import { isNotAdmin } from "@/lib/checkAdmin";
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
 *   4 teams → 50/50 split double elim (4 matches)
 *   5-8 teams → 8-team double elim with 50/50 split (up to 10 matches)
 *
 * Seeding (50/50 SPLIT):
 *   - Top 50% of standings → Upper Bracket R1
 *   - Bottom 50% of standings → Lower Bracket R1
 *   - UB losers drop into LB R2 (they face LB R1 winners)
 *   - This rewards group stage performance: top teams get the double-elim
 *     advantage from the start.
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
    const { tournamentId, adminKey, topTeams, startTime, startDate, standingsNotComplete } = await req.json();

    if (!tournamentId || !adminKey) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (await isNotAdmin(adminKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const tDoc = await tournamentRef.get();
    if (!tDoc.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // ── Determine advancing teams ──────────────────────────────────────────────
    const numAdvancing = topTeams || 4;
    if (numAdvancing < 2) {
      return NextResponse.json({ error: "Need at least 2 teams for brackets." }, { status: 400 });
    }

    let seededTeams: TeamSeed[];

    if (standingsNotComplete) {
      // All slots filled with TBD — bracket structure only, no real teams
      seededTeams = Array.from({ length: numAdvancing }, (_, i) => ({
        teamId: "TBD",
        teamName: "TBD",
        seed: i + 1,
        members: [],
      }));
    } else {
      // ── Fetch standings (sorted by points, buchholz, map diff) ─────────────
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

      const actualAdvancing = Math.min(numAdvancing, allStandings.length);
      if (actualAdvancing < 2) {
        return NextResponse.json({ error: "Need at least 2 teams for brackets." }, { status: 400 });
      }

      // ── Fetch team data for member info ────────────────────────────────────
      const teamsSnap = await tournamentRef.collection("teams").get();
      const teamDataMap: Record<string, any> = {};
      teamsSnap.docs.forEach(d => { teamDataMap[d.id] = d.data(); });

      seededTeams = allStandings.slice(0, actualAdvancing).map((s: any, i: number) => ({
        teamId: s.id || s.teamId,
        teamName: s.teamName,
        seed: i + 1,
        members: teamDataMap[s.id]?.members || [],
      }));
    }

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
    const tData = tDoc.data()!;
    const bracketBO = tData.bracketBestOf || 2;
    const lbFinalBO = tData.lbFinalBestOf || bracketBO;
    const grandFinalBO = tData.grandFinalBestOf || 3;
    const GAME_SPACING_MS = 60 * 60 * 1000; // 1 hour between each game
    const MATCH_SPACING_MS = bracketBO * GAME_SPACING_MS; // match spacing = BO × 1 hour

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
    let ubCount = 0; // # of teams that start in the upper bracket (rest start in LB)

    const makeMatchData = (
      id: string,
      label: string,
      bracketType: string,
      bracketRound: number,
      day: number,
      timeOffset: number,
      t1: TeamSeed,
      t2: TeamSeed,
      numGames: number = bracketBO,
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
          games: Object.fromEntries(
            Array.from({ length: numGames }, (_, g) => [
              `game${g + 1}`,
              { status: "pending", scheduledTime: new Date(new Date(scheduledTime).getTime() + g * GAME_SPACING_MS).toISOString(), winner: null, valorantMatchId: null, mapName: null, playerStats: null },
            ])
          ),
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
      ubCount = 2;
      bracketMatches.push(makeMatchData(
        "grand-final", "Grand Final", "grand_final", 1, nextDay, 0,
        seededTeams[0], seededTeams[1], grandFinalBO,
      ));

    } else if (numAdvancing === 3) {
      // ══════════════════════════════════════════════════════════════════════
      // 3 TEAMS: UB Final (#1 vs #2) → LB Final (UB loser vs #3) → GF
      // #1 and #2 in Upper Bracket, #3 starts in Lower Bracket with bye
      // ══════════════════════════════════════════════════════════════════════
      bracketSize = 4;
      ubCount = 2;

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
        TBD, seededTeams[2], lbFinalBO, // TBD = UB loser, #3 starts here
      ));
      bracketMatches[1].data.winnerGoesTo = "grand-final";

      // Day 3: Grand Final
      bracketMatches.push(makeMatchData(
        "grand-final", "Grand Final", "grand_final", 1, nextDay + 2, 0,
        TBD, TBD, grandFinalBO,
      ));

    } else if (numAdvancing === 4) {
      // ══════════════════════════════════════════════════════════════════════
      // 4 TEAMS: 50/50 Split Double Elimination
      //
      // Upper Bracket: #1 vs #2 (top 50%)
      // Lower Bracket R1: #3 vs #4 (bottom 50%)
      //
      // Flow:
      //   UB winner → Grand Final (upper slot)
      //   UB loser  → LB Final (faces LB R1 winner)
      //   LB R1 winner → LB Final
      //   LB Final winner → Grand Final (lower slot)
      // ══════════════════════════════════════════════════════════════════════
      bracketSize = 4;
      ubCount = 2;

      // Day 1: UB Semi (#1 vs #2) + LB R1 (#3 vs #4)
      bracketMatches.push(makeMatchData(
        "wb-semi-m1", "Upper Bracket", "winners", 1, nextDay, 0,
        seededTeams[0], seededTeams[1],  // #1 vs #2
      ));
      bracketMatches.push(makeMatchData(
        "lb-r1-m1", "Lower Bracket R1", "losers", 1, nextDay, 1,
        seededTeams[2], seededTeams[3],  // #3 vs #4
      ));

      // Day 2: LB Final (UB loser vs LB R1 winner)
      bracketMatches.push(makeMatchData(
        "lb-final", "Lower Bracket Final", "losers", 2, nextDay + 1, 0,
        TBD, TBD, lbFinalBO,
      ));

      // Day 3: Grand Final (UB winner vs LB Final winner)
      bracketMatches.push(makeMatchData(
        "grand-final", "Grand Final", "grand_final", 1, nextDay + 2, 0,
        TBD, TBD, grandFinalBO,
      ));

      // Set routing
      bracketMatches[0].data.winnerGoesTo = "grand-final";   // UB winner → GF
      bracketMatches[0].data.loserGoesTo = "lb-final";        // UB loser → LB Final
      bracketMatches[1].data.winnerGoesTo = "lb-final";       // LB R1 winner → LB Final
      bracketMatches[2].data.winnerGoesTo = "grand-final";    // LB Final winner → GF

    } else if (numAdvancing >= 9) {
      // ══════════════════════════════════════════════════════════════════════
      // 9-10 TEAMS: 6 UB / 4 LB Double Elimination (clamped to 10 teams)
      //
      // Upper Bracket (top 6, with #1 / #2 byes through to UB Semis):
      //   UB R1: #3 vs #6, #4 vs #5  → winners → UB Semis, losers drop to LB R2
      //   UB Semis: #1 vs winner(UB R1 M2), #2 vs winner(UB R1 M1)
      //               → winners → UB Final, losers drop to LB R3
      //   UB Final → winner to GF, loser to LB Final
      //
      // Lower Bracket (bottom 4 + drops from UB):
      //   LB R1: #7 vs #10, #8 vs #9
      //   LB R2: LB R1 winners crossed with UB R1 losers
      //          (M1-winner vs M2-loser, M2-winner vs M1-loser)
      //   LB R3: LB R2 winners crossed with UB Semi losers
      //   LB Semi: 2 LB R3 winners → 1 winner → LB Final
      //   LB Final: LB Semi winner vs UB Final loser → GF
      //
      // Grand Final: UB Final winner vs LB Final winner
      //
      // 14 matches total. If only 9 teams advance, #10 is BYE (LB R1 M2
      // becomes #8 vs BYE → #8 walks; the rest of the bracket is unchanged).
      // ══════════════════════════════════════════════════════════════════════
      bracketSize = 10;
      ubCount = 6;

      const ubTeam = (i: number): TeamSeed => (i < Math.min(6, seededTeams.length)) ? seededTeams[i] : BYE;
      const lbTeam = (i: number): TeamSeed => {
        const idx = 6 + i;
        return (idx < seededTeams.length) ? seededTeams[idx] : BYE;
      };

      // Day 1: UB R1 (#3v#6, #4v#5) + LB R1 (#7v#10, #8v#9) — 4 matches simultaneously
      bracketMatches.push(makeMatchData("wb-r1-m1", "UB R1 M1", "winners", 1, nextDay, 0, ubTeam(2), ubTeam(5))); // [0] #3 vs #6
      bracketMatches.push(makeMatchData("wb-r1-m2", "UB R1 M2", "winners", 1, nextDay, 1, ubTeam(3), ubTeam(4))); // [1] #4 vs #5
      bracketMatches.push(makeMatchData("lb-r1-m1", "LB R1 M1", "losers",  1, nextDay, 2, lbTeam(0), lbTeam(3))); // [2] #7 vs #10
      bracketMatches.push(makeMatchData("lb-r1-m2", "LB R1 M2", "losers",  1, nextDay, 3, lbTeam(1), lbTeam(2))); // [3] #8 vs #9

      // Day 2: UB Semis (#1 vs UB R1 M2 winner, #2 vs UB R1 M1 winner) + LB R2 (crossed)
      bracketMatches.push(makeMatchData("wb-semi-m1", "UB Semi M1", "winners", 2, nextDay + 1, 0, ubTeam(0), TBD)); // [4] #1 vs winner(UB R1 M2)
      bracketMatches.push(makeMatchData("wb-semi-m2", "UB Semi M2", "winners", 2, nextDay + 1, 1, ubTeam(1), TBD)); // [5] #2 vs winner(UB R1 M1)
      bracketMatches.push(makeMatchData("lb-r2-m1",   "LB R2 M1",   "losers",  2, nextDay + 1, 2, TBD, TBD));         // [6]
      bracketMatches.push(makeMatchData("lb-r2-m2",   "LB R2 M2",   "losers",  2, nextDay + 1, 3, TBD, TBD));         // [7]

      // Day 3: UB Final + LB R3 (crossed)
      bracketMatches.push(makeMatchData("wb-final", "Upper Bracket Final", "winners", 3, nextDay + 2, 0, TBD, TBD));    // [8]
      bracketMatches.push(makeMatchData("lb-r3-m1", "LB R3 M1",            "losers",  3, nextDay + 2, 1, TBD, TBD));    // [9]
      bracketMatches.push(makeMatchData("lb-r3-m2", "LB R3 M2",            "losers",  3, nextDay + 2, 2, TBD, TBD));    // [10]

      // Day 4: LB Semi
      bracketMatches.push(makeMatchData("lb-semi", "Lower Bracket Semi", "losers", 4, nextDay + 3, 0, TBD, TBD));       // [11]

      // Day 5: LB Final
      bracketMatches.push(makeMatchData("lb-final", "Lower Bracket Final", "losers", 5, nextDay + 4, 0, TBD, TBD, lbFinalBO)); // [12]

      // Day 6: Grand Final
      bracketMatches.push(makeMatchData("grand-final", "Grand Final", "grand_final", 1, nextDay + 5, 0, TBD, TBD, grandFinalBO)); // [13]

      // ── Routing ─────────────────────────────────────────────────────────
      // UB R1 winners → UB Semis (paired opposite — M1 winner vs #2, M2 winner vs #1)
      bracketMatches[0].data.winnerGoesTo = "wb-semi-m2";  // UB R1 M1 winner → UB Semi M2 (faces #2)
      bracketMatches[1].data.winnerGoesTo = "wb-semi-m1";  // UB R1 M2 winner → UB Semi M1 (faces #1)
      // UB R1 losers → LB R2 (crossed with LB R1 winners)
      bracketMatches[0].data.loserGoesTo  = "lb-r2-m2";    // UB R1 M1 loser → LB R2 M2
      bracketMatches[1].data.loserGoesTo  = "lb-r2-m1";    // UB R1 M2 loser → LB R2 M1

      // LB R1 winners → LB R2
      bracketMatches[2].data.winnerGoesTo = "lb-r2-m1";    // LB R1 M1 winner
      bracketMatches[3].data.winnerGoesTo = "lb-r2-m2";    // LB R1 M2 winner

      // UB Semis → UB Final / LB R3 (crossed)
      bracketMatches[4].data.winnerGoesTo = "wb-final";    // UB Semi M1 winner
      bracketMatches[5].data.winnerGoesTo = "wb-final";    // UB Semi M2 winner
      bracketMatches[4].data.loserGoesTo  = "lb-r3-m2";    // UB Semi M1 loser → LB R3 M2 (crossed)
      bracketMatches[5].data.loserGoesTo  = "lb-r3-m1";    // UB Semi M2 loser → LB R3 M1

      // LB R2 winners → LB R3
      bracketMatches[6].data.winnerGoesTo = "lb-r3-m1";    // LB R2 M1 winner
      bracketMatches[7].data.winnerGoesTo = "lb-r3-m2";    // LB R2 M2 winner

      // UB Final → GF / LB Final
      bracketMatches[8].data.winnerGoesTo = "grand-final"; // UB Final winner
      bracketMatches[8].data.loserGoesTo  = "lb-final";    // UB Final loser

      // LB R3 winners → LB Semi
      bracketMatches[9].data.winnerGoesTo  = "lb-semi";    // LB R3 M1 winner
      bracketMatches[10].data.winnerGoesTo = "lb-semi";    // LB R3 M2 winner

      // LB Semi winner → LB Final
      bracketMatches[11].data.winnerGoesTo = "lb-final";

      // LB Final winner → GF
      bracketMatches[12].data.winnerGoesTo = "grand-final";

      // ── Auto-advance BYE matches ──────────────────────────────────────────
      for (const bm of bracketMatches) {
        if (bm.data.team1Id === "BYE" && bm.data.team2Id !== "BYE" && bm.data.team2Id !== "TBD") {
          bm.data.status = "completed";
          bm.data.team2Score = 1;
          bm.data.team1Score = 0;
        } else if (bm.data.team2Id === "BYE" && bm.data.team1Id !== "BYE" && bm.data.team1Id !== "TBD") {
          bm.data.status = "completed";
          bm.data.team1Score = 1;
          bm.data.team2Score = 0;
        }
      }

    } else {
      // ══════════════════════════════════════════════════════════════════════
      // 5-8 TEAMS: 50/50 Split Double Elimination
      //
      // Upper Bracket (top 4): #1 vs #4, #2 vs #3
      // Lower Bracket R1 (bottom 4): #5 vs #8, #6 vs #7
      //
      // Flow:
      //   UB R1 winners → UB Final
      //   UB R1 losers  → LB R2 (face LB R1 winners)
      //   LB R1 winners → LB R2
      //   LB R2 winners → LB Semi
      //   LB Semi winner → LB Final (faces UB Final loser)
      //   UB Final winner → Grand Final (upper slot)
      //   LB Final winner → Grand Final (lower slot)
      // ══════════════════════════════════════════════════════════════════════
      bracketSize = 8;
      ubCount = 4;

      const ubTeam = (i: number): TeamSeed => (i < Math.min(4, seededTeams.length)) ? seededTeams[i] : BYE;
      const lbTeam = (i: number): TeamSeed => {
        const idx = 4 + i;
        return (idx < seededTeams.length) ? seededTeams[idx] : BYE;
      };

      // Day 1: UB R1 (top 4) + LB R1 (bottom 4) — play simultaneously
      // UB R1: #1 vs #4, #2 vs #3
      bracketMatches.push(makeMatchData("wb-r1-m1", "UB R1 M1", "winners", 1, nextDay, 0, ubTeam(0), ubTeam(3))); // [0] #1 vs #4
      bracketMatches.push(makeMatchData("wb-r1-m2", "UB R1 M2", "winners", 1, nextDay, 1, ubTeam(1), ubTeam(2))); // [1] #2 vs #3

      // LB R1: #5 vs #8, #6 vs #7 (these teams START in lower bracket)
      bracketMatches.push(makeMatchData("lb-r1-m1", "LB R1 M1", "losers", 1, nextDay, 2, lbTeam(0), lbTeam(3))); // [2] #5 vs #8
      bracketMatches.push(makeMatchData("lb-r1-m2", "LB R1 M2", "losers", 1, nextDay, 3, lbTeam(1), lbTeam(2))); // [3] #6 vs #7

      // Day 2: UB Final + LB R2
      bracketMatches.push(makeMatchData("wb-final", "Upper Bracket Final", "winners", 2, nextDay + 1, 0, TBD, TBD)); // [4]

      // LB R2: LB R1 winners vs UB R1 losers (dropping down)
      bracketMatches.push(makeMatchData("lb-r2-m1", "LB R2 M1", "losers", 2, nextDay + 1, 1, TBD, TBD)); // [5]
      bracketMatches.push(makeMatchData("lb-r2-m2", "LB R2 M2", "losers", 2, nextDay + 1, 2, TBD, TBD)); // [6]

      // Day 3: LB Semi
      bracketMatches.push(makeMatchData("lb-semi", "Lower Bracket Semi", "losers", 3, nextDay + 2, 0, TBD, TBD)); // [7]

      // Day 4: LB Final (LB Semi winner vs UB Final loser)
      bracketMatches.push(makeMatchData("lb-final", "Lower Bracket Final", "losers", 4, nextDay + 3, 0, TBD, TBD, lbFinalBO)); // [8]

      // Day 5: Grand Final
      bracketMatches.push(makeMatchData("grand-final", "Grand Final", "grand_final", 1, nextDay + 4, 0, TBD, TBD, grandFinalBO)); // [9]

      // ── Set routing ────────────────────────────────────────────────────────
      // UB R1 winners → UB Final
      bracketMatches[0].data.winnerGoesTo = "wb-final";   // UB R1 M1 winner
      bracketMatches[1].data.winnerGoesTo = "wb-final";   // UB R1 M2 winner

      // UB R1 losers → LB R2 (drop down to face LB R1 winners)
      bracketMatches[0].data.loserGoesTo = "lb-r2-m1";    // UB R1 M1 loser
      bracketMatches[1].data.loserGoesTo = "lb-r2-m2";    // UB R1 M2 loser

      // LB R1 winners → LB R2
      bracketMatches[2].data.winnerGoesTo = "lb-r2-m1";   // LB R1 M1 winner
      bracketMatches[3].data.winnerGoesTo = "lb-r2-m2";   // LB R1 M2 winner

      // UB Final
      bracketMatches[4].data.winnerGoesTo = "grand-final"; // UB Final winner → GF
      bracketMatches[4].data.loserGoesTo = "lb-final";     // UB Final loser → LB Final

      // LB R2 winners → LB Semi
      bracketMatches[5].data.winnerGoesTo = "lb-semi";
      bracketMatches[6].data.winnerGoesTo = "lb-semi";

      // LB Semi winner → LB Final
      bracketMatches[7].data.winnerGoesTo = "lb-final";

      // LB Final winner → Grand Final
      bracketMatches[8].data.winnerGoesTo = "grand-final";

      // ── Auto-advance BYE matches ──────────────────────────────────────────
      for (const bm of bracketMatches) {
        if (bm.data.team1Id === "BYE" && bm.data.team2Id !== "BYE" && bm.data.team2Id !== "TBD") {
          bm.data.status = "completed";
          bm.data.team2Score = 1;
          bm.data.team1Score = 0;
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
      bracketTeamCount: numAdvancing,
      ubTeamCount: ubCount,
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
            ? "4-team double elim (50/50 split: #1v#2 UB, #3v#4 LB)"
            : numAdvancing >= 9
              ? `10-team double elim (6 UB / 4 LB${numAdvancing < 10 ? `, ${10 - numAdvancing} byes` : ""})`
              : `8-team double elim (50/50 split: top 4 UB, bottom ${numAdvancing - 4} LB${numAdvancing < 8 ? `, ${8 - numAdvancing} byes` : ""})`,
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