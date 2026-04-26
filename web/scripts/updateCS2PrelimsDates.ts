/**
 * Shift the CS2 Prelims tournament dates to start 23rd May 2026
 * (registration closes 22nd May 2026). Same time-of-day across the board —
 * only the calendar dates move, no other fields are touched.
 *
 * Run: npx tsx scripts/updateCS2PrelimsDates.ts
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
const TOURNAMENT_ID = "cs2-prelims-april-2026";

const updates = {
  registrationDeadline: "2026-05-22T23:59:00+05:30",
  startDate: "2026-05-23T18:00:00+05:30",
  endDate: "2026-05-23T23:00:00+05:30",
  "schedule.registrationOpens": "2026-05-16T00:00:00+05:30",
  "schedule.registrationCloses": "2026-05-22T23:59:00+05:30",
  "schedule.squadCreation": "2026-05-23T16:00:00+05:30",
  "schedule.groupStageStart": "2026-05-23T18:00:00+05:30",
  "schedule.groupStageEnd": "2026-05-23T21:00:00+05:30",
  "schedule.tourneyStageStart": "2026-05-23T21:00:00+05:30",
  "schedule.tourneyStageEnd": "2026-05-23T23:00:00+05:30",
};

async function run() {
  const ref = db.collection("cs2Tournaments").doc(TOURNAMENT_ID);
  const before = await ref.get();
  if (!before.exists) {
    console.error(`❌ Tournament not found: ${TOURNAMENT_ID}`);
    process.exit(1);
  }
  const beforeData = before.data() || {};
  console.log(`📋 Before:`);
  console.log(`   registrationDeadline: ${beforeData.registrationDeadline}`);
  console.log(`   startDate:            ${beforeData.startDate}`);
  console.log(`   endDate:              ${beforeData.endDate}`);
  console.log(`   schedule:             ${JSON.stringify(beforeData.schedule)}\n`);

  await ref.update(updates);

  const after = (await ref.get()).data() || {};
  console.log(`✅ After:`);
  console.log(`   registrationDeadline: ${after.registrationDeadline}`);
  console.log(`   startDate:            ${after.startDate}`);
  console.log(`   endDate:              ${after.endDate}`);
  console.log(`   schedule:             ${JSON.stringify(after.schedule)}`);
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Update error:", err);
  process.exit(1);
});
