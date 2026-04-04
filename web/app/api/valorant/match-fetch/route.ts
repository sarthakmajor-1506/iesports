import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/valorant/match-fetch
 *
 * Fetches a single Valorant game's stats from Henrik API and stores them.
 * Designed for BO2 series: admin calls once for Game 1, once for Game 2.
 *
 * KEY IMPROVEMENTS:
 * 1. PUUID matching (not name matching) to map Red/Blue → team1/team2
 * 2. Per-game round scores mapped to tournament teams (team1RoundsWon, team2RoundsWon)
 * 3. Leaderboard only tracks players on tournament team rosters
 * 4. Global leaderboard (cross-tournament) updated alongside tournament leaderboard
 * 5. Immediate game-level updates (Game 1 writes scores before Game 2 is fetched)
 * 6. Standings + Buchholz update when series completes
 * 7. Auto-resolve next round TBD matches when all round matches complete
 *
 * Required: tournamentId, adminKey, matchDocId, valorantMatchId, gameNumber (1-5), region
 * Optional: excludedPuuids (string[]) — subs to skip in leaderboard
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
    if (!Number.isInteger(gameNumber) || gameNumber < 1 || gameNumber > 5) {
      return NextResponse.json({ error: "gameNumber must be 1-5" }, { status: 400 });
    }

    const henrikKey = process.env.HENRIK_API_KEY;
    if (!henrikKey) {
      return NextResponse.json({ error: "HENRIK_API_KEY not configured" }, { status: 500 });
    }

    const matchRegion = region || "ap";
    const excluded = new Set(excludedPuuids || []);

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. FETCH MATCH FROM HENRIK API
    // ═══════════════════════════════════════════════════════════════════════════
    let matchData: any = null;
    let apiVersion = "v4";

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

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. PARSE PLAYER STATS FROM HENRIK RESPONSE
    // ═══════════════════════════════════════════════════════════════════════════
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
        team: p.team_id || p.team, // "Red" or "Blue"
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
        team: p.team, // "Red" or "Blue"
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

    const valorantWinnerSide = redWon ? "Red" : "Blue"; // which Valorant side won

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. LOAD MATCH DOC + TOURNAMENT TEAMS
    // ═══════════════════════════════════════════════════════════════════════════
    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const matchRef = tournamentRef.collection("matches").doc(matchDocId);
    const matchDoc = await matchRef.get();

    if (!matchDoc.exists) {
      return NextResponse.json({ error: `Match doc '${matchDocId}' not found` }, { status: 404 });
    }

    const existingMatch = matchDoc.data()!;
    const team1Id = existingMatch.team1Id;
    const team2Id = existingMatch.team2Id;

    // Load both teams' member lists
    const [team1Doc, team2Doc] = await Promise.all([
      tournamentRef.collection("teams").doc(team1Id).get(),
      tournamentRef.collection("teams").doc(team2Id).get(),
    ]);

    const team1Members = team1Doc.exists ? (team1Doc.data()!.members || []) : [];
    const team2Members = team2Doc.exists ? (team2Doc.data()!.members || []) : [];

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. PUUID MATCHING — MAP TOURNAMENT TEAMS TO VALORANT SIDES
    // ═══════════════════════════════════════════════════════════════════════════

    // Build a set of PUUIDs for each tournament team
    // First, try to use riotPuuid stored on the member objects
    // If not available, look up from user docs (fallback)
    let team1Puuids = new Set<string>();
    let team2Puuids = new Set<string>();

    // Attempt to get PUUIDs from member objects first
    for (const m of team1Members) {
      if (m.riotPuuid) team1Puuids.add(m.riotPuuid);
    }
    for (const m of team2Members) {
      if (m.riotPuuid) team2Puuids.add(m.riotPuuid);
    }

    // Fallback: if no PUUIDs on member objects, look up from user docs
    if (team1Puuids.size === 0) {
      const uids = team1Members.map((m: any) => m.uid).filter(Boolean);
      if (uids.length > 0) {
        const userDocs = await Promise.all(uids.map((uid: string) => adminDb.collection("users").doc(uid).get()));
        for (const doc of userDocs) {
          const puuid = doc.data()?.riotPuuid;
          if (puuid) team1Puuids.add(puuid);
        }
      }
    }
    if (team2Puuids.size === 0) {
      const uids = team2Members.map((m: any) => m.uid).filter(Boolean);
      if (uids.length > 0) {
        const userDocs = await Promise.all(uids.map((uid: string) => adminDb.collection("users").doc(uid).get()));
        for (const doc of userDocs) {
          const puuid = doc.data()?.riotPuuid;
          if (puuid) team2Puuids.add(puuid);
        }
      }
    }

    // Now match: which Valorant side has team1's players?
    let team1ValorantSide: string | null = null;
    let team1MatchCount = 0;
    let team2MatchCount = 0;

    for (const ps of playerStats) {
      if (team1Puuids.has(ps.puuid)) {
        team1ValorantSide = team1ValorantSide || ps.team;
        team1MatchCount++;
      }
      if (team2Puuids.has(ps.puuid)) {
        team2MatchCount++;
      }
    }

    // Fallback to name matching if PUUID matching failed
    if (!team1ValorantSide) {
      console.warn("[match-fetch] PUUID matching failed, falling back to name matching");
      const team1Names = new Set(team1Members.map((m: any) => m.riotGameName?.toLowerCase()).filter(Boolean));
      for (const ps of playerStats) {
        if (team1Names.has(ps.name?.toLowerCase())) {
          team1ValorantSide = ps.team;
          break;
        }
      }
    }

    const team2ValorantSide = team1ValorantSide === "Red" ? "Blue" : team1ValorantSide === "Blue" ? "Red" : null;

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. COMPUTE TEAM-MAPPED GAME SCORES
    // ═══════════════════════════════════════════════════════════════════════════
    let team1RoundsWon = 0;
    let team2RoundsWon = 0;
    let gameWinner: "team1" | "team2" | null = null;

    if (team1ValorantSide) {
      team1RoundsWon = team1ValorantSide === "Red" ? redRoundsWon : blueRoundsWon;
      team2RoundsWon = team1ValorantSide === "Red" ? blueRoundsWon : redRoundsWon;
      gameWinner = valorantWinnerSide === team1ValorantSide ? "team1" : "team2";
    }

    // Tag each player stat with teamId for the frontend
    const enrichedPlayerStats = playerStats.map(ps => ({
      ...ps,
      teamId: team1Puuids.has(ps.puuid) ? team1Id :
              team2Puuids.has(ps.puuid) ? team2Id :
              // Name fallback for teamId tagging
              (team1ValorantSide && ps.team === team1ValorantSide) ? team1Id :
              (team2ValorantSide && ps.team === team2ValorantSide) ? team2Id : null,
      tournamentTeam: team1Puuids.has(ps.puuid) ? "team1" :
                      team2Puuids.has(ps.puuid) ? "team2" :
                      (team1ValorantSide && ps.team === team1ValorantSide) ? "team1" :
                      (team2ValorantSide && ps.team === team2ValorantSide) ? "team2" : null,
    }));

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. BUILD GAME DATA + UPDATE MATCH DOC (IMMEDIATELY)
    // ═══════════════════════════════════════════════════════════════════════════
    const gameKey = `game${gameNumber}`;

    const gameData = {
      valorantMatchId,
      mapName,
      roundsPlayed,
      redRoundsWon,
      blueRoundsWon,
      winningTeam: valorantWinnerSide,
      team1RoundsWon,
      team2RoundsWon,
      winner: gameWinner, // "team1" | "team2" | null
      team1ValorantSide: team1ValorantSide,
      team2ValorantSide: team2ValorantSide,
      playerStats: enrichedPlayerStats,
      fetchedAt: new Date().toISOString(),
      apiVersion,
      status: "completed",
    };
    const updatePayload: any = {
      [gameKey]: gameData,
      [`games.${gameKey}`]: gameData,
      [`${gameKey}MatchId`]: valorantMatchId,
      [`${gameKey}Winner`]: gameWinner,
    };


    // ═══════════════════════════════════════════════════════════════════════════
    // 7. CHECK IF SERIES IS COMPLETE (dynamic BO — all games fetched)
    // ═══════════════════════════════════════════════════════════════════════════
    // Determine BO from tournament settings
    const tournamentDoc = await tournamentRef.get();
    const tData = tournamentDoc.data() || {};
    let bo = 2; // default
    if (existingMatch.bracketType === "grand_final") bo = tData.grandFinalBestOf || 3;
    else if (existingMatch.id === "lb-final" && tData.lbFinalBestOf) bo = tData.lbFinalBestOf;
    else if (existingMatch.isBracket) bo = tData.bracketBestOf || 2;
    else bo = tData.matchesPerRound || 2;

    let seriesComplete = false;
    let team1SeriesScore = 0;
    let team2SeriesScore = 0;

    // Collect winners for all games (including the one we just fetched)
    let completedGames = 0;
    for (let g = 1; g <= bo; g++) {
      let gWinner: string | null = null;
      if (g === gameNumber) {
        gWinner = gameWinner;
        if (gameWinner) completedGames++;
      } else {
        const gData = existingMatch[`game${g}`];
        gWinner = existingMatch[`game${g}Winner`] || gData?.winner || null;
        if (gData?.status === "completed") completedGames++;
        else gWinner = null;
      }
      if (gWinner === "team1") team1SeriesScore++;
      else if (gWinner === "team2") team2SeriesScore++;
    }

    // Series completes when all BO games are fetched, or a team has clinched (won majority)
    const winsNeeded = Math.ceil(bo / 2);
    if (completedGames === bo || team1SeriesScore >= winsNeeded || team2SeriesScore >= winsNeeded) {
      seriesComplete = true;
      updatePayload.team1Score = team1SeriesScore;
      updatePayload.team2Score = team2SeriesScore;
      updatePayload.status = "completed";
      updatePayload.completedAt = new Date().toISOString();
      updatePayload.seriesAutoComputed = true;
    } else if (gameWinner) {
      // Partial update — show running tally
      updatePayload.team1Score = team1SeriesScore;
      updatePayload.team2Score = team2SeriesScore;
      updatePayload.status = existingMatch.status === "pending" ? "live" : existingMatch.status;
    }

    if (!gameWinner) {
      updatePayload.needsManualScore = true;
    }

    await matchRef.update(updatePayload);

    // ═══════════════════════════════════════════════════════════════════════════
    // 8. UPDATE STANDINGS IF SERIES COMPLETE
    // ═══════════════════════════════════════════════════════════════════════════
    if (seriesComplete && existingMatch.status !== "completed") {
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

      await ensureStanding(team1Id, existingMatch.team1Name);
      await ensureStanding(team2Id, existingMatch.team2Name);

      await standingsRef.doc(team1Id).update({
        played: FieldValue.increment(1),
        wins: FieldValue.increment(team1Result === "win" ? 1 : 0),
        draws: FieldValue.increment(team1Result === "draw" ? 1 : 0),
        losses: FieldValue.increment(team1Result === "loss" ? 1 : 0),
        points: FieldValue.increment(team1Points),
        mapsWon: FieldValue.increment(team1SeriesScore),
        mapsLost: FieldValue.increment(team2SeriesScore),
      });

      await standingsRef.doc(team2Id).update({
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

    // ═══════════════════════════════════════════════════════════════════════════
    // 9. UPDATE LEADERBOARD — ONLY TOURNAMENT ROSTER PLAYERS
    // ═══════════════════════════════════════════════════════════════════════════

    // Build a set of all PUUIDs that are on tournament team rosters
    const rosterPuuids = new Set<string>([...team1Puuids, ...team2Puuids]);

    // Also build a uid lookup: puuid → uid (for global leaderboard linking)
    const puuidToUid: Record<string, string> = {};
    const puuidToMemberInfo: Record<string, any> = {};
    for (const m of [...team1Members, ...team2Members]) {
      if (m.riotPuuid) {
        puuidToUid[m.riotPuuid] = m.uid;
        puuidToMemberInfo[m.riotPuuid] = m;
      }
    }

    // If we didn't have PUUIDs on member objects, build from user docs
    if (Object.keys(puuidToUid).length === 0) {
      const allUids = [...team1Members, ...team2Members].map((m: any) => m.uid).filter(Boolean);
      if (allUids.length > 0) {
        const userDocs = await Promise.all(allUids.map((uid: string) => adminDb.collection("users").doc(uid).get()));
        for (const doc of userDocs) {
          const data = doc.data();
          if (data?.riotPuuid) {
            puuidToUid[data.riotPuuid] = doc.id;
            rosterPuuids.add(data.riotPuuid);
            puuidToMemberInfo[data.riotPuuid] = {
              uid: doc.id,
              riotGameName: data.riotGameName,
              riotTagLine: data.riotTagLine,
              riotAvatar: data.riotAvatar,
            };
          }
        }
      }
    }

    const leaderboardRef = tournamentRef.collection("leaderboard");
    const globalLeaderboardRef = adminDb.collection("globalLeaderboard");
    const lbBatch = adminDb.batch();
    const glBatch = adminDb.batch();

    let playersTracked = 0;
    let playersSkipped = 0;

    for (const player of enrichedPlayerStats) {
      // Skip excluded PUUIDs (substitutes)
      if (excluded.has(player.puuid)) {
        playersSkipped++;
        continue;
      }

      // ONLY track players who are on tournament team rosters
      if (!rosterPuuids.has(player.puuid)) {
        playersSkipped++;
        continue;
      }

      playersTracked++;
      const playerId = player.puuid;
      const playerRef = leaderboardRef.doc(playerId);
      const existingDoc = await playerRef.get();

      // ── Tournament leaderboard ──
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
          // Link to user
          uid: puuidToUid[player.puuid] || ex.uid || null,
          teamId: player.teamId,
        });
      } else {
        lbBatch.set(playerRef, {
          puuid: player.puuid,
          name: player.name,
          tag: player.tag,
          uid: puuidToUid[player.puuid] || null,
          teamId: player.teamId,
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

      // ── Global leaderboard (cross-tournament) ──
      const glRef = globalLeaderboardRef.doc(playerId);
      const glDoc = await glRef.get();

      if (glDoc.exists) {
        const gl = glDoc.data()!;
        const glKills = (gl.valorant?.totalKills || 0) + player.kills;
        const glDeaths = (gl.valorant?.totalDeaths || 0) + player.deaths;
        const glMatches = (gl.valorant?.matchesPlayed || 0) + 1;
        const glHS = (gl.valorant?.totalHeadshots || 0) + player.headshots;
        const glBS = (gl.valorant?.totalBodyshots || 0) + player.bodyshots;
        const glLS = (gl.valorant?.totalLegshots || 0) + player.legshots;
        const glRounds = (gl.valorant?.totalRoundsPlayed || 0) + roundsPlayed;
        const glScore = (gl.valorant?.totalScore || 0) + player.score;

        // Determine if this is a win for this player's team in this game
        const playerIsTeam1 = player.tournamentTeam === "team1";
        const thisGameWin = gameWinner === player.tournamentTeam ? 1 : 0;

        glBatch.update(glRef, {
          uid: puuidToUid[player.puuid] || gl.uid || null,
          name: player.name,
          tag: player.tag,
          lastUpdated: new Date().toISOString(),
          "valorant.totalKills": glKills,
          "valorant.totalDeaths": glDeaths,
          "valorant.totalAssists": (gl.valorant?.totalAssists || 0) + player.assists,
          "valorant.totalScore": glScore,
          "valorant.totalHeadshots": glHS,
          "valorant.totalBodyshots": glBS,
          "valorant.totalLegshots": glLS,
          "valorant.totalDamageDealt": (gl.valorant?.totalDamageDealt || 0) + player.damageDealt,
          "valorant.totalDamageReceived": (gl.valorant?.totalDamageReceived || 0) + player.damageReceived,
          "valorant.matchesPlayed": glMatches,
          "valorant.totalRoundsPlayed": glRounds,
          "valorant.gamesWon": (gl.valorant?.gamesWon || 0) + thisGameWin,
          "valorant.kd": Math.round(glKills / Math.max(1, glDeaths) * 100) / 100,
          "valorant.acs": glRounds > 0 ? Math.round(glScore / glRounds) : 0,
          "valorant.hsPercent": Math.round(glHS / Math.max(1, glHS + glBS + glLS) * 100),
          "valorant.agents": [...new Set([...(gl.valorant?.agents || []), player.agent])],
          "valorant.tournaments": [...new Set([...(gl.valorant?.tournaments || []), tournamentId])],
        });
      } else {
        const thisGameWin = gameWinner === player.tournamentTeam ? 1 : 0;
        glBatch.set(glRef, {
          puuid: player.puuid,
          uid: puuidToUid[player.puuid] || null,
          name: player.name,
          tag: player.tag,
          lastUpdated: new Date().toISOString(),
          valorant: {
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
            gamesWon: thisGameWin,
            kd: Math.round(player.kills / Math.max(1, player.deaths) * 100) / 100,
            acs: roundsPlayed > 0 ? Math.round(player.score / roundsPlayed) : 0,
            hsPercent: Math.round(player.headshots / Math.max(1, player.headshots + player.bodyshots + player.legshots) * 100),
            agents: [player.agent],
            tournaments: [tournamentId],
          },
          dota: null, // placeholder for future
        });
      }
    }

    await lbBatch.commit();
    await glBatch.commit();

    // ═══════════════════════════════════════════════════════════════════════════
    // 10. AUTO-RESOLVE NEXT ROUND (if series complete + all round matches done)
    // ═══════════════════════════════════════════════════════════════════════════
    let autoResolved = false;
    let resolvedPairings: string[] = [];

    if (seriesComplete && existingMatch.status !== "completed") {
      try {
        const matchDay = existingMatch.matchDay;
        const roundMatches = await tournamentRef
          .collection("matches")
          .where("matchDay", "==", matchDay)
          .get();

        const allRoundComplete = roundMatches.docs.every(d => d.data().status === "completed" || d.id === matchDocId);

        if (allRoundComplete) {
          const nextRound = matchDay + 1;
          const nextRoundMatches = await tournamentRef
            .collection("matches")
            .where("matchDay", "==", nextRound)
            .get();

          const tbdDocs = nextRoundMatches.docs
            .filter(d => d.data().isTBD === true)
            .sort((a, b) => a.data().matchIndex - b.data().matchIndex);

          if (tbdDocs.length > 0) {
            const teamsSnap = await tournamentRef.collection("teams").orderBy("teamIndex").get();
            const teams = teamsSnap.docs.map(d => ({
              id: d.id,
              teamName: d.data().teamName,
              teamIndex: d.data().teamIndex,
            }));

            const freshStandings = await tournamentRef.collection("standings").get();
            const standings: Record<string, { points: number; mapsWon: number; mapsLost: number }> = {};
            for (const doc of freshStandings.docs) {
              const d = doc.data();
              standings[doc.id] = { points: d.points || 0, mapsWon: d.mapsWon || 0, mapsLost: d.mapsLost || 0 };
            }

            const allMatchesDocs = await tournamentRef.collection("matches").get();
            const pastPairings = new Set<string>();
            for (const doc of allMatchesDocs.docs) {
              const d = doc.data();
              if (d.team1Id !== "TBD" && d.team2Id !== "TBD") {
                pastPairings.add(`${d.team1Id}-${d.team2Id}`);
                pastPairings.add(`${d.team2Id}-${d.team1Id}`);
              }
            }

            const sorted = teams
              .map(t => ({ ...t, pts: standings[t.id]?.points || 0, md: (standings[t.id]?.mapsWon || 0) - (standings[t.id]?.mapsLost || 0) }))
              .sort((a, b) => b.pts - a.pts || b.md - a.md);

            const used = new Set<string>();
            const pairings: { team1: typeof sorted[0]; team2: typeof sorted[0] }[] = [];

            for (let i = 0; i < sorted.length; i++) {
              if (used.has(sorted[i].id)) continue;
              for (let j = i + 1; j < sorted.length; j++) {
                if (used.has(sorted[j].id)) continue;
                const key = `${sorted[i].id}-${sorted[j].id}`;
                if (!pastPairings.has(key)) {
                  pairings.push({ team1: sorted[i], team2: sorted[j] });
                  used.add(sorted[i].id);
                  used.add(sorted[j].id);
                  break;
                }
              }
            }

            const resolveBatch = adminDb.batch();
            for (let i = 0; i < Math.min(pairings.length, tbdDocs.length); i++) {
              const p = pairings[i];
              resolveBatch.update(tbdDocs[i].ref, {
                team1Id: p.team1.id,
                team2Id: p.team2.id,
                team1Name: p.team1.teamName,
                team2Name: p.team2.teamName,
                isTBD: false,
              });
              resolvedPairings.push(`${p.team1.teamName} vs ${p.team2.teamName}`);
            }

            resolveBatch.update(tournamentRef, { currentMatchDay: nextRound });
            await resolveBatch.commit();

            autoResolved = true;
            console.log(`[AutoResolve] Round ${matchDay} complete → resolved ${resolvedPairings.length} matches for round ${nextRound}`);
          }
        }
      } catch (resolveErr: any) {
        console.error("[AutoResolve] Error:", resolveErr.message);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 11. RESPONSE
    // ═══════════════════════════════════════════════════════════════════════════
    return NextResponse.json({
      success: true,
      gameNumber,
      apiVersion,
      map: mapName,
      roundsPlayed,
      roundScore: `${team1RoundsWon}-${team2RoundsWon}`,
      valorantSideScore: `${redRoundsWon}-${blueRoundsWon}`,
      gameWinner,
      team1ValorantSide,
      team2ValorantSide,
      puuidMatchMethod: team1MatchCount > 0 ? "puuid" : "name_fallback",
      playersMatched: { team1: team1MatchCount, team2: team2MatchCount },
      playersTracked,
      playersSkipped,
      seriesComplete,
      ...(seriesComplete ? {
        seriesScore: `${team1SeriesScore}-${team2SeriesScore}`,
        standingsUpdated: existingMatch.status !== "completed",
      } : {}),
      autoResolved,
      resolvedPairings: autoResolved ? resolvedPairings : undefined,
    });
  } catch (e: any) {
    console.error("Match fetch error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}