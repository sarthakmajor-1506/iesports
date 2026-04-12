import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const game = req.nextUrl.searchParams.get("game");

  if (!id || !game || !["dota2", "valorant", "cs2"].includes(game)) {
    return NextResponse.json({ error: "Missing id or invalid game" }, { status: 400 });
  }

  try {
    const col = game === "valorant" ? "valorantTournaments" : game === "cs2" ? "cs2Tournaments" : "tournaments";
    const playersCol = game === "valorant" || game === "cs2" ? "soloPlayers" : "players";

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
    let players: any[] = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const standings = standingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const leaderboard = lbSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // For Dota, refresh rank data from user docs so tournament shows current rank
    if (game === "dota2" && players.length > 0) {
      const uids = players.map((p: any) => p.uid || p.id).filter(Boolean);
      if (uids.length > 0) {
        const userRefs = uids.map((uid: string) => adminDb.collection("users").doc(uid));
        const userDocs = await adminDb.getAll(...userRefs);
        const rankMap: Record<string, { dotaRankTier: number; dotaMMR: number }> = {};
        userDocs.forEach(ud => {
          if (ud.exists) {
            const d = ud.data();
            if (d?.dotaRankTier) rankMap[ud.id] = { dotaRankTier: d.dotaRankTier, dotaMMR: d.dotaMMR || 0 };
          }
        });
        players = players.map((p: any) => {
          const uid = p.uid || p.id;
          const fresh = rankMap[uid];
          if (fresh) return { ...p, dotaRankTier: fresh.dotaRankTier, dotaMMR: fresh.dotaMMR };
          return p;
        });
      }
    }

    return NextResponse.json({ tournament, players, teams, standings, matches, leaderboard });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
