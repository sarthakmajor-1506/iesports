import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid } = await req.json();
    if (!tournamentId || !uid) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // ── Check user doc ─────────────────────────────────────────────────────
    const userDoc = await adminDb.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check Riot ID is linked
    if (!userData.riotGameName) {
      return NextResponse.json({ error: "Connect your Riot ID first" }, { status: 400 });
    }

    // Check riotVerified — block "unlinked", allow "pending" with warning
    const riotVerified = userData.riotVerified || "unlinked";
    if (riotVerified === "unlinked") {
      return NextResponse.json({ error: "Connect your Riot ID first" }, { status: 400 });
    }

    // ── Check tournament exists ────────────────────────────────────────────
    const tournamentDoc = await adminDb.collection("valorantTournaments").doc(tournamentId).get();
    const tData = tournamentDoc.data();
    if (!tData) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // Check slots
    if (tData.slotsBooked >= tData.totalSlots) {
      return NextResponse.json({ error: "Tournament is full" }, { status: 400 });
    }

    // ── Check not already registered ───────────────────────────────────────
    const existingDoc = await adminDb
      .collection("valorantTournaments")
      .doc(tournamentId)
      .collection("soloPlayers")
      .doc(uid)
      .get();

    if (existingDoc.exists) {
      return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 400 });
    }

    // ── Compute skill level from rank ──────────────────────────────────────
    const riotRank = userData.riotRank || "";
    const baseTier = riotRank.split(" ")[0];
    const skillLevels: Record<string, number> = {
      "Iron": 1, "Bronze": 1, "Silver": 1, "Gold": 1,
      "Platinum": 2, "Diamond": 3, "Ascendant": 4, "Immortal": 5, "Radiant": 5,
    };
    const skillLevel = skillLevels[baseTier] ?? 1;

    // ── Write to soloPlayers subcollection ──────────────────────────────────
    await adminDb
      .collection("valorantTournaments")
      .doc(tournamentId)
      .collection("soloPlayers")
      .doc(uid)
      .set({
        uid,
        riotGameName: userData.riotGameName,
        riotTagLine: userData.riotTagLine || "",
        riotAvatar: userData.riotAvatar || "",
        riotRank: userData.riotRank || "",
        riotTier: userData.riotTier || 0,
        skillLevel,
        bracket: null,
        registeredAt: new Date().toISOString(),
      });

    // ── Update tournament slotsBooked ──────────────────────────────────────
    await adminDb.collection("valorantTournaments").doc(tournamentId).update({
      slotsBooked: FieldValue.increment(1),
    });

    // ── Update user's registered tournaments ───────────────────────────────
    await adminDb.collection("users").doc(uid).update({
      registeredValorantTournaments: FieldValue.arrayUnion(tournamentId),
    });

    return NextResponse.json({
      success: true,
      skillLevel,
      riotVerified,
      warning: riotVerified === "pending"
        ? "Your Riot ID is pending verification. Registration accepted but may require verification before tournament starts."
        : undefined,
    });
  } catch (e: any) {
    console.error("Valorant solo registration error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
