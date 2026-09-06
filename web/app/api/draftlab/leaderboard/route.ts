import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";
import { buildEngine, evaluate, type DraftModel } from "@/lib/draftlab";
import { buildQuiz, type Knowledge } from "@/lib/quiz";

/**
 * Draft Lab — leaderboard.
 *
 * Signed-in players are ranked; everyone else can still play, they just are not
 * on the board. That asymmetry is the whole reason to sign in, so the game never
 * blocks on it.
 *
 * THE SCORE IS RECOMPUTED HERE, NOT ACCEPTED.
 *
 * The win-probability model runs in the browser, so a submitted score is a number
 * the player's own machine produced and could trivially edit. This route takes
 * the picks and the quiz answer sheet instead, and derives the score from them:
 *
 *   draft  — the model is re-evaluated server-side on the ten heroes submitted
 *   quiz   — the paper is regenerated from its seed and the answers re-marked
 *
 * Answer *timing* cannot be verified from here, so the submitted points are
 * capped at ten per answer that was actually correct. That is a real bound, not
 * a rubber stamp: it makes the only forgeable component "claimed to be fast",
 * and makes a wrong answer worth nothing no matter what is sent.
 */

const COLL = "draftlabLeaderboard";
const MIN_GAMES = 3;
const clean = (v: unknown, max = 24) =>
  typeof v === "string" ? v.trim().slice(0, max).replace(/[<>]/g, "") : "";

let modelCache: DraftModel | null = null;
let knowledgeCache: Knowledge | null = null;

async function getModel() {
  if (!modelCache) modelCache = (await import("@/public/draftlab/model.json")).default as unknown as DraftModel;
  return modelCache;
}
async function getKnowledge() {
  if (!knowledgeCache) knowledgeCache = (await import("@/public/draftlab/knowledge.json")).default as unknown as Knowledge;
  return knowledgeCache;
}

/**
 * Who is submitting this score?
 *
 * The uid in the body is never believed — it is checked against the Firebase ID
 * token the browser sends. Deliberately self-contained rather than reusing the
 * registration routes' `verifyCaller`: that helper belongs to the payment work,
 * which is a separate unshipped changeset, and importing across the two is what
 * broke the first production build of this feature.
 */
async function callerUid(req: NextRequest, claimed: string): Promise<string | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid === claimed ? decoded.uid : null;
  } catch {
    return null;
  }
}

const heroIds = (v: unknown): number[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is number => typeof x === "number" && Number.isInteger(x)))].slice(0, 5) : [];

export type LeaderRow = {
  uid: string;
  name: string;
  avatar: string | null;
  games: number;
  points: number;
  avg: number;
  best: number;
  wins: number;
  quiz: number;
  ranked: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const uid = clean(body.uid, 64);
    if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

    if (!(await callerUid(req, uid))) {
      return NextResponse.json({ error: "Sign in and try again." }, { status: 401 });
    }

    const mine = heroIds(body.mine);
    const theirs = heroIds(body.theirs);
    if (mine.length !== 5 || theirs.length !== 5) {
      return NextResponse.json({ error: "A finished draft has five heroes a side" }, { status: 400 });
    }
    if (mine.some((h) => theirs.includes(h))) {
      return NextResponse.json({ error: "A hero cannot be on both sides" }, { status: 400 });
    }

    /* ------------------------------------------------------- draft score */
    const model = await getModel();
    const engine = buildEngine(model);
    const known = new Set(model.heroes.map((h) => h.id));
    if ([...mine, ...theirs].some((h) => !known.has(h))) {
      return NextResponse.json({ error: "Unknown hero" }, { status: 400 });
    }
    const p = evaluate(engine, mine, theirs).p;
    const draftPoints = Math.round(p * 100);

    /* -------------------------------------------------------- quiz score */
    let quizPoints = 0;
    let quizCorrect = 0;
    const seed = clean(body.quizSeed, 120);
    const picks = Array.isArray(body.quizPicks) ? body.quizPicks.slice(0, 3) : [];
    if (seed && picks.length) {
      const knowledge = await getKnowledge();
      const paper = buildQuiz(knowledge, seed, 3);
      quizCorrect = paper.reduce((n, q, i) => {
        const choice = picks[i];
        return n + (typeof choice === "number" && q.options[choice]?.correct ? 1 : 0);
      }, 0);
      const claimed = typeof body.quizPoints === "number" ? Math.max(0, Math.round(body.quizPoints)) : 0;
      quizPoints = Math.min(claimed, quizCorrect * 10, 30);
    }

    const points = draftPoints + quizPoints;
    const won = p > 0.5;

    /* ----------------------------------------------------------- record */
    const ref = adminDb.collection(COLL).doc(uid);
    const row = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prev = snap.exists ? snap.data()! : {};
      // Whether this beat their own record has to be decided against the row as it
      // stood BEFORE this game is folded in, or every game is a personal best.
      const wasBest = points > (prev.best ?? 0) && (prev.games ?? 0) > 0;
      const first = (prev.games ?? 0) === 0;
      const games = (prev.games ?? 0) + 1;
      const total = (prev.points ?? 0) + points;
      const next = {
        uid,
        name: clean(body.name) || prev.name || "Anonymous",
        avatar: clean(body.avatar, 300) || prev.avatar || null,
        games,
        points: total,
        avg: +(total / games).toFixed(2),
        best: Math.max(prev.best ?? 0, points),
        wins: (prev.wins ?? 0) + (won ? 1 : 0),
        quiz: (prev.quiz ?? 0) + quizPoints,
        lastAt: new Date(),
      };
      tx.set(ref, next, { merge: true });
      return { ...next, wasBest, first };
    });

    return NextResponse.json({
      ok: true,
      scored: { draftPoints, quizPoints, quizCorrect, points, winProb: +(p * 100).toFixed(1) },
      you: { ...row, ranked: row.games >= MIN_GAMES },
      personalBest: row.wasBest, firstGame: row.first,
    });
  } catch (e) {
    console.error("[draftlab] leaderboard submit failed:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * Top of the board, plus the caller's own row whether or not it made the cut.
 *
 * Ordered on the stored average so the query needs only the automatic
 * single-field index; the minimum-games filter is applied here rather than in the
 * query, which would otherwise require a composite index to deploy.
 */
export async function GET(req: NextRequest) {
  try {
    const uid = (req.nextUrl.searchParams.get("uid") || "").slice(0, 64);
    const limit = Math.min(50, Math.max(5, Number(req.nextUrl.searchParams.get("limit")) || 25));

    const snap = await adminDb.collection(COLL).orderBy("avg", "desc").limit(200).get();
    const all: LeaderRow[] = snap.docs.map((d) => {
      const x = d.data();
      return {
        uid: d.id,
        name: x.name || "Anonymous",
        avatar: x.avatar ?? null,
        games: x.games ?? 0,
        points: x.points ?? 0,
        avg: x.avg ?? 0,
        best: x.best ?? 0,
        wins: x.wins ?? 0,
        quiz: x.quiz ?? 0,
        ranked: (x.games ?? 0) >= MIN_GAMES,
      };
    });

    const ranked = all.filter((r) => r.ranked).slice(0, limit);
    let you: (LeaderRow & { rank: number | null }) | null = null;
    if (uid) {
      const mine = all.find((r) => r.uid === uid);
      if (mine) {
        const rank = mine.ranked ? all.filter((r) => r.ranked).findIndex((r) => r.uid === uid) + 1 : null;
        you = { ...mine, rank };
      } else {
        const doc = await adminDb.collection(COLL).doc(uid).get();
        if (doc.exists) {
          const x = doc.data()!;
          you = {
            uid, name: x.name || "Anonymous", avatar: x.avatar ?? null,
            games: x.games ?? 0, points: x.points ?? 0, avg: x.avg ?? 0,
            best: x.best ?? 0, wins: x.wins ?? 0, quiz: x.quiz ?? 0,
            ranked: (x.games ?? 0) >= MIN_GAMES, rank: null,
          };
        }
      }
    }

    return NextResponse.json({ rows: ranked, you, minGames: MIN_GAMES });
  } catch (e) {
    console.error("[draftlab] leaderboard read failed:", e);
    return NextResponse.json({ rows: [], you: null, minGames: MIN_GAMES });
  }
}
