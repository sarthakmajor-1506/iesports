import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, matchDocId, game1Winner, game2Winner, reason } = await req.json();

    if (!tournamentId || !adminKey || !matchDocId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const validValues = ["team1", "team2", "draw", null, undefined];
    if (!validValues.includes(game1Winner) || !validValues.includes(game2Winner)) {
      return NextResponse.json({ error: "game1Winner/game2Winner must be 'team1', 'team2', 'draw', or null" }, { status: 400 });
    }

    if (!game1Winner && !game2Winner) {
      return NextResponse.json({ error: "At least one game result must be provided" }, { status: 400 });
    }

    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const matchRef = tournamentRef.collection("matches").doc(matchDocId);
    const matchDoc = await matchRef.get();

    if (!matchDoc.exists) {
      return NextResponse.json({ error: `Match '${matchDocId}' not found` }, { status: 404 });
    }

    const existingMatch = matchDoc.data()!;
    const matchDay = existingMatch.matchDay;
    const isBracketMatch = existingMatch.isBracket === true;

    // ── Compute series score ─────────────────────────────────────────────────
    let team1Maps = 0;
    let team2Maps = 0;

    if (game1Winner === "team1") team1Maps++;
    else if (game1Winner === "team2") team2Maps++;

    if (game2Winner === "team1") team1Maps++;
    else if (game2Winner === "team2") team2Maps++;

    const updatePayload: any = {
      team1Score: team1Maps,
      team2Score: team2Maps,
      status: "completed",
      completedAt: new Date().toISOString(),
      manualResult: true,
      ...(reason ? { resultReason: reason } : {}),
      ...(game1Winner ? {
        game1: { manualResult: true, winner: game1Winner, mapName: reason || "Manual", ...(reason ? { reason } : {}) },
        game1Winner,
      } : {}),
      ...(game2Winner ? {
        game2: { manualResult: true, winner: game2Winner, mapName: reason || "Manual", ...(reason ? { reason } : {}) },
        game2Winner,
      } : {}),
    };

    await matchRef.update(updatePayload);

    // ── BRACKET ADVANCEMENT: propagate winner/loser to next matches ──────────
    if (isBracketMatch) {
      const winnerId   = team1Maps >= team2Maps ? existingMatch.team1Id   : existingMatch.team2Id;
      const winnerName = team1Maps >= team2Maps ? existingMatch.team1Name : existingMatch.team2Name;
      const loserId    = team1Maps >= team2Maps ? existingMatch.team2Id   : existingMatch.team1Id;
      const loserName  = team1Maps >= team2Maps ? existingMatch.team2Name : existingMatch.team1Name;

      const advanceBatch = adminDb.batch();

      // ── Move winner into winnerGoesTo match ────────────────────────────────
      if (existingMatch.winnerGoesTo) {
        const nextMatchRef = tournamentRef.collection("matches").doc(existingMatch.winnerGoesTo);
        const nextMatchDoc = await nextMatchRef.get();
        if (nextMatchDoc.exists) {
          const nextMatch = nextMatchDoc.data()!;
          // Fill the first TBD slot found
          if (nextMatch.team1Id === "TBD") {
            advanceBatch.update(nextMatchRef, { team1Id: winnerId, team1Name: winnerName });
          } else if (nextMatch.team2Id === "TBD") {
            advanceBatch.update(nextMatchRef, { team2Id: winnerId, team2Name: winnerName });
          }
        }
      }

      // ── Move loser into loserGoesTo match ──────────────────────────────────
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

    // ── Update standings — GROUP STAGE ONLY ─────────────────────────────────
    let standingsUpdated = false;
    if (!isBracketMatch && existingMatch.status !== "completed") {
      standingsUpdated = true;

      let team1Points = 0, team2Points = 0;
      let team1Result: "win" | "draw" | "loss" = "draw";
      let team2Result: "win" | "draw" | "loss" = "draw";

      if (team1Maps > team2Maps) {
        team1Points = 2; team1Result = "win"; team2Result = "loss";
      } else if (team2Maps > team1Maps) {
        team2Points = 2; team1Result = "loss"; team2Result = "win";
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
        mapsWon: FieldValue.increment(team1Maps),
        mapsLost: FieldValue.increment(team2Maps),
      });

      await standingsRef.doc(existingMatch.team2Id).update({
        played: FieldValue.increment(1),
        wins: FieldValue.increment(team2Result === "win" ? 1 : 0),
        draws: FieldValue.increment(team2Result === "draw" ? 1 : 0),
        losses: FieldValue.increment(team2Result === "loss" ? 1 : 0),
        points: FieldValue.increment(team2Points),
        mapsWon: FieldValue.increment(team2Maps),
        mapsLost: FieldValue.increment(team1Maps),
      });

      // Recompute Buchholz using only group stage matches
      const allMatches = await tournamentRef.collection("matches")
        .where("status", "==", "completed")
        .where("isBracket", "!=", true)
        .get();
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

    // ── AUTO-RESOLVE: Group stage Swiss pairings only ────────────────────────
    let autoResolved = false;
    let resolvedPairings: string[] = [];

    if (!isBracketMatch) {
      try {
        const roundMatches = await tournamentRef
          .collection("matches")
          .where("matchDay", "==", matchDay)
          .where("isBracket", "!=", true)
          .get();

        const allRoundComplete = roundMatches.docs.every(d => d.data().status === "completed");

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
              id: d.id, teamName: d.data().teamName, teamIndex: d.data().teamIndex,
            }));

            const freshStandings = await tournamentRef.collection("standings").get();
            const standings: Record<string, { points: number; mapsWon: number; mapsLost: number }> = {};
            for (const doc of freshStandings.docs) {
              const d = doc.data();
              standings[doc.id] = { points: d.points || 0, mapsWon: d.mapsWon || 0, mapsLost: d.mapsLost || 0 };
            }

            const allMatchDocs = await tournamentRef.collection("matches").get();
            const pastPairings = new Set<string>();
            for (const doc of allMatchDocs.docs) {
              const d = doc.data();
              if (d.team1Id !== "TBD" && d.team2Id !== "TBD") {
                pastPairings.add(`${d.team1Id}-${d.team2Id}`);
                pastPairings.add(`${d.team2Id}-${d.team1Id}`);
              }
            }

            const sorted = [...teams].sort((a, b) => {
              const ptsA = standings[a.id]?.points || 0;
              const ptsB = standings[b.id]?.points || 0;
              if (ptsB !== ptsA) return ptsB - ptsA;
              const diffA = (standings[a.id]?.mapsWon || 0) - (standings[a.id]?.mapsLost || 0);
              const diffB = (standings[b.id]?.mapsWon || 0) - (standings[b.id]?.mapsLost || 0);
              if (diffB !== diffA) return diffB - diffA;
              return a.teamIndex - b.teamIndex;
            });

            const used = new Set<string>();
            const pairings: { team1: typeof teams[0]; team2: typeof teams[0] }[] = [];

            for (let i = 0; i < sorted.length; i++) {
              if (used.has(sorted[i].id)) continue;
              let paired = false;
              for (let j = i + 1; j < sorted.length; j++) {
                if (used.has(sorted[j].id)) continue;
                if (!pastPairings.has(`${sorted[i].id}-${sorted[j].id}`)) {
                  pairings.push({ team1: sorted[i], team2: sorted[j] });
                  used.add(sorted[i].id); used.add(sorted[j].id);
                  paired = true; break;
                }
              }
              if (!paired && !used.has(sorted[i].id)) {
                for (let j = i + 1; j < sorted.length; j++) {
                  if (!used.has(sorted[j].id)) {
                    pairings.push({ team1: sorted[i], team2: sorted[j] });
                    used.add(sorted[i].id); used.add(sorted[j].id); break;
                  }
                }
              }
            }

            const resolveBatch = adminDb.batch();
            for (let i = 0; i < Math.min(pairings.length, tbdDocs.length); i++) {
              const p = pairings[i];
              resolveBatch.update(tbdDocs[i].ref, {
                team1Id: p.team1.id, team2Id: p.team2.id,
                team1Name: p.team1.teamName, team2Name: p.team2.teamName,
                isTBD: false,
              });
              resolvedPairings.push(`${p.team1.teamName} vs ${p.team2.teamName}`);
            }
            resolveBatch.update(tournamentRef, { currentMatchDay: nextRound });
            await resolveBatch.commit();
            autoResolved = true;
          }
        }
      } catch (resolveErr: any) {
        console.error("[AutoResolve] Error:", resolveErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      matchDocId,
      seriesScore: `${team1Maps}-${team2Maps}`,
      game1Winner: game1Winner || "not played",
      game2Winner: game2Winner || "not played",
      reason: reason || "manual entry",
      standingsUpdated,
      autoResolved,
      resolvedPairings: autoResolved ? resolvedPairings : undefined,
    });
  } catch (e: any) {
    console.error("Manual game result error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}