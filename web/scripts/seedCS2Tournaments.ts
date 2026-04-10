/**
 * Seed CS2 tournaments into Firestore.
 * Run: npx tsx scripts/seedCS2Tournaments.ts
 *
 * Seeds into "cs2Tournaments" collection.
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
  console.log("🎯 Seeding CS2 tournaments...\n");

  const prelimsId = "cs2-prelims-april-2026";

  await db.collection("cs2Tournaments").doc(prelimsId).set({
    name: "CS2 Prelims",
    game: "cs2",
    format: "shuffle",
    status: "upcoming",
    bracketsComputed: false,
    registrationDeadline: "2026-04-17T23:59:00+05:30",
    startDate: "2026-04-18T18:00:00+05:30",
    endDate: "2026-04-18T23:00:00+05:30",
    totalSlots: 20,
    slotsBooked: 0,
    entryFee: 0,
    prizePool: "3,000",
    rules: [
      "All players must have a linked Steam account",
      "Teams are formed via balanced shuffle (snake draft by skill level)",
      "CS2 rank will be verified by admin before tournament",
      "Format: Swiss group stage followed by double elimination playoffs",
      "All matches played on official Valve servers",
    ],
    desc: "CS2 Prelims — Free entry shuffle tournament with ₹3,000 prize pool. Register solo, get drafted into balanced teams.",
    schedule: {
      registrationOpens: "2026-04-11T00:00:00+05:30",
      registrationCloses: "2026-04-17T23:59:00+05:30",
      squadCreation: "2026-04-18T16:00:00+05:30",
      groupStageStart: "2026-04-18T18:00:00+05:30",
      groupStageEnd: "2026-04-18T21:00:00+05:30",
      tourneyStageStart: "2026-04-18T21:00:00+05:30",
      tourneyStageEnd: "2026-04-18T23:00:00+05:30",
    },
    playersPerTeam: 5,
    bracketFormat: "double_elimination",
    bracketBestOf: 1,
    grandFinalBestOf: 3,
    createdAt: new Date().toISOString(),
  }, { merge: true });

  console.log(`✅ Seeded: ${prelimsId}`);
  console.log(`   📅 Registration deadline: 17th Apr 2026`);
  console.log(`   🎮 Start: 18th Apr 2026, 6 PM IST`);
  console.log(`   🎯 Format: Shuffle | Slots: 50 | Entry: Free | Prize: ₹3,000`);

  console.log("\n✅ Done — CS2 tournament seeded into 'cs2Tournaments' collection");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed error:", err);
  process.exit(1);
});
