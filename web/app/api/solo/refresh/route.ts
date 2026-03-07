// /app/api/solo/refresh/route.ts

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { fetchAndSyncPlayer } from "@/lib/fetchAndSyncPlayer";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid } = await req.json();
    if (!tournamentId || !uid) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    // Get tournament for start time
    const tDoc = await adminDb.collection("soloTournaments").doc(tournamentId).get();
    if (!tDoc.exists) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    const tData = tDoc.data()!;
    const tournamentStartTime = Math.floor(new Date(tData.weekStart).getTime() / 1000);

    // Get player doc for steamId
    const playerDoc = await adminDb
      .collection("soloTournaments").doc(tournamentId)
      .collection("players").doc(uid).get();
    if (!playerDoc.exists) return NextResponse.json({ error: "Not registered" }, { status: 404 });
    const playerData = playerDoc.data()!;

    // Single call — updates rank, appends match history, calculates score
    const result = await fetchAndSyncPlayer({
      uid,
      steamId: playerData.steamId,
      db: adminDb,
      tournamentId,
      tournamentStartTime,
    });

    return NextResponse.json({
      success: true,
      score: result.tournamentResult?.totalScore ?? 0,
      matchesPlayed: result.tournamentResult?.matchesPlayed ?? 0,
      topMatches: result.tournamentResult?.topMatches ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}