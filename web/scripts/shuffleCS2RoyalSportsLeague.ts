/**
 * Shuffle Royal Sports League's solo registrants into 8 balanced teams
 * across 2 groups, and generate the round-robin schedule + play-off
 * placeholders — the same algorithm as POST /api/cs2/shuffle-teams
 * (lib/shuffleCS2Teams.ts), for convenient terminal use.
 *
 * Run after registration closes (31 Jul 11:59 PM IST):
 *   npx tsx scripts/shuffleCS2RoyalSportsLeague.ts                      # dry-run preview
 *   npx tsx scripts/shuffleCS2RoyalSportsLeague.ts --apply              # writes Firestore
 *   npx tsx scripts/shuffleCS2RoyalSportsLeague.ts --apply --reshuffle  # wipes existing
 *                                                                        # teams/matches first
 *
 * Re-running the dry-run gives a different shuffle each time (fresh random
 * seed) until you commit — once applied, re-running without --reshuffle
 * just overwrites the same team docs with a new shuffle, so pass
 * --reshuffle if you're intentionally redoing it after players changed.
 */

import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";
import { shuffleCS2Teams } from "../lib/shuffleCS2Teams";

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
const TID = "cs2-royal-sports-league";
const APPLY = process.argv.includes("--apply");
const RESHUFFLE = process.argv.includes("--reshuffle");

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);
  console.log(`Tournament: ${TID}\n`);

  const result = await shuffleCS2Teams(db, TID, { dryRun: !APPLY, deleteExisting: RESHUFFLE });

  console.log(`${result.totalPlayers} registrants -> ${result.teamCount} teams / ${result.groupCount} groups, seed=${result.seed}`);
  if (result.warning) console.log(`⚠️  ${result.warning}`);
  console.log("");
  for (const t of result.teams) {
    const names = t.members.map(m => m.steamName || m.uid).join(", ");
    console.log(`  Group ${t.groupId} — ${t.teamName} (avg skill ${t.avgSkillLevel}): ${names}`);
  }
  console.log(`\n${result.matchesGenerated} matches generated (group stage + play-off placeholders).`);

  if (!APPLY) {
    console.log("\n🟡 DRY RUN — pass --apply to write Firestore. Add --reshuffle to wipe existing teams/matches first.");
  } else {
    console.log("\n✅ Wrote teams + matches to Firestore.");
  }
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
