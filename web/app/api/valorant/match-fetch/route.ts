import { isNotAdmin } from "@/lib/checkAdmin";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { sendGameResult, sendTournamentComplete } from "@/lib/discord";

/**
 * POST /api/valorant/match-fetch
 *
 * Fetches a single Valorant game's stats from the interim Valorant rank API and stores them.
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
    if (await isNotAdmin(adminKey)) {
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
        return NextResponse.json({ error: `Match fetch failed: ${v2Res.status}. Match ID may be invalid.` }, { status: 400 });
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

    // Helper: extract rounds won from a team object, trying all known field paths
    const extractRoundsWon = (teamObj: any): number => {
      if (!teamObj) return 0;
      // Try: rounds_won (snake), roundsWon (camel), rounds.won (nested)
      return teamObj.rounds_won ?? teamObj.roundsWon ?? teamObj.rounds?.won ?? 0;
    };
    const extractHasWon = (teamObj: any): boolean => {
      if (!teamObj) return false;
      // Try: has_won, hasWon, won
      return teamObj.has_won === true || teamObj.hasWon === true || teamObj.won === true;
    };

    // Helper: resolve teams — could be object {red:{}, blue:{}} or array [{team_id:"Red",...}]
    let redTeamObj: any = null;
    let blueTeamObj: any = null;
    if (matchData.teams) {
      if (Array.isArray(matchData.teams)) {
        redTeamObj = matchData.teams.find((t: any) => (t.team_id || t.teamId || "").toLowerCase() === "red");
        blueTeamObj = matchData.teams.find((t: any) => (t.team_id || t.teamId || "").toLowerCase() === "blue");
      } else {
        redTeamObj = matchData.teams.red || matchData.teams.Red;
        blueTeamObj = matchData.teams.blue || matchData.teams.Blue;
      }
    }

    // Dump raw teams structure for debugging
    const rawTeamsDebug = {
      isArray: Array.isArray(matchData.teams),
      keys: matchData.teams ? Object.keys(matchData.teams) : [],
      redKeys: redTeamObj ? Object.keys(redTeamObj) : [],
      redRaw: redTeamObj ? JSON.parse(JSON.stringify(redTeamObj, (k, v) => k === "roster" ? "[omitted]" : v)) : null,
      blueRaw: blueTeamObj ? JSON.parse(JSON.stringify(blueTeamObj, (k, v) => k === "roster" ? "[omitted]" : v)) : null,
    };

    if (apiVersion === "v4") {
      mapName = matchData.metadata?.map?.name || matchData.metadata?.map || "Unknown";
      redRoundsWon = extractRoundsWon(redTeamObj);
      blueRoundsWon = extractRoundsWon(blueTeamObj);
      roundsPlayed = redRoundsWon + blueRoundsWon;
      redWon = extractHasWon(redTeamObj);

      playerStats = (matchData.players || []).map((p: any) => {
        // Normalize team to "Red" or "Blue" — v4 may use team_id (could be non-standard) or team
        const rawTeam = p.team_id || p.team || "";
        const normalizedTeam = rawTeam.toLowerCase().includes("red") ? "Red"
          : rawTeam.toLowerCase().includes("blue") ? "Blue"
          : rawTeam; // pass through if unexpected

        // Extract FK/FD from player stats (v4 provides these directly)
        const directFK = p.stats?.first_kills ?? p.stats?.firstKills ?? p.first_kills ?? p.firstKills ?? null;
        const directFD = p.stats?.first_deaths ?? p.stats?.firstDeaths ?? p.first_deaths ?? p.firstDeaths ?? null;

        return {
          puuid: p.puuid,
          name: p.name,
          tag: p.tag,
          team: normalizedTeam,
          agent: p.agent?.name || "Unknown",
          kills: p.stats?.kills || 0,
          deaths: p.stats?.deaths || 0,
          assists: p.stats?.assists || 0,
          score: p.stats?.score || 0,
          headshots: p.stats?.headshots || 0,
          bodyshots: p.stats?.bodyshots || 0,
          legshots: p.stats?.legshots || 0,
          damageDealt: p.stats?.damage?.dealt || p.stats?.damage_dealt || 0,
          damageReceived: p.stats?.damage?.received || p.stats?.damage_received || 0,
          directFirstKills: directFK,
          directFirstDeaths: directFD,
        };
      });
    } else {
      const allPlayers = matchData.players?.all_players || [];
      mapName = matchData.metadata?.map || "Unknown";
      roundsPlayed = matchData.metadata?.rounds_played || 0;
      redRoundsWon = extractRoundsWon(redTeamObj);
      blueRoundsWon = extractRoundsWon(blueTeamObj);
      redWon = extractHasWon(redTeamObj);

      playerStats = allPlayers.map((p: any) => {
        // Extract FK/FD from v2 player stats if available
        const directFK = p.stats?.first_kills ?? p.first_kills ?? p.firstKills ?? null;
        const directFD = p.stats?.first_deaths ?? p.first_deaths ?? p.firstDeaths ?? null;

        return {
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
          damageDealt: p.damage_made || p.stats?.damage_dealt || 0,
          damageReceived: p.damage_received || p.stats?.damage_received || 0,
          directFirstKills: directFK,
          directFirstDeaths: directFD,
        };
      });
    }

    const valorantWinnerSide = redWon ? "Red" : "Blue"; // which Valorant side won

    // ── Extract round-by-round data, first bloods, kill matrix ──
    let roundResults: { round: number; winTeam: string; endType: string }[] = [];
    const playerFirstKills: Record<string, number> = {};
    const playerFirstDeaths: Record<string, number> = {};
    const killMatrix: Record<string, Record<string, number>> = {}; // killer puuid -> victim puuid -> count

    if (matchData.rounds && Array.isArray(matchData.rounds)) {
      for (let ri = 0; ri < matchData.rounds.length; ri++) {
        const round = matchData.rounds[ri];
        const winTeam = round.winning_team || round.winningTeam || round.result || "";
        const normalizedWin = typeof winTeam === "string"
          ? (winTeam.toLowerCase().includes("red") ? "Red" : winTeam.toLowerCase().includes("blue") ? "Blue" : winTeam)
          : "";
        const endType = round.end_type || round.endType || "";

        roundResults.push({ round: ri + 1, winTeam: normalizedWin, endType });

        // Extract kill events from round
        const kills: { killer: string; victim: string; round_time?: number }[] = [];

        // Path 1: player_stats[].kills[]
        const roundPlayerStats = round.player_stats || round.playerStats || round.stats || [];
        if (Array.isArray(roundPlayerStats)) {
          for (const ps of roundPlayerStats) {
            const playerKills = ps.kills || ps.kill_events || [];
            if (Array.isArray(playerKills)) {
              for (const k of playerKills) {
                const killer = k.killer?.puuid || k.killer_puuid || k.killer_id || ps.puuid || "";
                const victim = k.victim?.puuid || k.victim_puuid || k.victim_id || "";
                const rt = k.round_time_in_ms ?? k.round_time ?? k.time_in_round ?? 0;
                if (killer && victim) kills.push({ killer, victim, round_time: rt });
              }
            }
          }
        }

        // Path 2: round.kills[] (flat array)
        if (kills.length === 0 && Array.isArray(round.kills)) {
          for (const k of round.kills) {
            const killer = k.killer?.puuid || k.killer_puuid || k.killer_id || "";
            const victim = k.victim?.puuid || k.victim_puuid || k.victim_id || "";
            const rt = k.round_time_in_ms ?? k.round_time ?? k.time_in_round ?? 0;
            if (killer && victim) kills.push({ killer, victim, round_time: rt });
          }
        }

        // Path 3: round.player_stats[].was_first_kill / was_first_death (v4 shortcut)
        if (kills.length === 0 && Array.isArray(roundPlayerStats)) {
          for (const ps of roundPlayerStats) {
            const puuid = ps.puuid || ps.player_puuid || "";
            if (puuid && (ps.was_first_kill || ps.first_kill)) {
              playerFirstKills[puuid] = (playerFirstKills[puuid] || 0) + 1;
            }
            if (puuid && (ps.was_first_death || ps.first_death)) {
              playerFirstDeaths[puuid] = (playerFirstDeaths[puuid] || 0) + 1;
            }
          }
        }

        // Sort kills by time so first blood = earliest kill
        if (kills.length > 0) {
          kills.sort((a, b) => (a.round_time || 0) - (b.round_time || 0));
          const fb = kills[0];
          playerFirstKills[fb.killer] = (playerFirstKills[fb.killer] || 0) + 1;
          playerFirstDeaths[fb.victim] = (playerFirstDeaths[fb.victim] || 0) + 1;
        }

        // Aggregate kill matrix for duels
        for (const k of kills) {
          if (!killMatrix[k.killer]) killMatrix[k.killer] = {};
          killMatrix[k.killer][k.victim] = (killMatrix[k.killer][k.victim] || 0) + 1;
        }
      }
    }

    // Path 4: Top-level matchData.kills[] (v4 flat kill feed across all rounds)
    if (Object.keys(playerFirstKills).length === 0 && matchData.kills && Array.isArray(matchData.kills)) {
      // Group kills by round
      const killsByRound: Record<number, { killer: string; victim: string; time: number }[]> = {};
      for (const k of matchData.kills) {
        const roundNum = k.round ?? k.round_number ?? 0;
        const killer = k.killer?.puuid || k.killer_puuid || "";
        const victim = k.victim?.puuid || k.victim_puuid || "";
        const time = k.round_time_in_ms ?? k.round_time ?? k.time_in_round ?? 0;
        if (killer && victim) {
          if (!killsByRound[roundNum]) killsByRound[roundNum] = [];
          killsByRound[roundNum].push({ killer, victim, time });
        }
      }
      for (const roundKills of Object.values(killsByRound)) {
        roundKills.sort((a, b) => a.time - b.time);
        if (roundKills.length > 0) {
          playerFirstKills[roundKills[0].killer] = (playerFirstKills[roundKills[0].killer] || 0) + 1;
          playerFirstDeaths[roundKills[0].victim] = (playerFirstDeaths[roundKills[0].victim] || 0) + 1;
        }
        // Also aggregate kill matrix
        for (const k of roundKills) {
          if (!killMatrix[k.killer]) killMatrix[k.killer] = {};
          killMatrix[k.killer][k.victim] = (killMatrix[k.killer][k.victim] || 0) + 1;
        }
      }
    }

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

    // Test tournaments can pin Discord traffic to a single isolated channel.
    const tournamentDocForOverride = await tournamentRef.get();
    const testChannelOverride: string | undefined = tournamentDocForOverride.data()?.testDiscordChannelId;

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

    // Tag each player stat with teamId + first blood stats for the frontend
    // Prefer direct API values, fall back to round-extracted values
    const enrichedPlayerStats = playerStats.map(ps => ({
      ...ps,
      firstKills: ps.directFirstKills ?? playerFirstKills[ps.puuid] ?? 0,
      firstDeaths: ps.directFirstDeaths ?? playerFirstDeaths[ps.puuid] ?? 0,
      teamId: team1Puuids.has(ps.puuid) ? team1Id :
              team2Puuids.has(ps.puuid) ? team2Id :
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

    // Map round results to tournament teams
    const mappedRoundResults = roundResults.map(r => ({
      ...r,
      winner: !team1ValorantSide ? null :
        r.winTeam === team1ValorantSide ? "team1" :
        r.winTeam === team2ValorantSide ? "team2" : null,
    }));

    const gameStartedAt = matchData?.metadata?.started_at || matchData?.metadata?.game_start || null;
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
      roundResults: mappedRoundResults,
      killMatrix,
      fetchedAt: new Date().toISOString(),
      startedAt: gameStartedAt,
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
    else if (matchDocId === "lb-final" && tData.lbFinalBestOf) bo = tData.lbFinalBestOf;
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

    // Series completes when all BO games are fetched, or (for BO3/BO5) a team clinches majority
    // BO1/BO2: must play ALL games (no early clinch — BO2 can draw 1-1)
    const winsNeeded = Math.ceil(bo / 2);
    const canClinchEarly = bo >= 3; // only odd-BO series can clinch before all games
    if (completedGames === bo || (canClinchEarly && (team1SeriesScore >= winsNeeded || team2SeriesScore >= winsNeeded))) {
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
    // 8. UPDATE STANDINGS IF SERIES COMPLETE — GROUP STAGE ONLY
    // ═══════════════════════════════════════════════════════════════════════════
    const isBracketMatch = existingMatch.isBracket === true;

    // ═══════════════════════════════════════════════════════════════════════════
    // 8a. BRACKET ADVANCEMENT — propagate winner/loser to next matches
    // ═══════════════════════════════════════════════════════════════════════════
    if (seriesComplete && isBracketMatch) {
      const winnerId   = team1SeriesScore >= team2SeriesScore ? team1Id : team2Id;
      const winnerName = team1SeriesScore >= team2SeriesScore ? existingMatch.team1Name : existingMatch.team2Name;
      const loserId    = team1SeriesScore >= team2SeriesScore ? team2Id : team1Id;
      const loserName  = team1SeriesScore >= team2SeriesScore ? existingMatch.team2Name : existingMatch.team1Name;

      const advanceBatch = adminDb.batch();

      // Move winner into winnerGoesTo match
      if (existingMatch.winnerGoesTo) {
        const nextMatchRef = tournamentRef.collection("matches").doc(existingMatch.winnerGoesTo);
        const nextMatchDoc = await nextMatchRef.get();
        if (nextMatchDoc.exists) {
          const nextMatch = nextMatchDoc.data()!;
          if (nextMatch.team1Id === "TBD") {
            advanceBatch.update(nextMatchRef, { team1Id: winnerId, team1Name: winnerName });
          } else if (nextMatch.team2Id === "TBD") {
            advanceBatch.update(nextMatchRef, { team2Id: winnerId, team2Name: winnerName });
          }
        }
      }

      // Move loser into loserGoesTo match
      if (existingMatch.loserGoesTo) {
        const loseMatchRef = tournamentRef.collection("matches").doc(existingMatch.loserGoesTo);
        const loseMatchDoc = await loseMatchRef.get();
        if (loseMatchDoc.exists) {
          const loseMatch = loseMatchDoc.data()!;
          if (loseMatch.team1Id === "TBD") {
            advanceBatch.update(loseMatchRef, { team1Id: loserId, team1Name: loserName });
          } else if (loseMatch.team2Id === "TBD") {
            advanceBatch.update(loseMatchRef, { team2Id: loserId, team2Name: loserName });
          }
        }
      }

      await advanceBatch.commit();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 8b. UPDATE STANDINGS IF SERIES COMPLETE — GROUP STAGE ONLY
    // ═══════════════════════════════════════════════════════════════════════════
    if (seriesComplete && existingMatch.status !== "completed" && !isBracketMatch) {
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

      // Recompute Buchholz using only group stage matches
      const allCompletedMatches = await tournamentRef.collection("matches")
        .where("status", "==", "completed")
        .where("isBracket", "!=", true)
        .get();
      const allStandings = await standingsRef.get();
      const pointsMap: Record<string, number> = {};
      for (const doc of allStandings.docs) pointsMap[doc.id] = doc.data().points || 0;

      const opponentsMap: Record<string, string[]> = {};
      for (const doc of allCompletedMatches.docs) {
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

        const newFK = (ex.totalFirstKills || 0) + (player.firstKills || 0);
        const newFD = (ex.totalFirstDeaths || 0) + (player.firstDeaths || 0);

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
          totalFirstKills: newFK,
          totalFirstDeaths: newFD,
          matchesPlayed: newMatches,
          totalRoundsPlayed: newRounds,
          agents: [...new Set([...(ex.agents || []), player.agent])],
          avgKills: Math.round(newKills / newMatches * 100) / 100,
          avgDeaths: Math.round(newDeaths / newMatches * 100) / 100,
          kd: Math.round(newKills / Math.max(1, newDeaths) * 100) / 100,
          acs: newRounds > 0 ? Math.round(newScore / newRounds) : 0,
          hsPercent: Math.round(newHS / Math.max(1, newHS + newBS + newLS) * 100),
          lastUpdated: new Date().toISOString(),
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
          totalFirstKills: player.firstKills || 0,
          totalFirstDeaths: player.firstDeaths || 0,
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

    if (seriesComplete && existingMatch.status !== "completed" && !isBracketMatch) {
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
    // 10b. PER-GAME DISCORD UPDATE — sent after every game fetch
    // ═══════════════════════════════════════════════════════════════════════════
    let discordGameUpdate = false;
    try {
      // MVP matches the tournament-detail page formula: plain K/D
      // (kills / max(1, deaths)), tiebroken by kills. Leaderboard uses a
      // different (K+0.5A)/D aggregation — per-match MVP is simpler so the
      // Discord post and the match page always agree on who won MVP.
      // Substitutes and any player not on either team's roster are ineligible.
      const mvpKd = (p: { kills: number; deaths: number }) => p.kills / Math.max(1, p.deaths);
      const sortedByMvp = [...enrichedPlayerStats]
        .filter(p => !excluded.has(p.puuid) && rosterPuuids.has(p.puuid))
        .sort((a, b) => {
          const kdA = mvpKd(a);
          const kdB = mvpKd(b);
          if (Math.abs(kdB - kdA) > 0.01) return kdB - kdA;
          return (b.kills || 0) - (a.kills || 0);
        });
      const mvpPlayer = sortedByMvp[0] || null;
      const mvp = mvpPlayer ? {
        name: mvpPlayer.name || "Unknown",
        kills: mvpPlayer.kills,
        deaths: mvpPlayer.deaths,
        assists: mvpPlayer.assists,
        acs: roundsPlayed > 0 ? Math.round(mvpPlayer.score / roundsPlayed) : 0,
      } : null;

      const topPerformers = sortedByMvp.slice(1, 3).map(p => ({
        name: p.name || "Unknown",
        kills: p.kills,
        deaths: p.deaths,
        acs: roundsPlayed > 0 ? Math.round(p.score / roundsPlayed) : 0,
      }));

      const gameRes = await sendGameResult({
        team1Name: existingMatch.team1Name,
        team2Name: existingMatch.team2Name,
        gameNumber,
        mapName,
        team1RoundsWon,
        team2RoundsWon,
        gameWinner,
        team1SeriesScore,
        team2SeriesScore,
        bo,
        mvp,
        topPerformers,
        isBracket: existingMatch.isBracket,
        bracketLabel: existingMatch.bracketLabel,
        channelIdOverride: testChannelOverride,
      });
      discordGameUpdate = gameRes.ok;
      if (!gameRes.ok) console.error("[Discord] Game update failed:", gameRes.error);
    } catch (gameDiscordErr: any) {
      console.error("[Discord] Game update error:", gameDiscordErr.message);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 10c. TOURNAMENT COMPLETION — Discord announcement when Grand Final ends
    // ═══════════════════════════════════════════════════════════════════════════
    let discordAnnouncement = false;
    if (seriesComplete && existingMatch.bracketType === "grand_final") {
      try {
        const winnerId = team1SeriesScore > team2SeriesScore ? team1Id : team2Id;
        const winnerName = team1SeriesScore > team2SeriesScore ? existingMatch.team1Name : existingMatch.team2Name;

        // Fetch winner team members
        const allTeamsSnap = await tournamentRef.collection("teams").get();
        const winnerTeamDoc = allTeamsSnap.docs.find(d => d.id === winnerId);
        const winnerMembers = winnerTeamDoc?.data()?.members || [];

        // Build Discord ID map for winner tags
        const discordIdMap: Record<string, string> = {};
        for (const m of winnerMembers) {
          if (m.uid?.startsWith("discord_")) {
            discordIdMap[m.uid] = m.uid.replace("discord_", "");
          } else if (m.uid) {
            const userDoc = await adminDb.collection("users").doc(m.uid).get();
            if (userDoc.exists && userDoc.data()?.discordId) {
              discordIdMap[m.uid] = userDoc.data()!.discordId;
            }
          }
        }

        const winnerTags = winnerMembers
          .map((m: any) => {
            const dId = discordIdMap[m.uid];
            return dId ? `<@${dId}>` : (m.riotGameName || m.steamName || "");
          })
          .join(" · ");

        // Game summaries with MVP
        const gameSummaries: string[] = [];
        for (let g = 1; g <= bo; g++) {
          const gData = g === gameNumber ? gameData : (existingMatch[`game${g}`] || existingMatch.games?.[`game${g}`]);
          if (!gData) continue;
          const gMap = gData.mapName || "Unknown";
          const gWinner = g === gameNumber ? gameWinner : (existingMatch[`game${g}Winner`] || gData.winner);
          const gWinnerName = gWinner === "team1" ? existingMatch.team1Name : existingMatch.team2Name;
          const t1R = gData.team1RoundsWon ?? 0;
          const t2R = gData.team2RoundsWon ?? 0;
          // Find MVP for this game
          const gPlayers = (gData.playerStats || []) as any[];
          const gRounds = gData.roundsPlayed || Math.max(t1R + t2R, 1);
          const gMvp = [...gPlayers].sort((a, b) => (b.score / gRounds) - (a.score / gRounds))[0];
          const mvpStr = gMvp ? ` | MVP: **${gMvp.name}** (${gMvp.kills}K/${gMvp.deaths}D, ${Math.round(gMvp.score / gRounds)} ACS)` : "";
          gameSummaries.push(`🗺️ Game ${g} — ${gMap}: **${gWinnerName}** wins **${Math.max(t1R, t2R)}-${Math.min(t1R, t2R)}**${mvpStr}`);
        }

        // Leaderboard top 3
        const lbSnap = await tournamentRef.collection("leaderboard").get();
        const lb = lbSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
        lb.sort((a, b) => (b.kd || 0) - (a.kd || 0));
        const top3 = lb.slice(0, 3).map(p => {
          const dId = discordIdMap[p.uid] || "";
          return { tag: dId ? `<@${dId}>` : "", name: p.name, kd: p.kd || 0, acs: p.acs || 0 };
        });

        const result = await sendTournamentComplete({
          tournamentName: tData.name || "Tournament",
          tournamentId,
          winnerName,
          winnerTags,
          prizePool: tData.prizePool || "TBD",
          team1Name: existingMatch.team1Name,
          team2Name: existingMatch.team2Name,
          team1SeriesScore,
          team2SeriesScore,
          gameSummaries,
          leaderboardTop3: top3,
          channelIdOverride: testChannelOverride,
        });

        if (result.ok) {
          discordAnnouncement = true;
        } else {
          console.error("[Discord] Tournament announcement failed:", result.error);
        }

        // Mark tournament as completed regardless of Discord success
        await tournamentRef.update({
          status: "completed",
          championTeamId: winnerId,
          championTeamName: winnerName,
          championMembers: winnerMembers.map((m: any) => ({
            uid: m.uid, name: m.riotGameName || m.steamName || "", tag: m.riotTagLine || "",
            avatar: m.riotAvatar || "",
          })),
          completedAt: new Date().toISOString(),
        });
      } catch (discordErr: any) {
        console.error("[Discord] Tournament completion error:", discordErr.message);
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
      valorantSideScore: `Red ${redRoundsWon} - Blue ${blueRoundsWon}`,
      redWon,
      gameWinner,
      team1ValorantSide,
      team2ValorantSide,
      puuidMatchMethod: team1MatchCount > 0 ? "puuid" : "name_fallback",
      playersMatched: { team1: team1MatchCount, team2: team2MatchCount },
      rawTeamsDebug,
      puuidsFound: { team1: team1Puuids.size, team2: team2Puuids.size },
      playersTracked,
      playersSkipped,
      seriesComplete,
      ...(seriesComplete ? {
        seriesScore: `${team1SeriesScore}-${team2SeriesScore}`,
        standingsUpdated: existingMatch.status !== "completed",
      } : {}),
      autoResolved,
      resolvedPairings: autoResolved ? resolvedPairings : undefined,
      discordGameUpdate,
      discordAnnouncement,
    });
  } catch (e: any) {
    console.error("Match fetch error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}