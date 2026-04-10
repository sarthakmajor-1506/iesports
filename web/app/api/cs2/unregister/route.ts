import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid } = await req.json();
    if (!tournamentId || !uid) {
      return NextResponse.json({ error: "Missing tournamentId or uid" }, { status: 400 });
    }

    const tournRef = adminDb.collection("cs2Tournaments").doc(tournamentId);
    const tourn = await tournRef.get();
    if (!tourn.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const data = tourn.data()!;

    if (data.bracketsComputed) {
      return NextResponse.json({ error: "Cannot unregister after teams have been formed" }, { status: 400 });
    }
    if (data.status === "active" || data.status === "ended") {
      return NextResponse.json({ error: "Cannot unregister from an active or ended tournament" }, { status: 400 });
    }

    const playerRef = tournRef.collection("soloPlayers").doc(uid);
    const playerDoc = await playerRef.get();
    if (!playerDoc.exists) {
      return NextResponse.json({ error: "You are not registered for this tournament" }, { status: 400 });
    }

    await playerRef.delete();
    await tournRef.update({ slotsBooked: FieldValue.increment(-1) });

    const userRef = adminDb.collection("users").doc(uid);
    await userRef.update({
      registeredCS2Tournaments: FieldValue.arrayRemove(tournamentId),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to unregister" }, { status: 500 });
  }
}
