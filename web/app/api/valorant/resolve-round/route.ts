import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/valorant/resolve-round
 *
 * After a round completes, this resolves TBD placeholders in the next round
 * by looking at current standings and doing Swiss-style pairing (similar points play each other).
 *
 * Body: { tournamentId, adminKey, completedRound }
 */
export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, completedRound } = await req.json();

    if (!tournamentId || !adminKey || !completedRound) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const nextRound = completedRound + 1;

    // ── Verify all matches in completed round are done ───────────────────────
    const completedMatches = await tournamentRef
      .collection("matches")
      .where("matchDay", "==", completedRound)
      .get();

    const allDone = completedMatches.docs.every(d => d.data().status === "completed");
    if (!allDone) {
      return NextResponse.json({
        error: `Not all matches in round ${completedRound} are completed yet.`,
      }, { status: 400 });
    }

    // ── Get TBD matches for next round ───────────────────────────────────────
    const nextRoundMatches = await tournamentRef
      .collection("matches")
      .where("matchDay", "==", nextRound)
      .get();

    if (nextRoundMatches.empty) {
      return NextResponse.json({
        error: `No matches found for round ${nextRound}. Tournament may be complete.`,
      }, { status: 400 });
    }

    // ── Get current standings ────────────────────────────────────────────────
    const standingsSnap = await tournamentRef.collection("standings").get();
    const standings: Record<string, { points: number; teamName: string; mapsWon: number; mapsLost: number }> = {};
    for (const doc of standingsSnap.docs) {
      const d = doc.data();
      standings[doc.id] = {
        points: d.points || 0,
        teamName: d.teamName || doc.id,
        mapsWon: d.mapsWon || 0,
        mapsLost: d.mapsLost || 0,
      };
    }

    // ── Get all teams ────────────────────────────────────────────────────────
    const teamsSnap = await tournamentRef.collection("teams").orderBy("teamIndex").get();
    const teams = teamsSnap.docs.map(d => ({
      id: d.id,
      teamName: d.data().teamName,
      teamIndex: d.data().teamIndex,
    }));

    // ── Get past pairings to avoid repeats ───────────────────────────────────
    const allMatches = await tournamentRef.collection("matches").get();
    const pastPairings = new Set<string>();
    for (const doc of allMatches.docs) {
      const d = doc.data();
      if (d.team1Id !== "TBD" && d.team2Id !== "TBD") {
        pastPairings.add(`${d.team1Id}-${d.team2Id}`);
        pastPairings.add(`${d.team2Id}-${d.team1Id}`);
      }
    }

    // ── Swiss pairing: sort by points, pair adjacent, avoid repeats ──────────
    const sorted = [...teams].sort((a, b) => {
      const ptsA = standings[a.id]?.points || 0;
      const ptsB = standings[b.id]?.points || 0;
      if (ptsB !== ptsA) return ptsB - ptsA;
      // Tiebreaker: map diff
      const diffA = (standings[a.id]?.mapsWon || 0) - (standings[a.id]?.mapsLost || 0);
      const diffB = (standings[b.id]?.mapsWon || 0) - (standings[b.id]?.mapsLost || 0);
      if (diffB !== diffA) return diffB - diffA;
      return a.teamIndex - b.teamIndex;
    });

    const used = new Set<string>();
    const pairings: { team1: typeof teams[0]; team2: typeof teams[0] }[] = [];

    for (let i = 0; i < sorted.length; i++) {
      if (used.has(sorted[i].id)) continue;

      // Try to find unused opponent they haven't faced
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

      // Fallback: pair with closest available
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

    // ── Update TBD match docs with actual teams ──────────────────────────────
    const tbdDocs = nextRoundMatches.docs
      .filter(d => d.data().isTBD === true)
      .sort((a, b) => a.data().matchIndex - b.data().matchIndex);

    const batch = adminDb.batch();
    const updated: string[] = [];

    for (let i = 0; i < Math.min(pairings.length, tbdDocs.length); i++) {
      const p = pairings[i];
      const docRef = tbdDocs[i].ref;

      batch.update(docRef, {
        team1Id: p.team1.id,
        team2Id: p.team2.id,
        team1Name: p.team1.teamName,
        team2Name: p.team2.teamName,
        isTBD: false,
      });

      updated.push(`${tbdDocs[i].id}: ${p.team1.teamName} vs ${p.team2.teamName}`);
    }

    // Update current match day
    batch.update(tournamentRef, { currentMatchDay: nextRound });

    await batch.commit();

    return NextResponse.json({
      success: true,
      resolvedRound: nextRound,
      pairings: updated,
      message: `Resolved ${updated.length} matches for round ${nextRound} based on round ${completedRound} standings.`,
    });
  } catch (e: any) {
    console.error("Resolve round error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}