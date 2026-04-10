import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { sendRegistrationDM } from "@/lib/discord";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid } = await req.json();
    if (!tournamentId || !uid) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const userDoc = await adminDb.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!userData.fullName) {
      return NextResponse.json({ error: "Full name is required. Please update your profile." }, { status: 400 });
    }
    if (!userData.phone && !userData.phoneNumber) {
      return NextResponse.json({ error: "Phone number is required. Please log in with your phone number." }, { status: 400 });
    }
    if (!userData.discordId) {
      return NextResponse.json({ error: "Discord account is required. Please connect Discord first." }, { status: 400 });
    }
    if (!userData.steamId) {
      return NextResponse.json({ error: "Connect your Steam account first" }, { status: 400 });
    }

    const tournamentDoc = await adminDb.collection("cs2Tournaments").doc(tournamentId).get();
    const tData = tournamentDoc.data();
    if (!tData) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    if (tData.slotsBooked >= tData.totalSlots) {
      return NextResponse.json({ error: "Tournament is full" }, { status: 400 });
    }

    const existingDoc = await adminDb.collection("cs2Tournaments").doc(tournamentId).collection("soloPlayers").doc(uid).get();
    if (existingDoc.exists) {
      return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 400 });
    }

    await adminDb.collection("cs2Tournaments").doc(tournamentId).collection("soloPlayers").doc(uid).set({
      uid,
      steamId: userData.steamId,
      steamName: userData.steamName || "",
      steamAvatar: userData.steamAvatar || "",
      cs2Rank: "",
      cs2RankTier: 0,
      skillLevel: 1,
      registeredAt: new Date().toISOString(),
    });

    await adminDb.collection("cs2Tournaments").doc(tournamentId).update({
      slotsBooked: FieldValue.increment(1),
    });

    await adminDb.collection("users").doc(uid).update({
      registeredCS2Tournaments: FieldValue.arrayUnion(tournamentId),
    });

    const discordId = userData.discordId || (uid.startsWith("discord_") ? uid.replace("discord_", "") : "");
    if (discordId) {
      sendRegistrationDM({
        discordId,
        playerName: userData.steamName || userData.fullName || "Player",
        tournamentName: tData.name || "Tournament",
        tournamentId,
        startDate: tData.startDate || "",
        registrationDeadline: tData.registrationDeadline || "",
        format: tData.format || "shuffle",
        prizePool: tData.prizePool || "TBD",
        slotsBooked: (tData.slotsBooked || 0) + 1,
        totalSlots: tData.totalSlots || 0,
        iesportsRank: "",
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
