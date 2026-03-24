import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Manually set game-level results for a BO2 series.
 * Used for walkovers, forfeits, or when match UUID isn't available.
 *
 * Accepts:
 * - tournamentId, adminKey, matchDocId
 * - game1Winner: "team1" | "team2" | "draw" | null (null = not played)
 * - game2Winner: "team1" | "team2" | "draw" | null
 * - reason: optional string (e.g. "Team 2 no-show", "forfeit")
 *
 * Computes series score and updates standings.
 */
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

    // ── Compute series score ─────────────────────────────────────────────────
    let team1Maps = 0;
    let team2Maps = 0;

    if (game1Winner === "team1") team1Maps++;
    else if (game1Winner === "team2") team2Maps++;
    else if (game1Winner === "draw") { /* neither gets a map win in a draw scenario — unusual for Valorant but handled */ }

    if (game2Winner === "team1") team1Maps++;
    else if (game2Winner === "team2") team2Maps++;
    else if (game2Winner === "draw") { }

    // If only one game played (other team forfeited both), winner gets 2-0
    // If one game played and other not specified, it's a partial result
    const gamesPlayed = (game1Winner ? 1 : 0) + (game2Winner ? 1 : 0);

    // For walkover: if only game1 or game2 specified and it's a full forfeit,
    // admin should set both games to the same winner
    const updatePayload: any = {
      team1Score: team1Maps,
      team2Score: team2Maps,
      status: "completed",
      completedAt: new Date().toISOString(),
      manualResult: true,
      ...(reason ? { resultReason: reason } : {}),
      ...(game1Winner ? {
        game1: {
          manualResult: true,
          winner: game1Winner,
          mapName: reason || "Manual",
          ...(reason ? { reason } : {}),
        },
        game1Winner: game1Winner,
      } : {}),
      ...(game2Winner ? {
        game2: {
          manualResult: true,
          winner: game2Winner,
          mapName: reason || "Manual",
          ...(reason ? { reason } : {}),
        },
        game2Winner: game2Winner,
      } : {}),
    };

    await matchRef.update(updatePayload);

    // ── Update standings ─────────────────────────────────────────────────────
    // Only update if match wasn't already completed
    if (existingMatch.status !== "completed") {
      let team1Points = 0;
      let team2Points = 0;
      let team1Result: "win" | "draw" | "loss" = "draw";
      let team2Result: "win" | "draw" | "loss" = "draw";

      if (team1Maps > team2Maps) {
        team1Points = 2; team2Points = 0;
        team1Result = "win"; team2Result = "loss";
      } else if (team2Maps > team1Maps) {
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

    return NextResponse.json({
      success: true,
      matchDocId,
      seriesScore: `${team1Maps}-${team2Maps}`,
      game1Winner: game1Winner || "not played",
      game2Winner: game2Winner || "not played",
      reason: reason || "manual entry",
      standingsUpdated: existingMatch.status !== "completed",
    });
  } catch (e: any) {
    console.error("Manual game result error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}