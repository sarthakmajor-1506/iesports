/**
 * One-shot setup for a hidden BO2 test tournament between two Discord users.
 *
 * All Discord traffic from match ops is pinned to `testDiscordChannelId` so
 * nothing leaks into production lobby/results channels. `isTestTournament: true`
 * keeps this tournament out of /api/featured-tournaments and /api/tournaments/list.
 *
 * Run: npx tsx scripts/setupTestTournament.ts
 * Teardown (below): uncomment the teardown block and re-run.
 */
import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = admin.firestore();

const TOURNAMENT_ID = "test-bo2-discord-ops";
const TEST_CHANNEL_ID = "1491455654370742324";
const USER_1 = "discord_760183283182206987";
const USER_2 = "discord_1302366375263735808";

async function setup() {
  const tournamentRef = db.collection("valorantTournaments").doc(TOURNAMENT_ID);
  const now = new Date();
  const later = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  await tournamentRef.set({
    id: TOURNAMENT_ID,
    name: "TEST — BO2 Discord Ops",
    game: "valorant",
    format: "standard",
    status: "active",
    bracketsComputed: true,
    // Hide from public listings — /api/featured-tournaments and
    // /api/tournaments/list both filter on !t.isTestTournament.
    isTestTournament: true,
    // All match-ops Discord posts for this tournament go here and ONLY here.
    // Remove this field (or delete the tournament) to revert.
    testDiscordChannelId: TEST_CHANNEL_ID,
    // Do not create/move/delete VCs — the test channel is for messages only.
    skipVcOps: true,
    registrationDeadline: now.toISOString(),
    startDate: now.toISOString(),
    endDate: later.toISOString(),
    totalSlots: 2,
    slotsBooked: 2,
    entryFee: 0,
    prizePool: "₹0",
    teamCount: 2,
    playersPerTeam: 1,
    desc: "Internal Discord-ops test. Do not promote.",
  }, { merge: true });

  // Two teams, one player each.
  await tournamentRef.collection("teams").doc("team-alpha").set({
    teamName: "Team Alpha",
    teamIndex: 0,
    captainUid: USER_1,
    members: [{ uid: USER_1, riotGameName: "AlphaTestPlayer" }],
    avgSkillLevel: 0,
  }, { merge: true });

  await tournamentRef.collection("teams").doc("team-beta").set({
    teamName: "Team Beta",
    teamIndex: 1,
    captainUid: USER_2,
    members: [{ uid: USER_2, riotGameName: "BetaTestPlayer" }],
    avgSkillLevel: 0,
  }, { merge: true });

  // One BO2 group-stage match between them.
  await tournamentRef.collection("matches").doc("m1").set({
    team1Id: "team-alpha", team1Name: "Team Alpha",
    team2Id: "team-beta",  team2Name: "Team Beta",
    bestOf: 2,
    bo: 2,
    matchDay: 1,
    matchIndex: 1,
    status: "scheduled",
    isBracket: false,
    scheduledTime: now.toISOString(),
    createdAt: now.toISOString(),
  }, { merge: true });

  // Register both users on the tournament so the admin UI sees them slotted in.
  for (const uid of [USER_1, USER_2]) {
    await db.collection("users").doc(uid).set({
      registeredValorantTournaments: admin.firestore.FieldValue.arrayUnion(TOURNAMENT_ID),
    }, { merge: true });
  }

  console.log(`✓ Tournament:  ${TOURNAMENT_ID}`);
  console.log(`✓ Teams:       team-alpha (${USER_1}) vs team-beta (${USER_2})`);
  console.log(`✓ Match:       m1 (BO2)`);
  console.log(`✓ Discord:     all messages pinned to ${TEST_CHANNEL_ID}`);
  console.log(`✓ skipVcOps:   true (no VCs created)`);
  console.log(`✓ Hidden from website (isTestTournament: true)`);
  console.log(``);
  console.log(`Open admin panel → pick "TEST — BO2 Discord Ops" → walk through`);
  console.log(`Set Lobby → Continue in same VCs (for G2) → Fetch Match Results.`);
  console.log(``);
  console.log(`To revert, run:`);
  console.log(`  npx tsx scripts/setupTestTournament.ts teardown`);
  process.exit(0);
}

async function teardown() {
  const tournamentRef = db.collection("valorantTournaments").doc(TOURNAMENT_ID);

  // Delete subcollections: teams, matches, leaderboard
  for (const sub of ["teams", "matches", "leaderboard", "soloPlayers"]) {
    const snap = await tournamentRef.collection(sub).get();
    for (const d of snap.docs) await d.ref.delete();
    if (snap.size) console.log(`✓ cleared ${snap.size} docs from /${sub}`);
  }

  await tournamentRef.delete();
  console.log(`✓ deleted tournament ${TOURNAMENT_ID}`);

  for (const uid of [USER_1, USER_2]) {
    await db.collection("users").doc(uid).set({
      registeredValorantTournaments: admin.firestore.FieldValue.arrayRemove(TOURNAMENT_ID),
    }, { merge: true });
  }
  console.log(`✓ unregistered users`);
  process.exit(0);
}

const run = process.argv[2] === "teardown" ? teardown : setup;
run().catch((e) => { console.error(e); process.exit(1); });
