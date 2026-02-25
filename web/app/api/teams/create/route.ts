import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { fetchAndStoreRank } from "@/lib/opendota";
import { FieldValue } from "firebase-admin/firestore";


function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid } = await req.json();
    if (!tournamentId || !uid) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    // Check not already registered
    const existing = await adminDb.collection("teams")
      .where("tournamentId", "==", tournamentId)
      .where("members", "array-contains", uid).get();
    if (!existing.empty) return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 400 });

    const soloExisting = await adminDb.collection("soloPool")
      .where("tournamentId", "==", tournamentId)
      .where("uid", "==", uid).get();
    if (!soloExisting.empty) return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 400 });

    // Get user's Steam ID
    const userDoc = await adminDb.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData?.steamId) return NextResponse.json({ error: "Steam account not linked" }, { status: 400 });

    // Fetch rank from OpenDota
    const { bracket } = await fetchAndStoreRank(uid, userData.steamId, adminDb);

    // Check bracket has slots
    const tournamentDoc = await adminDb.collection("tournaments").doc(tournamentId).get();
    const tData = tournamentDoc.data();
    if (!tData) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    if (tData.brackets[bracket].slotsBooked >= tData.brackets[bracket].slotsTotal) {
      return NextResponse.json({ error: `No slots left in your bracket` }, { status: 400 });
    }

    // Generate unique team code
    let teamCode = generateCode();
    let codeExists = !(await adminDb.collection("teams").where("teamCode", "==", teamCode).get()).empty;
    while (codeExists) {
      teamCode = generateCode();
      codeExists = !(await adminDb.collection("teams").where("teamCode", "==", teamCode).get()).empty;
    }

    // Create team
    await adminDb.collection("teams").add({
      tournamentId,
      captainUid: uid,
      members: [uid],
      memberBrackets: { [uid]: bracket },
      teamCode,
      status: "forming",
      createdAt: new Date(),
    });
    await adminDb.collection("users").doc(uid).update({ registeredTournaments: FieldValue.arrayUnion(tournamentId) });

    return NextResponse.json({ teamCode, bracket });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}