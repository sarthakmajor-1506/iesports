/**
 * Seed a Dota 2 shuffle tournament into Firestore.
 * Run: npx tsx scripts/seedDota2Tournament.ts
 *
 * Seeds into "tournaments" collection (Dota 2).
 */

import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

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

async function seed() {
  console.log("🎮 Seeding Dota 2 tournament...\n");

  const tournamentId = "dota2-dominate-utp-april-2026";

  await db.collection("tournaments").doc(tournamentId).set({
    name: "Dominate Ultimate Tilt Proof Tournament",
    game: "dota2",
    format: "shuffle",
    status: "upcoming",
    bracketsComputed: false,
    registrationDeadline: "2026-04-18T23:59:00+05:30",
    startDate: "2026-04-20T18:00:00+05:30",
    endDate: "2026-04-20T23:00:00+05:30",
    totalSlots: 20,
    slotsBooked: 0,
    entryFee: 0,
    prizePool: "₹5,000",
    totalTeams: 4,
    playersPerTeam: 5,
    groupStageRounds: 3,
    matchesPerRound: 2,
    bracketFormat: "double_elimination",
    bracketBestOf: 2,
    grandFinalBestOf: 3,
    bracketTeamCount: 4,
    rules: [
      "All players must have a verified Steam account with public Dota 2 match data",
      "Solo registration only — teams are formed via balanced snake-draft shuffle",
      "Players are sorted by MMR bracket and distributed evenly across teams",
      "Group stage: Swiss format, 3 rounds of BO2",
      "Top 4 teams advance to double-elimination play-offs",
      "Play-off matches are BO2, Grand Final is BO3",
      "All matches are played on official Dota 2 servers (SEA/India)",
      "Prizes paid via UPI within 24 hours of tournament completion",
    ],
    desc: "Dota 2 shuffle tournament — register solo, get drafted into balanced teams, and compete for ₹5,000. Free entry, rank-verified brackets, instant UPI payouts.",
    schedule: {
      registrationOpens: "2026-04-10T00:00:00+05:30",
      registrationCloses: "2026-04-18T23:59:00+05:30",
      squadCreation: "2026-04-19T12:00:00+05:30",
      groupStageStart: "2026-04-20T18:00:00+05:30",
      tourneyStageStart: "2026-04-20T21:00:00+05:30",
    },
    createdAt: new Date().toISOString(),
  }, { merge: true });

  console.log(`✅ Seeded: ${tournamentId}`);
  console.log(`   📅 Registration deadline: 2026-04-18T23:59:00+05:30`);
  console.log(`   🎯 Format: Shuffle | Slots: 20 | Prize: ₹5,000`);

  console.log("\n✅ Done — Dota 2 tournament seeded into 'tournaments' collection");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed error:", err);
  process.exit(1);
});
