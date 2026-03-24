import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, matchId, team1Score, team2Score } = await req.json();

    if (!tournamentId || !adminKey || !matchId || team1Score === undefined || team2Score === undefined) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate BO2 scores
    const s1 = Number(team1Score);
    const s2 = Number(team2Score);
    if (s1 + s2 > 2 || s1 < 0 || s2 < 0 || s1 > 2 || s2 > 2) {
      return NextResponse.json({ error: "Invalid BO2 scores. Each team can win 0-2 maps, total must be <= 2." }, { status: 400 });
    }

    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);

    // ── Fetch match ──────────────────────────────────────────────────────────
    const matchRef = tournamentRef.collection("matches").doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    const matchData = matchDoc.data()!;

    // ── Update match ─────────────────────────────────────────────────────────
    await matchRef.update({
      team1Score: s1,
      team2Score: s2,
      status: "completed",
      completedAt: new Date().toISOString(),
    });

    // ── Compute points ───────────────────────────────────────────────────────
    // BO2 Swiss: Win 2-0 = 2pts, Draw 1-1 = 1pt each, Loss 0-2 = 0pts
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
      // Draw (1-1)
      team1Points = 1; team2Points = 1;
      team1Result = "draw"; team2Result = "draw";
    }

    // ── Update standings ─────────────────────────────────────────────────────
    const standingsRef = tournamentRef.collection("standings");

    // Helper to ensure standings doc exists
    const ensureStanding = async (teamId: string, teamName: string) => {
      const ref = standingsRef.doc(teamId);
      const doc = await ref.get();
      if (!doc.exists) {
        await ref.set({
          teamId,
          teamName,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          mapsWon: 0,
          mapsLost: 0,
          buchholz: 0,
        });
      }
    };

    await ensureStanding(matchData.team1Id, matchData.team1Name);
    await ensureStanding(matchData.team2Id, matchData.team2Name);

    // Update team 1
    await standingsRef.doc(matchData.team1Id).update({
      played: FieldValue.increment(1),
      wins: FieldValue.increment(team1Result === "win" ? 1 : 0),
      draws: FieldValue.increment(team1Result === "draw" ? 1 : 0),
      losses: FieldValue.increment(team1Result === "loss" ? 1 : 0),
      points: FieldValue.increment(team1Points),
      mapsWon: FieldValue.increment(s1),
      mapsLost: FieldValue.increment(s2),
    });

    // Update team 2
    await standingsRef.doc(matchData.team2Id).update({
      played: FieldValue.increment(1),
      wins: FieldValue.increment(team2Result === "win" ? 1 : 0),
      draws: FieldValue.increment(team2Result === "draw" ? 1 : 0),
      losses: FieldValue.increment(team2Result === "loss" ? 1 : 0),
      points: FieldValue.increment(team2Points),
      mapsWon: FieldValue.increment(s2),
      mapsLost: FieldValue.increment(s1),
    });

    // ── Recompute Buchholz for ALL teams ─────────────────────────────────────
    // Buchholz = sum of all opponents' points
    const allMatches = await tournamentRef.collection("matches").where("status", "==", "completed").get();
    const allStandings = await standingsRef.get();

    const pointsMap: Record<string, number> = {};
    for (const doc of allStandings.docs) {
      pointsMap[doc.id] = doc.data().points || 0;
    }

    const opponentsMap: Record<string, string[]> = {};
    for (const doc of allMatches.docs) {
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

    return NextResponse.json({
      success: true,
      matchId,
      team1: { name: matchData.team1Name, score: s1, points: team1Points, result: team1Result },
      team2: { name: matchData.team2Name, score: s2, points: team2Points, result: team2Result },
    });
  } catch (e: any) {
    console.error("Match result error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
