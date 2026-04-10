import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid } = await req.json();
    if (!tournamentId || !uid) {
      return NextResponse.json({ error: "Missing tournamentId or uid" }, { status: 400 });
    }

    const tournRef = adminDb.collection("tournaments").doc(tournamentId);
    const tourn = await tournRef.get();
    if (!tourn.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const data = tourn.data()!;

    if (data.status === "ongoing" || data.status === "ended") {
      return NextResponse.json({ error: "Cannot unregister from an active or ended tournament" }, { status: 400 });
    }

    // Check if player is registered in the players subcollection
    const playerRef = tournRef.collection("players").doc(uid);
    const playerDoc = await playerRef.get();
    if (!playerDoc.exists) {
      return NextResponse.json({ error: "You are not registered for this tournament" }, { status: 400 });
    }

    const playerData = playerDoc.data();
    const bracket = playerData?.dotaBracket || "";

    // Remove from players subcollection
    await playerRef.delete();

    // Decrement slotsBooked (and bracket-specific slots if applicable)
    const updates: Record<string, any> = {
      slotsBooked: FieldValue.increment(-1),
    };
    if (bracket) {
      updates[`brackets.${bracket}.slotsBooked`] = FieldValue.increment(-1);
    }
    await tournRef.update(updates);

    // Remove from user's registeredTournaments array
    const userRef = adminDb.collection("users").doc(uid);
    await userRef.update({
      registeredTournaments: FieldValue.arrayRemove(tournamentId),
    });

    // Also remove from soloPool if exists
    const soloPoolSnap = await adminDb.collection("soloPool")
      .where("tournamentId", "==", tournamentId)
      .where("uid", "==", uid)
      .get();
    for (const doc of soloPoolSnap.docs) {
      await doc.ref.delete();
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to unregister" }, { status: 500 });
  }
}
