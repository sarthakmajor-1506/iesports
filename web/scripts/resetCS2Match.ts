/**
 * Reset a CS2 match doc back to pending.
 *
 * The site shows a match as live from the moment MatchZy's `series_start`
 * lands, and only stops when `series_end` settles it. If a match is abandoned,
 * force-ended, replayed as a pug, or the server never got our config, no
 * `series_end` ever arrives and the tournament page shows a phantom live game
 * indefinitely. This clears that.
 *
 * Also drops `matchzyMatchId` and its `cs2MatchzyIndex` entry, so any late
 * event from the abandoned attempt resolves to nothing instead of writing into
 * a match that has since been replayed. A stale index entry is how a
 * force-ended test ends up posting a result to Discord an hour later.
 *
 * This is for abandoned matches. To record a result that was actually played,
 * use the admin panel's manual result instead — that runs the full settle
 * cascade (standings, bracket seeding, Discord).
 *
 *   npx tsx scripts/resetCS2Match.ts <tournamentId> <matchId>
 *   npx tsx scripts/resetCS2Match.ts cs2-test-tournament cs2-test-m1 --apply
 */
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
const db = getFirestore(getApp());

const APPLY = process.argv.includes("--apply");
const [tournamentId, matchId] = process.argv.slice(2).filter(a => !a.startsWith("--"));

async function main() {
  if (!tournamentId || !matchId) {
    console.error("usage: npx tsx scripts/resetCS2Match.ts <tournamentId> <matchId> [--apply]");
    process.exit(1);
  }

  const ref = db.collection("cs2Tournaments").doc(tournamentId).collection("matches").doc(matchId);
  const snap = await ref.get();
  if (!snap.exists) { console.error(`match ${tournamentId}/${matchId} not found`); process.exit(1); }
  const m: any = snap.data();

  console.log(`=== ${tournamentId}/${matchId} ===`);
  console.log(`  ${m.team1Name} vs ${m.team2Name}`);
  console.log(`  status=${m.status} winner=${m.winner ?? "—"} score=${m.team1Score}-${m.team2Score} matchzyMatchId=${m.matchzyMatchId ?? "—"}`);
  for (let i = 1; i <= 5; i++) if (m[`game${i}`]) console.log(`  game${i}: ${JSON.stringify(m[`game${i}`])}`);

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); return; }

  const patch: any = {
    status: "pending",
    team1Score: 0, team2Score: 0,
    winner: FieldValue.delete(),
    completedAt: FieldValue.delete(),
    result: FieldValue.delete(),
    liveStartedAt: FieldValue.delete(),
    liveUpdatedAt: FieldValue.delete(),
    matchzyMatchId: FieldValue.delete(),
  };
  for (let i = 1; i <= 5; i++) patch[`game${i}`] = FieldValue.delete();

  await ref.set(patch, { merge: true });
  if (m.matchzyMatchId) {
    await db.collection("cs2MatchzyIndex").doc(String(m.matchzyMatchId)).delete().catch(() => {});
  }
  console.log("\nReset to pending. Re-run Load Match in the admin panel to play it.");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
