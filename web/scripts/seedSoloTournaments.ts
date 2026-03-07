// /scripts/seedSoloTournaments.ts
// Run with: npx tsx scripts/seedSoloTournaments.ts
// Safe to re-run — uses merge:true (won't wipe slotsBooked or player data)
// Also fixes stale statuses on ALL existing tournaments

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import { getWeekDates, formatWeekLabel } from "../lib/soloTournaments";

function getWeekIdIST(date: Date): string {
  const ist = new Date(date.getTime() + 330 * 60 * 1000);
  const day = ist.getUTCDay();
  const diff = ist.getUTCDate() - day + (day === 0 ? -6 : 1);
  ist.setUTCDate(diff);
  const thursday = new Date(ist);
  thursday.setUTCDate(ist.getUTCDate() - (ist.getUTCDay() + 6) % 7 + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const weekNo = 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86400000 - 3 + (firstThursday.getUTCDay() + 6) % 7) / 7);
  return `${ist.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getThreeWeeksIST(): { last: string; current: string; next: string } {
  const now = new Date();
  return {
    last:    getWeekIdIST(new Date(now.getTime() - 7 * 86400000)),
    current: getWeekIdIST(now),
    next:    getWeekIdIST(new Date(now.getTime() + 7 * 86400000)),
  };
}

// Derive status from dates, not hardcoded
function getStatusFromDates(weekStart: Date, weekEnd: Date): "upcoming" | "active" | "ended" {
  const now = new Date();
  if (now < weekStart) return "upcoming";
  if (now > weekEnd) return "ended";
  return "active";
}

dotenv.config({ path: ".env.local" });

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

async function seed() {
  const db = getFirestore();
  const { last, current, next } = getThreeWeeksIST();

  console.log(`📅 Last: ${last}  |  Current: ${current}  |  Next: ${next}\n`);

  for (const weekId of [last, current, next]) {
    const { weekStart, weekEnd, registrationDeadline } = getWeekDates(weekId);
    const status = getStatusFromDates(weekStart, weekEnd);
    const label = formatWeekLabel(weekId);

    const freeId = `${weekId}-free`;
    await db.collection("soloTournaments").doc(freeId).set({
      weekId,
      name: `Weekly Solo — ${label}`,
      type: "free",
      game: "dota2",
      status,
      prizePool: "₹2,500",
      entry: "Free",
      entryFee: 0,
      totalSlots: 50,
      // slotsBooked intentionally NOT set here — merge:true preserves existing value
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      registrationDeadline: registrationDeadline.toISOString(),
      createdAt: new Date().toISOString(),
      startTime: Math.floor(weekStart.getTime() / 1000),
      endTime: Math.floor(weekEnd.getTime() / 1000),
      registrationDeadlineUnix: Math.floor(registrationDeadline.getTime() / 1000),
      createdAtUnix: Math.floor(Date.now() / 1000),
    }, { merge: true });
    console.log(`✅ ${freeId} → ${status}`);
    console.log(`   ${weekStart.toISOString()} → ${weekEnd.toISOString()}`);
  }

  // ── Fix stale statuses on ALL existing tournaments ────────────────────
  console.log("\n🔄 Checking all tournament statuses...");
  const allDocs = await db.collection("soloTournaments").get();
  const batch = db.batch();
  let fixed = 0;

  for (const d of allDocs.docs) {
    const data = d.data();
    const ws = new Date(data.weekStart);
    const we = new Date(data.weekEnd);
    const correct = getStatusFromDates(ws, we);
    if (data.status !== correct) {
      batch.update(d.ref, { status: correct });
      console.log(`   ${d.id}: ${data.status} → ${correct}`);
      fixed++;
    }
  }

  if (fixed > 0) {
    await batch.commit();
    console.log(`✅ Fixed ${fixed} stale statuses`);
  } else {
    console.log(`✅ All statuses correct`);
  }

  console.log("\n🎯 Done!");
  process.exit(0);
}

seed().catch(console.error);