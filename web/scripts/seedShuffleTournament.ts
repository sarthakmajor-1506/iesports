/**
 * Seed a shuffle-format Valorant tournament for Saturday test.
 * Run: npx tsx scripts/seedShuffleTournament.ts
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
  console.log("🎯 Seeding shuffle tournament...\n");

  const id = "valorant-shuffle-test-mar28";

  await db.collection("valorantTournaments").doc(id).set({
    name: "League of Rising Stars — Test Run",
    game: "valorant",
    format: "shuffle",
    status: "upcoming",
    bracketsComputed: false,
    teamsGenerated: false,
    isTestTournament: false,
    registrationDeadline: "2026-03-28T17:00:00+05:30",
    startDate: "2026-03-28T18:00:00+05:30",
    endDate: "2026-03-28T23:00:00+05:30",
    totalSlots: 10,
    slotsBooked: 0,
    entryFee: 0,
    prizePool: "Test Run",
    teamCount: 2,
    swissRounds: 2,
    currentMatchDay: 0,
    schedule: {
      registrationOpens: "2026-03-24T10:00:00+05:30",
      registrationCloses: "2026-03-28T17:00:00+05:30",
      squadCreation: "2026-03-28T17:30:00+05:30",
      groupStageStart: "2026-03-28T18:00:00+05:30",
      groupStageEnd: "2026-03-28T22:00:00+05:30",
    },
    rules: [
      "This is a shuffle-based tournament — no premades, no comfort picks, just raw skill",
      "Players will be fairly shuffled into balanced teams based on rank",
      "LAN event — all players must be present at the venue",
      "Gold to Immortal ranks allowed",
      "Each team plays BO2 series per match day",
      "Scoring: Win 2-0 = 2 points, Draw 1-1 = 1 point each, Loss 0-2 = 0 points",
      "Tiebreaker: Buchholz score (sum of opponents' final points)",
      "All maps included in group stages",
      "Players must accurately report their current rank — misrepresentation leads to disqualification",
      "Admin decisions are final",
    ],
    desc: "A shuffle-based Valorant tournament at Domin8 Esports Cafe. Register solo — teams are auto-generated with balanced skill levels. No premades, no comfort picks, just raw skill. Powered by IEsports x Domin8.",
    createdAt: new Date().toISOString(),
  }, { merge: true });

  console.log(`✅ Seeded: ${id}`);
  console.log(`   📅 Registration: Now until Mar 28, 5 PM`);
  console.log(`   🎯 Format: Shuffle | Slots: 10 | Entry: Free`);
  console.log(`   📍 Venue: Domin8 Esports Cafe`);
  console.log(`\n✅ Done — shuffle tournament seeded into 'valorantTournaments' collection`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed error:", err);
  process.exit(1);
});
