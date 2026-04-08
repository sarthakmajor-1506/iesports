import { isNotAdmin } from "@/lib/checkAdmin";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/admin/update-player
 *
 * Updates a registered player's details in a tournament's soloPlayers subcollection
 * and optionally the global users doc. Used by admin to adjust ranks before shuffle.
 *
 * Body: { adminKey, tournamentId, collection, uid, updates: { riotTier?, riotRank?, ... } }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { adminKey, tournamentId, collection: col, uid, updates } = body;

    const secret = process.env.ADMIN_SECRET;
    if (!secret || adminKey !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!tournamentId || !uid || !updates || !col) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Whitelist of editable fields
    const allowed = [
      "riotRank", "riotTier", "riotGameName", "riotTagLine", "riotVerified",
      "iesportsRating", "iesportsRank", "iesportsTier",
      "dotaRankTier", "dotaBracket", "dotaMMR",
      "steamId", "steamName",
      "fullName", "phone", "discordUsername",
    ];

    const safeUpdates: Record<string, any> = {};
    for (const key of Object.keys(updates)) {
      if (allowed.includes(key)) {
        safeUpdates[key] = updates[key];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Ensure numeric fields are stored as numbers
    if ("riotTier" in safeUpdates) safeUpdates.riotTier = Number(safeUpdates.riotTier);
    if ("dotaRankTier" in safeUpdates) safeUpdates.dotaRankTier = Number(safeUpdates.dotaRankTier);
    if ("dotaMMR" in safeUpdates) safeUpdates.dotaMMR = Number(safeUpdates.dotaMMR);

    // Ensure iesports numeric fields are stored as numbers
    if ("iesportsRating" in safeUpdates) safeUpdates.iesportsRating = Number(safeUpdates.iesportsRating);
    if ("iesportsTier" in safeUpdates) safeUpdates.iesportsTier = Number(safeUpdates.iesportsTier);

    // 1. Update tournament soloPlayers doc (only rank-related fields that exist there)
    const tournamentPlayerFields = ["riotRank", "riotTier", "riotGameName", "riotTagLine", "iesportsRating", "iesportsRank", "iesportsTier"];
    const tournamentUpdates: Record<string, any> = {};
    for (const key of tournamentPlayerFields) {
      if (key in safeUpdates) tournamentUpdates[key] = safeUpdates[key];
    }

    const soloPlayersCol = col === "tournaments" ? "players" : "soloPlayers";
    if (Object.keys(tournamentUpdates).length > 0) {
      const playerRef = adminDb.collection(col).doc(tournamentId).collection(soloPlayersCol).doc(uid);
      const playerSnap = await playerRef.get();
      if (playerSnap.exists) {
        await playerRef.update(tournamentUpdates);
      }
    }

    // 2. Update global users doc
    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      await userRef.update(safeUpdates);
    }

    // 3. Recalc tiers if rank was changed (Valorant only)
    if (("riotTier" in safeUpdates || "riotRank" in safeUpdates) && col === "valorantTournaments") {
      const { recalcTiers } = await import("@/lib/recalcTiers");
      await recalcTiers(tournamentId);
    }

    return NextResponse.json({ success: true, updated: safeUpdates });
  } catch (e: any) {
    console.error("update-player error:", e.message);
    return NextResponse.json({ error: e.message || "Failed to update player" }, { status: 500 });
  }
}
