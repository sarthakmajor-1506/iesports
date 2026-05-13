/**
 * Shift Ascension matches scheduled on or after 10 May 2026 IST forward by 7 days.
 * The 10 May card did not happen, so 10 May → 17 May, 11 May → 18 May, etc.
 *
 *   npx tsx scripts/shiftAscensionMatchesPlusWeek.ts           # dry-run (no writes)
 *   npx tsx scripts/shiftAscensionMatchesPlusWeek.ts --apply   # actually write
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();

const TOURNAMENT_ID = "league-of-rising-stars-ascension";
// 2026-05-10T00:00:00 IST  ==  2026-05-09T18:30:00.000Z
const CUTOFF_MS = Date.parse("2026-05-09T18:30:00.000Z");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const APPLY = process.argv.includes("--apply");

function fmtIST(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

async function main() {
  const snap = await db
    .collection("valorantTournaments")
    .doc(TOURNAMENT_ID)
    .collection("matches")
    .get();

  console.log(`Tournament: ${TOURNAMENT_ID}`);
  console.log(`Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);
  console.log(`Total matches: ${snap.size}\n`);

  type Row = { id: string; from: string; to: string; teams: string };
  const toShift: Row[] = [];
  const skippedNoTime: string[] = [];
  const skippedBefore: Row[] = [];

  for (const doc of snap.docs) {
    const d = doc.data() as any;
    const cur: string | undefined = d.scheduledTime;
    const teams = `${d.team1Name ?? "?"} vs ${d.team2Name ?? "?"}`;
    if (!cur) {
      skippedNoTime.push(`${doc.id}  (${teams})`);
      continue;
    }
    const t = Date.parse(cur);
    if (Number.isNaN(t)) {
      skippedNoTime.push(`${doc.id}  (${teams})  bad scheduledTime=${cur}`);
      continue;
    }
    if (t < CUTOFF_MS) {
      skippedBefore.push({ id: doc.id, from: cur, to: cur, teams });
      continue;
    }
    const next = new Date(t + WEEK_MS).toISOString();
    toShift.push({ id: doc.id, from: cur, to: next, teams });
  }

  toShift.sort((a, b) => Date.parse(a.from) - Date.parse(b.from));

  console.log(`Matches to shift (+7d):  ${toShift.length}`);
  console.log(`Matches before cutoff:   ${skippedBefore.length}`);
  console.log(`Matches with no time:    ${skippedNoTime.length}\n`);

  console.log("=== Will shift ===");
  for (const r of toShift) {
    console.log(`  ${r.id.padEnd(28)}  ${r.teams}`);
    console.log(`    ${fmtIST(r.from)} IST  →  ${fmtIST(r.to)} IST`);
  }
  if (skippedNoTime.length) {
    console.log("\n=== Skipped (no scheduledTime) ===");
    for (const s of skippedNoTime) console.log(`  ${s}`);
  }

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to write.");
    return;
  }
  if (!toShift.length) {
    console.log("\nNothing to write.");
    return;
  }

  // Firestore batch limit is 500 writes; we're well under.
  const batch = db.batch();
  const matchesCol = db
    .collection("valorantTournaments")
    .doc(TOURNAMENT_ID)
    .collection("matches");
  for (const r of toShift) {
    batch.update(matchesCol.doc(r.id), { scheduledTime: r.to });
  }
  await batch.commit();
  console.log(`\n✅ Wrote ${toShift.length} updates.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
