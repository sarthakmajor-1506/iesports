/**
 * Create a private Discord channel for a CS2 tournament and route that
 * tournament's messages to it.
 *
 * Results were going to RESULTS_CHANNEL_ID — the shared channel the Valorant
 * flow uses — which for the Royal Sports League returned "Unknown Channel
 * (10003)", so every result announcement silently failed. `discordChannelId`
 * on the tournament doc overrides that fallback (see getCS2ResultsChannelId in
 * web/lib/discord.ts), and this script creates the channel and sets it.
 *
 * Membership is everyone registered for the tournament plus whoever is named
 * with --extra. The channel denies @everyone and grants each member
 * explicitly, so it is visible only to the people actually playing.
 *
 * A registrant who is not in the Discord server is reported rather than
 * skipped silently: they will not see the channel, and finding that out from
 * a player asking why they got no fixtures is worse than reading it here.
 *
 * Dry run by default:
 *   npx tsx scripts/createCS2TournamentChannel.ts
 *   npx tsx scripts/createCS2TournamentChannel.ts --apply
 *   npx tsx scripts/createCS2TournamentChannel.ts --name=royal-sports-league --apply
 *   npx tsx scripts/createCS2TournamentChannel.ts --extra=760183283182206987,... --apply
 */
import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } from "discord.js";
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
// The bot's own .env may not carry the Firebase service account; the web app's
// always does, and this script is run from a laptop, not the Railway service.
dotenv.config({ path: path.resolve(__dirname, "../../web/.env.local") });

if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
const db = getFirestore(getApp());

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const APPLY = process.argv.includes("--apply");
const TID = arg("tid") || "cs2-royal-sports-league";
const CHANNEL_NAME = arg("name") || "royal-sports-league";
/** Admins and organisers who are not registered players. */
const EXTRA = (arg("extra") || "").split(",").map(s => s.trim()).filter(Boolean);

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_SERVER_ID || process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) { console.error("DISCORD_BOT_TOKEN and DISCORD_SERVER_ID required"); process.exit(1); }

  const tref = db.collection("cs2Tournaments").doc(TID);
  const [tSnap, spSnap, usersSnap] = await Promise.all([
    tref.get(), tref.collection("soloPlayers").get(), db.collection("users").get(),
  ]);
  if (!tSnap.exists) { console.error(`tournament ${TID} not found`); process.exit(1); }
  const tournament: any = tSnap.data();
  const umap = new Map(usersSnap.docs.map(d => [d.id, d.data() as any]));

  // uids are "discord_<id>" for Discord-created accounts, but a phone-first
  // account carries the id in users/{uid}.discordId instead — read both.
  const wanted = new Map<string, string>(); // discordId -> label
  for (const d of spSnap.docs) {
    const u: any = umap.get(d.id) || {};
    const did = u.discordId || (d.id.startsWith("discord_") ? d.id.slice("discord_".length) : "");
    const label = u.fullName || (d.data() as any).steamName || d.id;
    if (did) wanted.set(String(did), label);
    else console.log(`  !! ${label} (${d.id}) has no Discord account — cannot be given access`);
  }
  for (const e of EXTRA) {
    const byId = usersSnap.docs.find(d => String((d.data() as any).discordId) === e || d.id === `discord_${e}`);
    const u: any = byId?.data();
    wanted.set(e, u ? `${u.fullName || u.discordUsername} (organiser)` : `${e} (organiser)`);
  }

  console.log(`=== ${TID} — "${tournament.name}" ===`);
  console.log(`channel: #${CHANNEL_NAME}   members: ${wanted.size}`);
  console.log(`current discordChannelId: ${tournament.discordChannelId || "unset (falls back to RESULTS_CHANNEL_ID)"}`);

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  await client.login(token);
  const guild = await client.guilds.fetch(guildId);
  const members = await guild.members.fetch();

  const present: string[] = [];
  const absent: string[] = [];
  for (const [did, label] of wanted) (members.has(did) ? present : absent).push(`${label} [${did}]`);

  console.log(`\nin the Discord server (${present.length}):`);
  present.forEach(p => console.log(`  ✓ ${p}`));
  if (absent.length) {
    console.log(`\nNOT in the Discord server (${absent.length}) — they will not see the channel:`);
    absent.forEach(p => console.log(`  ✗ ${p}`));
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing created. Re-run with --apply.`);
    await client.destroy();
    return;
  }

  const channel = await guild.channels.create({
    name: CHANNEL_NAME,
    type: ChannelType.GuildText,
    topic: `${tournament.name} — fixtures, results and standings. Auto-posted by IEsports.`,
    permissionOverwrites: [
      // Private by default; every member is granted explicitly below.
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
      ...[...wanted.keys()].filter(id => members.has(id)).map(id => ({
        id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages],
      })),
    ],
  });
  console.log(`\ncreated #${channel.name} (${channel.id})`);

  // This is what actually stops results going to the Valorant channel.
  await tref.set({ discordChannelId: channel.id }, { merge: true });
  console.log(`tournament.discordChannelId = ${channel.id}`);

  await channel.send([
    `**${tournament.name}** — this is the channel for this tournament.`,
    `Match results, standings and announcements are posted here automatically.`,
    ``,
    `Live page: https://www.iesports.in/cs2/tournament/${TID}`,
  ].join("\n"));

  await client.destroy();
  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
