import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/valorant/generate-brackets
 *
 * Creates double elimination bracket matches based on group stage standings.
 * Dynamically adjusts bracket structure based on team count:
 *
 *   2 teams → Grand Final only (1 match)
 *   3 teams → UB Final + LB Final + Grand Final (3 matches)
 *   4 teams → Full 4-team double elim (6 matches)
 *   5-8 teams → 8-team double elim with byes (up to 14 matches)
 *
 * Seeding:
 *   - Upper bracket gets top 50% of teams from standings
 *   - Lower bracket gets bottom 50%
 *   - Standard bracket seeding: 1v8, 4v5, 2v7, 3v6 (for 8-team)
 *
 * Body: { tournamentId, adminKey, topTeams, startTime, startDate }
 */

interface TeamSeed {
  teamId: string;
  teamName: string;
  seed: number;
  members: any[];
}

const BYE: TeamSeed = { teamId: "BYE", teamName: "BYE", seed: 0, members: [] };
const TBD: TeamSeed = { teamId: "TBD", teamName: "TBD", seed: 0, members: [] };

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, topTeams, startTime, startDate } = await req.json();

    if (!tournamentId || !adminKey) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const tDoc = await tournamentRef.get();
    if (!tDoc.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // ── Fetch standings (sorted by points, buchholz, map diff) ───────────────
    const standingsSnap = await tournamentRef.collection("standings").get();
    if (standingsSnap.empty) {
      return NextResponse.json({ error: "No standings found. Complete group stage first." }, { status: 400 });
    }

    const allStandings = standingsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
        return (b.mapsWon - b.mapsLost) - (a.mapsWon - a.mapsLost);
      });

    const numAdvancing = Math.min(topTeams || 4, allStandings.length);
    if (numAdvancing < 2) {
      return NextResponse.json({ error: "Need at least 2 teams for brackets." }, { status: 400 });
    }

    // ── Fetch team data for member info ──────────────────────────────────────
    const teamsSnap = await tournamentRef.collection("teams").get();
    const teamDataMap: Record<string, any> = {};
    teamsSnap.docs.forEach(d => { teamDataMap[d.id] = d.data(); });

    // ── Build seeded teams list ──────────────────────────────────────────────
    const seededTeams: TeamSeed[] = allStandings.slice(0, numAdvancing).map((s: any, i: number) => ({
      teamId: s.id || s.teamId,
      teamName: s.teamName,
      seed: i + 1,
      members: teamDataMap[s.id]?.members || [],
    }));

    // ── Delete existing bracket matches ──────────────────────────────────────
    const existingBracket = await tournamentRef.collection("matches").where("isBracket", "==", true).get();
    if (!existingBracket.empty) {
      const batch = adminDb.batch();
      existingBracket.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // ── Parse timing ─────────────────────────────────────────────────────────
    const [startHour, startMin] = (startTime || "18:00").split(":").map(Number);
    const baseDate = startDate || new Date().toISOString().split("T")[0];
    const MATCH_SPACING_MS = 90 * 60 * 1000;

    // Calculate the next matchDay after group stage
    const allMatches = await tournamentRef.collection("matches").get();
    const maxGroupDay = allMatches.docs.reduce((max, d) => {
      const day = d.data().matchDay || 0;
      return d.data().isBracket ? max : Math.max(max, day);
    }, 0);
    let nextDay = maxGroupDay + 1;

    // ── Generate bracket based on team count ─────────────────────────────────
    let bracketMatches: any[] = [];
    let matchNum = 1;
    let bracketSize = 2;

    const makeMatchData = (
      id: string,
      label: string,
      bracketType: string,
      bracketRound: number,
      day: number,
      timeOffset: number,
      t1: TeamSeed,
      t2: TeamSeed,
    ) => {
      const roundDate = new Date(`${baseDate}T${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}:00+05:30`);
      roundDate.setDate(roundDate.getDate() + (day - nextDay));
      const scheduledTime = new Date(roundDate.getTime() + timeOffset * MATCH_SPACING_MS).toISOString();

      return {
        id,
        data: {
          tournamentId,
          matchDay: day,
          matchIndex: matchNum++,
          isBracket: true,
          bracketType,
          bracketRound,
          bracketLabel: label,
          team1Id: t1.teamId,
          team2Id: t2.teamId,
          team1Name: t1.teamName,
          team2Name: t2.teamName,
          team1: t1,
          team2: t2,
          team1Score: 0,
          team2Score: 0,
          status: t1.teamId === "BYE" || t2.teamId === "BYE" ? "bye" : "pending",
          scheduledTime,
          games: {
            game1: { status: "pending", scheduledTime, winner: null, valorantMatchId: null, mapName: null, playerStats: null },
          },
          winnerGoesTo: null,
          loserGoesTo: null,
          createdAt: new Date().toISOString(),
        },
      };
    };

    if (numAdvancing === 2) {
      // ══════════════════════════════════════════════════════════════════════
      // 2 TEAMS: Grand Final only
      // ══════════════════════════════════════════════════════════════════════
      bracketSize = 2;
      bracketMatches.push(makeMatchData(
        "grand-final", "Grand Final", "grand_final", 1, nextDay, 0,
        seededTeams[0], seededTeams[1],
      ));

    } else if (numAdvancing === 3) {
      // ══════════════════════════════════════════════════════════════════════
      // 3 TEAMS: UB Final (#1 vs #2) → LB Final (UB loser vs #3) → GF
      // ══════════════════════════════════════════════════════════════════════
      bracketSize = 4; // use 4 for display purposes

      // Day 1: Upper Bracket Final
      bracketMatches.push(makeMatchData(
        "wb-final", "Upper Bracket Final", "winners", 1, nextDay, 0,
        seededTeams[0], seededTeams[1],
      ));
      bracketMatches[0].data.winnerGoesTo = "grand-final";
      bracketMatches[0].data.loserGoesTo = "lb-final";

      // Day 2: Lower Bracket Final (UB loser vs #3 seed)
      bracketMatches.push(makeMatchData(
        "lb-final", "Lower Bracket Final", "losers", 1, nextDay + 1, 0,
        TBD, seededTeams[2], // TBD = UB loser, #3 gets bye into LB final
      ));
      bracketMatches[1].data.winnerGoesTo = "grand-final";

      // Day 3: Grand Final
      bracketMatches.push(makeMatchData(
        "grand-final", "Grand Final", "grand_final", 1, nextDay + 2, 0,
        TBD, TBD,
      ));

    } else if (numAdvancing === 4) {
      // ══════════════════════════════════════════════════════════════════════
      // 4 TEAMS: Full double elimination
      // Seeding: #1 vs #4, #2 vs #3
      // ══════════════════════════════════════════════════════════════════════
      bracketSize = 4;

      // Day 1: Upper Bracket Semis
      bracketMatches.push(makeMatchData(
        "wb-semi-m1", "UB Semi 1", "winners", 1, nextDay, 0,
        seededTeams[0], seededTeams[3],
      ));
      bracketMatches.push(makeMatchData(
        "wb-semi-m2", "UB Semi 2", "winners", 1, nextDay, 1,
        seededTeams[1], seededTeams[2],
      ));

      // Day 2: Upper Bracket Final + Lower Bracket R1
      bracketMatches.push(makeMatchData(
        "wb-final", "Upper Bracket Final", "winners", 2, nextDay + 1, 0,
        TBD, TBD,
      ));
      bracketMatches.push(makeMatchData(
        "lb-r1-m1", "Lower Bracket R1", "losers", 1, nextDay + 1, 1,
        TBD, TBD,
      ));

      // Day 3: Lower Bracket Final
      bracketMatches.push(makeMatchData(
        "lb-final", "Lower Bracket Final", "losers", 2, nextDay + 2, 0,
        TBD, TBD,
      ));

      // Day 4: Grand Final
      bracketMatches.push(makeMatchData(
        "grand-final", "Grand Final", "grand_final", 1, nextDay + 3, 0,
        TBD, TBD,
      ));

      // Set routing
      bracketMatches[0].data.winnerGoesTo = "wb-final";
      bracketMatches[0].data.loserGoesTo = "lb-r1-m1";
      bracketMatches[1].data.winnerGoesTo = "wb-final";
      bracketMatches[1].data.loserGoesTo = "lb-r1-m1";
      bracketMatches[2].data.winnerGoesTo = "grand-final";
      bracketMatches[2].data.loserGoesTo = "lb-final";
      bracketMatches[3].data.winnerGoesTo = "lb-final";
      bracketMatches[4].data.winnerGoesTo = "grand-final";

    } else {
      // ══════════════════════════════════════════════════════════════════════
      // 5-8 TEAMS: 8-team double elimination with byes
      // Standard seeding: 1v8, 4v5, 2v7, 3v6
      // ══════════════════════════════════════════════════════════════════════
      bracketSize = 8;

      const t = (i: number): TeamSeed => (i < seededTeams.length) ? seededTeams[i] : BYE;

      // Seeded matchups for R1
      const r1Matchups: [number, number][] = [[0, 7], [3, 4], [1, 6], [2, 5]];

      // Day 1: Upper Bracket R1 (4 matches, some may be byes)
      for (let i = 0; i < 4; i++) {
        const [s1, s2] = r1Matchups[i];
        bracketMatches.push(makeMatchData(
          `wb-r1-m${i + 1}`, `UB R1 M${i + 1}`, "winners", 1, nextDay, i,
          t(s1), t(s2),
        ));
      }

      // Day 2: Upper Bracket Semis
      bracketMatches.push(makeMatchData("wb-semi-m1", "UB Semi 1", "winners", 2, nextDay + 1, 0, TBD, TBD));
      bracketMatches.push(makeMatchData("wb-semi-m2", "UB Semi 2", "winners", 2, nextDay + 1, 1, TBD, TBD));

      // Day 2: Lower Bracket R1 (losers from UB R1)
      bracketMatches.push(makeMatchData("lb-r1-m1", "LB R1 M1", "losers", 1, nextDay + 1, 2, TBD, TBD));
      bracketMatches.push(makeMatchData("lb-r1-m2", "LB R1 M2", "losers", 1, nextDay + 1, 3, TBD, TBD));

      // Day 3: Upper Bracket Final + Lower Bracket R2
      bracketMatches.push(makeMatchData("wb-final", "Upper Bracket Final", "winners", 3, nextDay + 2, 0, TBD, TBD));
      bracketMatches.push(makeMatchData("lb-r2-m1", "LB R2 M1", "losers", 2, nextDay + 2, 1, TBD, TBD));
      bracketMatches.push(makeMatchData("lb-r2-m2", "LB R2 M2", "losers", 2, nextDay + 2, 2, TBD, TBD));

      // Day 4: Lower Bracket Semi
      bracketMatches.push(makeMatchData("lb-semi", "Lower Bracket Semi", "losers", 3, nextDay + 3, 0, TBD, TBD));

      // Day 5: Lower Bracket Final
      bracketMatches.push(makeMatchData("lb-final", "Lower Bracket Final", "losers", 4, nextDay + 4, 0, TBD, TBD));

      // Day 6: Grand Final
      bracketMatches.push(makeMatchData("grand-final", "Grand Final", "grand_final", 1, nextDay + 5, 0, TBD, TBD));

      // ── Set routing ────────────────────────────────────────────────────────
      // UB R1 winners → UB Semi
      bracketMatches[0].data.winnerGoesTo = "wb-semi-m1"; // R1M1 winner
      bracketMatches[1].data.winnerGoesTo = "wb-semi-m1"; // R1M2 winner
      bracketMatches[2].data.winnerGoesTo = "wb-semi-m2"; // R1M3 winner
      bracketMatches[3].data.winnerGoesTo = "wb-semi-m2"; // R1M4 winner

      // UB R1 losers → LB R1
      bracketMatches[0].data.loserGoesTo = "lb-r1-m1";
      bracketMatches[1].data.loserGoesTo = "lb-r1-m1";
      bracketMatches[2].data.loserGoesTo = "lb-r1-m2";
      bracketMatches[3].data.loserGoesTo = "lb-r1-m2";

      // UB Semi winners → UB Final
      bracketMatches[4].data.winnerGoesTo = "wb-final";
      bracketMatches[5].data.winnerGoesTo = "wb-final";
      // UB Semi losers → LB R2
      bracketMatches[4].data.loserGoesTo = "lb-r2-m1";
      bracketMatches[5].data.loserGoesTo = "lb-r2-m2";

      // LB R1 winners → LB R2
      bracketMatches[6].data.winnerGoesTo = "lb-r2-m1";
      bracketMatches[7].data.winnerGoesTo = "lb-r2-m2";

      // UB Final
      bracketMatches[8].data.winnerGoesTo = "grand-final";
      bracketMatches[8].data.loserGoesTo = "lb-final";

      // LB R2 winners → LB Semi
      bracketMatches[9].data.winnerGoesTo = "lb-semi";
      bracketMatches[10].data.winnerGoesTo = "lb-semi";

      // LB Semi winner → LB Final
      bracketMatches[11].data.winnerGoesTo = "lb-final";

      // LB Final winner → Grand Final
      bracketMatches[12].data.winnerGoesTo = "grand-final";

      // ── Auto-advance BYE matches ──────────────────────────────────────────
      // If a team has a BYE opponent, auto-complete that match
      for (const bm of bracketMatches) {
        if (bm.data.team1Id === "BYE" && bm.data.team2Id !== "BYE" && bm.data.team2Id !== "TBD") {
          bm.data.status = "completed";
          bm.data.team2Score = 1;
          bm.data.team1Score = 0;
          // The real team advances — routing handled by match-result logic
        } else if (bm.data.team2Id === "BYE" && bm.data.team1Id !== "BYE" && bm.data.team1Id !== "TBD") {
          bm.data.status = "completed";
          bm.data.team1Score = 1;
          bm.data.team2Score = 0;
        }
      }
    }

    // ── Write all bracket matches to Firestore ───────────────────────────────
    const batch = adminDb.batch();
    for (const bm of bracketMatches) {
      const ref = tournamentRef.collection("matches").doc(bm.id);
      batch.set(ref, bm.data);
    }
    await batch.commit();

    // ── Update tournament doc ────────────────────────────────────────────────
    await tournamentRef.update({
      bracketSize,
      bracketGenerated: true,
      bracketTeams: numAdvancing,
    });

    return NextResponse.json({
      success: true,
      bracketSize,
      teamsAdvancing: numAdvancing,
      matchesCreated: bracketMatches.length,
      structure: numAdvancing <= 2
        ? "Grand Final only"
        : numAdvancing === 3
          ? "UB Final → LB Final (with bye) → Grand Final"
          : numAdvancing <= 4
            ? "Full 4-team double elimination"
            : `8-team double elimination (${8 - numAdvancing} byes)`,
      matches: bracketMatches.map(bm => ({
        id: bm.id,
        label: bm.data.bracketLabel,
        teams: `${bm.data.team1Name} vs ${bm.data.team2Name}`,
        status: bm.data.status,
      })),
    });
  } catch (e: any) {
    console.error("Generate brackets error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}