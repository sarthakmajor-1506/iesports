import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { START_ELO, dayKey, msUntilReset, medal, type LadderRow, type DailyRow } from "@/lib/draftLadder";

/**
 * Draft Lab — the head-to-head ladder, read side.
 *
 * TWO BOARDS, ON PURPOSE. All-time ranks the pool; today ranks the day. An
 * all-time board is settled within a fortnight and after that it tells everyone
 * below the top ten that there is no point playing — the number they are chasing
 * was set by whoever showed up first. The daily board is winnable by anybody who
 * opens the app tonight, and it is the one that gives a reason to come back.
 *
 * Writes do not happen here. Ratings move only in `settleRoom`, from a finished
 * room, so there is no endpoint through which a client can report a result.
 */

const LADDER = "draftlabLadder";
const DAILY = "draftlabLadderDaily";
/** One game is a coin flip; three is the point at which a row means something. */
const MIN_GAMES = 3;

const decorate = (uid: string | null) => (d: FirebaseFirestore.DocumentData): LadderRow & { you: boolean; medal: string; medalFill: string } => {
  const elo = typeof d.elo === "number" ? d.elo : START_ELO;
  const m = medal(elo);
  return {
    uid: d.uid, name: d.name ?? "Anonymous", avatar: d.avatar ?? null,
    elo, peak: typeof d.peak === "number" ? d.peak : elo,
    games: d.games ?? 0, wins: d.wins ?? 0, losses: d.losses ?? 0, draws: d.draws ?? 0,
    streak: d.streak ?? 0,
    you: !!uid && d.uid === uid,
    medal: m.name, medalFill: m.fill,
  };
};

export async function GET(req: NextRequest) {
  try {
    const uid = (req.nextUrl.searchParams.get("uid") || "").slice(0, 64) || null;
    const scope = req.nextUrl.searchParams.get("scope") === "today" ? "today" : "all";
    const limit = Math.min(50, Math.max(5, Number(req.nextUrl.searchParams.get("limit")) || 25));
    const day = dayKey();

    if (scope === "today") {
      /*
       * Ordered on `delta` — rating gained today, not rating held.
       * Ranking the daily board on absolute Elo would just reprint the all-time
       * board with fewer rows on it.
       */
      const snap = await adminDb.collection(DAILY).doc(day).collection("players")
        .orderBy("delta", "desc").limit(limit).get();

      const rows: (DailyRow & { you: boolean })[] = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          uid: d.uid, name: d.name ?? "Anonymous", avatar: d.avatar ?? null,
          delta: d.delta ?? 0, games: d.games ?? 0, wins: d.wins ?? 0,
          you: !!uid && d.uid === uid,
        };
      });

      let you: (DailyRow & { you: boolean; rank: number | null }) | null = null;
      if (uid && !rows.some((r) => r.uid === uid)) {
        const mine = await adminDb.collection(DAILY).doc(day).collection("players").doc(uid).get();
        if (mine.exists) {
          const d = mine.data()!;
          you = {
            uid, name: d.name ?? "Anonymous", avatar: d.avatar ?? null,
            delta: d.delta ?? 0, games: d.games ?? 0, wins: d.wins ?? 0,
            you: true, rank: null,
          };
        }
      }

      return NextResponse.json({ scope, day, rows, you, resetsInMs: msUntilReset() });
    }

    /*
     * The minimum-games filter is applied after the query rather than inside it.
     * A `where games >= 3` alongside `orderBy elo` needs a composite index, and
     * this route has to work on a fresh project before anybody has deployed one.
     * Over-fetching a little and filtering here costs nothing at this size.
     */
    const snap = await adminDb.collection(LADDER).orderBy("elo", "desc").limit(limit * 3).get();
    const all = snap.docs.map((d) => d.data());
    const rows = all.filter((d) => (d.games ?? 0) >= MIN_GAMES).slice(0, limit).map(decorate(uid));

    let you: (LadderRow & { you: boolean; medal: string; medalFill: string; rank: number | null; ranked: boolean }) | null = null;
    if (uid && !rows.some((r) => r.uid === uid)) {
      const mine = await adminDb.collection(LADDER).doc(uid).get();
      if (mine.exists) {
        const d = mine.data()!;
        const ranked = (d.games ?? 0) >= MIN_GAMES;
        // Only meaningful once they are actually on the board; an unranked row
        // has no position to report, and inventing one would be a lie.
        const above = ranked
          ? (await adminDb.collection(LADDER).where("elo", ">", d.elo ?? START_ELO).count().get()).data().count
          : null;
        you = { ...decorate(uid)(d), rank: above == null ? null : above + 1, ranked };
      }
    }

    return NextResponse.json({ scope, rows, you, minGames: MIN_GAMES, resetsInMs: msUntilReset() });
  } catch (e) {
    console.error("[draftlab] ladder read failed:", e);
    // The scope is echoed back even on failure. Returning a hard-coded "all"
    // here is how a broken daily query looked like an empty daily board for
    // long enough to ship.
    const scope = req.nextUrl.searchParams.get("scope") === "today" ? "today" : "all";
    return NextResponse.json({ scope, rows: [], you: null, minGames: MIN_GAMES, resetsInMs: msUntilReset() });
  }
}
