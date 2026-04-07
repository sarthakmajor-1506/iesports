import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/admin/update-user
 *
 * Updates a user's global profile fields directly (no tournament context needed).
 * Used by admin Player Registry to edit any user's details.
 *
 * Body: { adminKey, uid, updates: { fullName?, phone?, riotRank?, ... } }
 */
export async function POST(req: NextRequest) {
  try {
    const { adminKey, uid, updates } = await req.json();

    if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!uid || !updates || typeof updates !== "object") {
      return NextResponse.json({ error: "Missing uid or updates" }, { status: 400 });
    }

    const allowed = [
      "fullName", "phone", "upiId", "personalPhoto",
      "riotGameName", "riotTagLine", "riotRank", "riotTier", "riotVerified", "riotRegion",
      "iesportsRating", "iesportsRank", "iesportsTier",
      "steamId", "steamName",
      "discordUsername",
      "dotaRankTier", "dotaBracket", "dotaMMR",
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

    if ("riotTier" in safeUpdates) safeUpdates.riotTier = Number(safeUpdates.riotTier);
    if ("dotaRankTier" in safeUpdates) safeUpdates.dotaRankTier = Number(safeUpdates.dotaRankTier);
    if ("dotaMMR" in safeUpdates) safeUpdates.dotaMMR = Number(safeUpdates.dotaMMR);

    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await userRef.update(safeUpdates);

    return NextResponse.json({ success: true, updated: safeUpdates });
  } catch (e: any) {
    console.error("update-user error:", e.message);
    return NextResponse.json({ error: e.message || "Failed to update user" }, { status: 500 });
  }
}
