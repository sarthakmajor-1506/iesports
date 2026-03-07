// /app/api/solo/register/route.ts

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { fetchAndSyncPlayer } from "@/lib/fetchAndSyncPlayer";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid } = await req.json();
    if (!tournamentId || !uid) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const tDoc = await adminDb.collection("soloTournaments").doc(tournamentId).get();
    if (!tDoc.exists) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    const tData = tDoc.data()!;

    // ── Date-based checks only — ignore status field entirely ───────────
    const now = new Date();
    const weekEnd = new Date(tData.weekEnd);
    const deadline = new Date(tData.registrationDeadline);

    // Tournament already ended
    if (now > weekEnd) return NextResponse.json({ error: "Tournament has ended" }, { status: 400 });

    // Registration deadline passed
    if (now > deadline) return NextResponse.json({ error: "Registration deadline has passed" }, { status: 400 });

    // NOTE: No "hasn't started yet" check — users CAN register for upcoming/next week tournaments
    // as long as the registration deadline hasn't passed

    if (tData.entryFee > 0) return NextResponse.json({ error: "Payment integration coming soon" }, { status: 400 });

    if ((tData.slotsBooked || 0) >= tData.totalSlots) return NextResponse.json({ error: "Tournament is full" }, { status: 400 });

    const existing = await adminDb
      .collection("soloTournaments").doc(tournamentId)
      .collection("players").doc(uid).get();
    if (existing.exists) return NextResponse.json({ error: "You are already registered" }, { status: 400 });

    const userDoc = await adminDb.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData?.steamId) return NextResponse.json({ error: "Steam account not linked" }, { status: 400 });

    // Sync rank + match history
    try {
      await fetchAndSyncPlayer({ uid, steamId: userData.steamId, db: adminDb });
    } catch (syncErr: any) {
      console.error("OpenDota sync failed (non-blocking):", syncErr.message);
    }

    await adminDb
      .collection("soloTournaments").doc(tournamentId)
      .collection("players").doc(uid).set({
        uid,
        steamId: userData.steamId,
        steamName: userData.steamName || "",
        steamAvatar: userData.steamAvatar || "",
        cachedScore: 0,
        cachedTopMatches: [],
        matchesPlayed: 0,
        smurfRiskScore: userData.smurfRiskScore || 0,
        disqualified: false,
        lastUpdated: new Date().toISOString(),
      });

    await adminDb.collection("soloTournaments").doc(tournamentId).update({
      slotsBooked: FieldValue.increment(1),
    });

    await adminDb.collection("users").doc(uid).update({
      registeredSoloTournaments: FieldValue.arrayUnion(tournamentId),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}