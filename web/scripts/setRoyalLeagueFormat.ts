/**
 * Force the Royal Sports League onto its published format: everything BO1,
 * league games MR16, play-offs MR24.
 *
 * The tournament doc was seeded with bracketBestOf/grandFinalBestOf = 3, so
 * every play-off would have been handed a three-map maplist by
 * api/cs2/match-config and settled as a three-map series by settleCS2Match —
 * in a schedule that gives each play-off a single 20-minute slot. This script
 * rewrites the live doc rather than re-running the seeder, because the seeder
 * would also rewrite rosters and fixtures that have since been corrected by
 * hand.
 *
 * Round limits are written per match as well as on the tournament. The
 * match-config endpoint prefers the per-match `maxRounds`, so a match seeded
 * before the tournament-level fallback existed would otherwise keep whatever
 * it was given.
 *
 * Also trims any plannedMaps longer than the best-of. A three-map list left
 * over from a BO3 load is not merely cosmetic: match-config only accepts
 * plannedMaps when its length equals num_maps, so a stale list silently falls
 * back to the default map instead of the map the admin picked.
 *
 * Dry run by default:
 *   npx tsx scripts/setRoyalLeagueFormat.ts
 *   npx tsx scripts/setRoyalLeagueFormat.ts --apply
 */
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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
const TID = process.argv.find(a => a.startsWith("--tid="))?.slice(6) || "cs2-royal-sports-league";

const GROUP_MAX_ROUNDS = 16;
const BRACKET_MAX_ROUNDS = 24;

const FORMAT = {
  matchesPerRound: 1,   // group stage BO1
  bracketBestOf: 1,     // semifinals BO1
  grandFinalBestOf: 1,  // final BO1
  lbFinalBestOf: 1,     // unused (single elimination), set so nothing defaults to 3
  groupMaxRounds: GROUP_MAX_ROUNDS,
  bracketMaxRounds: BRACKET_MAX_ROUNDS,
};

async function main() {
  const tref = db.collection("cs2Tournaments").doc(TID);
  const tSnap = await tref.get();
  if (!tSnap.exists) { console.error(`tournament ${TID} not found`); process.exit(1); }
  const t: any = tSnap.data();

  console.log(`=== ${TID} — ${t.name} (${t.status}) ===\n`);
  for (const [k, v] of Object.entries(FORMAT)) {
    const cur = t[k];
    console.log(`  ${k.padEnd(18)} ${String(cur ?? "unset").padEnd(8)} → ${v}${cur === v ? "   (unchanged)" : ""}`);
  }

  const msnap = await tref.collection("matches").get();
  console.log(`\n=== ${msnap.size} matches ===`);
  const matchPatches: Array<[FirebaseFirestore.DocumentReference, any]> = [];

  for (const d of msnap.docs) {
    const m: any = d.data();
    const isBracket = !!m.isBracket;
    const want = isBracket ? BRACKET_MAX_ROUNDS : GROUP_MAX_ROUNDS;
    const bo = isBracket
      ? (m.bracketType === "grand_final" ? FORMAT.grandFinalBestOf : FORMAT.bracketBestOf)
      : FORMAT.matchesPerRound;

    const patch: any = {};
    if (Number(m.maxRounds) !== want) patch.maxRounds = want;
    if (Array.isArray(m.plannedMaps) && m.plannedMaps.length > bo) patch.plannedMaps = m.plannedMaps.slice(0, bo);

    const note = Object.keys(patch).length
      ? Object.entries(patch).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ")
      : "ok";
    console.log(`  ${d.id.padEnd(26)} ${isBracket ? "bracket" : "group  "} BO${bo} MR${want}   ${note}`);
    if (Object.keys(patch).length) matchPatches.push([d.ref, patch]);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing written (${matchPatches.length} match patches pending). Re-run with --apply.`);
    return;
  }

  const batch = db.batch();
  batch.set(tref, FORMAT, { merge: true });
  for (const [ref, patch] of matchPatches) batch.set(ref, patch, { merge: true });
  await batch.commit();
  console.log(`\nWritten: tournament format + ${matchPatches.length} match patches.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
