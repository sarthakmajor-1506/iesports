/**
 * Switch a Valorant tournament from solo registration to team registration.
 *
 * Written for League of Rising Stars: Horizon on 14 Sep 2026 (₹500 per player,
 * shuffled on the day → ₹2000 per pre-formed team of 5). It only changes the
 * tournament document, and refuses to run while solo players are still on the
 * roster: clearing them (and recording their refunds) is a separate step, see
 * scripts/ad-hoc/_horizonCancelSoloEntries.ts. Refunds are never part of team
 * registration.
 *
 * Dry run by default — prints the before/after.
 *
 *   npx tsx scripts/dev-tools/convertToTeamRegistration.ts --id=league-of-rising-stars-horizon
 *   npx tsx scripts/dev-tools/convertToTeamRegistration.ts --id=league-of-rising-stars-horizon --fee=2000 --teams=4 --apply
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

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const APPLY = process.argv.includes("--apply");

const HORIZON = "league-of-rising-stars-horizon";

// Copy for Horizon. Review before --apply; everything else about the event
// (schedule, round robin, Grand Final) is unchanged from the solo version.
const HORIZON_COPY = {
  desc:
    "LEAGUE OF RISING STARS - HORIZON — a one-day, fully online Valorant team tournament. " +
    "₹2,000 per team of five, ₹8,000 prize pool, winner takes all. The captain registers the team " +
    "and shares a code, teammates join free. Settle it in one evening. Powered by iesports.",
  rules: [
    "Register as a team of 5 — the captain pays ₹2,000 once for the whole team",
    "The captain gets a team code; teammates join free with it. Every player needs a linked Riot ID",
    "Prize pool ₹8,000",
    "Registration closes 24 September, or the moment all 4 team slots fill — whichever comes first",
    "Check in on Discord from 10:30 AM — lobby codes go out there",
    "Group stage: round robin — every team plays every other team, best of 2",
    "Matches at 11:00 AM, 1:00 PM and 3:00 PM IST, two running in parallel",
    "Each map won is 1 point. Level on points → RW−RL decides, then K−D",
    "Top two teams play a best-of-3 Grand Final at 5:00 PM IST — there are no other play-offs",
    "All matches streamed live; highlight shorts and an AI performance report follow",
  ],
};

async function main() {
  const id = arg("id");
  if (!id) throw new Error("--id=<tournamentId> is required");

  const ref = db.collection("valorantTournaments").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`valorantTournaments/${id} not found`);
  const t = snap.data() as any;

  const teamSize = Number(arg("size")) || 5;
  const totalTeams = Number(arg("teams")) || Number(t.totalTeams) || Math.floor((Number(t.totalSlots) || 0) / teamSize);
  const fee = Number(arg("fee")) || Number(t.entryFee) || 0;

  const update: Record<string, any> = {
    registrationMode: "team",
    format: "standard",
    teamSize,
    totalTeams,
    totalSlots: totalTeams * teamSize,
    entryFee: fee,
    // Record of the switch, for anyone reading the doc later.
    registrationModeChangedAt: new Date().toISOString(),
    previousRegistration: { mode: "solo", format: t.format || null, entryFee: t.entryFee ?? null, totalSlots: t.totalSlots ?? null },
    ...(id === HORIZON ? HORIZON_COPY : {}),
  };

  console.log(`\n=== ${t.name} (${id}) ===\n`);
  for (const [k, v] of Object.entries(update)) {
    if (k === "rules") {
      console.log(`  rules:`);
      (t.rules || []).forEach((r: string) => console.log(`    - ${r}`));
      console.log(`  → rules:`);
      (v as string[]).forEach((r) => console.log(`    + ${r}`));
      continue;
    }
    if (k === "previousRegistration" || k === "registrationModeChangedAt") continue;
    const before = JSON.stringify(t[k]);
    const after = JSON.stringify(v);
    console.log(`  ${k.padEnd(18)} ${before === after ? after : `${before}  →  ${after}`}`);
  }

  if (t.teamsGenerated || (await ref.collection("teams").limit(1).get()).size) {
    console.log(`\n  ⚠ this tournament already has teams — they would sit alongside registered ones. Stopping.`);
    return;
  }
  if (t.status !== "upcoming") {
    console.log(`\n  ⚠ status is "${t.status}", not "upcoming". Stopping.`);
    return;
  }

  // Solo and team entries never mix: a solo player left on the roster would sit
  // on no team, holding a seat nobody can see how to fill.
  const roster = await ref.collection("soloPlayers").get();
  const liveSolo = (await db.collection("paidEntries").where("tournamentId", "==", id).get())
    .docs.filter(e => !e.id.endsWith("__team") && (e.data() as any).voided !== true);
  if (roster.size || liveSolo.length) {
    console.log(`\n  ⚠ ${roster.size} solo player(s) on the roster and ${liveSolo.length} live solo entitlement(s).`);
    console.log(`    Cancel them first: npx tsx scripts/ad-hoc/_horizonCancelSoloEntries.ts`);
    if (APPLY) { console.log(`  Stopping.`); return; }
  }

  if (!APPLY) { console.log(`\nDRY RUN — re-run with --apply to switch this tournament to team registration.`); return; }

  await ref.update(update);
  console.log(`\n✓ ${id} now takes team registrations (₹${fee} per team of ${teamSize}, ${totalTeams} teams).`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
