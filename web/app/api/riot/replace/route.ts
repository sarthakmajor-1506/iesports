import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { floorCheck, ratingToRank, ratingToTier } from "@/lib/elo";

const COOLDOWN_DAYS = 30;

/**
 * POST /api/riot/replace
 *
 * Replaces the user's Riot ID with a completely different account.
 * Guards:
 *   1. Not in any active tournament
 *   2. 30-day cooldown since last replacement
 *   3. New PUUID not already linked to another user
 * Effects:
 *   - Old Riot ID stored in riotHistory array
 *   - riotVerified resets to "pending"
 *   - iE rating floor-checked against new rank (never drops)
 */
export async function POST(req: NextRequest) {
  try {
    const { uid, riotId, region } = await req.json();
    if (!uid || !riotId) {
      return NextResponse.json({ error: "uid and riotId required" }, { status: 400 });
    }

    // Parse Riot ID
    const hashIdx = riotId.lastIndexOf("#");
    if (hashIdx <= 0 || hashIdx === riotId.length - 1) {
      return NextResponse.json({ error: "Invalid Riot ID format. Use Name#TAG" }, { status: 400 });
    }
    const gameName = riotId.slice(0, hashIdx).trim();
    const tagLine = riotId.slice(hashIdx + 1).trim();

    // Get user
    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const userData = userDoc.data()!;

    // ── Guard 1: Cooldown ─────────────────────────────────────────────
    if (userData.riotLastChanged) {
      const lastChanged = new Date(userData.riotLastChanged);
      const daysSince = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < COOLDOWN_DAYS) {
        const daysLeft = Math.ceil(COOLDOWN_DAYS - daysSince);
        return NextResponse.json({
          error: `You can change your Riot ID once every ${COOLDOWN_DAYS} days. Try again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
        }, { status: 429 });
      }
    }

    // ── Guard 2: Not in active tournament ─────────────────────────────
    const activeTournaments = await adminDb.collection("valorantTournaments")
      .where("status", "in", ["upcoming", "live", "registration_open"])
      .get();

    for (const tDoc of activeTournaments.docs) {
      const playerDoc = await tDoc.ref.collection("soloPlayers").doc(uid).get();
      if (playerDoc.exists) {
        return NextResponse.json({
          error: `You're registered in "${tDoc.data().name}". You can change your Riot ID after the tournament ends.`,
        }, { status: 400 });
      }
    }

    // Also check tournaments that haven't explicitly ended
    const nonEndedTournaments = await adminDb.collection("valorantTournaments")
      .where("status", "!=", "ended")
      .get();

    for (const tDoc of nonEndedTournaments.docs) {
      // Skip ones we already checked
      if (activeTournaments.docs.some(d => d.id === tDoc.id)) continue;
      const playerDoc = await tDoc.ref.collection("soloPlayers").doc(uid).get();
      if (playerDoc.exists) {
        const tData = tDoc.data();
        // Check if tournament end date has passed
        if (tData.endDate && new Date(tData.endDate) > new Date()) {
          return NextResponse.json({
            error: `You're registered in "${tData.name}". You can change your Riot ID after the tournament ends.`,
          }, { status: 400 });
        }
      }
    }

    // ── Lookup new Riot ID via interim Valorant rank API ───────────────
    const henrikKey = process.env.HENRIK_API_KEY || "";
    const searchRegion = region || "ap";

    const acctRes = await fetch(
      `https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}?api_key=${henrikKey}`,
      { headers: { "Authorization": henrikKey } }
    );

    if (!acctRes.ok) {
      if (acctRes.status === 404) return NextResponse.json({ error: "Player not found" }, { status: 404 });
      if (acctRes.status === 429) return NextResponse.json({ error: "Rate limited. Try again in a minute." }, { status: 429 });
      return NextResponse.json({ error: "Failed to look up player" }, { status: 502 });
    }

    const acctData = await acctRes.json();
    const newPuuid = acctData.data?.puuid;

    if (!newPuuid) {
      return NextResponse.json({ error: "Could not retrieve PUUID" }, { status: 502 });
    }

    // ── Guard 3: PUUID uniqueness ─────────────────────────────────────
    if (newPuuid !== userData.riotPuuid) {
      const existing = await adminDb.collection("users")
        .where("riotPuuid", "==", newPuuid)
        .get();

      const otherUser = existing.docs.find(d => d.id !== uid);
      if (otherUser) {
        return NextResponse.json({
          error: "This Riot ID is already linked to another IEsports account.",
        }, { status: 409 });
      }
    }

    // ── Fetch rank for new account ────────────────────────────────────
    let newRank = "Unranked";
    let newTier = 0;

    const mmrRes = await fetch(
      `https://api.henrikdev.xyz/valorant/v2/mmr/${searchRegion}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}?api_key=${henrikKey}`,
      { headers: { "Authorization": henrikKey } }
    );

    if (mmrRes.ok) {
      const mmrData = await mmrRes.json();
      newRank = mmrData.data?.current_data?.currenttierpatched || "Unranked";
      newTier = mmrData.data?.current_data?.currenttier || 0;
    }

    // ── iE Rating floor-check ─────────────────────────────────────────
    let iesportsRating = userData.iesportsRating || 0;
    let ratingChanged = false;

    if (iesportsRating > 0) {
      const bumped = floorCheck(iesportsRating, newTier, Math.max(newTier, userData.riotPeakTier || 0));
      if (bumped !== null) {
        const before = iesportsRating;
        iesportsRating = bumped;
        ratingChanged = true;

        await adminDb.collection("users").doc(uid).collection("rankHistory").add({
          timestamp: new Date().toISOString(),
          type: "riot_id_change",
          ratingBefore: before,
          ratingAfter: bumped,
          delta: bumped - before,
          oldRiotId: `${userData.riotGameName}#${userData.riotTagLine}`,
          newRiotId: `${gameName}#${tagLine}`,
        });
      }
    }

    // ── Store old ID in history ───────────────────────────────────────
    const historyEntry = {
      puuid: userData.riotPuuid || "",
      gameName: userData.riotGameName || "",
      tagLine: userData.riotTagLine || "",
      rank: userData.riotRank || "",
      tier: userData.riotTier || 0,
      changedAt: new Date().toISOString(),
    };

    // ── Update user doc ───────────────────────────────────────────────
    const update: Record<string, any> = {
      riotGameName: acctData.data.name,
      riotTagLine: acctData.data.tag,
      riotAvatar: acctData.data.card?.small || acctData.data.card?.large || "",
      riotPuuid: newPuuid,
      riotRegion: acctData.data.region || searchRegion,
      riotAccountLevel: acctData.data.account_level || 0,
      riotRank: newRank,
      riotTier: newTier,
      riotVerified: "pending",
      riotLinkedAt: new Date().toISOString(),
      riotLastChanged: new Date().toISOString(),
      riotHistory: FieldValue.arrayUnion(historyEntry),
    };

    if (ratingChanged) {
      update.iesportsRating = iesportsRating;
      update.iesportsRank = ratingToRank(iesportsRating);
      update.iesportsTier = ratingToTier(iesportsRating);
    }

    await adminDb.collection("users").doc(uid).update(update);

    return NextResponse.json({
      success: true,
      gameName: acctData.data.name,
      tagLine: acctData.data.tag,
      avatar: acctData.data.card?.small || "",
      rank: newRank,
      tier: newTier,
      ratingChanged,
      iesportsRating: ratingChanged ? iesportsRating : undefined,
    });
  } catch (e: any) {
    console.error("Riot replace error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
