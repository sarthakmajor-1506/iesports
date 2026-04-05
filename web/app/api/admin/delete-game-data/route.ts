import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/admin/delete-game-data
 *
 * Deletes a specific game's data from a match and reverses all database impacts:
 * - Removes game data from match doc
 * - Reverses tournament leaderboard stats for affected players
 * - Reverses global leaderboard stats for affected players
 * - Reverses standings if the series was previously completed (group stage only)
 * - Resets match status/scores
 *
 * Required: tournamentId, adminKey, matchDocId, gameNumber
 */
export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, matchDocId, gameNumber } = await req.json();

    if (!tournamentId || !adminKey || !matchDocId || !gameNumber) {
      return NextResponse.json({ error: "Missing fields: tournamentId, adminKey, matchDocId, gameNumber required" }, { status: 400 });
    }
    if (adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!Number.isInteger(gameNumber) || gameNumber < 1 || gameNumber > 5) {
      return NextResponse.json({ error: "gameNumber must be 1-5" }, { status: 400 });
    }

    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const matchRef = tournamentRef.collection("matches").doc(matchDocId);
    const matchDoc = await matchRef.get();

    if (!matchDoc.exists) {
      return NextResponse.json({ error: `Match doc '${matchDocId}' not found` }, { status: 404 });
    }

    const matchData = matchDoc.data()!;
    const gameKey = `game${gameNumber}`;
    const gameData = matchData[gameKey] || matchData.games?.[gameKey];

    if (!gameData || !gameData.playerStats) {
      return NextResponse.json({ error: `No game data found for game ${gameNumber}` }, { status: 404 });
    }

    const isBracketMatch = matchData.isBracket === true;
    const wasCompleted = matchData.status === "completed";
    const roundsPlayed = gameData.roundsPlayed || 0;
    const gameWinner = gameData.winner; // "team1" | "team2" | null

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. REVERSE TOURNAMENT LEADERBOARD
    // ═══════════════════════════════════════════════════════════════════════════
    const leaderboardRef = tournamentRef.collection("leaderboard");
    const globalLeaderboardRef = adminDb.collection("globalLeaderboard");
    const lbBatch = adminDb.batch();
    const glBatch = adminDb.batch();

    let playersReverted = 0;

    for (const player of gameData.playerStats) {
      const playerId = player.puuid;
      if (!playerId) continue;

      // ── Tournament leaderboard ──
      const playerRef = leaderboardRef.doc(playerId);
      const existingDoc = await playerRef.get();

      if (existingDoc.exists) {
        const ex = existingDoc.data()!;
        const newMatches = Math.max(0, (ex.matchesPlayed || 0) - 1);

        if (newMatches <= 0) {
          // Remove the player entirely if this was their only game
          lbBatch.delete(playerRef);
        } else {
          const newKills = Math.max(0, (ex.totalKills || 0) - (player.kills || 0));
          const newDeaths = Math.max(0, (ex.totalDeaths || 0) - (player.deaths || 0));
          const newAssists = Math.max(0, (ex.totalAssists || 0) - (player.assists || 0));
          const newScore = Math.max(0, (ex.totalScore || 0) - (player.score || 0));
          const newHS = Math.max(0, (ex.totalHeadshots || 0) - (player.headshots || 0));
          const newBS = Math.max(0, (ex.totalBodyshots || 0) - (player.bodyshots || 0));
          const newLS = Math.max(0, (ex.totalLegshots || 0) - (player.legshots || 0));
          const newRounds = Math.max(0, (ex.totalRoundsPlayed || 0) - roundsPlayed);
          const newDmgDealt = Math.max(0, (ex.totalDamageDealt || 0) - (player.damageDealt || 0));
          const newDmgRecv = Math.max(0, (ex.totalDamageReceived || 0) - (player.damageReceived || 0));
          const newFK = Math.max(0, (ex.totalFirstKills || 0) - (player.firstKills || 0));
          const newFD = Math.max(0, (ex.totalFirstDeaths || 0) - (player.firstDeaths || 0));

          lbBatch.update(playerRef, {
            totalKills: newKills,
            totalDeaths: newDeaths,
            totalAssists: newAssists,
            totalScore: newScore,
            totalHeadshots: newHS,
            totalBodyshots: newBS,
            totalLegshots: newLS,
            totalDamageDealt: newDmgDealt,
            totalDamageReceived: newDmgRecv,
            totalFirstKills: newFK,
            totalFirstDeaths: newFD,
            matchesPlayed: newMatches,
            totalRoundsPlayed: newRounds,
            avgKills: Math.round(newKills / newMatches * 100) / 100,
            avgDeaths: Math.round(newDeaths / newMatches * 100) / 100,
            kd: Math.round(newKills / Math.max(1, newDeaths) * 100) / 100,
            acs: newRounds > 0 ? Math.round(newScore / newRounds) : 0,
            hsPercent: Math.round(newHS / Math.max(1, newHS + newBS + newLS) * 100),
            lastUpdated: new Date().toISOString(),
          });
        }
        playersReverted++;
      }

      // ── Global leaderboard ──
      const glRef = globalLeaderboardRef.doc(playerId);
      const glDoc = await glRef.get();

      if (glDoc.exists) {
        const gl = glDoc.data()!;
        const glMatches = Math.max(0, (gl.valorant?.matchesPlayed || 0) - 1);
        const thisGameWin = gameWinner === player.tournamentTeam ? 1 : 0;

        if (glMatches <= 0) {
          glBatch.delete(glRef);
        } else {
          const glKills = Math.max(0, (gl.valorant?.totalKills || 0) - (player.kills || 0));
          const glDeaths = Math.max(0, (gl.valorant?.totalDeaths || 0) - (player.deaths || 0));
          const glHS = Math.max(0, (gl.valorant?.totalHeadshots || 0) - (player.headshots || 0));
          const glBS = Math.max(0, (gl.valorant?.totalBodyshots || 0) - (player.bodyshots || 0));
          const glLS = Math.max(0, (gl.valorant?.totalLegshots || 0) - (player.legshots || 0));
          const glRounds = Math.max(0, (gl.valorant?.totalRoundsPlayed || 0) - roundsPlayed);
          const glScore = Math.max(0, (gl.valorant?.totalScore || 0) - (player.score || 0));

          glBatch.update(glRef, {
            lastUpdated: new Date().toISOString(),
            "valorant.totalKills": glKills,
            "valorant.totalDeaths": glDeaths,
            "valorant.totalAssists": Math.max(0, (gl.valorant?.totalAssists || 0) - (player.assists || 0)),
            "valorant.totalScore": glScore,
            "valorant.totalHeadshots": glHS,
            "valorant.totalBodyshots": glBS,
            "valorant.totalLegshots": glLS,
            "valorant.totalDamageDealt": Math.max(0, (gl.valorant?.totalDamageDealt || 0) - (player.damageDealt || 0)),
            "valorant.totalDamageReceived": Math.max(0, (gl.valorant?.totalDamageReceived || 0) - (player.damageReceived || 0)),
            "valorant.matchesPlayed": glMatches,
            "valorant.totalRoundsPlayed": glRounds,
            "valorant.gamesWon": Math.max(0, (gl.valorant?.gamesWon || 0) - thisGameWin),
            "valorant.kd": Math.round(glKills / Math.max(1, glDeaths) * 100) / 100,
            "valorant.acs": glRounds > 0 ? Math.round(glScore / glRounds) : 0,
            "valorant.hsPercent": Math.round(glHS / Math.max(1, glHS + glBS + glLS) * 100),
          });
        }
      }
    }

    await lbBatch.commit();
    await glBatch.commit();

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. REVERSE STANDINGS IF MATCH WAS COMPLETED (GROUP STAGE ONLY)
    // ═══════════════════════════════════════════════════════════════════════════
    let standingsReverted = false;

    if (wasCompleted && !isBracketMatch) {
      // We need to figure out the old series result to reverse it
      // Count game winners across all games in the series
      const tournamentDoc = await tournamentRef.get();
      const tData = tournamentDoc.data() || {};
      let bo = tData.matchesPerRound || 2;
      if (matchData.bracketType === "grand_final") bo = tData.grandFinalBestOf || 3;
      else if (matchData.isBracket) bo = tData.bracketBestOf || 2;

      // Reconstruct old series scores
      let oldT1Score = 0;
      let oldT2Score = 0;
      for (let g = 1; g <= bo; g++) {
        const gData = matchData[`game${g}`] || matchData.games?.[`game${g}`];
        const gWinner = matchData[`game${g}Winner`] || gData?.winner || null;
        if (gWinner === "team1") oldT1Score++;
        else if (gWinner === "team2") oldT2Score++;
      }

      // Determine old result
      let oldT1Pts = 0, oldT2Pts = 0;
      let oldT1Result: "win" | "draw" | "loss" = "draw";
      let oldT2Result: "win" | "draw" | "loss" = "draw";

      if (oldT1Score > oldT2Score) {
        oldT1Pts = 2; oldT1Result = "win"; oldT2Result = "loss";
      } else if (oldT2Score > oldT1Score) {
        oldT2Pts = 2; oldT1Result = "loss"; oldT2Result = "win";
      } else {
        oldT1Pts = 1; oldT2Pts = 1;
      }

      const standingsRef = tournamentRef.collection("standings");
      const t1Standing = await standingsRef.doc(matchData.team1Id).get();
      const t2Standing = await standingsRef.doc(matchData.team2Id).get();

      if (t1Standing.exists) {
        await standingsRef.doc(matchData.team1Id).update({
          played: FieldValue.increment(-1),
          wins: FieldValue.increment(oldT1Result === "win" ? -1 : 0),
          draws: FieldValue.increment(oldT1Result === "draw" ? -1 : 0),
          losses: FieldValue.increment(oldT1Result === "loss" ? -1 : 0),
          points: FieldValue.increment(-oldT1Pts),
          mapsWon: FieldValue.increment(-oldT1Score),
          mapsLost: FieldValue.increment(-oldT2Score),
        });
      }

      if (t2Standing.exists) {
        await standingsRef.doc(matchData.team2Id).update({
          played: FieldValue.increment(-1),
          wins: FieldValue.increment(oldT2Result === "win" ? -1 : 0),
          draws: FieldValue.increment(oldT2Result === "draw" ? -1 : 0),
          losses: FieldValue.increment(oldT2Result === "loss" ? -1 : 0),
          points: FieldValue.increment(-oldT2Pts),
          mapsWon: FieldValue.increment(-oldT2Score),
          mapsLost: FieldValue.increment(-oldT1Score),
        });
      }

      // Recompute Buchholz using only group stage matches (excluding this one)
      const allCompleted = await tournamentRef.collection("matches")
        .where("status", "==", "completed")
        .where("isBracket", "!=", true)
        .get();
      const freshStandings = await standingsRef.get();
      const pointsMap: Record<string, number> = {};
      for (const doc of freshStandings.docs) pointsMap[doc.id] = doc.data().points || 0;

      const opponentsMap: Record<string, string[]> = {};
      for (const doc of allCompleted.docs) {
        if (doc.id === matchDocId) continue; // exclude the match we're reverting
        const d = doc.data();
        if (!opponentsMap[d.team1Id]) opponentsMap[d.team1Id] = [];
        if (!opponentsMap[d.team2Id]) opponentsMap[d.team2Id] = [];
        opponentsMap[d.team1Id].push(d.team2Id);
        opponentsMap[d.team2Id].push(d.team1Id);
      }

      const bBatch = adminDb.batch();
      // Reset all teams' buchholz to 0 first, then recompute
      for (const doc of freshStandings.docs) {
        bBatch.update(doc.ref, { buchholz: 0 });
      }
      for (const [teamId, opponents] of Object.entries(opponentsMap)) {
        const bScore = opponents.reduce((sum, oppId) => sum + (pointsMap[oppId] || 0), 0);
        const ref = standingsRef.doc(teamId);
        bBatch.update(ref, { buchholz: bScore });
      }
      await bBatch.commit();

      standingsReverted = true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. CLEAR GAME DATA FROM MATCH DOC + RESET STATUS
    // ═══════════════════════════════════════════════════════════════════════════
    const clearPayload: any = {
      [gameKey]: FieldValue.delete(),
      [`games.${gameKey}`]: FieldValue.delete(),
      [`${gameKey}MatchId`]: FieldValue.delete(),
      [`${gameKey}Winner`]: FieldValue.delete(),
    };

    // Recalculate series score from remaining games
    const tournamentDoc2 = await tournamentRef.get();
    const tData2 = tournamentDoc2.data() || {};
    let bo = tData2.matchesPerRound || 2;
    if (matchData.bracketType === "grand_final") bo = tData2.grandFinalBestOf || 3;
    else if (matchData.id === "lb-final" && tData2.lbFinalBestOf) bo = tData2.lbFinalBestOf;
    else if (matchData.isBracket) bo = tData2.bracketBestOf || 2;

    let newT1Score = 0;
    let newT2Score = 0;
    let remainingGames = 0;
    for (let g = 1; g <= bo; g++) {
      if (g === gameNumber) continue; // skip deleted game
      const gData = matchData[`game${g}`] || matchData.games?.[`game${g}`];
      const gWinner = matchData[`game${g}Winner`] || gData?.winner || null;
      if (gData?.status === "completed") {
        remainingGames++;
        if (gWinner === "team1") newT1Score++;
        else if (gWinner === "team2") newT2Score++;
      }
    }

    clearPayload.team1Score = newT1Score;
    clearPayload.team2Score = newT2Score;

    if (remainingGames === 0) {
      clearPayload.status = "pending";
      clearPayload.completedAt = FieldValue.delete();
      clearPayload.seriesAutoComputed = FieldValue.delete();
    } else {
      clearPayload.status = "live";
      clearPayload.completedAt = FieldValue.delete();
      clearPayload.seriesAutoComputed = FieldValue.delete();
    }

    await matchRef.update(clearPayload);

    return NextResponse.json({
      success: true,
      matchDocId,
      gameNumber,
      playersReverted,
      standingsReverted,
      remainingGames,
      newSeriesScore: `${newT1Score}-${newT2Score}`,
      matchStatusReset: remainingGames === 0 ? "pending" : "live",
    });
  } catch (e: any) {
    console.error("Delete game data error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
