import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  try {
    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const d = userDoc.data()!;

    // Fetch rank history via admin SDK (client SDK blocked by security rules)
    const rhSnap = await adminDb.collection("users").doc(uid)
      .collection("rankHistory")
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();
    const rankHistory = rhSnap.docs.map(doc => doc.data());

    // ── Global leaderboard stats (server-side; client SDK is blocked for
    // unauthenticated visitors, which is why public profiles looked empty). ──
    let globalStats: any = null;
    if (d.riotPuuid) {
      const glDoc = await adminDb.collection("globalLeaderboard").doc(d.riotPuuid).get();
      if (glDoc.exists) globalStats = glDoc.data();
    }

    // ── Valorant match history (server-side). Ported from the page's old
    // client-SDK loop so the public profile shows match history without auth. ──
    const matchHistory: any[] = [];
    const regVal: string[] = d.registeredValorantTournaments || [];
    if (regVal.length > 0) {
      const tournamentIds = regVal.slice(0, 10);
      const results = await Promise.all(tournamentIds.map(async (tId) => {
        try {
          const [tDoc, matchesSnap] = await Promise.all([
            adminDb.collection("valorantTournaments").doc(tId).get(),
            adminDb.collection("valorantTournaments").doc(tId).collection("matches").orderBy("matchDay").get(),
          ]);
          return { tId, tName: tDoc.exists ? (tDoc.data() as any).name : tId, matches: matchesSnap.docs };
        } catch { return null; }
      }));
      for (const result of results) {
        if (!result) continue;
        const { tId, tName, matches } = result;
        for (const mDoc of matches) {
          const m: any = mDoc.data();
          if (m.status !== "completed" && m.status !== "live") continue;
          const games: any[] = [];
          let playerInMatch = false;
          for (let gNum = 1; gNum <= 5; gNum++) {
            const g = m[`game${gNum}`] || m.games?.[`game${gNum}`];
            if (!g || !g.playerStats) continue;
            const ps = g.playerStats.find((p: any) =>
              (d.riotPuuid && p.puuid === d.riotPuuid) ||
              (p.name?.toLowerCase() === d.riotGameName?.toLowerCase())
            );
            if (ps) {
              playerInMatch = true;
              const roundsInGame = g.roundsPlayed || (g.redRoundsWon + g.blueRoundsWon) || 1;
              games.push({
                gameNum: gNum, mapName: g.mapName || "Unknown", winner: g.winner || "",
                team1Rounds: g.team1RoundsWon ?? 0, team2Rounds: g.team2RoundsWon ?? 0,
                playerTeam: ps.tournamentTeam || ps.teamId || "",
                kills: ps.kills || 0, deaths: ps.deaths || 0, assists: ps.assists || 0,
                agent: ps.agent || "Unknown", score: ps.score || 0,
                acs: roundsInGame > 0 ? Math.round(ps.score / roundsInGame) : 0,
              });
            }
          }
          if (playerInMatch) {
            matchHistory.push({
              tournamentId: tId, tournamentName: tName, matchDocId: mDoc.id,
              matchDay: m.matchDay, matchIndex: m.matchIndex,
              team1Name: m.team1Name, team2Name: m.team2Name,
              team1Score: m.team1Score, team2Score: m.team2Score,
              games, completedAt: m.completedAt,
            });
          }
        }
      }
      matchHistory.sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
    }

    return NextResponse.json({
      uid,
      fullName: d.fullName || null,
      displayName: d.displayName || null,
      riotGameName: d.riotGameName || null,
      riotTagLine: d.riotTagLine || null,
      riotAvatar: d.riotAvatar || null,
      riotRank: d.riotRank || null,
      riotTier: d.riotTier || 0,
      // riotPuuid intentionally NOT exposed (Riot policy forbids PUUID
      // de-anonymization). The globalLeaderboard lookup + match attribution that
      // needed it now run server-side in this route, so the client never sees it.
      riotVerified: d.riotVerified || null,
      riotPeakRank: d.riotPeakRank || null,
      riotPeakTier: d.riotPeakTier || 0,
      iesportsRating: d.iesportsRating || null,
      iesportsRank: d.iesportsRank || null,
      iesportsTier: d.iesportsTier || 0,
      iesportsMatchesPlayed: d.iesportsMatchesPlayed || 0,
      discordUsername: d.discordUsername || null,
      discordId: d.discordId || null,
      steamName: d.steamName || null,
      steamId: d.steamId || null,
      steamAvatar: d.steamAvatar || null,
      dotaRankTier: d.dotaRankTier || null,
      dotaBracket: d.dotaBracket || null,
      dotaMMR: d.dotaMMR || null,
      phone: d.phone ? "redacted" : null,   // never expose raw phone to public
      upiId: null,                           // never expose UPI publicly
      personalPhoto: d.personalPhoto || null,
      discordConnections: d.discordConnections || [],
      registeredValorantTournaments: d.registeredValorantTournaments || [],
      // Point-in-time tournament honors — see scripts/markTournamentHonors.ts.
      // Drives the crown / trophy on the player's avatar across the site.
      mvpBracket: d.mvpBracket || null,
      isChampion: d.isChampion || null,
      honorTournamentId: d.honorTournamentId || null,
      honorTournamentName: d.honorTournamentName || null,
      rankHistory,
      globalStats,
      matchHistory,
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}
