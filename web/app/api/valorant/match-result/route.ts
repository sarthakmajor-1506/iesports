import { isNotAdmin } from "@/lib/checkAdmin";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, matchId, team1Score, team2Score, bestOf } = await req.json();

    if (!tournamentId || !adminKey || !matchId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (await isNotAdmin(adminKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bo = bestOf || 2;
    const s1 = parseInt(team1Score);
    const s2 = parseInt(team2Score);

    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0 || s1 + s2 > bo || s1 > bo || s2 > bo) {
      return NextResponse.json({ error: `Invalid scores. Each team can win 0-${bo} maps, total must be <= ${bo}.` }, { status: 400 });
    }

    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);

    const matchRef = tournamentRef.collection("matches").doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    const matchData = matchDoc.data()!;
    const matchDay = matchData.matchDay;
    const isBracketMatch = matchData.isBracket === true;

    await matchRef.update({
      team1Score: s1,
      team2Score: s2,
      status: "completed",
      completedAt: new Date().toISOString(),
    });

    let team1Points = 0;
    let team2Points = 0;
    let team1Result: "win" | "draw" | "loss" = "draw";
    let team2Result: "win" | "draw" | "loss" = "draw";

    if (s1 > s2) {
      team1Points = 2; team2Points = 0;
      team1Result = "win"; team2Result = "loss";
    } else if (s2 > s1) {
      team1Points = 0; team2Points = 2;
      team1Result = "loss"; team2Result = "win";
    } else {
      team1Points = 1; team2Points = 1;
    }

    // ── Update standings — GROUP STAGE ONLY ─────────────────────────────────
    if (!isBracketMatch) {
      const standingsRef = tournamentRef.collection("standings");

      const ensureStanding = async (teamId: string, teamName: string) => {
        const ref = standingsRef.doc(teamId);
        const doc = await ref.get();
        if (!doc.exists) {
          await ref.set({ teamId, teamName, played: 0, wins: 0, draws: 0, losses: 0, points: 0, mapsWon: 0, mapsLost: 0, buchholz: 0 });
        }
      };

      await ensureStanding(matchData.team1Id, matchData.team1Name);
      await ensureStanding(matchData.team2Id, matchData.team2Name);

      await standingsRef.doc(matchData.team1Id).update({
        played: FieldValue.increment(1),
        wins: FieldValue.increment(team1Result === "win" ? 1 : 0),
        draws: FieldValue.increment(team1Result === "draw" ? 1 : 0),
        losses: FieldValue.increment(team1Result === "loss" ? 1 : 0),
        points: FieldValue.increment(team1Points),
        mapsWon: FieldValue.increment(s1),
        mapsLost: FieldValue.increment(s2),
      });

      await standingsRef.doc(matchData.team2Id).update({
        played: FieldValue.increment(1),
        wins: FieldValue.increment(team2Result === "win" ? 1 : 0),
        draws: FieldValue.increment(team2Result === "draw" ? 1 : 0),
        losses: FieldValue.increment(team2Result === "loss" ? 1 : 0),
        points: FieldValue.increment(team2Points),
        mapsWon: FieldValue.increment(s2),
        mapsLost: FieldValue.increment(s1),
      });

      // Recompute Buchholz using only group stage matches
      const allCompletedMatches = await tournamentRef.collection("matches")
        .where("status", "==", "completed")
        .where("isBracket", "!=", true)
        .get();
      const allStandings = await standingsRef.get();

      const pointsMap: Record<string, number> = {};
      for (const doc of allStandings.docs) {
        pointsMap[doc.id] = doc.data().points || 0;
      }

      const opponentsMap: Record<string, string[]> = {};
      for (const doc of allCompletedMatches.docs) {
        const d = doc.data();
        if (!opponentsMap[d.team1Id]) opponentsMap[d.team1Id] = [];
        if (!opponentsMap[d.team2Id]) opponentsMap[d.team2Id] = [];
        opponentsMap[d.team1Id].push(d.team2Id);
        opponentsMap[d.team2Id].push(d.team1Id);
      }

      const buchholzBatch = adminDb.batch();
      for (const [teamId, opponents] of Object.entries(opponentsMap)) {
        const bScore = opponents.reduce((sum, oppId) => sum + (pointsMap[oppId] || 0), 0);
        buchholzBatch.update(standingsRef.doc(teamId), { buchholz: bScore });
      }
      await buchholzBatch.commit();
    }

    // ── AUTO-RESOLVE: Group stage only ───────────────────────────────────────
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

            const allMatches = await tournamentRef.collection("matches").get();
            const pastPairings = new Set<string>();
            for (const doc of allMatches.docs) {
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
                const key = `${sorted[i].id}-${sorted[j].id}`;
                if (!pastPairings.has(key)) {
                  pairings.push({ team1: sorted[i], team2: sorted[j] });
                  used.add(sorted[i].id);
                  used.add(sorted[j].id);
                  paired = true;
                  break;
                }
              }
              if (!paired && !used.has(sorted[i].id)) {
                for (let j = i + 1; j < sorted.length; j++) {
                  if (!used.has(sorted[j].id)) {
                    pairings.push({ team1: sorted[i], team2: sorted[j] });
                    used.add(sorted[i].id);
                    used.add(sorted[j].id);
                    break;
                  }
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

    return NextResponse.json({
      success: true,
      matchId,
      team1: { name: matchData.team1Name, score: s1, points: team1Points, result: team1Result },
      team2: { name: matchData.team2Name, score: s2, points: team2Points, result: team2Result },
      autoResolved,
      resolvedPairings: autoResolved ? resolvedPairings : undefined,
    });
  } catch (e: any) {
    console.error("Match result error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}