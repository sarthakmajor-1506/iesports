import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { buildEngine, evaluate, type DraftModel } from "@/lib/draftlab";
import {
  START_ELO, weekKey, nextRatings, outcomeFrom, scoreFor,
  type Outcome,
} from "@/lib/draftLadder";
import { resolvePlayerIdentity } from "@/lib/draftIdentity";

/**
 * Paying out a finished live room.
 *
 * WHO WON. The model evaluates the two finished fives and the higher win
 * probability takes it. That is the same 58%-accurate model the solo score
 * uses, and on its own it has no authority — but here it is not being asked to
 * be an oracle, only to be an impartial and symmetric judge of two drafts made
 * under identical rules. Both players accepted it before they started, and
 * neither can influence it. Inside `DRAW_BAND` it declines to pick, because a
 * gap smaller than the model's own calibration error is not a result.
 *
 * WHERE IT RUNS. Here, never in the browser. The model ships to the client, so
 * a client-reported winner is a number the winner's own machine produced.
 *
 * EXACTLY ONCE. The room's `settled` flag is read and set inside the same
 * transaction that moves both ratings, so two clients racing to report the
 * same final pick cannot pay the ladder twice.
 *
 * COINS, DRAFT PORTION ONLY. A win here pays coins equal to the winner's
 * win-probability score, same as a solo win does for its draft half. It does
 * NOT also fold in quiz points the way a solo game's single submission does —
 * the quiz happens after the draft is already settled, played independently by
 * each side, submitted through the room's own `quiz` action. Splitting the
 * award in two here, or holding this transaction open across a game the other
 * player has not even started yet, is worse than the small asymmetry of a
 * live win paying slightly less than the same win would in solo.
 */

const ROOMS = "draftlabRooms";
/**
 * Which accounts sat in a room. Kept apart from the room itself because rooms
 * are readable by anyone with the code, and a Discord-login uid contains the
 * player's Discord id — see the note on `Seat` in the room route.
 */
const SEATS = "draftlabRoomSeats";
const LADDER = "draftlabLadder";
const WEEKLY = "draftlabLadderWeekly";

let modelCache: DraftModel | null = null;
async function getModel(): Promise<DraftModel> {
  if (!modelCache) modelCache = (await import("@/public/draftlab/model.json")).default as unknown as DraftModel;
  return modelCache;
}

type Seat = { id: string; name: string; avatar?: string | null };

export type SettleResult = {
  settled: boolean;
  outcome?: Outcome;
  hostWinProb?: number;
  deltaHost?: number;
  deltaGuest?: number;
  coinsHost?: number;
  coinsGuest?: number;
  reason?: string;
};

/**
 * Coins for one side of a ranked draft win. The loser and a draw earn nothing —
 * "on a win" is the whole rule, not a partial-credit curve.
 */
const coinsForWin = (winProbForThem: number) => Math.round(winProbForThem * 100);

export async function settleRoom(code: string): Promise<SettleResult> {
  const roomRef = adminDb.collection(ROOMS).doc(code);
  const snap = await roomRef.get();
  if (!snap.exists) return { settled: false, reason: "no room" };
  const room = snap.data() as {
    status?: string; ranked?: boolean; settled?: boolean;
    host?: Seat; guest?: Seat | null;
    picks?: { by: "host" | "guest"; kind: "pick" | "ban"; heroId: number }[];
  };

  if (room.status !== "done") return { settled: false, reason: "not finished" };
  if (room.settled) return { settled: false, reason: "already settled" };

  const picks = room.picks ?? [];
  const hostFive = picks.filter((p) => p.kind === "pick" && p.by === "host").map((p) => p.heroId);
  const guestFive = picks.filter((p) => p.kind === "pick" && p.by === "guest").map((p) => p.heroId);
  if (hostFive.length !== 5 || guestFive.length !== 5) return { settled: false, reason: "incomplete draft" };

  const model = await getModel();
  const engine = buildEngine(model);
  const hostWinProb = evaluate(engine, hostFive, guestFive).p;
  const outcome = outcomeFrom(hostWinProb);

  const seatsSnap = await adminDb.collection(SEATS).doc(code).get();
  const seats = (seatsSnap.exists ? seatsSnap.data() : {}) as { hostUid?: string | null; guestUid?: string | null };
  const hostUid = seats.hostUid || null;
  const guestUid = seats.guestUid || null;

  /*
   * An unranked room still records its result.
   *
   * The scoreboard the players see at the end is drawn from `result`, so an
   * anonymous game has to write one too — it simply does not touch anybody's
   * rating or coins. Marking it settled also stops both clients retrying the
   * payout for a room that will never have one.
   */
  if (!room.ranked || !hostUid || !guestUid) {
    await roomRef.update({
      settled: true,
      result: { outcome, hostWinProb, deltaHost: 0, deltaGuest: 0, coinsHost: 0, coinsGuest: 0 },
      settledAt: FieldValue.serverTimestamp(),
    });
    return { settled: true, outcome, hostWinProb, deltaHost: 0, deltaGuest: 0, coinsHost: 0, coinsGuest: 0, reason: "unranked" };
  }

  // Resolved from the account, not from whatever the room's seat happened to
  // carry — see draftIdentity.ts for why the seat can no longer be trusted.
  const [hostIdentity, guestIdentity] = await Promise.all([
    resolvePlayerIdentity(hostUid, room.host?.name, room.host?.avatar),
    resolvePlayerIdentity(guestUid, room.guest?.name, room.guest?.avatar),
  ]);

  const hostRef = adminDb.collection(LADDER).doc(hostUid);
  const guestRef = adminDb.collection(LADDER).doc(guestUid);
  const week = weekKey();
  const weeklyHostRef = adminDb.collection(WEEKLY).doc(week).collection("players").doc(hostUid);
  const weeklyGuestRef = adminDb.collection(WEEKLY).doc(week).collection("players").doc(guestUid);

  const hostWon = outcome === "host", guestWon = outcome === "guest", drew = outcome === "draw";
  const coinsHost = hostWon ? coinsForWin(hostWinProb) : 0;
  const coinsGuest = guestWon ? coinsForWin(1 - hostWinProb) : 0;

  const out = await adminDb.runTransaction(async (tx) => {
    // Every read first — Firestore forbids a read after a write in the same
    // transaction, and there are five of them here.
    const [roomNow, h, g, wh, wg] = await Promise.all([
      tx.get(roomRef), tx.get(hostRef), tx.get(guestRef), tx.get(weeklyHostRef), tx.get(weeklyGuestRef),
    ]);
    if ((roomNow.data() as { settled?: boolean } | undefined)?.settled) {
      return { settled: false, reason: "already settled" } as SettleResult;
    }

    const hPrev = h.exists ? h.data()! : {};
    const gPrev = g.exists ? g.data()! : {};
    const hElo = typeof hPrev.elo === "number" ? hPrev.elo : START_ELO;
    const gElo = typeof gPrev.elo === "number" ? gPrev.elo : START_ELO;

    const moved = nextRatings(hElo, gElo, scoreFor(outcome));
    const hNewElo = moved.a, gNewElo = moved.b;

    /**
     * The one permanent record for a player. Ranked live games move
     * elo/peak/losses/draws/streak; solo wins never touch this branch at all
     * (see the leaderboard route) but merge into the same `games`/`wins`/`best`
     * counters, so "games played" and "personal best coin haul" mean the same
     * thing regardless of which mode earned them.
     */
    const row = (
      who: string, identity: { name: string; avatar: string | null },
      prev: FirebaseFirestore.DocumentData, elo: number, coins: number,
      won: boolean, lost: boolean, drew_: boolean
    ) => ({
      uid: who,
      name: identity.name,
      avatar: identity.avatar,
      elo,
      peak: Math.max(typeof prev.peak === "number" ? prev.peak : START_ELO, elo),
      games: (prev.games ?? 0) + 1,
      wins: (prev.wins ?? 0) + (won ? 1 : 0),
      losses: (prev.losses ?? 0) + (lost ? 1 : 0),
      draws: (prev.draws ?? 0) + (drew_ ? 1 : 0),
      // A streak counts consecutive wins and is cut by anything else, a draw
      // included — "on a streak" has to mean winning, or it means nothing.
      streak: won ? (prev.streak ?? 0) + 1 : 0,
      best: Math.max(prev.best ?? 0, coins),
      lastAt: FieldValue.serverTimestamp(),
    });

    tx.set(hostRef, row(hostUid, hostIdentity, hPrev, hNewElo, coinsHost, hostWon, guestWon, drew), { merge: true });
    tx.set(guestRef, row(guestUid, guestIdentity, gPrev, gNewElo, coinsGuest, guestWon, hostWon, drew), { merge: true });

    /**
     * The weekly board. `elo` is mirrored in here purely so the read side can
     * show a medal without a second fetch per row — it is flavour, not the
     * sort key, so a few minutes of staleness against the permanent doc above
     * is invisible.
     */
    const weekly = (
      who: string, identity: { name: string; avatar: string | null },
      prev: FirebaseFirestore.DocumentData, elo: number, coins: number, won: boolean
    ) => ({
      uid: who,
      name: identity.name,
      avatar: identity.avatar,
      elo,
      coins: (prev.coins ?? 0) + coins,
      games: (prev.games ?? 0) + 1,
      wins: (prev.wins ?? 0) + (won ? 1 : 0),
      lastAt: FieldValue.serverTimestamp(),
    });
    tx.set(weeklyHostRef, weekly(hostUid, hostIdentity, wh.exists ? wh.data()! : {}, hNewElo, coinsHost, hostWon), { merge: true });
    tx.set(weeklyGuestRef, weekly(guestUid, guestIdentity, wg.exists ? wg.data()! : {}, gNewElo, coinsGuest, guestWon), { merge: true });

    tx.update(roomRef, {
      settled: true,
      result: { outcome, hostWinProb, deltaHost: moved.deltaA, deltaGuest: moved.deltaB, coinsHost, coinsGuest },
      settledAt: FieldValue.serverTimestamp(),
    });

    return {
      settled: true, outcome, hostWinProb,
      deltaHost: moved.deltaA, deltaGuest: moved.deltaB, coinsHost, coinsGuest,
    } as SettleResult;
  });

  return out;
}
