import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendRegistrationDM } from "@/lib/discord";
import { requirePaidEntry } from "@/lib/paidEntry";
import { claimSoloSlot } from "@/lib/registrationSlots";
import { verifyCaller } from "@/lib/apiAuth";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid } = await req.json();
    if (!tournamentId || !uid) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const caller = await verifyCaller(req, uid);
    if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

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

    // Paid entry — no-op for free tournaments, 402 until the fee is settled.
    const gate = await requirePaidEntry({ game: "cs2", tournamentId, uid, tournament: tData });
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.error, requiresPayment: gate.requiresPayment, entryFee: gate.entryFee },
        { status: gate.status }
      );
    }

    const existingDoc = await adminDb.collection("cs2Tournaments").doc(tournamentId).collection("soloPlayers").doc(uid).get();
    if (existingDoc.exists) {
      return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 400 });
    }

    // Player document, slot counter and the user's tournament array move in one
    // transaction. A duplicate PayU webhook or a double-clicked button loses the
    // race here rather than counting the same player twice.
    const claim = await claimSoloSlot({
      game: "cs2",
      tournamentId,
      uid,
      player: {
        uid,
        steamId: userData.steamId,
        steamName: userData.steamName || "",
        steamAvatar: userData.steamAvatar || "",
        cs2Rank: "",
        cs2RankTier: 0,
        skillLevel: 1,
        registeredAt: new Date().toISOString(),
      },
    });

    if (!claim.ok) {
      if (claim.reason === "already_registered") {
        return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 400 });
      }
      if (claim.reason === "full") {
        return NextResponse.json({ error: "Tournament is full" }, { status: 400 });
      }
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

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
        slotsBooked: claim.slotsBooked,
        totalSlots: tData.totalSlots || 0,
        iesportsRank: "",
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
