// Slot accounting — the one place that is allowed to move `slotsBooked`.
//
// Why this exists: on 11 Aug PayU delivered the same webhook twice, 3 seconds
// apart. Both deliveries called the registration route. The route checked
// "already registered?" with a plain read and incremented the counter with a
// bare FieldValue.increment, with nothing joining the two, so both calls saw
// "not registered", both wrote the same player document (idempotent, one row)
// and both incremented. Horizon read 3/20 with two players in it, and the
// duplicate pass also seeded the player's rating history twice.
//
// The rule now: the existence check and the counter move happen inside ONE
// transaction, so the second caller loses and is told the truth. That covers
// duplicate webhooks, a double-clicked Register button and a reconcile replay
// racing a player, which are all the same bug wearing different clothes.
//
// The counter is also computed from the document read inside the transaction
// rather than incremented blindly, so it can never go negative and can never
// drift by a delivery.
//
// Slot holds solve the other half. Under "seat first, setup after" the money is
// taken before the player is registered, so `slotsBooked` alone would let the
// last slot be sold to two people at once and the loser would already have
// paid. A hold is written at checkout time inside a transaction that counts
// existing holds, and it survives until the player registers.

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { PAID_GAMES, type PaidGame } from "@/lib/paidEntry";

/** How long an unpaid checkout may sit on a slot before it is offered again. */
export const HOLD_TTL_MS = 20 * 60 * 1000;

const tournamentRef = (game: PaidGame, tournamentId: string) =>
  adminDb.collection(PAID_GAMES[game].collection).doc(tournamentId);

const playerRef = (game: PaidGame, tournamentId: string, uid: string) =>
  tournamentRef(game, tournamentId).collection(PAID_GAMES[game].playersSubcollection).doc(uid);

const holdsRef = (game: PaidGame, tournamentId: string) =>
  tournamentRef(game, tournamentId).collection("slotHolds");

export type ClaimResult =
  | { ok: true; slotsBooked: number }
  | { ok: false; reason: "already_registered" | "full" | "no_tournament" };

/**
 * Register a player and move the counter, atomically.
 *
 * `player` is the document body the caller wants stored. `extraCounters` is for
 * per-bracket totals (Dota 5v5 keeps `brackets.<name>.slotsBooked` alongside
 * the global one) and is applied with the same read-inside-the-transaction
 * arithmetic.
 */
export async function claimSoloSlot(args: {
  game: PaidGame;
  tournamentId: string;
  uid: string;
  player: Record<string, unknown>;
  /** Skip the capacity test when the caller has already reserved the slot. */
  enforceCapacity?: boolean;
  extraCounters?: Record<string, number>;
}): Promise<ClaimResult> {
  const { game, tournamentId, uid, player, enforceCapacity = true, extraCounters = {} } = args;
  const cfg = PAID_GAMES[game];

  const tRef = tournamentRef(game, tournamentId);
  const pRef = playerRef(game, tournamentId, uid);
  const uRef = adminDb.collection("users").doc(uid);
  const hRef = holdsRef(game, tournamentId).doc(uid);

  return adminDb.runTransaction(async (tx) => {
    const [tSnap, pSnap, hSnap] = await Promise.all([tx.get(tRef), tx.get(pRef), tx.get(hRef)]);

    if (!tSnap.exists) return { ok: false as const, reason: "no_tournament" as const };
    if (pSnap.exists) return { ok: false as const, reason: "already_registered" as const };

    const t = tSnap.data() || {};
    const booked = Number(t.slotsBooked) || 0;
    const total = Number(t.totalSlots) || 0;

    // A player holding a slot has already been counted against capacity at
    // checkout, so they are let in even on the last seat.
    if (enforceCapacity && total > 0 && booked >= total && !hSnap.exists) {
      return { ok: false as const, reason: "full" as const };
    }

    const update: Record<string, unknown> = { slotsBooked: booked + 1 };
    for (const [path, delta] of Object.entries(extraCounters)) {
      const current = Number(path.split(".").reduce<any>((o, k) => (o == null ? undefined : o[k]), t)) || 0;
      update[path] = current + delta;
    }

    tx.set(pRef, player);
    tx.update(tRef, update);
    tx.set(uRef, { [cfg.registeredField]: FieldValue.arrayUnion(tournamentId) }, { merge: true });
    // The hold has done its job: the player is in the counter now.
    if (hSnap.exists) tx.delete(hRef);

    return { ok: true as const, slotsBooked: booked + 1 };
  });
}

export type ReleaseResult =
  | { ok: true; slotsBooked: number; player: Record<string, any> }
  | { ok: false; reason: "not_registered" | "no_tournament" };

/** Unregister a player and move the counter back, atomically. */
export async function releaseSoloSlot(args: {
  game: PaidGame;
  tournamentId: string;
  uid: string;
  extraCounters?: (player: Record<string, any>) => Record<string, number>;
}): Promise<ReleaseResult> {
  const { game, tournamentId, uid, extraCounters } = args;
  const cfg = PAID_GAMES[game];

  const tRef = tournamentRef(game, tournamentId);
  const pRef = playerRef(game, tournamentId, uid);
  const uRef = adminDb.collection("users").doc(uid);

  return adminDb.runTransaction(async (tx) => {
    const [tSnap, pSnap] = await Promise.all([tx.get(tRef), tx.get(pRef)]);

    if (!tSnap.exists) return { ok: false as const, reason: "no_tournament" as const };
    if (!pSnap.exists) return { ok: false as const, reason: "not_registered" as const };

    const t = tSnap.data() || {};
    const playerData = pSnap.data() || {};
    const booked = Number(t.slotsBooked) || 0;

    const update: Record<string, unknown> = { slotsBooked: Math.max(0, booked - 1) };
    for (const [path, delta] of Object.entries(extraCounters ? extraCounters(playerData) : {})) {
      const current = Number(path.split(".").reduce<any>((o, k) => (o == null ? undefined : o[k]), t)) || 0;
      update[path] = Math.max(0, current + delta);
    }

    tx.delete(pRef);
    tx.update(tRef, update);
    tx.set(uRef, { [cfg.registeredField]: FieldValue.arrayRemove(tournamentId) }, { merge: true });

    return { ok: true as const, slotsBooked: Math.max(0, booked - 1), player: playerData };
  });
}

// ── Slot holds ──────────────────────────────────────────────────────────────

export type ReserveResult = { ok: true; held: number } | { ok: false; reason: "full" | "no_tournament" };

/**
 * Reserve a slot before sending the player to PayU.
 *
 * Counting holds inside the transaction is what makes this safe: two players
 * paying for the last seat at the same moment serialise, and the second is told
 * the tournament is full BEFORE any money moves.
 */
export async function reserveSlotForCheckout(args: {
  game: PaidGame;
  tournamentId: string;
  uid: string;
  txnid: string;
}): Promise<ReserveResult> {
  const { game, tournamentId, uid, txnid } = args;

  const tRef = tournamentRef(game, tournamentId);
  const hCol = holdsRef(game, tournamentId);
  const hRef = hCol.doc(uid);
  const now = Date.now();

  return adminDb.runTransaction(async (tx) => {
    const [tSnap, allHolds] = await Promise.all([tx.get(tRef), tx.get(hCol)]);
    if (!tSnap.exists) return { ok: false as const, reason: "no_tournament" as const };

    const t = tSnap.data() || {};
    const total = Number(t.totalSlots) || 0;
    const booked = Number(t.slotsBooked) || 0;

    let active = 0;
    const stale: FirebaseFirestore.DocumentReference[] = [];
    for (const d of allHolds.docs) {
      if (d.id === uid) continue; // renewing our own hold is not a new claim
      const h = d.data() || {};
      const live = h.paid === true || (h.expiresAt && Date.parse(h.expiresAt) > now);
      if (live) active++;
      else stale.push(d.ref);
    }

    if (total > 0 && booked + active >= total) {
      return { ok: false as const, reason: "full" as const };
    }

    for (const ref of stale) tx.delete(ref);
    tx.set(hRef, {
      uid,
      txnid,
      paid: false,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(now + HOLD_TTL_MS).toISOString(),
    }, { merge: true });

    return { ok: true as const, held: active + 1 };
  });
}

/** A paid hold never expires: the seat is theirs until they register or withdraw. */
export async function markHoldPaid(game: PaidGame, tournamentId: string, uid: string, txnid: string) {
  await holdsRef(game, tournamentId).doc(uid).set(
    { uid, txnid, paid: true, expiresAt: null, paidAt: new Date().toISOString() },
    { merge: true }
  );
}

export async function releaseHold(game: PaidGame, tournamentId: string, uid: string) {
  await holdsRef(game, tournamentId).doc(uid).delete().catch(() => {});
}
