// /scripts/seedSoloTournaments.ts
// Run with: npx tsx scripts/seedSoloTournaments.ts

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import { getWeekDates, formatWeekLabel } from "../lib/soloTournaments";

// Timezone-safe week ID calculation for IST (UTC+5:30)
function getWeekIdIST(date: Date): string {
  // Add IST offset: 5.5 hours = 330 minutes
  const ist = new Date(date.getTime() + 330 * 60 * 1000);
  const day = ist.getUTCDay();
  const diff = ist.getUTCDate() - day + (day === 0 ? -6 : 1);
  ist.setUTCDate(diff);
  const year = ist.getUTCFullYear();
  const thursday = new Date(ist);
  thursday.setUTCDate(ist.getUTCDate() - (ist.getUTCDay() + 6) % 7 + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const weekNo = 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86400000 - 3 + (firstThursday.getUTCDay() + 6) % 7) / 7);
  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}

function getThreeWeeksIST(): { last: string; current: string; next: string } {
  const now = new Date();
  const current = getWeekIdIST(now);
  const lastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last = getWeekIdIST(lastDate);
  const nextDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const next = getWeekIdIST(nextDate);
  return { last, current, next };
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

  const weekStatuses: Record<string, "ended" | "active" | "upcoming"> = {
    [last]: "ended",
    [current]: "active",
    [next]: "upcoming",
  };

  for (const weekId of [last, current, next]) {
    const { weekStart, weekEnd, registrationDeadline } = getWeekDates(weekId);
    const status = weekStatuses[weekId];
    const label = formatWeekLabel(weekId);

    // Free tournament
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
      slotsBooked: 0,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      registrationDeadline: registrationDeadline.toISOString(),
      createdAt: new Date().toISOString(),
    });
    console.log(`✅ Seeded free: ${freeId}`);

    // Paid tournament
    const paidId = `${weekId}-paid`;
    await db.collection("soloTournaments").doc(paidId).set({
      weekId,
      name: `Weekly Solo Pro — ${label}`,
      type: "paid",
      game: "dota2",
      status,
      prizePool: "₹10,000",
      entry: "₹199",
      entryFee: 199,
      totalSlots: 50,
      slotsBooked: 0,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      registrationDeadline: registrationDeadline.toISOString(),
      createdAt: new Date().toISOString(),
    });
    console.log(`✅ Seeded paid: ${paidId}`);
  }

  console.log("\nDone! 6 solo tournaments seeded (3 weeks × 2 types)");
  process.exit(0);
}

seed().catch(console.error);