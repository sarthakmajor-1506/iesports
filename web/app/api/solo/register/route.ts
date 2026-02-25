// /app/api/solo/register/route.ts

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid } = await req.json();
    if (!tournamentId || !uid) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    // Get tournament
    const tDoc = await adminDb.collection("soloTournaments").doc(tournamentId).get();
    if (!tDoc.exists) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    const tData = tDoc.data()!;

    // Check tournament is active
    if (tData.status === "ended") return NextResponse.json({ error: "Tournament has ended" }, { status: 400 });
    if (tData.status === "upcoming") return NextResponse.json({ error: "Tournament hasn't started yet" }, { status: 400 });

    // Check registration deadline
    const deadline = new Date(tData.registrationDeadline);
    if (new Date() > deadline) return NextResponse.json({ error: "Registration deadline has passed" }, { status: 400 });

    // Check paid tournament
    if (tData.entryFee > 0) return NextResponse.json({ error: "Payment integration coming soon" }, { status: 400 });

    // Check slots
    if (tData.slotsBooked >= tData.totalSlots) return NextResponse.json({ error: "Tournament is full" }, { status: 400 });

    // Check not already registered
    const existing = await adminDb
      .collection("soloTournaments").doc(tournamentId)
      .collection("players").doc(uid).get();
    if (existing.exists) return NextResponse.json({ error: "You are already registered" }, { status: 400 });

    // Get user data
    const userDoc = await adminDb.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData?.steamId) return NextResponse.json({ error: "Steam account not linked" }, { status: 400 });

    // Add player to tournament subcollection
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

    // Increment slots
    await adminDb.collection("soloTournaments").doc(tournamentId).update({
      slotsBooked: FieldValue.increment(1),
    });

    // Track on user doc
    await adminDb.collection("users").doc(uid).update({
      registeredSoloTournaments: FieldValue.arrayUnion(tournamentId),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}