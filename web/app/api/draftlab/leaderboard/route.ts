import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { buildEngine, evaluate, type DraftModel } from "@/lib/draftlab";
import { buildQuiz, QUIZ_COUNT, MAX_POINTS, type Knowledge } from "@/lib/quiz";
import { monthKey, monthLabel, msUntilMonthReset } from "@/lib/draftLadder";
import { resolvePlayerIdentity } from "@/lib/draftIdentity";

/**
 * Draft Lab — the one leaderboard.
 *
 * THE SCORE IS RECOMPUTED HERE, NOT ACCEPTED. The win-probability model runs in
 * the browser, so a submitted score is a number the player's own machine
 * produced and could trivially edit. This route takes the picks and the quiz
 * answer sheet instead, and derives the score from them:
 *
 *   draft  — the model is re-evaluated server-side on the ten heroes submitted
 *   quiz   — the paper is regenerated from its seed and the answers re-marked
 *
 * Answer *timing* cannot be verified from here, so the submitted points are
 * capped at ten per answer that was actually correct. That is a real bound, not
 * a rubber stamp: it makes the only forgeable component "claimed to be fast",
 * and makes a wrong answer worth nothing no matter what is sent.
 *
 * ONE BOARD, NOT THREE. This used to feed its own avg-points collection,
 * separate from the ranked ladder's Elo board and its own separate daily
 * variant. A player's name could be right on one and wrong on another because
 * they were three different write paths trusting three different strings. Now
 * there is one permanent record per player (`draftlabLadder`, shared with
 * ranked live results — see draftLadderServer.ts) and one visible board
 * (`draftlabLadderMonthly`, coins earned this month, resetting on the 1st IST), and
 * the identity on every write is looked up from the account, never taken from
 * the request body — see draftIdentity.ts.
 *
 * COINS. A solo win pays draft points plus quiz points, in one award, because
 * both are known by the time this fires (the quiz always runs before "done").
 * A loss pays nothing — coins are a reward for winning, not a score for
 * playing.
 */

const LADDER = "draftlabLadder";
const MONTHLY = "draftlabLadderMonthly";
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
    // The round length comes from lib/quiz so this can never drift from what the
    // browser actually asked. It was hard-coded to 3 in both places, which meant
    // lengthening the round here would have thrown away the extra answers and
    // held every player's quiz score at the old ceiling.
    const picks = Array.isArray(body.quizPicks) ? body.quizPicks.slice(0, QUIZ_COUNT) : [];
    if (seed && picks.length) {
      const knowledge = await getKnowledge();
      const paper = buildQuiz(knowledge, seed, QUIZ_COUNT);
      quizCorrect = paper.reduce((n, q, i) => {
        const choice = picks[i];
        return n + (typeof choice === "number" && q.options[choice]?.correct ? 1 : 0);
      }, 0);
      const claimed = typeof body.quizPoints === "number" ? Math.max(0, Math.round(body.quizPoints)) : 0;
      quizPoints = Math.min(claimed, quizCorrect * MAX_POINTS, QUIZ_COUNT * MAX_POINTS);
    }

    const points = draftPoints + quizPoints;
    const won = p > 0.5;
    // Coins are the reward for winning; a lost draft still shows its score
    // above (points), but nothing is added to the board for it.
    const coins = won ? points : 0;

    /*
     * The account's real name and picture, not whatever this request claims.
     * See draftIdentity.ts — this is the fix for a name that was right on one
     * board and wrong on another because two write paths trusted two strings.
     */
    const identity = await resolvePlayerIdentity(uid, clean(body.name), clean(body.avatar, 300));

    /* ----------------------------------------------------------- record */
    const ref = adminDb.collection(LADDER).doc(uid);
    const month = monthKey();
    const monthlyRef = adminDb.collection(MONTHLY).doc(month).collection("players").doc(uid);

    const out = await adminDb.runTransaction(async (tx) => {
      const [snap, monthlySnap] = await Promise.all([tx.get(ref), tx.get(monthlyRef)]);
      const prev = snap.exists ? snap.data()! : {};

      // A coin haul beating your own record — decided against the row as it
      // stood BEFORE this game, or every game would be a personal best.
      const wasBest = coins > (prev.best ?? 0) && (prev.games ?? 0) > 0;
      const first = (prev.games ?? 0) === 0;

      /*
       * Solo never touches elo/peak/losses/draws/streak — those are a ranked
       * live concept — so they are simply left out of this write. A Firestore
       * merge leaves whatever was there alone, so a player with no ranked
       * history still reads back exactly what they did before this game.
       */
      const next = {
        uid,
        name: identity.name,
        avatar: identity.avatar,
        games: (prev.games ?? 0) + 1,
        wins: (prev.wins ?? 0) + (won ? 1 : 0),
        best: Math.max(prev.best ?? 0, coins),
        lastAt: FieldValue.serverTimestamp(),
      };
      tx.set(ref, next, { merge: true });

      const mPrev = monthlySnap.exists ? monthlySnap.data()! : {};
      const monthlyCoins = (mPrev.coins ?? 0) + coins;
      tx.set(monthlyRef, {
        uid, name: identity.name, avatar: identity.avatar,
        coins: monthlyCoins,
        games: (mPrev.games ?? 0) + 1,
        wins: (mPrev.wins ?? 0) + (won ? 1 : 0),
        lastAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return { ...next, wasBest, first, monthlyCoins };
    });

    return NextResponse.json({
      ok: true,
      scored: { draftPoints, quizPoints, quizCorrect, points, winProb: +(p * 100).toFixed(1) },
      coinsAwarded: coins,
      monthlyTotal: out.monthlyCoins,
      coinsPersonalBest: out.wasBest,
      firstGame: out.first,
    });
  } catch (e) {
    console.error("[draftlab] leaderboard submit failed:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * Top of the board, plus the caller's own row whether or not it made the cut.
 *
 * No games-played floor here, unlike the old avg board — a single big win
 * this month is a real result worth showing, not noise that needs a sample
 * size to trust, because the board resets before it can be gamed by attrition.
 */
export async function GET(req: NextRequest) {
  const month = monthKey();
  try {
    const uid = (req.nextUrl.searchParams.get("uid") || "").slice(0, 64);
    const limit = Math.min(50, Math.max(5, Number(req.nextUrl.searchParams.get("limit")) || 25));

    const snap = await adminDb.collection(MONTHLY).doc(month).collection("players")
      .orderBy("coins", "desc").limit(limit).get();

    // No rank band goes out with a row. It was read from all-time ranked Elo
    // and shown beside a coin total that covers this month and both modes, so
    // the two routinely disagreed in front of the player.
    const rows = snap.docs.map((d) => {
      const x = d.data();
      return {
        uid: x.uid, name: x.name ?? "Anonymous", avatar: x.avatar ?? null,
        coins: x.coins ?? 0, games: x.games ?? 0, wins: x.wins ?? 0,
      };
    });

    let you: (typeof rows[number] & { rank: number | null }) | null = null;
    if (uid && !rows.some((r) => r.uid === uid)) {
      const mine = await adminDb.collection(MONTHLY).doc(month).collection("players").doc(uid).get();
      if (mine.exists) {
        const x = mine.data()!;
        you = {
          uid, name: x.name ?? "Anonymous", avatar: x.avatar ?? null,
          coins: x.coins ?? 0, games: x.games ?? 0, wins: x.wins ?? 0,
          rank: null,
        };
      }
    }

    return NextResponse.json({ month, label: monthLabel(month), rows, you, resetsInMs: msUntilMonthReset() });
  } catch (e) {
    console.error("[draftlab] leaderboard read failed:", e);
    return NextResponse.json({ month, label: monthLabel(month), rows: [], you: null, resetsInMs: msUntilMonthReset() });
  }
}
