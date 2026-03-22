/**
 * Seed Valorant tournaments into Firestore.
 * Run: npx tsx scripts/seedValorantTournaments.ts
 *
 * Seeds into "valorantTournaments" collection (separate from Dota "tournaments").
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
  console.log("🎯 Seeding Valorant tournaments...\n");

  // ── Tournament 1: Valorant Auction Cup ──────────────────────────────────
  const auctionCupId = "valorant-auction-cup-april-2026";

  await db.collection("valorantTournaments").doc(auctionCupId).set({
    name: "Valorant Auction Cup — April 2026",
    game: "valorant",
    format: "auction",
    status: "upcoming",
    bracketsComputed: false,
    registrationDeadline: "2026-04-18T23:59:00+05:30",
    startDate: "2026-04-20T18:00:00+05:30",
    endDate: "2026-04-20T23:00:00+05:30",
    totalSlots: 50,
    slotsBooked: 0,
    entryFee: 0,
    prizePool: "TBD",
    maxTeams: 8,
    minBidPoints: { S: 150, A: 100, B: 60, C: 30 },
    captainBudgets: { S: 600, A: 750, B: 875, C: 1000 },
    sTierCapPerTeam: 2,
    rules: [
      "All players must have a verified Riot ID before registration closes",
      "Captains create teams and bid for solo players during the live auction",
      "Captain rank determines starting bid budget — higher rank = lower budget",
      "S-tier players are capped at 2 per team",
      "Each team must have 5 starters and 1 assigned substitute",
      "Substitute must be within 1 rank bracket of team average",
      "Admin finalises all teams before tournament begins",
    ],
    desc: "India's first auction-format Valorant tournament. Register as a captain or solo player — captains bid for solo players using rank-weighted budgets.",
    createdAt: new Date().toISOString(),
  }, { merge: true });

  console.log(`✅ Seeded: ${auctionCupId}`);
  console.log(`   📅 Registration deadline: 2026-04-18T23:59:00+05:30`);
  console.log(`   🎯 Format: Auction | Slots: 50 | Entry: Free`);

  // ── Tournament 2: Dev Test — Daily Valorant ─────────────────────────────
  const devTestId = "valorant-dev-test-daily";

  await db.collection("valorantTournaments").doc(devTestId).set({
    name: "Dev Test — Daily Valorant",
    game: "valorant",
    format: "standard",
    status: "active",
    bracketsComputed: false,
    isTestTournament: true,
    isDailyTournament: true,
    registrationDeadline: "2099-12-31T23:59:00+05:30",
    startDate: "2099-12-31T23:59:00+05:30",
    endDate: "2099-12-31T23:59:00+05:30",
    totalSlots: 10,
    slotsBooked: 0,
    entryFee: 0,
    prizePool: "0",
    rules: ["Dev testing only"],
    desc: "Internal test tournament for development purposes.",
    createdAt: new Date().toISOString(),
  }, { merge: true });

  console.log(`✅ Seeded: ${devTestId}`);
  console.log(`   🧪 Test tournament (hidden from non-admin users)`);

  console.log("\n✅ Done — 2 Valorant tournaments seeded into 'valorantTournaments' collection");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed error:", err);
  process.exit(1);
});