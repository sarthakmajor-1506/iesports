import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { buildEngine, evaluate, type DraftModel } from "@/lib/draftlab";
import {
  START_ELO, dayKey, nextRatings, outcomeFrom, scoreFor,
  type Outcome,
} from "@/lib/draftLadder";

/**
 * Paying out a finished live room.
 *
 * WHO WON. The model evaluates the two finished fives and the higher win
 * probability takes it. That is the same 58%-accurate model the solo board uses,
 * and on its own it has no authority — but here it is not being asked to be an
 * oracle, only to be an impartial and symmetric judge of two drafts made under
 * identical rules. Both players accepted it before they started, and neither can
 * influence it. Inside `DRAW_BAND` it declines to pick, because a gap smaller
 * than the model's own calibration error is not a result.
 *
 * WHERE IT RUNS. Here, never in the browser. The model ships to the client, so a
 * client-reported winner is a number the winner's own machine produced.
 *
 * EXACTLY ONCE. The room's `settled` flag is read and set inside the same
 * transaction that moves both ratings, so two clients racing to report the same
 * final pick cannot pay the ladder twice.
 */

const ROOMS = "draftlabRooms";
/**
 * Which accounts sat in a room. Kept apart from the room itself because rooms
 * are readable by anyone with the code, and a Discord-login uid contains the
 * player's Discord id — see the note on `Seat` in the room route.
 */
const SEATS = "draftlabRoomSeats";
const LADDER = "draftlabLadder";
const DAILY = "draftlabLadderDaily";

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
  reason?: string;
};

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
   * rating. Marking it settled also stops both clients retrying the payout for
   * a room that will never have one.
   */
  if (!room.ranked || !hostUid || !guestUid) {
    await roomRef.update({
      settled: true,
      result: { outcome, hostWinProb, deltaHost: 0, deltaGuest: 0 },
      settledAt: FieldValue.serverTimestamp(),
    });
    return { settled: true, outcome, hostWinProb, deltaHost: 0, deltaGuest: 0, reason: "unranked" };
  }

  const hostRef = adminDb.collection(LADDER).doc(hostUid);
  const guestRef = adminDb.collection(LADDER).doc(guestUid);
  /*
   * A subcollection per day, not one flat collection with a `day` field.
   *
   * The board asks for "today, best first", and on a flat collection that is
   * `where(day ==) + orderBy(delta)` — two different fields, which Firestore
   * will not serve without a composite index somebody has to remember to
   * deploy. Until they do, the query throws and the board silently shows as
   * empty, which is exactly what it did. Inside a per-day subcollection the
   * same question is a single-field `orderBy`, served by the automatic index on
   * a project nobody has configured.
   */
  const day = dayKey();
  const dailyHostRef = adminDb.collection(DAILY).doc(day).collection("players").doc(hostUid);
  const dailyGuestRef = adminDb.collection(DAILY).doc(day).collection("players").doc(guestUid);

  const out = await adminDb.runTransaction(async (tx) => {
    // Every read first — Firestore forbids a read after a write in the same
    // transaction, and there are five of them here.
    const [roomNow, h, g, dh, dg] = await Promise.all([
      tx.get(roomRef), tx.get(hostRef), tx.get(guestRef), tx.get(dailyHostRef), tx.get(dailyGuestRef),
    ]);
    if ((roomNow.data() as { settled?: boolean } | undefined)?.settled) {
      return { settled: false, reason: "already settled" } as SettleResult;
    }

    const hPrev = h.exists ? h.data()! : {};
    const gPrev = g.exists ? g.data()! : {};
    const hElo = typeof hPrev.elo === "number" ? hPrev.elo : START_ELO;
    const gElo = typeof gPrev.elo === "number" ? gPrev.elo : START_ELO;

    const moved = nextRatings(hElo, gElo, scoreFor(outcome));

    // The uid is passed in rather than read off the seat: seats no longer carry
    // one, because the room document they live in is world-readable.
    const row = (
      who: string,
      prev: FirebaseFirestore.DocumentData,
      seat: Seat,
      elo: number,
      won: boolean,
      lost: boolean,
      drew: boolean
    ) => ({
      uid: who,
      name: seat.name || prev.name || "Anonymous",
      avatar: seat.avatar ?? prev.avatar ?? null,
      elo,
      peak: Math.max(typeof prev.peak === "number" ? prev.peak : START_ELO, elo),
      games: (prev.games ?? 0) + 1,
      wins: (prev.wins ?? 0) + (won ? 1 : 0),
      losses: (prev.losses ?? 0) + (lost ? 1 : 0),
      draws: (prev.draws ?? 0) + (drew ? 1 : 0),
      // A streak counts consecutive wins and is cut by anything else, a draw
      // included — "on a streak" has to mean winning, or it means nothing.
      streak: won ? (prev.streak ?? 0) + 1 : 0,
      lastAt: FieldValue.serverTimestamp(),
    });

    const hostWon = outcome === "host", guestWon = outcome === "guest", drew = outcome === "draw";
    tx.set(hostRef, row(hostUid, hPrev, room.host!, moved.a, hostWon, guestWon, drew), { merge: true });
    tx.set(guestRef, row(guestUid, gPrev, room.guest!, moved.b, guestWon, hostWon, drew), { merge: true });

    const daily = (who: string, prev: FirebaseFirestore.DocumentData, seat: Seat, delta: number, won: boolean) => ({
      uid: who,
      day,
      name: seat.name || prev.name || "Anonymous",
      avatar: seat.avatar ?? prev.avatar ?? null,
      delta: (prev.delta ?? 0) + delta,
      games: (prev.games ?? 0) + 1,
      wins: (prev.wins ?? 0) + (won ? 1 : 0),
      lastAt: FieldValue.serverTimestamp(),
    });
    tx.set(dailyHostRef, daily(hostUid, dh.exists ? dh.data()! : {}, room.host!, moved.deltaA, hostWon), { merge: true });
    tx.set(dailyGuestRef, daily(guestUid, dg.exists ? dg.data()! : {}, room.guest!, moved.deltaB, guestWon), { merge: true });

    tx.update(roomRef, {
      settled: true,
      result: { outcome, hostWinProb, deltaHost: moved.deltaA, deltaGuest: moved.deltaB },
      settledAt: FieldValue.serverTimestamp(),
    });

    return {
      settled: true, outcome, hostWinProb,
      deltaHost: moved.deltaA, deltaGuest: moved.deltaB,
    } as SettleResult;
  });

  return out;
}
