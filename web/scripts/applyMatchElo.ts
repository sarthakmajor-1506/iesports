/**
 * Apply ELO rating changes from completed tournament matches.
 *
 * Processes all completed matches in chronological order and adjusts
 * each player's iesportsRating based on match results.
 *
 * Run: npx tsx scripts/applyMatchElo.ts <tournamentId>
 * Example: npx tsx scripts/applyMatchElo.ts league-of-rising-stars-prelims
 */

import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";
import { calculateElo, ratingToRank, ratingToTier, seedRating } from "../lib/elo";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore(getApp());

// ── Types ───────────────────────────────────────────────────────────────────

type TeamMember = {
  uid: string;
  riotGameName: string;
  riotTagLine: string;
  riotTier: number;
};

type GameData = {
  winner?: "team1" | "team2";
  team1RoundsWon?: number;
  team2RoundsWon?: number;
};

type MatchDoc = {
  id: string;
  matchDay: number;
  matchIndex: number;
  team1Id: string;
  team2Id: string;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  isBracket?: boolean;
  status: string;
  [key: string]: any; // for game1, game2, games.game1, etc.
};

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const tournamentId = process.argv[2];
  if (!tournamentId) {
    console.error("Usage: npx tsx scripts/applyMatchElo.ts <tournamentId>");
    process.exit(1);
  }

  const tournamentRef = db.collection("valorantTournaments").doc(tournamentId);
  const tournamentDoc = await tournamentRef.get();
  if (!tournamentDoc.exists) {
    console.error(`Tournament "${tournamentId}" not found`);
    process.exit(1);
  }
  const tournamentName = tournamentDoc.data()!.name || tournamentId;

  console.log(`\n═══ Applying ELO for: ${tournamentName} ═══\n`);

  // ── 1. Fetch all teams → build teamId → members map ────────────────────
  const teamsSnap = await tournamentRef.collection("teams").get();
  const teamMembers: Record<string, TeamMember[]> = {};
  const teamNames: Record<string, string> = {};

  for (const doc of teamsSnap.docs) {
    const data = doc.data();
    teamNames[doc.id] = data.teamName || doc.id;
    teamMembers[doc.id] = (data.members || []).map((m: any) => ({
      uid: m.uid,
      riotGameName: m.riotGameName || "",
      riotTagLine: m.riotTagLine || "",
      riotTier: m.riotTier || 0,
    }));
  }

  console.log(`Teams loaded: ${Object.keys(teamMembers).length}`);

  // ── 2. Fetch all completed matches, sorted chronologically ─────────────
  const matchesSnap = await tournamentRef.collection("matches")
    .where("status", "==", "completed")
    .get();

  const matches: MatchDoc[] = matchesSnap.docs
    .map(d => ({ id: d.id, ...d.data() } as MatchDoc))
    .sort((a, b) => {
      if (a.matchDay !== b.matchDay) return a.matchDay - b.matchDay;
      return a.matchIndex - b.matchIndex;
    });

  console.log(`Completed matches: ${matches.length}\n`);

  if (matches.length === 0) {
    console.log("No completed matches to process.");
    process.exit(0);
  }

  // ── 3. Cache of current ratings (avoid re-reading after each update) ───
  // Pre-load all player ratings
  const ratingCache: Record<string, number> = {};
  const matchesPlayedCache: Record<string, number> = {};
  const allUids = new Set<string>();

  for (const members of Object.values(teamMembers)) {
    for (const m of members) allUids.add(m.uid);
  }

  for (const uid of allUids) {
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.exists) {
      const data = userDoc.data()!;
      ratingCache[uid] = data.iesportsRating || seedRating(data.riotTier || 0, data.riotPeakTier || data.riotTier || 0);
      matchesPlayedCache[uid] = data.iesportsMatchesPlayed || 0;
    }
  }

  console.log(`Players loaded: ${allUids.size}\n`);
  console.log("─".repeat(90));

  // ── 4. Process each match sequentially ─────────────────────────────────
  let totalChanges = 0;

  for (const match of matches) {
    const t1Members = teamMembers[match.team1Id] || [];
    const t2Members = teamMembers[match.team2Id] || [];

    if (t1Members.length === 0 || t2Members.length === 0) {
      console.log(`⚠ Skipping ${match.id}: missing team data for ${match.team1Id} or ${match.team2Id}`);
      continue;
    }

    const mapScore = `${match.team1Score}-${match.team2Score}`;
    const label = match.isBracket ? `[Bracket]` : `[Day ${match.matchDay}]`;

    // Extract per-game round data (dual storage path: flat or nested)
    const games: { winner: "team1" | "team2"; t1Rounds: number; t2Rounds: number; gameNum: number }[] = [];
    for (let g = 1; g <= 5; g++) {
      const game: GameData | undefined = match[`game${g}`] ?? match.games?.[`game${g}`];
      if (!game || !game.winner) continue;
      games.push({
        winner: game.winner,
        t1Rounds: game.team1RoundsWon || 0,
        t2Rounds: game.team2RoundsWon || 0,
        gameNum: g,
      });
    }

    // Fallback: if no per-game data, synthesize from match scores
    if (games.length === 0) {
      for (let i = 0; i < match.team1Score; i++) games.push({ winner: "team1", t1Rounds: 13, t2Rounds: 0, gameNum: i + 1 });
      for (let i = 0; i < match.team2Score; i++) games.push({ winner: "team2", t1Rounds: 0, t2Rounds: 13, gameNum: match.team1Score + i + 1 });
    }

    console.log(`\n${label} ${match.team1Name} ${mapScore} ${match.team2Name} (${games.length} games)`);

    for (let g = 0; g < games.length; g++) {
      const game = games[g];
      const t1Result: "win" | "loss" = game.winner === "team1" ? "win" : "loss";
      const t2Result: "win" | "loss" = game.winner === "team2" ? "win" : "loss";
      const roundDiff = Math.abs(game.t1Rounds - game.t2Rounds);
      const roundScore = `${game.t1Rounds}-${game.t2Rounds}`;

      // Recalculate team averages each game (ratings shift between games)
      const t1AvgRating = t1Members.reduce((sum, m) => sum + (ratingCache[m.uid] || 0), 0) / t1Members.length;
      const t2AvgRating = t2Members.reduce((sum, m) => sum + (ratingCache[m.uid] || 0), 0) / t2Members.length;

      // Compute delta ONCE using team avg vs team avg (same delta for everyone on the team)
      const { delta: t1Delta } = calculateElo(t1AvgRating, t2AvgRating, t1Result, roundDiff);
      const { delta: t2Delta } = calculateElo(t2AvgRating, t1AvgRating, t2Result, roundDiff);

      console.log(`  Game ${game.gameNum} (${roundScore}): Team1 ${t1Result} | avg ${Math.round(t1AvgRating)} vs ${Math.round(t2AvgRating)} | rdiff=${roundDiff} | t1Δ=${t1Delta} t2Δ=${t2Delta}`);

      // Apply the team-level delta to each player
      const applyToTeam = async (
        members: TeamMember[],
        result: "win" | "loss",
        teamDelta: number,
        teamName: string,
        oppTeamName: string,
        oppAvgRating: number,
      ) => {
        for (const m of members) {
          const before = ratingCache[m.uid] || 0;
          const newRating = Math.max(0, before + teamDelta);
          const delta = teamDelta;

          // Update cache
          ratingCache[m.uid] = newRating;
          matchesPlayedCache[m.uid] = (matchesPlayedCache[m.uid] || 0) + 1;

          // Update Firestore
          await db.collection("users").doc(m.uid).update({
            iesportsRating: newRating,
            iesportsRank: ratingToRank(newRating),
            iesportsTier: ratingToTier(newRating),
            iesportsMatchesPlayed: matchesPlayedCache[m.uid],
          });

          // Create rank history entry with round-level detail
          await db.collection("users").doc(m.uid).collection("rankHistory").add({
            timestamp: new Date().toISOString(),
            type: "match",
            ratingBefore: before,
            ratingAfter: newRating,
            delta,
            matchId: match.id,
            tournamentId,
            tournamentName,
            teamName,
            opponentTeamName: oppTeamName,
            result,
            mapScore,
            roundScore,
            gameNum: game.gameNum,
            opponentAvgRating: Math.round(oppAvgRating),
          });

          const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
          const sign = delta > 0 ? "+" : "";
          console.log(`      ${m.riotGameName.padEnd(20)} ${before} ${arrow} ${newRating} (${sign}${delta})`);
          totalChanges++;
        }
      };

      await applyToTeam(t1Members, t1Result, t1Delta, match.team1Name, match.team2Name, t2AvgRating);
      await applyToTeam(t2Members, t2Result, t2Delta, match.team2Name, match.team1Name, t1AvgRating);
    }
  }

  // ── 5. Summary ─────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(60)}`);
  console.log(`SUMMARY`);
  console.log(`${"═".repeat(60)}`);
  console.log(`Matches processed: ${matches.length}`);
  console.log(`Rating changes:    ${totalChanges}`);
  console.log(`${"═".repeat(60)}`);

  // Print final ratings
  console.log(`\nFinal IEsports Ratings:`);
  console.log(`${"Player".padEnd(25)} ${"Rating".padEnd(8)} ${"Rank".padEnd(14)} Matches`);
  console.log("-".repeat(55));

  const sortedPlayers = [...allUids]
    .map(uid => {
      const members = Object.values(teamMembers).flat();
      const m = members.find(m => m.uid === uid);
      return {
        name: m ? `${m.riotGameName}#${m.riotTagLine}` : uid,
        rating: ratingCache[uid] || 0,
        matches: matchesPlayedCache[uid] || 0,
      };
    })
    .sort((a, b) => b.rating - a.rating);

  for (const p of sortedPlayers) {
    console.log(
      `${p.name.padEnd(25)} ${String(p.rating).padEnd(8)} ${ratingToRank(p.rating).padEnd(14)} ${p.matches}`
    );
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
