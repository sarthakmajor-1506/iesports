import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Fetches a single Valorant game's stats from Henrik API and stores them.
 * Designed for BO2 series: admin calls this once for Game 1, once for Game 2.
 * After both games are fetched, the series score auto-computes.
 *
 * Required fields:
 * - tournamentId, adminKey, matchDocId (e.g. "day1-match1")
 * - valorantMatchId (UUID from Valorant match history)
 * - gameNumber: 1 or 2 (which game in the BO2)
 * - region: "ap" | "eu" | "na" | etc.
 *
 * Optional:
 * - excludedPuuids: string[] — PUUIDs to exclude from leaderboard (substitutes)
 */
export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, matchDocId, valorantMatchId, gameNumber, region, excludedPuuids } = await req.json();

    if (!tournamentId || !adminKey || !matchDocId || !valorantMatchId || !gameNumber) {
      return NextResponse.json({ error: "Missing fields: tournamentId, adminKey, matchDocId, valorantMatchId, gameNumber required" }, { status: 400 });
    }
    if (adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (gameNumber !== 1 && gameNumber !== 2) {
      return NextResponse.json({ error: "gameNumber must be 1 or 2" }, { status: 400 });
    }

    const henrikKey = process.env.HENRIK_API_KEY;
    if (!henrikKey) {
      return NextResponse.json({ error: "HENRIK_API_KEY not configured" }, { status: 500 });
    }

    const matchRegion = region || "ap";
    const excluded = new Set(excludedPuuids || []);

    // ── Fetch match from Henrik API ──────────────────────────────────────────
    let matchData: any = null;
    let apiVersion = "v4";

    // Try v4 first
    try {
      const v4Url = `https://api.henrikdev.xyz/valorant/v4/match/${matchRegion}/${valorantMatchId}`;
      const v4Res = await fetch(v4Url, { headers: { Authorization: henrikKey } });
      if (v4Res.ok) {
        const v4Json = await v4Res.json();
        matchData = v4Json.data;
      } else {
        throw new Error(`v4 status ${v4Res.status}`);
      }
    } catch {
      // Fallback to v2
      apiVersion = "v2";
      const v2Url = `https://api.henrikdev.xyz/valorant/v2/match/${valorantMatchId}`;
      const v2Res = await fetch(v2Url, { headers: { Authorization: henrikKey } });
      if (!v2Res.ok) {
        return NextResponse.json({ error: `Henrik API error: ${v2Res.status}. Match ID may be invalid.` }, { status: 400 });
      }
      const v2Json = await v2Res.json();
      matchData = v2Json.data;
    }

    if (!matchData) {
      return NextResponse.json({ error: "Could not fetch match data" }, { status: 400 });
    }

    // ── Parse based on API version ───────────────────────────────────────────
    let playerStats: any[] = [];
    let mapName = "";
    let redRoundsWon = 0;
    let blueRoundsWon = 0;
    let roundsPlayed = 0;
    let redWon = false;

    if (apiVersion === "v4") {
      mapName = matchData.metadata?.map?.name || matchData.metadata?.map || "Unknown";
      redRoundsWon = matchData.teams?.red?.rounds_won || 0;
      blueRoundsWon = matchData.teams?.blue?.rounds_won || 0;
      roundsPlayed = redRoundsWon + blueRoundsWon;
      redWon = matchData.teams?.red?.has_won === true;

      playerStats = (matchData.players || []).map((p: any) => ({
        puuid: p.puuid,
        name: p.name,
        tag: p.tag,
        team: p.team_id || p.team,
        agent: p.agent?.name || "Unknown",
        kills: p.stats?.kills || 0,
        deaths: p.stats?.deaths || 0,
        assists: p.stats?.assists || 0,
        score: p.stats?.score || 0,
        headshots: p.stats?.headshots || 0,
        bodyshots: p.stats?.bodyshots || 0,
        legshots: p.stats?.legshots || 0,
        damageDealt: p.stats?.damage?.dealt || 0,
        damageReceived: p.stats?.damage?.received || 0,
      }));
    } else {
      // v2 format
      const allPlayers = matchData.players?.all_players || [];
      mapName = matchData.metadata?.map || "Unknown";
      roundsPlayed = matchData.metadata?.rounds_played || 0;
      redRoundsWon = matchData.teams?.red?.rounds_won || 0;
      blueRoundsWon = matchData.teams?.blue?.rounds_won || 0;
      redWon = matchData.teams?.red?.has_won === true;

      playerStats = allPlayers.map((p: any) => ({
        puuid: p.puuid,
        name: p.name,
        tag: p.tag,
        team: p.team,
        agent: p.character || "Unknown",
        kills: p.stats?.kills || 0,
        deaths: p.stats?.deaths || 0,
        assists: p.stats?.assists || 0,
        score: p.stats?.score || 0,
        headshots: p.stats?.headshots || 0,
        bodyshots: p.stats?.bodyshots || 0,
        legshots: p.stats?.legshots || 0,
        damageDealt: p.damage_made || 0,
        damageReceived: p.damage_received || 0,
      }));
    }

    const winningTeam = redWon ? "Red" : "Blue";

    // ── Update match doc with this game's data ───────────────────────────────
    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const matchRef = tournamentRef.collection("matches").doc(matchDocId);
    const matchDoc = await matchRef.get();

    if (!matchDoc.exists) {
      return NextResponse.json({ error: `Match doc '${matchDocId}' not found` }, { status: 404 });
    }

    const existingMatch = matchDoc.data()!;
    const gameKey = gameNumber === 1 ? "game1" : "game2";

    const gameData = {
      valorantMatchId,
      mapName,
      roundsPlayed,
      redRoundsWon,
      blueRoundsWon,
      winningTeam,
      playerStats,
      fetchedAt: new Date().toISOString(),
    };

    // Write game data to match doc
    const updatePayload: any = {
      [`${gameKey}`]: gameData,
      [`${gameKey}MatchId`]: valorantMatchId,
    };

    // ── Auto-compute series score if both games are done ─────────────────────
    const otherGameKey = gameNumber === 1 ? "game2" : "game1";
    const otherGameData = existingMatch[otherGameKey];
    let seriesComplete = false;
    let team1SeriesScore = existingMatch.team1Score || 0;
    let team2SeriesScore = existingMatch.team2Score || 0;

    // Determine which team in our system (team1/team2) corresponds to Red/Blue
    // We need to match players from our tournament teams to the Valorant match teams
    // For now: admin must ensure team1 = the team whose players are on one side
    // We'll use a simpler approach: store which Valorant team (Red/Blue) each game was won by
    // and let admin map it via the team order in the match

    // Store the game result
    updatePayload[`${gameKey}Winner`] = winningTeam;

    if (otherGameData) {
      // Both games fetched — compute series score
      seriesComplete = true;
      const game1Winner = gameNumber === 1 ? winningTeam : existingMatch.game1Winner || existingMatch.game1?.winningTeam;
      const game2Winner = gameNumber === 2 ? winningTeam : existingMatch.game2Winner || existingMatch.game2?.winningTeam;

      // Count wins per team name (team1Name, team2Name in our match doc)
      // We need admin to tell us which Valorant team color maps to which tournament team
      // For now: auto-detect by matching player names between tournament teams and match players
      const team1Id = existingMatch.team1Id;
      const team2Id = existingMatch.team2Id;

      // Fetch tournament teams to match PUUIDs
      const team1Doc = await tournamentRef.collection("teams").doc(team1Id).get();
      const team2Doc = await tournamentRef.collection("teams").doc(team2Id).get();

      let team1ValorantSide: string | null = null;

      if (team1Doc.exists) {
        const team1Members = (team1Doc.data()!.members || []).map((m: any) => m.riotGameName?.toLowerCase());
        // Check if team1's players are on Red or Blue
        for (const ps of playerStats) {
          if (team1Members.includes(ps.name?.toLowerCase())) {
            team1ValorantSide = ps.team; // "Red" or "Blue"
            break;
          }
        }
      }

      if (team1ValorantSide) {
        const team2ValorantSide = team1ValorantSide === "Red" ? "Blue" : "Red";

        let t1Wins = 0;
        let t2Wins = 0;

        if (game1Winner === team1ValorantSide) t1Wins++; else t2Wins++;
        if (game2Winner === team1ValorantSide) t1Wins++; else t2Wins++;

        team1SeriesScore = t1Wins;
        team2SeriesScore = t2Wins;

        updatePayload.team1Score = t1Wins;
        updatePayload.team2Score = t2Wins;
        updatePayload.team1ValorantSide = team1ValorantSide;
        updatePayload.team2ValorantSide = team2ValorantSide;
        updatePayload.status = "completed";
        updatePayload.completedAt = new Date().toISOString();
        updatePayload.seriesAutoComputed = true;
      } else {
        // Couldn't auto-detect — mark as needing manual score entry
        updatePayload.needsManualScore = true;
      }
    }

    await matchRef.update(updatePayload);

    // ── Update standings if series is complete ────────────────────────────────
    if (seriesComplete && !existingMatch.status?.includes("completed")) {
      // Compute points: 2-0 = 2pts winner, 1-1 = 1pt each, 0-2 = 2pts winner
      let team1Points = 0;
      let team2Points = 0;
      let team1Result: "win" | "draw" | "loss" = "draw";
      let team2Result: "win" | "draw" | "loss" = "draw";

      if (team1SeriesScore > team2SeriesScore) {
        team1Points = 2; team2Points = 0;
        team1Result = "win"; team2Result = "loss";
      } else if (team2SeriesScore > team1SeriesScore) {
        team1Points = 0; team2Points = 2;
        team1Result = "loss"; team2Result = "win";
      } else {
        team1Points = 1; team2Points = 1;
      }

      const standingsRef = tournamentRef.collection("standings");

      const ensureStanding = async (teamId: string, teamName: string) => {
        const ref = standingsRef.doc(teamId);
        const doc = await ref.get();
        if (!doc.exists) {
          await ref.set({ teamId, teamName, played: 0, wins: 0, draws: 0, losses: 0, points: 0, mapsWon: 0, mapsLost: 0, buchholz: 0 });
        }
      };

      await ensureStanding(existingMatch.team1Id, existingMatch.team1Name);
      await ensureStanding(existingMatch.team2Id, existingMatch.team2Name);

      await standingsRef.doc(existingMatch.team1Id).update({
        played: FieldValue.increment(1),
        wins: FieldValue.increment(team1Result === "win" ? 1 : 0),
        draws: FieldValue.increment(team1Result === "draw" ? 1 : 0),
        losses: FieldValue.increment(team1Result === "loss" ? 1 : 0),
        points: FieldValue.increment(team1Points),
        mapsWon: FieldValue.increment(team1SeriesScore),
        mapsLost: FieldValue.increment(team2SeriesScore),
      });

      await standingsRef.doc(existingMatch.team2Id).update({
        played: FieldValue.increment(1),
        wins: FieldValue.increment(team2Result === "win" ? 1 : 0),
        draws: FieldValue.increment(team2Result === "draw" ? 1 : 0),
        losses: FieldValue.increment(team2Result === "loss" ? 1 : 0),
        points: FieldValue.increment(team2Points),
        mapsWon: FieldValue.increment(team2SeriesScore),
        mapsLost: FieldValue.increment(team1SeriesScore),
      });

      // Recompute Buchholz
      const allMatches = await tournamentRef.collection("matches").where("status", "==", "completed").get();
      const allStandings = await standingsRef.get();
      const pointsMap: Record<string, number> = {};
      for (const doc of allStandings.docs) pointsMap[doc.id] = doc.data().points || 0;

      const opponentsMap: Record<string, string[]> = {};
      for (const doc of allMatches.docs) {
        const d = doc.data();
        if (!opponentsMap[d.team1Id]) opponentsMap[d.team1Id] = [];
        if (!opponentsMap[d.team2Id]) opponentsMap[d.team2Id] = [];
        opponentsMap[d.team1Id].push(d.team2Id);
        opponentsMap[d.team2Id].push(d.team1Id);
      }

      const bBatch = adminDb.batch();
      for (const [teamId, opponents] of Object.entries(opponentsMap)) {
        const bScore = opponents.reduce((sum, oppId) => sum + (pointsMap[oppId] || 0), 0);
        bBatch.update(standingsRef.doc(teamId), { buchholz: bScore });
      }
      await bBatch.commit();
    }

    // ── Update leaderboard (exclude substitutes) ─────────────────────────────
    const leaderboardRef = tournamentRef.collection("leaderboard");
    const lbBatch = adminDb.batch();

    for (const player of playerStats) {
      // Skip excluded PUUIDs (substitutes)
      if (excluded.has(player.puuid)) {
        continue;
      }

      const playerId = player.puuid || `${player.name}-${player.tag}`;
      const playerRef = leaderboardRef.doc(playerId);
      const existingDoc = await playerRef.get();

      if (existingDoc.exists) {
        const ex = existingDoc.data()!;
        const newKills = (ex.totalKills || 0) + player.kills;
        const newDeaths = (ex.totalDeaths || 0) + player.deaths;
        const newMatches = (ex.matchesPlayed || 0) + 1;
        const newHS = (ex.totalHeadshots || 0) + player.headshots;
        const newBS = (ex.totalBodyshots || 0) + player.bodyshots;
        const newLS = (ex.totalLegshots || 0) + player.legshots;
        const newRounds = (ex.totalRoundsPlayed || 0) + roundsPlayed;
        const newScore = (ex.totalScore || 0) + player.score;

        lbBatch.update(playerRef, {
          totalKills: newKills,
          totalDeaths: newDeaths,
          totalAssists: (ex.totalAssists || 0) + player.assists,
          totalScore: newScore,
          totalHeadshots: newHS,
          totalBodyshots: newBS,
          totalLegshots: newLS,
          totalDamageDealt: (ex.totalDamageDealt || 0) + player.damageDealt,
          totalDamageReceived: (ex.totalDamageReceived || 0) + player.damageReceived,
          matchesPlayed: newMatches,
          totalRoundsPlayed: newRounds,
          agents: [...new Set([...(ex.agents || []), player.agent])],
          avgKills: Math.round(newKills / newMatches * 100) / 100,
          avgDeaths: Math.round(newDeaths / newMatches * 100) / 100,
          kd: Math.round(newKills / Math.max(1, newDeaths) * 100) / 100,
          acs: newRounds > 0 ? Math.round(newScore / newRounds) : 0,
          hsPercent: Math.round(newHS / Math.max(1, newHS + newBS + newLS) * 100),
          lastUpdated: new Date().toISOString(),
        });
      } else {
        lbBatch.set(playerRef, {
          puuid: player.puuid,
          name: player.name,
          tag: player.tag,
          totalKills: player.kills,
          totalDeaths: player.deaths,
          totalAssists: player.assists,
          totalScore: player.score,
          totalHeadshots: player.headshots,
          totalBodyshots: player.bodyshots,
          totalLegshots: player.legshots,
          totalDamageDealt: player.damageDealt,
          totalDamageReceived: player.damageReceived,
          matchesPlayed: 1,
          totalRoundsPlayed: roundsPlayed,
          agents: [player.agent],
          avgKills: player.kills,
          avgDeaths: player.deaths,
          kd: Math.round(player.kills / Math.max(1, player.deaths) * 100) / 100,
          acs: roundsPlayed > 0 ? Math.round(player.score / roundsPlayed) : 0,
          hsPercent: Math.round(player.headshots / Math.max(1, player.headshots + player.bodyshots + player.legshots) * 100),
          lastUpdated: new Date().toISOString(),
        });
      }
    }

    await lbBatch.commit();

    return NextResponse.json({
      success: true,
      gameNumber,
      apiVersion,
      map: mapName,
      roundsPlayed,
      score: `${redRoundsWon}-${blueRoundsWon}`,
      winningTeam,
      playersTracked: playerStats.length - excluded.size,
      excludedCount: excluded.size,
      seriesComplete,
      ...(seriesComplete ? { seriesScore: `${team1SeriesScore}-${team2SeriesScore}` } : {}),
    });
  } catch (e: any) {
    console.error("Match fetch error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
