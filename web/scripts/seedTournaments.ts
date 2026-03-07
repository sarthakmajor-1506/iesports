// /scripts/seedSoloTournaments.ts
// Run with: npx tsx scripts/seedSoloTournaments.ts

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import { getWeekDates, formatWeekLabel } from "../lib/soloTournaments";

// ── IST-aware week ID ─────────────────────────────────────────────────────────
function getWeekIdIST(date: Date): string {
  const ist = new Date(date.getTime() + 330 * 60 * 1000);
  const day  = ist.getUTCDay();
  const diff = ist.getUTCDate() - day + (day === 0 ? -6 : 1);
  ist.setUTCDate(diff);
  const thursday = new Date(ist);
  thursday.setUTCDate(ist.getUTCDate() - (ist.getUTCDay() + 6) % 7 + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const weekNo = 1 + Math.round(
    ((thursday.getTime() - firstThursday.getTime()) / 86400000
      - 3 + (firstThursday.getUTCDay() + 6) % 7) / 7
  );
  return `${ist.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getThreeWeeksIST() {
  const now  = new Date();
  const last = getWeekIdIST(new Date(now.getTime() - 7 * 86400000));
  const current = getWeekIdIST(now);
  const next = getWeekIdIST(new Date(now.getTime() + 7 * 86400000));
  return { last, current, next };
}

dotenv.config({ path: ".env.local" });

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

async function seed() {
  const db = getFirestore();
  const { last, current, next } = getThreeWeeksIST();

  const weekStatuses: Record<string, "ended" | "active" | "upcoming"> = {
    [last]:    "ended",
    [current]: "active",
    [next]:    "upcoming",
  };

  for (const weekId of [last, current, next]) {
    const { weekStart, weekEnd, registrationDeadline } = getWeekDates(weekId);
    const status = weekStatuses[weekId];
    const label  = formatWeekLabel(weekId);

    // ── Tournament window ────────────────────────────────────────────────────
    // Registration opens: Monday 00:00 IST = weekStart
    // Registration closes: Wednesday 23:59 IST = registrationDeadline
    // Tournament starts:  Monday 00:00 IST = weekStart  (matches from start count)
    // Tournament ends:    Sunday  23:59 IST = weekEnd

    const startTimeUnix = Math.floor(weekStart.getTime() / 1000);        // unix seconds
    const endTimeUnix   = Math.floor(weekEnd.getTime() / 1000);          // unix seconds
    const regDeadlineUnix = Math.floor(registrationDeadline.getTime() / 1000);
    const createdAtUnix   = Math.floor(Date.now() / 1000);

    const freeId = `${weekId}-free`;

    await db.collection("soloTournaments").doc(freeId).set({
      weekId,
      name:   `Weekly Solo — ${label}`,
      type:   "free",
      game:   "dota2",
      status,

      // Prize
      prizePool: "₹2,500",
      entry:     "Free",
      entryFee:  0,

      // Slots
      totalSlots:  50,
      slotsBooked: 0,

      // ── Timestamps stored as BOTH ISO strings AND unix seconds ──────────
      // ISO strings kept for backwards compat with existing UI code
      weekStart:            weekStart.toISOString(),
      weekEnd:              weekEnd.toISOString(),
      registrationDeadline: registrationDeadline.toISOString(),
      createdAt:            new Date().toISOString(),

      // Unix seconds — used by scoring engine & schedule display
      startTime:            startTimeUnix,      // tournament window open (= weekStart)
      endTime:              endTimeUnix,         // tournament window close (= weekEnd)
      registrationDeadlineUnix: regDeadlineUnix,
      createdAtUnix,
    }, { merge: true }); // merge:true so re-seeding doesn't wipe player subcollection refs

    console.log(`✅ Seeded free: ${freeId}`);
    console.log(`   📅 ${weekStart.toISOString()} → ${weekEnd.toISOString()}`);
    console.log(`   ⏱️  startTime=${startTimeUnix}  endTime=${endTimeUnix}`);
  }

  console.log("\n✅ Done — 3 free solo tournaments seeded (last / current / next week)");
  process.exit(0);
}

seed().catch(console.error);