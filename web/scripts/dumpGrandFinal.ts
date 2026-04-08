/**
 * Dump grand final match data from Firestore
 * Run: npx tsx scripts/dumpGrandFinal.ts
 */
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

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

async function main() {
  const tournamentId = "league-of-rising-stars-prelims";
  const matchId = "grand-final";

  const matchDoc = await db.collection("valorantTournaments").doc(tournamentId).collection("matches").doc(matchId).get();
  if (!matchDoc.exists) {
    console.error("Grand final match not found");
    process.exit(1);
  }

  const match = matchDoc.data()!;
  console.log(`\n=== GRAND FINAL: ${match.team1Name} vs ${match.team2Name} ===`);
  console.log(`Score: ${match.team1Score} - ${match.team2Score}`);
  console.log(`Status: ${match.status}\n`);

  // Dump all games
  for (let g = 1; g <= 5; g++) {
    const game = match[`game${g}`] ?? match.games?.[`game${g}`];
    if (!game) continue;

    console.log(`--- Game ${g}: ${game.map || 'unknown map'} ---`);
    console.log(`Rounds: ${game.team1RoundsWon || '?'} - ${game.team2RoundsWon || '?'}`);

    if (game.playerStats) {
      console.log(`\n  ${'Player'.padEnd(25)} ${'Team'.padEnd(8)} ${'Agent'.padEnd(12)} ${'K'.padStart(3)} ${'D'.padStart(3)} ${'A'.padStart(3)} ${'ACS'.padStart(5)} ${'KD'.padStart(5)}`);
      console.log(`  ${'-'.repeat(70)}`);

      for (const p of game.playerStats) {
        const kd = (p.kills / Math.max(1, p.deaths)).toFixed(2);
        const acs = p.score && game.team1RoundsWon !== undefined
          ? Math.round(p.score / Math.max(1, (game.team1RoundsWon + game.team2RoundsWon)))
          : '?';
        console.log(`  ${(p.name || p.riotId || 'unknown').padEnd(25)} ${(p.teamSide || '?').padEnd(8)} ${(p.character || '?').padEnd(12)} ${String(p.kills || 0).padStart(3)} ${String(p.deaths || 0).padStart(3)} ${String(p.assists || 0).padStart(3)} ${String(acs).padStart(5)} ${kd.padStart(5)}`);
      }
    }
    console.log('');
  }

  // Save raw data for the media pipeline
  const outputPath = path.resolve(__dirname, "../../media/data/match-data.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(match, null, 2));
  console.log(`\nRaw data saved to: ${outputPath}`);
}

main().catch(console.error);
