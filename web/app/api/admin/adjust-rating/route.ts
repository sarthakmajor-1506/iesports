import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { ratingToRank, ratingToTier } from "@/lib/elo";
import { syncPlayerSnapshotsForUser } from "@/lib/valorantPlayerSnapshot";

/**
 * POST /api/admin/adjust-rating
 *
 * Manually adjust a player's IEsports rating with an audit trail.
 * Creates a rankHistory entry of type "admin_override" with the admin's note.
 *
 * Body: { adminKey, uid, delta: number, note: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { adminKey, uid, delta, note } = await req.json();

    if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!uid || delta === undefined || delta === null) {
      return NextResponse.json({ error: "Missing uid or delta" }, { status: 400 });
    }

    const deltaNum = Number(delta);
    if (isNaN(deltaNum) || deltaNum === 0) {
      return NextResponse.json({ error: "Delta must be a non-zero number" }, { status: 400 });
    }

    const userRef = adminDb.collection("users").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const data = userDoc.data()!;
    const ratingBefore = data.iesportsRating || 0;
    const ratingAfter = Math.max(0, ratingBefore + deltaNum);

    const newRank = ratingToRank(ratingAfter);
    const newTier = ratingToTier(ratingAfter);

    // Update user doc
    await userRef.update({
      iesportsRating: ratingAfter,
      iesportsRank: newRank,
      iesportsTier: newTier,
    });

    // Sync to all tournament soloPlayers docs
    const registeredTournaments = data.registeredValorantTournaments || [];
    for (const tId of registeredTournaments) {
      const spRef = adminDb.collection("valorantTournaments").doc(tId).collection("soloPlayers").doc(uid);
      const spDoc = await spRef.get();
      if (spDoc.exists) {
        await spRef.update({
          riotRank: newRank,
          riotTier: newTier,
          iesportsRating: ratingAfter,
          iesportsRank: newRank,
          iesportsTier: newTier,
        });
      }
    }

    // Refresh the denormalized playersSnapshot on every tournament this user is in.
    // Done after the soloPlayers updates above so each rebuild sees the new values.
    await syncPlayerSnapshotsForUser(uid, registeredTournaments);

    // Create rank history entry
    await userRef.collection("rankHistory").add({
      timestamp: new Date().toISOString(),
      type: "admin_override",
      ratingBefore,
      ratingAfter,
      delta: deltaNum,
      adminNote: note || "",
    });

    return NextResponse.json({
      success: true,
      uid,
      ratingBefore,
      ratingAfter,
      delta: deltaNum,
      iesportsRank: ratingToRank(ratingAfter),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
