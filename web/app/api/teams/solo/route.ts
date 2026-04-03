import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { fetchAndStoreRank } from "@/lib/opendota";
import { FieldValue } from "firebase-admin/firestore";


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
    if (!soloExisting.empty) return NextResponse.json({ error: "You are already in the solo pool for this tournament" }, { status: 400 });

    // Get user doc and validate mandatory fields
    const userDoc = await adminDb.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData?.fullName) return NextResponse.json({ error: "Full name is required. Please update your profile." }, { status: 400 });
    if (!userData?.phone && !userData?.phoneNumber) return NextResponse.json({ error: "Phone number is required. Please log in with your phone number." }, { status: 400 });
    if (!userData?.discordId) return NextResponse.json({ error: "Discord account is required. Please connect Discord first." }, { status: 400 });
    if (!userData?.steamId) return NextResponse.json({ error: "Steam account not linked" }, { status: 400 });

    const { bracket, mmr } = await fetchAndStoreRank(uid, userData.steamId, adminDb);

    // Check bracket has slots
    const tournamentDoc = await adminDb.collection("tournaments").doc(tournamentId).get();
    const tData = tournamentDoc.data();
    if (!tData) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    if (tData.brackets[bracket].slotsBooked >= tData.brackets[bracket].slotsTotal) {
      return NextResponse.json({ error: "No slots left in your bracket" }, { status: 400 });
    }

    // Add to solo pool
    await adminDb.collection("soloPool").add({
      tournamentId,
      uid,
      bracket,
      mmr,
      status: "waiting",
      registeredAt: new Date(),
    });

    console.log("About to write registeredTournaments for uid:", uid, "tournamentId:", tournamentId);
    await adminDb.collection("users").doc(uid).update({ registeredTournaments: FieldValue.arrayUnion(tournamentId) });
    console.log("Successfully wrote registeredTournaments");

    // Increment slotsBooked
    await adminDb.collection("tournaments").doc(tournamentId).update({
      slotsBooked: (tData.slotsBooked || 0) + 1,
      [`brackets.${bracket}.slotsBooked`]: (tData.brackets[bracket].slotsBooked || 0) + 1,
    });

    return NextResponse.json({ success: true, bracket });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}