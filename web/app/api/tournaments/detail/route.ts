import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const game = req.nextUrl.searchParams.get("game");

  if (!id || !game || !["dota2", "valorant"].includes(game)) {
    return NextResponse.json({ error: "Missing id or invalid game" }, { status: 400 });
  }

  try {
    const col = game === "valorant" ? "valorantTournaments" : "tournaments";
    const playersCol = game === "valorant" ? "soloPlayers" : "players";

    const [tDoc, playersSnap, teamsSnap, standingsSnap, matchesSnap, lbSnap] = await Promise.all([
      adminDb.collection(col).doc(id).get(),
      adminDb.collection(col).doc(id).collection(playersCol).get(),
      adminDb.collection(col).doc(id).collection("teams").orderBy("teamIndex").get(),
      adminDb.collection(col).doc(id).collection("standings").get(),
      adminDb.collection(col).doc(id).collection("matches").get(),
      adminDb.collection(col).doc(id).collection("leaderboard").get(),
    ]);

    if (!tDoc.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const tournament = { id: tDoc.id, ...tDoc.data() };
    const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const standings = standingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const leaderboard = lbSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ tournament, players, teams, standings, matches, leaderboard });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
