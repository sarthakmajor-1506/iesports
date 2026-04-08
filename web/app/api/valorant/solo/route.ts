import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { recalcTiers } from "@/lib/recalcTiers";
import { seedRating, floorCheck, ratingToRank, ratingToTier } from "@/lib/elo";
import { sendRegistrationDM } from "@/lib/discord";

const HENRIK_BASE = "https://api.henrikdev.xyz/valorant";

async function refreshRiotRank(region: string, name: string, tag: string) {
  const apiKey = process.env.HENRIK_API_KEY || "";
  const encodedName = encodeURIComponent(name);
  const encodedTag = encodeURIComponent(tag);
  const url = `${HENRIK_BASE}/v2/mmr/${region}/${encodedName}/${encodedTag}?api_key=${apiKey}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...(apiKey ? { Authorization: apiKey } : {}) },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data;
}

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid } = await req.json();
    if (!tournamentId || !uid) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // ── Check user doc ─────────────────────────────────────────────────────
    const userDoc = await adminDb.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Validate mandatory fields
    if (!userData.fullName) {
      return NextResponse.json({ error: "Full name is required. Please update your profile." }, { status: 400 });
    }
    if (!userData.phone && !userData.phoneNumber) {
      return NextResponse.json({ error: "Phone number is required. Please log in with your phone number." }, { status: 400 });
    }
    if (!userData.discordId) {
      return NextResponse.json({ error: "Discord account is required. Please connect Discord first." }, { status: 400 });
    }

    // Check Riot ID is linked
    if (!userData.riotGameName) {
      return NextResponse.json({ error: "Connect your Riot ID first" }, { status: 400 });
    }

    // Check riotVerified — block "unlinked", allow "pending" with warning
    const riotVerified = userData.riotVerified || "unlinked";
    if (riotVerified === "unlinked") {
      return NextResponse.json({ error: "Connect your Riot ID first" }, { status: 400 });
    }

    // ── Check tournament exists ────────────────────────────────────────────
    const tournamentDoc = await adminDb.collection("valorantTournaments").doc(tournamentId).get();
    const tData = tournamentDoc.data();
    if (!tData) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // Check slots
    if (tData.slotsBooked >= tData.totalSlots) {
      return NextResponse.json({ error: "Tournament is full" }, { status: 400 });
    }

    // ── Check not already registered ───────────────────────────────────────
    const existingDoc = await adminDb
      .collection("valorantTournaments")
      .doc(tournamentId)
      .collection("soloPlayers")
      .doc(uid)
      .get();

    if (existingDoc.exists) {
      return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 400 });
    }

    // ── Refresh Riot rank from Henrik API ───────────────────────────────
    let currentRank = userData.riotRank || "";
    let currentTier = userData.riotTier || 0;
    let peakTier = userData.riotPeakTier || currentTier;
    let peakRank = userData.riotPeakRank || currentRank;
    let rankRefreshed = false;

    try {
      const mmrData = await refreshRiotRank(
        userData.riotRegion || "ap",
        userData.riotGameName,
        userData.riotTagLine || ""
      );
      if (mmrData) {
        const newTier = mmrData.current_data?.currenttier || 0;
        const newRank = mmrData.current_data?.currenttierpatched || "Unranked";
        const apiPeakTier = mmrData.highest_rank?.tier || 0;
        const apiPeakRank = mmrData.highest_rank?.patched_tier || "Unranked";

        currentRank = newRank;
        currentTier = newTier;
        peakTier = Math.max(apiPeakTier, peakTier, newTier);
        peakRank = peakTier === apiPeakTier ? apiPeakRank
          : peakTier === (userData.riotPeakTier || 0) ? (userData.riotPeakRank || newRank)
          : newRank;
        rankRefreshed = true;
      }
    } catch { /* proceed with stored rank data */ }

    // ── Seed or floor-check IEsports rating ──────────────────────────────
    let iesportsRating = userData.iesportsRating || 0;
    let ratingChanged = false;

    const userUpdate: Record<string, any> = {
      riotRank: currentRank,
      riotTier: currentTier,
      riotPeakRank: peakRank,
      riotPeakTier: peakTier,
    };

    if (!userData.iesportsRating) {
      iesportsRating = seedRating(currentTier, peakTier);
      userUpdate.iesportsRating = iesportsRating;
      userUpdate.iesportsRank = ratingToRank(iesportsRating);
      userUpdate.iesportsTier = ratingToTier(iesportsRating);
      userUpdate.iesportsMatchesPlayed = userData.iesportsMatchesPlayed || 0;
      ratingChanged = true;

      await adminDb.collection("users").doc(uid).collection("rankHistory").add({
        timestamp: new Date().toISOString(),
        type: "seed",
        ratingBefore: 0,
        ratingAfter: iesportsRating,
        delta: iesportsRating,
      });
    } else {
      const bumped = floorCheck(iesportsRating, currentTier, peakTier);
      if (bumped !== null) {
        const before = iesportsRating;
        iesportsRating = bumped;
        userUpdate.iesportsRating = bumped;
        userUpdate.iesportsRank = ratingToRank(bumped);
        userUpdate.iesportsTier = ratingToTier(bumped);
        ratingChanged = true;

        await adminDb.collection("users").doc(uid).collection("rankHistory").add({
          timestamp: new Date().toISOString(),
          type: "riot_refresh",
          ratingBefore: before,
          ratingAfter: bumped,
          delta: bumped - before,
          riotRankBefore: userData.riotRank || "Unknown",
          riotRankAfter: currentRank,
          riotTierBefore: userData.riotTier || 0,
          riotTierAfter: currentTier,
        });
      } else {
        userUpdate.iesportsRank = ratingToRank(iesportsRating);
        userUpdate.iesportsTier = ratingToTier(iesportsRating);
      }
    }

    await adminDb.collection("users").doc(uid).update(userUpdate);

    // ── Write to soloPlayers subcollection ────────────────────────────────
    await adminDb
      .collection("valorantTournaments")
      .doc(tournamentId)
      .collection("soloPlayers")
      .doc(uid)
      .set({
        uid,
        riotGameName: userData.riotGameName,
        riotTagLine: userData.riotTagLine || "",
        riotAvatar: userData.riotAvatar || "",
        riotRank: currentRank,
        riotTier: currentTier,
        iesportsRating,
        iesportsRank: ratingToRank(iesportsRating),
        iesportsTier: ratingToTier(iesportsRating),
        skillLevel: 1,
        bracket: null,
        registeredAt: new Date().toISOString(),
      });

    // ── Update tournament slotsBooked ──────────────────────────────────────
    await adminDb.collection("valorantTournaments").doc(tournamentId).update({
      slotsBooked: FieldValue.increment(1),
    });

    // ── Update user's registered tournaments ───────────────────────────────
    await adminDb.collection("users").doc(uid).update({
      registeredValorantTournaments: FieldValue.arrayUnion(tournamentId),
    });

    // ── Recalculate tiers for all players based on quantiles ──────────────
    await recalcTiers(tournamentId);

    // ── Send registration DM (fire-and-forget — never blocks registration) ──
    const discordId = userData.discordId || (uid.startsWith("discord_") ? uid.replace("discord_", "") : "");
    if (discordId) {
      sendRegistrationDM({
        discordId,
        playerName: userData.riotGameName || userData.fullName || "Player",
        tournamentName: tData.name || "Tournament",
        tournamentId,
        startDate: tData.startDate || "",
        format: tData.format || "shuffle",
        prizePool: tData.prizePool || "TBD",
        slotsBooked: (tData.slotsBooked || 0) + 1,
        totalSlots: tData.totalSlots || 0,
        iesportsRank: ratingToRank(iesportsRating),
      }).catch(() => {}); // never fail the registration
    }

    return NextResponse.json({
      success: true,
      riotVerified,
      rankRefreshed,
      ratingChanged,
      iesportsRating,
      iesportsRank: ratingToRank(iesportsRating),
      riotRank: currentRank,
      warning: riotVerified === "pending"
        ? "Your Riot ID is pending verification. Registration accepted but may require verification before tournament starts."
        : undefined,
    });
  } catch (e: any) {
    console.error("Valorant solo registration error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
