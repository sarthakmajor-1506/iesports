// /app/api/solo/refresh/route.ts
// Called when user visits leaderboard — refreshes their own score

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import axios from "axios";
import { calculatePlayerScore } from "@/lib/soloScoring";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid } = await req.json();
    if (!tournamentId || !uid) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    // Get tournament for start time
    const tDoc = await adminDb.collection("soloTournaments").doc(tournamentId).get();
    if (!tDoc.exists) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    const tData = tDoc.data()!;
    const tournamentStartTime = Math.floor(new Date(tData.weekStart).getTime() / 1000);

    // Get player doc
    const playerDoc = await adminDb
      .collection("soloTournaments").doc(tournamentId)
      .collection("players").doc(uid).get();
    if (!playerDoc.exists) return NextResponse.json({ error: "Not registered" }, { status: 404 });
    const playerData = playerDoc.data()!;

    // Fetch recent matches from OpenDota
    const steam32 = (BigInt(playerData.steamId) - BigInt("76561197960265728")).toString();
    const matchesRes = await axios.get(
      `https://api.opendota.com/api/players/${steam32}/recentMatches`
    );
    const matches = matchesRes.data;

    if (!matches || matches.length === 0) {
      return NextResponse.json({ score: 0, matchesPlayed: 0, topMatches: [] });
    }

    // Calculate score
    const { totalScore, topMatches, matchesPlayed } = calculatePlayerScore(matches, tournamentStartTime);

    // Update player doc
    await adminDb
      .collection("soloTournaments").doc(tournamentId)
      .collection("players").doc(uid).update({
        cachedScore: totalScore,
        cachedTopMatches: topMatches,
        matchesPlayed,
        lastUpdated: new Date().toISOString(),
      });

    return NextResponse.json({ success: true, score: totalScore, matchesPlayed, topMatches });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}