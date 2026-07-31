/**
 * Shared "finalize a successful PayU payment" logic — used by both the
 * webhook handler (app/api/payu/webhook/route.ts) and the reconciliation
 * cron (app/api/cron/payu-reconcile/route.ts) so the two paths can never
 * drift apart. Idempotent: safe to call more than once for the same txnid.
 */

import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { sendRegistrationDM, sendDM } from "@/lib/discord";
import { recalcTiers } from "@/lib/recalcTiers";
import { syncPlayerSnapshot } from "@/lib/valorantPlayerSnapshot";
import { seedRating, floorCheck, ratingToRank, ratingToTier } from "@/lib/elo";
import { fetchAndSyncPlayer } from "@/lib/fetchAndSyncPlayer";

export type Game = "dota2" | "valorant" | "cs2";

export const GAME_CONFIG: Record<Game, { collection: string; subcollection: string; userArrayField: string }> = {
  dota2: { collection: "soloTournaments", subcollection: "players", userArrayField: "registeredSoloTournaments" },
  cs2: { collection: "cs2Tournaments", subcollection: "soloPlayers", userArrayField: "registeredCS2Tournaments" },
  valorant: { collection: "valorantTournaments", subcollection: "soloPlayers", userArrayField: "registeredValorantTournaments" },
};

const HENRIK_BASE = "https://api.henrikdev.xyz/valorant";
async function refreshRiotRank(region: string, name: string, tag: string) {
  const apiKey = process.env.HENRIK_API_KEY || "";
  const url = `${HENRIK_BASE}/v2/mmr/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?api_key=${apiKey}`;
  const res = await fetch(url, { headers: { Accept: "application/json", ...(apiKey ? { Authorization: apiKey } : {}) } });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

/**
 * Books the paid registration for a confirmed-successful PayU payment.
 * Returns { ok: true, booked } on success, or { ok: false, reason } if it
 * couldn't proceed (order missing, tournament missing, user missing, etc).
 * `booked` is false (but ok: true) on a clean idempotent no-op — e.g. a
 * duplicate call for a txnid that's already registrationCompleted.
 */
export async function finalizeSuccessfulPayment(params: {
  txnid: string;
  tournamentId: string;
  game: Game;
  uid: string;
  mihpayid: string | null;
  payuStatus: string;
}): Promise<{ ok: true; booked: boolean } | { ok: false; reason: string }> {
  const { txnid, tournamentId, game, uid, mihpayid, payuStatus } = params;
  const cfg = GAME_CONFIG[game];
  const orderRef = adminDb.collection("payuOrders").doc(txnid);

  const userDoc = await adminDb.collection("users").doc(uid).get();
  const userData = userDoc.data();
  if (!userData) {
    await orderRef.set({ status: "failure", payuStatus: "user_not_found", updatedAt: new Date().toISOString() }, { merge: true });
    return { ok: false, reason: "user_not_found" };
  }

  // ── Valorant: network calls (rank refresh, Elo) happen BEFORE the
  // transaction — transactions retry on contention and must not re-trigger
  // external API calls or duplicate rankHistory entries on retry. ──────────
  let valorantUserUpdate: Record<string, any> | null = null;
  let valorantPlayerDoc: Record<string, any> | null = null;
  let valorantRankHistoryEntry: Record<string, any> | null = null;
  let dotaSmurfRiskScore = 0;

  if (game === "valorant") {
    let currentRank = userData.riotRank || "";
    let currentTier = userData.riotTier || 0;
    let peakTier = userData.riotPeakTier || currentTier;
    let peakRank = userData.riotPeakRank || currentRank;

    try {
      const mmrData = await refreshRiotRank(userData.riotRegion || "ap", userData.riotGameName, userData.riotTagLine || "");
      if (mmrData) {
        const newTier = mmrData.current_data?.currenttier || 0;
        const newRank = mmrData.current_data?.currenttierpatched || "Unranked";
        const apiPeakTier = mmrData.highest_rank?.tier || 0;
        const apiPeakRank = mmrData.highest_rank?.patched_tier || "Unranked";
        currentRank = newRank;
        currentTier = newTier;
        peakTier = Math.max(apiPeakTier, peakTier, newTier);
        peakRank = peakTier === apiPeakTier ? apiPeakRank : peakTier === (userData.riotPeakTier || 0) ? (userData.riotPeakRank || newRank) : newRank;
      }
    } catch { /* proceed with stored rank data */ }

    let iesportsRating = userData.iesportsRating || 0;
    const userUpdate: Record<string, any> = { riotRank: currentRank, riotTier: currentTier, riotPeakRank: peakRank, riotPeakTier: peakTier };

    if (!userData.iesportsRating) {
      iesportsRating = seedRating(currentTier, peakTier);
      userUpdate.iesportsRating = iesportsRating;
      userUpdate.iesportsRank = ratingToRank(iesportsRating);
      userUpdate.iesportsTier = ratingToTier(iesportsRating);
      userUpdate.iesportsMatchesPlayed = userData.iesportsMatchesPlayed || 0;
      valorantRankHistoryEntry = { timestamp: new Date().toISOString(), type: "seed", ratingBefore: 0, ratingAfter: iesportsRating, delta: iesportsRating };
    } else {
      const bumped = floorCheck(iesportsRating, currentTier, peakTier);
      if (bumped !== null) {
        const before = iesportsRating;
        iesportsRating = bumped;
        userUpdate.iesportsRating = bumped;
        userUpdate.iesportsRank = ratingToRank(bumped);
        userUpdate.iesportsTier = ratingToTier(bumped);
        valorantRankHistoryEntry = {
          timestamp: new Date().toISOString(), type: "riot_refresh", ratingBefore: before, ratingAfter: bumped, delta: bumped - before,
          riotRankBefore: userData.riotRank || "Unknown", riotRankAfter: currentRank, riotTierBefore: userData.riotTier || 0, riotTierAfter: currentTier,
        };
      } else {
        userUpdate.iesportsRank = ratingToRank(iesportsRating);
        userUpdate.iesportsTier = ratingToTier(iesportsRating);
      }
    }

    valorantUserUpdate = userUpdate;
    valorantPlayerDoc = {
      uid, riotGameName: userData.riotGameName, riotTagLine: userData.riotTagLine || "", riotAvatar: userData.riotAvatar || "",
      riotRank: currentRank, riotTier: currentTier, iesportsRating, iesportsRank: ratingToRank(iesportsRating), iesportsTier: ratingToTier(iesportsRating),
      skillLevel: 1, bracket: null, registeredAt: new Date().toISOString(),
    };
  } else if (game === "dota2") {
    dotaSmurfRiskScore = userData.smurfRiskScore || 0;
    try {
      await fetchAndSyncPlayer({ uid, steamId: userData.steamId, db: adminDb });
    } catch (syncErr: any) {
      console.error("OpenDota sync failed (non-blocking):", syncErr.message);
    }
  }

  // ── Idempotent, atomic booking ──────────────────────────────────────────
  let didBook = false;
  try {
    await adminDb.runTransaction(async (tx) => {
      const [orderSnap, tSnap, playerSnap] = await Promise.all([
        tx.get(orderRef),
        tx.get(adminDb.collection(cfg.collection).doc(tournamentId)),
        tx.get(adminDb.collection(cfg.collection).doc(tournamentId).collection(cfg.subcollection).doc(uid)),
      ]);

      if (!orderSnap.exists) throw new Error("ORDER_NOT_FOUND");
      const order = orderSnap.data()!;
      if (order.registrationCompleted === true) return; // idempotency guard, no-op

      if (!tSnap.exists) throw new Error("TOURNAMENT_NOT_FOUND");
      const tData = tSnap.data()!;
      if (playerSnap.exists) {
        tx.set(orderRef, { status: "success", payuStatus, mihpayid, registrationCompleted: true, updatedAt: new Date().toISOString() }, { merge: true });
        return;
      }
      if ((tData.slotsBooked || 0) >= tData.totalSlots) {
        tx.set(orderRef, { status: "failure", payuStatus: "slots_full", mihpayid, updatedAt: new Date().toISOString() }, { merge: true });
        return;
      }

      const playerRef = adminDb.collection(cfg.collection).doc(tournamentId).collection(cfg.subcollection).doc(uid);
      const tournamentRef = adminDb.collection(cfg.collection).doc(tournamentId);
      const userRef = adminDb.collection("users").doc(uid);

      if (game === "dota2") {
        tx.set(playerRef, {
          uid, steamId: userData.steamId, steamName: userData.steamName || "", steamAvatar: userData.steamAvatar || "",
          cachedScore: 0, cachedTopMatches: [], matchesPlayed: 0, smurfRiskScore: dotaSmurfRiskScore, disqualified: false,
          lastUpdated: new Date().toISOString(),
        });
      } else if (game === "cs2") {
        tx.set(playerRef, {
          uid, steamId: userData.steamId, steamName: userData.steamName || "", steamAvatar: userData.steamAvatar || "",
          cs2Rank: "", cs2RankTier: 0, skillLevel: 1, registeredAt: new Date().toISOString(),
        });
      } else if (game === "valorant" && valorantPlayerDoc) {
        tx.set(playerRef, valorantPlayerDoc);
        if (valorantUserUpdate) tx.update(userRef, valorantUserUpdate);
        if (valorantRankHistoryEntry) tx.set(userRef.collection("rankHistory").doc(), valorantRankHistoryEntry);
      }

      tx.update(tournamentRef, { slotsBooked: FieldValue.increment(1) });
      tx.update(userRef, { [cfg.userArrayField]: FieldValue.arrayUnion(tournamentId) });
      tx.set(orderRef, { status: "success", payuStatus, mihpayid, registrationCompleted: true, updatedAt: new Date().toISOString() }, { merge: true });
      didBook = true;
    });
  } catch (e: any) {
    console.error(`PayU booking transaction failed for txnid=${txnid}:`, e.message);
    return { ok: false, reason: e.message || "transaction_failed" };
  }

  if (didBook && game === "valorant") {
    try {
      await recalcTiers(tournamentId);
      await syncPlayerSnapshot(tournamentId);
    } catch (e: any) {
      console.error("Post-booking Valorant recalc failed (non-blocking):", e.message);
    }
  }

  if (didBook) {
    const tDoc = await adminDb.collection(cfg.collection).doc(tournamentId).get();
    const tData = tDoc.data() || {};
    const discordId = userData.discordId || (uid.startsWith("discord_") ? uid.replace("discord_", "") : "");
    if (discordId) {
      // The actual payment receipt — Discord is mandatory for every
      // registered user today, unlike email (only captured going forward,
      // see app/api/auth/discord-callback and discord-login-callback).
      const orderDoc = await orderRef.get();
      const amount = orderDoc.data()?.amount;
      sendDM(
        discordId,
        `✅ **Payment received** — ₹${amount ?? "?"} for **${tData.name || "your tournament"}**.\n` +
        `You're registered! Transaction ref: \`${txnid}\`.`
      ).catch(() => {});

      sendRegistrationDM({
        discordId,
        playerName: (game === "valorant" ? userData.riotGameName : userData.steamName) || userData.fullName || "Player",
        tournamentName: tData.name || "Tournament",
        tournamentId,
        startDate: tData.startDate || "",
        registrationDeadline: tData.registrationDeadline || "",
        format: tData.format || "shuffle",
        prizePool: tData.prizePool || "TBD",
        slotsBooked: tData.slotsBooked || 0,
        totalSlots: tData.totalSlots || 0,
        iesportsRank: game === "valorant" && valorantPlayerDoc ? valorantPlayerDoc.iesportsRank : "",
      }).catch(() => {});
    }
  }

  return { ok: true, booked: didBook };
}
