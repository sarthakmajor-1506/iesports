/**
 * Create a private text channel in the iesports Discord server for a Dota 2
 * tournament. Channel name = sanitized tournament name. Members = registered
 * players (looked up from users.registeredTournaments[]) + the 3 admins
 * (shrey, major, shay).
 *
 * Idempotent at the Firestore level: stores result on
 * `tournaments/{id}.discordChannelId` and won't recreate if already set
 * unless --force is passed.
 *
 * Usage:
 *   npx tsx scripts/createDotaTournamentTextChannel.ts                # dry run
 *   npx tsx scripts/createDotaTournamentTextChannel.ts --create       # actually create
 *   npx tsx scripts/createDotaTournamentTextChannel.ts --create --force
 *   npx tsx scripts/createDotaTournamentTextChannel.ts --tid=<id> ... # different tournament
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
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

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (k: string) => args.includes(k);
const argv = (k: string) => {
  const a = args.find((x) => x.startsWith(k + "="));
  return a ? a.slice(k.length + 1) : undefined;
};

const TID = argv("--tid") || "domin8-ultimate-tilt-proof-tournament";
const DO_CREATE = flag("--create");
const FORCE = flag("--force");

// ─── Constants ───────────────────────────────────────────────────────────────
const ADMIN_IDS: { id: string; label: string }[] = [
  { id: "746803954767364147",  label: "shrey8169 (Shrey Jain)" },
  { id: "760183283182206987",  label: "bubble_subu (Shay)" },
  { id: "1302366375263735808", label: "major1506_31908 (Sarthak)" },
];

const PERMS = {
  VIEW_CHANNEL: 1 << 10,
  SEND_MESSAGES: 1 << 11,
  EMBED_LINKS: 1 << 14,
  ATTACH_FILES: 1 << 15,
  READ_MESSAGE_HISTORY: 1 << 16,
  ADD_REACTIONS: 1 << 6,
  MENTION_EVERYONE: 1 << 17,
};

const MEMBER_ALLOW = (
  PERMS.VIEW_CHANNEL | PERMS.SEND_MESSAGES | PERMS.EMBED_LINKS |
  PERMS.ATTACH_FILES | PERMS.READ_MESSAGE_HISTORY | PERMS.ADD_REACTIONS
).toString();

const DISCORD_API = "https://discord.com/api/v10";

/** Discord channel-name rules: lowercase, no spaces (→ dash), ≤100 chars.
 *  Also collapses repeated dashes (e.g. "Foo - Bar" → "foo-bar" not "foo---bar")
 *  and trims them from the ends. */
function sanitizeName(raw: string): string {
  return raw.toLowerCase().trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

async function main() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_SERVER_ID;
  if (!botToken || !guildId) {
    console.error("❌ DISCORD_BOT_TOKEN or DISCORD_SERVER_ID missing");
    process.exit(1);
  }

  const db = getFirestore();
  const tDoc = await db.collection("tournaments").doc(TID).get();
  if (!tDoc.exists) {
    console.error(`❌ tournaments/${TID} not found`);
    process.exit(1);
  }
  const tData = tDoc.data() as any;
  const name = sanitizeName(tData.name || TID);
  console.log(`Tournament: ${tData.name}  (status=${tData.status})`);
  console.log(`Channel name will be: #${name}`);

  if (tData.discordChannelId && !FORCE) {
    console.log(`\n⚠️  Tournament already has discordChannelId = ${tData.discordChannelId}`);
    console.log(`    Pass --force to recreate (this will create a second channel).`);
    if (DO_CREATE) process.exit(1);
  }

  // ─── Resolve registered players ────────────────────────────────────────────
  // 5v5 tournaments use users.registeredTournaments[]
  const usersSnap = await db.collection("users").where("registeredTournaments", "array-contains", TID).get();
  const players: { uid: string; fullName?: string; discordId?: string; discordUsername?: string }[] = [];
  usersSnap.forEach((u) => {
    const d = u.data() as any;
    players.push({
      uid: u.id,
      fullName: d.fullName,
      discordId: d.discordId,
      discordUsername: d.discordUsername,
    });
  });
  players.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));

  const withDiscord = players.filter((p) => !!p.discordId);
  const withoutDiscord = players.filter((p) => !p.discordId);

  console.log(`\n━━━ Registered players: ${players.length} ━━━`);
  withDiscord.forEach((p, i) => {
    console.log(`  ${(i + 1).toString().padStart(2)}. ${p.fullName?.padEnd(28) || "(no name)".padEnd(28)} @${p.discordUsername || "?"}  ${p.discordId}`);
  });
  if (withoutDiscord.length > 0) {
    console.log(`\n⚠️  ${withoutDiscord.length} player(s) have NO Discord ID — they will NOT be added:`);
    withoutDiscord.forEach((p) => console.log(`    - ${p.fullName || p.uid}  (${p.uid})`));
  }

  console.log(`\n━━━ Admins (always added) ━━━`);
  ADMIN_IDS.forEach((a) => console.log(`     ${a.label}  ${a.id}`));

  const playerIds = withDiscord.map((p) => p.discordId!);
  const adminIds = ADMIN_IDS.map((a) => a.id);
  const allMemberIds = Array.from(new Set([...playerIds, ...adminIds]));
  console.log(`\nTotal Discord overwrites: ${allMemberIds.length + 1} (members + @everyone)`);

  if (!DO_CREATE) {
    console.log(`\n🟡 Dry run only. Re-run with --create to actually create the channel.`);
    process.exit(0);
  }

  // ─── Create the channel ────────────────────────────────────────────────────
  const overwrites = [
    { id: guildId, type: 0, allow: "0", deny: PERMS.VIEW_CHANNEL.toString() }, // @everyone deny
    ...allMemberIds.map((uid) => ({ id: uid, type: 1, allow: MEMBER_ALLOW, deny: "0" })),
  ];

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      type: 0, // text channel
      topic: `${tData.name} — private comms for registered players + admins.`,
      permission_overwrites: overwrites,
    }),
  });
  if (!res.ok) {
    console.error(`❌ Discord ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const channel = await res.json();
  console.log(`\n✅ Channel created: #${channel.name}  (id=${channel.id})`);

  // ─── Store reference on the tournament doc ────────────────────────────────
  await tDoc.ref.update({
    discordChannelId: channel.id,
    discordChannelName: channel.name,
    discordChannelCreatedAt: new Date().toISOString(),
  });
  console.log(`✅ Updated tournaments/${TID}.discordChannelId`);

  // ─── Post welcome message ─────────────────────────────────────────────────
  const lines = [
    `# 🎮 ${tData.name}`,
    ``,
    `Welcome team — this is your private comms channel for the tournament.`,
    ``,
    `**Admins:** ${ADMIN_IDS.map((a) => `<@${a.id}>`).join(" ")}`,
    `**Players:** ${withDiscord.length}/${players.length} added${withoutDiscord.length > 0 ? ` (${withoutDiscord.length} missing Discord)` : ""}`,
    ``,
    `📎 Tournament page: https://iesports.in/tournament/${TID}`,
    ``,
    `All tournament ops — schedule, lobby info, results — will be coordinated here. 🏆`,
  ];
  const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: lines.join("\n") }),
  });
  if (msgRes.ok) console.log(`✅ Posted welcome message`);
  else console.warn(`⚠️  Welcome message failed: ${msgRes.status} ${await msgRes.text()}`);

  console.log(`\nDone.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
