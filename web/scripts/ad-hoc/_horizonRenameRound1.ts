/**
 * Horizon, 17 Sep 2026: renamed "LEAGUE OF RISING STARS - HORIZON" → "HORIZON - ROUND 1".
 *
 * Only `name` and the name at the start of `desc` change. The document id
 * (`league-of-rising-stars-horizon`) stays: payments, teams, refunds and shared
 * links all point at it. Old `tournamentName` copies on payment records are
 * receipts of what was bought, so they are left alone.
 *
 *   npx tsx scripts/ad-hoc/_horizonRenameRound1.ts            # dry run
 *   npx tsx scripts/ad-hoc/_horizonRenameRound1.ts --apply
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
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, "\n"),
    }),
  });
}
const db = getFirestore();

const APPLY = process.argv.includes("--apply");
const ID = "league-of-rising-stars-horizon";
const OLD = "LEAGUE OF RISING STARS - HORIZON";
const NEW = "HORIZON - ROUND 1";

async function main() {
  const ref = db.collection("valorantTournaments").doc(ID);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`valorantTournaments/${ID} not found`);
  const t = snap.data() as any;

  const desc = typeof t.desc === "string" ? t.desc.split(OLD).join(NEW) : t.desc;
  console.log(`  name: ${JSON.stringify(t.name)}  →  ${JSON.stringify(NEW)}`);
  console.log(`  desc:\n    - ${t.desc}\n    + ${desc}`);

  if (!APPLY) { console.log(`\nDRY RUN — re-run with --apply.`); return; }
  await ref.update({ name: NEW, desc, previousName: t.name ?? null, renamedAt: new Date().toISOString() });
  console.log(`\n✓ ${ID} renamed to ${NEW}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
