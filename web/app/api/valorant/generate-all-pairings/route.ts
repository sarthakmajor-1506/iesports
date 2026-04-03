import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/valorant/generate-all-pairings
 *
 * Creates all swiss rounds at once:
 * - Round 1: Random pairings
 * - Rounds 2+: TBD placeholders (team names = "TBD — Based on Round X standings")
 *
 * Each match gets a scheduled time, 1.5 hours apart within a round.
 * Each match also gets game1 and game2 sub-objects.
 *
 * Body: { tournamentId, adminKey, totalRounds, startTime, startDate }
 */
export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, totalRounds, startTime, startDate } = await req.json();

    if (!tournamentId || !adminKey || !totalRounds) {
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

    // ── Fetch teams ──────────────────────────────────────────────────────────
    const teamsSnap = await tournamentRef.collection("teams").orderBy("teamIndex").get();
    if (teamsSnap.empty) {
      return NextResponse.json({ error: "No teams found. Run shuffle first." }, { status: 400 });
    }

    const teams = teamsSnap.docs.map((d) => ({
      id: d.id,
      teamName: d.data().teamName,
      teamIndex: d.data().teamIndex,
    }));

    // ── Delete all existing matches ──────────────────────────────────────────
    const existingMatches = await tournamentRef.collection("matches").get();
    if (!existingMatches.empty) {
      const deleteBatch = adminDb.batch();
      existingMatches.docs.forEach(doc => deleteBatch.delete(doc.ref));
      await deleteBatch.commit();
    }

    // ── Delete all existing standings ────────────────────────────────────────
    const existingStandings = await tournamentRef.collection("standings").get();
    if (!existingStandings.empty) {
      const deleteBatch = adminDb.batch();
      existingStandings.docs.forEach(doc => deleteBatch.delete(doc.ref));
      await deleteBatch.commit();
    }

    // ── Initialize standings for all teams ───────────────────────────────────
    const standingsBatch = adminDb.batch();
    for (const team of teams) {
      const ref = tournamentRef.collection("standings").doc(team.id);
      standingsBatch.set(ref, {
        teamId: team.id,
        teamName: team.teamName,
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
    await standingsBatch.commit();

    // ── Parse start time ─────────────────────────────────────────────────────
    const [startHour, startMin] = (startTime || "18:00").split(":").map(Number);
    const baseDate = startDate || new Date().toISOString().split("T")[0];

    const tData = tDoc.data()!;
    const gamesPerMatch = tData.matchesPerRound || 2; // BO count from tournament settings
    const GAME_SPACING_MS = 60 * 60 * 1000; // 1 hour between each game
    const MATCH_SPACING_MS = gamesPerMatch * GAME_SPACING_MS; // match spacing = numGames × 1 hour

    const numTeams = teams.length;
    const matchesPerRound = Math.floor(numTeams / 2);

    // ── Generate Round 1: Random pairings ────────────────────────────────────
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    const round1Pairings: { team1: typeof teams[0]; team2: typeof teams[0] }[] = [];
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      round1Pairings.push({ team1: shuffled[i], team2: shuffled[i + 1] });
    }

    // ── Write all rounds ─────────────────────────────────────────────────────
    const allCreated: any[] = [];

    for (let round = 1; round <= totalRounds; round++) {
      const batch = adminDb.batch();
      const matchesRef = tournamentRef.collection("matches");

      // Calculate base time for this round's matches
      // Each round is on consecutive days (or same day if you prefer)
      const roundDate = new Date(`${baseDate}T${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}:00+05:30`);
      roundDate.setDate(roundDate.getDate() + (round - 1)); // each round = next day

      if (round === 1) {
        // ── Round 1: Actual teams ──────────────────────────────────────────
        for (let i = 0; i < round1Pairings.length; i++) {
          const p = round1Pairings[i];
          const matchId = `round${round}-match${i + 1}`;
          const matchRef = matchesRef.doc(matchId);

          const scheduledTime = new Date(roundDate.getTime() + i * MATCH_SPACING_MS).toISOString();

          const matchData = {
            tournamentId,
            matchDay: round,
            matchIndex: i + 1,
            team1Id: p.team1.id,
            team2Id: p.team2.id,
            team1Name: p.team1.teamName,
            team2Name: p.team2.teamName,
            team1Score: 0,
            team2Score: 0,
            status: "pending",
            scheduledTime,
            games: Object.fromEntries(
              Array.from({ length: gamesPerMatch }, (_, g) => [
                `game${g + 1}`,
                { status: "pending", scheduledTime: new Date(new Date(scheduledTime).getTime() + g * GAME_SPACING_MS).toISOString(), winner: null, valorantMatchId: null, mapName: null, playerStats: null },
              ])
            ),
            createdAt: new Date().toISOString(),
          };

          batch.set(matchRef, matchData);
          allCreated.push({ id: matchId, round, ...matchData });
        }
      } else {
        // ── Rounds 2+: TBD placeholders ────────────────────────────────────
        for (let i = 0; i < matchesPerRound; i++) {
          const matchId = `round${round}-match${i + 1}`;
          const matchRef = matchesRef.doc(matchId);

          const scheduledTime = new Date(roundDate.getTime() + i * MATCH_SPACING_MS).toISOString();

          const matchData = {
            tournamentId,
            matchDay: round,
            matchIndex: i + 1,
            team1Id: "TBD",
            team2Id: "TBD",
            team1Name: `TBD (Round ${round} #${2 * i + 1})`,
            team2Name: `TBD (Round ${round} #${2 * i + 2})`,
            team1Score: 0,
            team2Score: 0,
            status: "pending",
            isTBD: true, // flag to know this needs resolving
            scheduledTime,
            games: Object.fromEntries(
              Array.from({ length: gamesPerMatch }, (_, g) => [
                `game${g + 1}`,
                { status: "pending", scheduledTime: new Date(new Date(scheduledTime).getTime() + g * GAME_SPACING_MS).toISOString(), winner: null, valorantMatchId: null, mapName: null, playerStats: null },
              ])
            ),
            createdAt: new Date().toISOString(),
          };

          batch.set(matchRef, matchData);
          allCreated.push({ id: matchId, round, ...matchData });
        }
      }

      await batch.commit();
    }

    // ── Update tournament doc ────────────────────────────────────────────────
    await tournamentRef.update({
      currentMatchDay: 1,
      swissRounds: totalRounds,
      fixturesGenerated: true,
    });

    return NextResponse.json({
      success: true,
      totalRounds,
      matchesPerRound,
      totalMatches: allCreated.length,
      message: `Created ${allCreated.length} matches across ${totalRounds} rounds. Round 1 has real pairings, rounds 2-${totalRounds} have TBD placeholders.`,
    });
  } catch (e: any) {
    console.error("Generate all pairings error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}