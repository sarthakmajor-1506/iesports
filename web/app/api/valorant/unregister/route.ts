import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid } = await req.json();
    if (!tournamentId || !uid) {
      return NextResponse.json({ error: "Missing tournamentId or uid" }, { status: 400 });
    }

    const tournRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const tourn = await tournRef.get();
    if (!tourn.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const data = tourn.data()!;

    // Don't allow unregister if teams are already formed or tournament is active/ended
    if (data.bracketsComputed) {
      return NextResponse.json({ error: "Cannot unregister after teams have been formed" }, { status: 400 });
    }
    if (data.status === "active" || data.status === "ended") {
      return NextResponse.json({ error: "Cannot unregister from an active or ended tournament" }, { status: 400 });
    }

    // Check if player is actually registered
    const playerRef = tournRef.collection("soloPlayers").doc(uid);
    const playerDoc = await playerRef.get();
    if (!playerDoc.exists) {
      return NextResponse.json({ error: "You are not registered for this tournament" }, { status: 400 });
    }

    // Check if player is a team captain — can't unregister if you have a team
    const teamsSnap = await adminDb.collection("valorantTeams")
      .where("tournamentId", "==", tournamentId)
      .where("captainUid", "==", uid)
      .get();
    if (!teamsSnap.empty) {
      return NextResponse.json({ error: "Cannot unregister — you are a team captain. Disband your team first." }, { status: 400 });
    }

    // Remove from soloPlayers subcollection
    await playerRef.delete();

    // Decrement slotsBooked
    await tournRef.update({ slotsBooked: FieldValue.increment(-1) });

    // Remove from user's registeredValorantTournaments array
    const userRef = adminDb.collection("users").doc(uid);
    await userRef.update({
      registeredValorantTournaments: FieldValue.arrayRemove(tournamentId),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Unregister error:", error);
    return NextResponse.json({ error: error.message || "Failed to unregister" }, { status: 500 });
  }
}
