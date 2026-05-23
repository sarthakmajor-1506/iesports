/**
 * Internal Dota end-to-end test tournament — Major vs Shrey, 1 match.
 *
 * Purpose: exercise the full Dota flow (lobby creation, player invite, GC
 * result ingestion, leaderboard + standings aggregation) without polluting
 * the public site. The tournament carries:
 *
 *   - `isTestTournament: true`             → filtered out of public listings
 *   - `visibleToUids: [major, shrey]`      → whitelisted for these two uids only
 *   - `discordChannelId: <new channel>`    → all admin-panel-driven Discord
 *                                            traffic (lobby ann, results,
 *                                            match-update embeds) routes here
 *
 * Run:
 *   npx tsx scripts/seedDotaTestTournament.ts                 # dry-run
 *   npx tsx scripts/seedDotaTestTournament.ts --apply         # writes Firestore
 *   npx tsx scripts/seedDotaTestTournament.ts --apply --with-channel
 *                                                             # also creates
 *                                                             # the private
 *                                                             # Discord channel
 *
 * Idempotent — re-running with --apply will merge over the existing docs;
 * --with-channel is a no-op if `discordChannelId` is already set (pass
 * --force-channel to recreate).
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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

const TID = "dota-test-major-shrey";
const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes("--apply");
const WITH_CHANNEL = ARGS.includes("--with-channel");
const FORCE_CHANNEL = ARGS.includes("--force-channel");

// ── Player roster (hard-coded; the two test users) ──────────────────────────
const MAJOR = {
  uid: "discord_1302366375263735808",
  fullName: "Sarthak",
  steamId: "76561198129242599",
  steamName: "Major",
  steamAvatar: "https://avatars.steamstatic.com/f18cfac168a0d2be16fd1400feef4d67c1b6fcdc_full.jpg",
  discordId: "1302366375263735808",
  discordUsername: "major1506_31908",
  dotaRankTier: 35,
  dotaBracket: "crusader_archon",
};
const SHREY = {
  uid: "steam_76561198089387830",
  fullName: "Shrey Jain",
  steamId: "76561198089387830",
  steamName: "/",
  steamAvatar: "https://avatars.steamstatic.com/99e48f2a6326cd537471f64fab0308f9ddad03d1_full.jpg",
  discordId: "746803954767364147",
  discordUsername: "shrey8169",
  dotaRankTier: 72,
  dotaBracket: "divine_immortal",
};
const PLAYERS = [MAJOR, SHREY];
const VISIBLE_UIDS = PLAYERS.map(p => p.uid);

// ── Tournament doc ──────────────────────────────────────────────────────────
const tournamentDoc = {
  game: "dota2",
  name: "Dota Internal Test — Major vs Shrey",
  format: "standard",
  status: "ongoing",
  bracketsComputed: false,
  isTestTournament: true,
  visibleToUids: VISIBLE_UIDS,
  registrationDeadline: new Date(Date.now() - 60_000).toISOString(),  // already closed
  startDate: new Date().toISOString(),
  endDate: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
  totalSlots: 2,
  slotsBooked: PLAYERS.length,
  entryFee: 0,
  prizePool: "₹0",
  totalTeams: 2,
  playersPerTeam: 1,
  groupStageRounds: 1,
  matchesPerRound: 1,
  bracketFormat: "single_elimination",
  bracketBestOf: 1,
  bracketTeamCount: 2,
  rules: [
    "Internal end-to-end test — Major vs Shrey 1v1 mid (or whatever ruleset you agree on).",
    "Not counted on any leaderboard; tournament is whitelisted to the two players only.",
  ],
  desc: "Hidden test tournament wired to a private Discord channel. Used to validate the Dota lobby/result/Discord pipeline without surfacing on the public site.",
  schedule: {
    registrationOpens: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
    registrationCloses: new Date(Date.now() - 60_000).toISOString(),
    groupStageStart: new Date().toISOString(),
  },
  createdAt: new Date().toISOString(),
};

// ── Teams (1 player per team) ───────────────────────────────────────────────
function buildTeam(idx: number, p: typeof MAJOR) {
  return {
    id: `team-${idx}`,
    tournamentId: TID,
    teamIndex: idx,
    teamName: p.steamName === "/" ? p.fullName : p.steamName,
    captainUid: p.uid,
    bracket: p.dotaBracket,
    avgMMR: p.dotaMMR ?? 0,
    totalMMR: p.dotaMMR ?? 0,
    avgRankTier: p.dotaRankTier,
    avgSkillLevel: 0,
    roleCoverage: { safe_lane: true, mid: true, off_lane: true, soft_support: true, hard_support: true },
    members: [{
      uid: p.uid,
      fullName: p.fullName,
      steamName: p.steamName,
      steamId: p.steamId,
      steamAvatar: p.steamAvatar,
      discordId: p.discordId,
      discordUsername: p.discordUsername,
      dotaRankTier: p.dotaRankTier,
      dotaBracket: p.dotaBracket,
      dotaMMR: 0,
      iesportsRank: p.dotaBracket,
      iesportsTier: p.dotaRankTier,
      iesportsRating: 0,
      skillLevel: 0,
      rolePreferences: ["mid"],
      assignedRole: "mid",
      assignedRoleLabel: "Mid",
    }],
  };
}

// ── Match (1 BO1 between the two teams) ─────────────────────────────────────
function buildMatch(team1: ReturnType<typeof buildTeam>, team2: ReturnType<typeof buildTeam>) {
  return {
    id: "r1-match-1",
    tournamentId: TID,
    team1Id: team1.id,
    team2Id: team2.id,
    team1Name: team1.teamName,
    team2Name: team2.teamName,
    team1Logo: "",
    team2Logo: "",
    team1Score: 0,
    team2Score: 0,
    bestOf: 1,
    matchDay: 1,
    matchIndex: 1,
    isBracket: false,
    status: "pending",
    scheduledTime: new Date(Date.now() + 60 * 60_000).toISOString(),  // 1hr out
    createdAt: new Date().toISOString(),
  };
}

// ── Discord channel creation ────────────────────────────────────────────────
const DISCORD_API = "https://discord.com/api/v10";
const PERMS = {
  VIEW_CHANNEL:         1 << 10,
  SEND_MESSAGES:        1 << 11,
  EMBED_LINKS:          1 << 14,
  ATTACH_FILES:         1 << 15,
  READ_MESSAGE_HISTORY: 1 << 16,
  ADD_REACTIONS:        1 << 6,
};
const MEMBER_ALLOW = (
  PERMS.VIEW_CHANNEL | PERMS.SEND_MESSAGES | PERMS.EMBED_LINKS |
  PERMS.ATTACH_FILES | PERMS.READ_MESSAGE_HISTORY | PERMS.ADD_REACTIONS
).toString();

async function ensureDiscordChannel(existingId: string | null) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_SERVER_ID;
  if (!botToken || !guildId) {
    console.error("\n❌ DISCORD_BOT_TOKEN / DISCORD_SERVER_ID missing — cannot create channel.");
    return null;
  }

  if (existingId && !FORCE_CHANNEL) {
    console.log(`\nDiscord channel already exists: ${existingId} — skip (pass --force-channel to recreate).`);
    return existingId;
  }

  const channelName = "dota-test-major-shrey";
  // Member list: only Major + Shrey. @everyone is denied VIEW so no one
  // else (not even other admins) can see this channel. The bot itself
  // can post because it owns the channel via guild perms / role.
  const overwrites = [
    { id: guildId, type: 0, allow: "0", deny: PERMS.VIEW_CHANNEL.toString() },  // @everyone deny
    { id: MAJOR.discordId, type: 1, allow: MEMBER_ALLOW, deny: "0" },
    { id: SHREY.discordId, type: 1, allow: MEMBER_ALLOW, deny: "0" },
  ];

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: channelName,
      type: 0,  // text
      topic: "Internal Dota dry-run channel — visible only to Major + Shrey + bot. All admin-panel-driven comms for the test tournament land here.",
      permission_overwrites: overwrites,
    }),
  });
  if (!res.ok) {
    console.error(`❌ Discord create channel failed ${res.status}: ${await res.text()}`);
    return null;
  }
  const ch = await res.json();
  console.log(`\n✅ Discord channel created: #${ch.name}  (id=${ch.id})`);

  // Welcome message — wraps the test scope so neither participant wonders
  // why they suddenly have a new private channel.
  const intro = [
    `# 🧪 Dota internal test`,
    ``,
    `<@${MAJOR.discordId}> <@${SHREY.discordId}> — this is the private channel for the **Major vs Shrey** Dota test tournament.`,
    ``,
    `• Tournament page (visible only to you two): https://iesports.in/tournament/${TID}`,
    `• All admin-panel actions for this test (lobby creation, invites, results) will post here.`,
    `• Nothing here counts toward any leaderboard — purely a smoke-test for the Dota pipeline.`,
  ].join("\n");
  await fetch(`${DISCORD_API}/channels/${ch.id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: intro }),
  });
  return ch.id as string;
}

// ── Driver ──────────────────────────────────────────────────────────────────
async function run() {
  console.log(`Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);
  console.log(`Tournament ID: ${TID}\n`);

  console.log("Players whitelisted:");
  for (const p of PLAYERS) {
    console.log(`  • ${p.fullName.padEnd(14)}  uid=${p.uid}  discord=${p.discordUsername} (${p.discordId})`);
  }

  const team1 = buildTeam(1, MAJOR);
  const team2 = buildTeam(2, SHREY);
  const match = buildMatch(team1, team2);

  console.log(`\nTeams:    ${team1.teamName}  vs  ${team2.teamName}`);
  console.log(`Match:    ${match.id}  (BO${match.bestOf}, status=${match.status}, scheduled=${match.scheduledTime})`);

  if (!APPLY) {
    console.log("\n🟡 DRY RUN — pass --apply to write Firestore. Add --with-channel to also create the Discord channel.");
    return;
  }

  const tRef = db.collection("tournaments").doc(TID);
  const batch = db.batch();

  batch.set(tRef, tournamentDoc, { merge: true });

  for (const team of [team1, team2]) {
    batch.set(tRef.collection("teams").doc(team.id), team);
  }

  // Players subcollection (mirrors the shape `/api/tournaments/detail` reads
  // for Dota). Each player doc carries enough to render the registered-list
  // and the team roster card.
  for (const p of PLAYERS) {
    batch.set(tRef.collection("players").doc(p.uid), {
      uid: p.uid,
      fullName: p.fullName,
      steamName: p.steamName,
      steamId: p.steamId,
      steamAvatar: p.steamAvatar,
      discordId: p.discordId,
      discordUsername: p.discordUsername,
      dotaRankTier: p.dotaRankTier,
      dotaBracket: p.dotaBracket,
      dotaMMR: 0,
      rolePreferences: ["mid"],
      registeredAt: new Date().toISOString(),
    });
  }

  batch.set(tRef.collection("matches").doc(match.id), match);

  // Mirror Dota convention: users.registeredTournaments[] gets the TID
  // appended so the player's profile reflects the test registration.
  for (const p of PLAYERS) {
    batch.set(
      db.collection("users").doc(p.uid),
      { registeredTournaments: FieldValue.arrayUnion(TID) },
      { merge: true },
    );
  }

  await batch.commit();
  console.log("\n✅ Wrote tournament + 2 teams + 1 match + 2 players + 2 user registrations.");

  if (WITH_CHANNEL) {
    const existing = (await tRef.get()).data()?.discordChannelId || null;
    const channelId = await ensureDiscordChannel(existing);
    if (channelId) {
      await tRef.update({
        discordChannelId: channelId,
        discordChannelName: "dota-test-major-shrey",
        discordChannelCreatedAt: new Date().toISOString(),
      });
      console.log(`✅ Stored discordChannelId on tournaments/${TID}.`);
    }
  } else {
    console.log("\nℹ️  Skipping Discord channel creation (pass --with-channel to create).");
  }

  console.log("\nDone. Visit https://iesports.in/tournament/" + TID + " while logged in as Major or Shrey.");
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
