/**
 * Open registration for CS2 Prelims now.
 *
 * The CS2 tournament page checks `schedule.registrationOpens` against
 * `new Date()` to decide whether the register button is live. Currently
 * that field is set to 2026-05-16; the operator wants users to register
 * starting today, so we shift just that one field to today's date at
 * 00:00 IST. registrationCloses + startDate are preserved.
 *
 * Run: npx tsx scripts/openCS2PrelimsRegistration.ts
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
const NEW_OPEN = "2026-04-27T00:00:00+05:30";

async function run() {
  const ref = db.collection("cs2Tournaments").doc(TOURNAMENT_ID);
  const before = await ref.get();
  if (!before.exists) {
    console.error(`❌ Tournament not found: ${TOURNAMENT_ID}`);
    process.exit(1);
  }
  const b = before.data() || {};
  console.log(`Before: schedule.registrationOpens = ${b.schedule?.registrationOpens}`);
  console.log(`        schedule.registrationCloses = ${b.schedule?.registrationCloses}`);
  console.log(`        registrationDeadline = ${b.registrationDeadline}`);

  await ref.update({ "schedule.registrationOpens": NEW_OPEN });

  const after = (await ref.get()).data() || {};
  console.log(`\nAfter:  schedule.registrationOpens = ${after.schedule?.registrationOpens}`);
  console.log(`        (close + start dates unchanged)`);
  process.exit(0);
}

run().catch((e) => {
  console.error("❌ Update error:", e);
  process.exit(1);
});
