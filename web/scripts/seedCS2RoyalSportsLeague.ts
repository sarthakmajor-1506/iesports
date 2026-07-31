/**
 * Create the "Royal Sports League" CS2 tournament — opens solo registration.
 *
 * Format: 40 players (8 teams x 5), split into 2 groups of 4 once registration
 * closes. Group stage: round robin BO1 at MR16 (3 matches per team). Top 2 per
 * group advance to a single-elimination play-off: 2 semifinals -> final, also
 * BO1 but at MR24. No 3rd place match. Free entry, prize pool TBD. One-day
 * event on 31 July 2026.
 *
 * Everything is BO1: the published schedule runs matches back-to-back in
 * 20-minute slots from 21:00, and a single BO3 play-off would eat three of
 * those slots on its own. Play-offs get the longer MR24 instead, which is the
 * time the format has to spend.
 *
 * This script only creates the tournament + opens registration. Team
 * formation, group assignment, and match generation happen AFTER
 * registration closes — run scripts/generateCS2RoyalSportsLeagueBracket.ts
 * for that once you've split registrants into 8 rosters.
 *
 * Run: npx tsx scripts/seedCS2RoyalSportsLeague.ts
 */

import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore(getApp());

const TID = "cs2-royal-sports-league";

// NOTE: start/end times are a placeholder single-day window — adjust before
// running if you want a different start time for 31 July.
const REGISTRATION_CLOSES = "2026-07-31T23:59:00+05:30";
const START_DATE = "2026-07-31T10:00:00+05:30";
const END_DATE = "2026-07-31T22:00:00+05:30";

async function seed() {
  console.log("🎯 Creating Royal Sports League (CS2)...\n");

  await db.collection("cs2Tournaments").doc(TID).set({
    name: "Royal Sports League",
    game: "cs2",
    // "shuffle" is what routes RegisterModal.tsx straight to the solo
    // registration flow (POST /api/cs2/solo). CS2 has no team create/join
    // API route yet, so any other format value would send players into a
    // "create/join team" step that 404s.
    format: "shuffle",
    status: "upcoming",
    bracketsComputed: false,
    registrationDeadline: REGISTRATION_CLOSES,
    startDate: START_DATE,
    endDate: END_DATE,
    totalSlots: 40,
    slotsBooked: 0,
    entryFee: 0,
    prizePool: "TBD",
    rules: [
      "40 players, 8 teams of 5 — teams and groups are assigned by admin after registration closes",
      "Group stage: 2 groups of 4 teams, round robin, best of 1 — MR16 (first to 9)",
      "Top 2 teams from each group qualify for the play-offs",
      "Play-offs: single elimination — 2 semifinals into 1 final, best of 1 — MR24 (first to 13)",
      "No 3rd place match",
      "Maps: standard CS2 active duty pool, team veto before each match",
      "All players must have a linked Steam account",
    ],
    desc: "Royal Sports League — free entry CS2 tournament. 8 teams, 2 groups, round robin into a single-elimination play-off. One-day event, 31 July 2026.",
    schedule: {
      registrationOpens: new Date().toISOString(),
      registrationCloses: REGISTRATION_CLOSES,
      groupStageStart: START_DATE,
      groupStageEnd: "2026-07-31T15:00:00+05:30",
      tourneyStageStart: "2026-07-31T15:30:00+05:30",
      tourneyStageEnd: END_DATE,
    },
    playersPerTeam: 5,
    totalTeams: 8,
    groupStageRounds: 3,
    matchesPerRound: 1,
    bracketFormat: "single_elimination",
    // BO1 throughout — see the header. These drive both the config handed to
    // MatchZy (num_maps in api/cs2/match-config) and the series score written
    // on settle (lib/settleCS2Match.ts); they must never disagree.
    bracketBestOf: 1,
    grandFinalBestOf: 1,
    // Round limits, read by api/cs2/match-config as the mp_maxrounds fallback
    // when a match carries no maxRounds of its own.
    groupMaxRounds: 16,
    bracketMaxRounds: 24,
    bracketTeamCount: 4,
    createdAt: new Date().toISOString(),
  }, { merge: true });

  console.log(`✅ Seeded: ${TID}`);
  console.log(`   📅 Registration closes: 31 Jul 2026, 00:00 IST`);
  console.log(`   🎮 Tournament day: 31 Jul 2026`);
  console.log(`   🎯 8 teams (40 players) · Free entry · Prize: TBD`);
  console.log(`\nNext step (after registration closes): fill in rosters + groups in`);
  console.log(`scripts/generateCS2RoyalSportsLeagueBracket.ts, then run it (dry-run first).`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed error:", err);
  process.exit(1);
});
