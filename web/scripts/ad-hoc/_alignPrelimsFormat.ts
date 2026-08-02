/**
 * Align the CS2 Prelims document with the format the tournament will actually
 * run — and therefore with the explainer video on its own page.
 *
 * The doc still described a Swiss group stage into double-elimination playoffs
 * starting at 6 PM, with registration closing 23 September. The agreed format is
 * a round robin from 11:00 into a BO3 final. Shipping a 30-second video that
 * contradicts the rules printed directly beneath it would be worse than having
 * no video at all.
 *
 *   npx tsx scripts/ad-hoc/_alignPrelimsFormat.ts
 *   npx tsx scripts/ad-hoc/_alignPrelimsFormat.ts --apply
 */
import { config } from "dotenv";
import * as path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

config({ path: path.resolve(__dirname, "../../.env.local") });

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
const APPLY = process.argv.includes("--apply");

const D = "2026-09-13";

const update = {
  schedule: {
    registrationOpens: "2026-04-27T00:00:00+05:30",
    registrationCloses: "2026-09-11T23:59:00+05:30",
    squadCreation: `${D}T10:30:00+05:30`,   // random draw, 30 min before first match
    groupStageStart: `${D}T11:00:00+05:30`,
    groupStageEnd: `${D}T16:30:00+05:30`,   // three slots: 11:00, 13:00, 15:00
    tourneyStageStart: `${D}T17:00:00+05:30`,
    tourneyStageEnd: `${D}T19:00:00+05:30`,
  },
  rules: [
    "Linked Steam account required",
    "Entry fee ₹500 per player — withdraw before registration closes for a 100% refund",
    "Prize pool ₹8,000",
    "Registration closes 11 September, or the moment all 20 slots fill — whichever comes first",
    "20 players → 4 teams of 5, drawn at random on the day at 10:30 AM IST",
    "Substitutes join free once registration closes, and replace anyone who withdraws",
    "Group stage: round robin — every team plays every other team, best of 2",
    "Matches at 11:00, 13:00 and 15:00 IST, two matches running in parallel",
    "Standings: each map won is 1 point. Level on points → RW−RL decides, then K−D",
    "Top two teams play a best-of-3 grand final at 17:00 IST",
    "All communication and match calls happen on Discord",
  ],
};

(async () => {
  const ref = db.collection("cs2Tournaments").doc("cs2-prelims-april-2026");
  const before: any = (await ref.get()).data();

  console.log("=== schedule ===");
  for (const [k, v] of Object.entries(update.schedule)) {
    const old = before.schedule?.[k];
    console.log(`  ${k.padEnd(20)} ${old === v ? "unchanged" : `${old} → ${v}`}`);
  }
  console.log(`\n=== rules: ${before.rules?.length || 0} → ${update.rules.length} ===`);
  update.rules.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));

  if (!APPLY) { console.log("\nDRY RUN — re-run with --apply"); return; }
  await ref.update(update);
  console.log("\ndone.");
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
