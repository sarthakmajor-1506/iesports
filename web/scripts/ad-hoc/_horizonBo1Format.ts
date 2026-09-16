/**
 * Horizon, 16 Sep 2026: group stage goes best-of-1.
 *
 * Sarthak's call: round robin is Bo1, then the top two play a Bo3 Grand Final.
 * Horizon was still carrying the solo-era numbers — `matchesPerRound: 2` and
 * rules saying "best of 2".
 *
 * `matchesPerRound` is not copy. generate-all-pairings reads it to decide how
 * many games each fixture gets, and match-fetch reads it to score results, so
 * leaving it at 2 would schedule Bo2 fixtures no matter what the rules said.
 * Safe to change only while no pairings exist — the script refuses otherwise.
 *
 * Also removes `schedule.squadCreation` (10:45 on the day). That slot was the
 * random draw; under team registration the rosters are formed at sign-up and
 * the page would otherwise list a "Team Formation" step that never happens.
 *
 * Bracket fields (bracketFormat, bracketBestOf, lbFinalBestOf, …) are left
 * alone: they are leftovers from the double-elimination template, and whether
 * the Grand Final is generated through them is an ops decision, not a copy one.
 *
 *   npx tsx scripts/ad-hoc/_horizonBo1Format.ts            # dry run, prints before/after
 *   npx tsx scripts/ad-hoc/_horizonBo1Format.ts --apply
 */
import { config } from "dotenv";
import * as path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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
const ID = "league-of-rising-stars-horizon";

const DESC =
  "LEAGUE OF RISING STARS - HORIZON — a one-day, fully online Valorant team tournament. " +
  "₹2,000 per team of five, ₹8,000 prize pool, winner takes all. The captain creates the team " +
  "and shares a team code; teammates join free with it. Format: a best-of-1 round robin — every " +
  "team plays every other team once — then the top two play a best-of-3 Grand Final. " +
  "Settle it in one evening. Powered by iesports.";

const RULES = [
  "Enter as a team of 5 — create a team (the captain pays ₹2,000 once for the whole team) or join one with a team code",
  "The captain gets a 6-character team code; teammates join free with it. Every player needs a linked Riot ID",
  "Prize pool ₹8,000 — winner takes all",
  "Registration closes 24 September, or the moment all 4 team slots fill — whichever comes first",
  "Check in on Discord from 10:30 AM — lobby codes go out there",
  "Group stage: round robin, best of 1 (Bo1) — every team plays every other team once, 3 matches each",
  "Matches at 11:00 AM, 1:00 PM and 3:00 PM IST, two running in parallel",
  "Each match won is 1 point. Level on points → RW−RL (rounds won minus rounds lost) decides, then K−D",
  "Top two teams play a best-of-3 (Bo3) Grand Final at 5:00 PM IST — there are no other play-offs",
  "All matches streamed live; highlight shorts and an AI performance report follow",
];

async function main() {
  const ref = db.collection("valorantTournaments").doc(ID);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`valorantTournaments/${ID} not found`);
  const t = snap.data() as any;

  console.log(`\n=== ${t.name} ===\n`);
  const show = (k: string, before: unknown, after: unknown) => {
    const b = JSON.stringify(before), a = JSON.stringify(after);
    console.log(`  ${k.padEnd(24)} ${b === a ? a : `${b}  →  ${a}`}`);
  };
  show("matchesPerRound", t.matchesPerRound, 1);
  show("grandFinalBestOf", t.grandFinalBestOf, 3);
  show("groupStageFormat", t.groupStageFormat, "Round Robin");
  show("playoffFormat", t.playoffFormat, "Grand Final");
  show("schedule.squadCreation", t.schedule?.squadCreation, "(removed)");
  console.log(`\n  desc:\n    - ${t.desc}\n    + ${DESC}`);
  console.log(`\n  rules:`);
  (t.rules || []).forEach((r: string) => console.log(`    - ${r}`));
  RULES.forEach((r) => console.log(`    + ${r}`));

  const matches = await ref.collection("matches").limit(1).get();
  if (!matches.empty || t.status !== "upcoming") {
    console.log(`\n  ⚠ status "${t.status}", ${matches.size ? "fixtures already exist" : "no fixtures"}.`);
    console.log(`    Changing the best-of under existing fixtures would mis-score them. Stopping.`);
    return;
  }

  if (!APPLY) { console.log(`\nDRY RUN — re-run with --apply.`); return; }

  await ref.update({
    matchesPerRound: 1,
    grandFinalBestOf: 3,
    groupStageFormat: "Round Robin",
    playoffFormat: "Grand Final",
    "schedule.squadCreation": FieldValue.delete(),
    desc: DESC,
    rules: RULES,
    formatChangedAt: new Date().toISOString(),
    previousFormat: { matchesPerRound: t.matchesPerRound ?? null, rules: t.rules ?? null, desc: t.desc ?? null, squadCreation: t.schedule?.squadCreation ?? null },
  });
  console.log(`\n✓ ${ID}: Bo1 round robin → Bo3 Grand Final.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
