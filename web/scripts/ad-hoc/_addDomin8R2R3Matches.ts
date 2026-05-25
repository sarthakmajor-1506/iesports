/**
 * Add the remaining Round 2 round-robin matches (2 missing combos) +
 * a full Round 3 round-robin (6 matches) to Domin8.
 * 4 matches per Saturday: 2026-05-30 and 2026-06-06.
 *
 * R1 covered every combo. R2 had 4 of 6 combos. R3 will be a full
 * fresh round-robin (all 6 combos again).
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
const db = getFirestore();
const TID = "domin8-ultimate-tilt-proof-tournament";

// Team IDs in the tournament
const T = {
  pohe:      { id: "team-1", name: "10k ke Pohe" },
  toxic:     { id: "team-2", name: "Toxic but Talented" },
  versatile: { id: "team-3", name: "Versatile Dogs" },
  tamers:    { id: "team-4", name: "Dog Tamers" },
};

// IST 8pm/9pm/10pm/11pm = UTC 14:30/15:30/16:30/17:30
const SLOTS = ["14:30:00Z", "15:30:00Z", "16:30:00Z", "17:30:00Z"];

const matches = [
  // ── Sat 2026-05-30 ──────────────────────────────
  { id: "r2-match-5", day: 2, idx: 5, date: "2026-05-30", slot: 0, t1: T.pohe,      t2: T.toxic },
  { id: "r2-match-6", day: 2, idx: 6, date: "2026-05-30", slot: 1, t1: T.versatile, t2: T.tamers },
  { id: "r3-match-1", day: 3, idx: 1, date: "2026-05-30", slot: 2, t1: T.pohe,      t2: T.toxic },
  { id: "r3-match-2", day: 3, idx: 2, date: "2026-05-30", slot: 3, t1: T.pohe,      t2: T.versatile },
  // ── Sat 2026-06-06 ──────────────────────────────
  { id: "r3-match-3", day: 3, idx: 3, date: "2026-06-06", slot: 0, t1: T.pohe,      t2: T.tamers },
  { id: "r3-match-4", day: 3, idx: 4, date: "2026-06-06", slot: 1, t1: T.toxic,     t2: T.versatile },
  { id: "r3-match-5", day: 3, idx: 5, date: "2026-06-06", slot: 2, t1: T.toxic,     t2: T.tamers },
  { id: "r3-match-6", day: 3, idx: 6, date: "2026-06-06", slot: 3, t1: T.versatile, t2: T.tamers },
];

(async () => {
  const tref = db.collection("tournaments").doc(TID);
  let created = 0, skipped = 0;
  for (const m of matches) {
    const ref = tref.collection("matches").doc(m.id);
    const existing = await ref.get();
    if (existing.exists) {
      console.log(`  skip ${m.id} (already exists)`);
      skipped++;
      continue;
    }
    const scheduledTime = `${m.date}T${SLOTS[m.slot]}`;
    const istLabel = ["8pm", "9pm", "10pm", "11pm"][m.slot];
    await ref.set({
      id: m.id,
      tournamentId: TID,
      team1Id: m.t1.id,
      team2Id: m.t2.id,
      team1Name: m.t1.name,
      team2Name: m.t2.name,
      team1Logo: "",
      team2Logo: "",
      team1Score: 0,
      team2Score: 0,
      matchDay: m.day,
      matchIndex: m.idx,
      isBracket: false,
      bestOf: 1,
      status: "pending",
      scheduledTime,
      createdAt: new Date().toISOString(),
    });
    console.log(`  ✓ ${m.id}  ${m.t1.name} vs ${m.t2.name}  ${m.date} ${istLabel} IST`);
    created++;
  }
  console.log(`\nCreated ${created} new matches, skipped ${skipped} existing.`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
