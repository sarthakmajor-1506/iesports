/**
 * List — and optionally delete — voice channels in the Discord server.
 *
 * The match-lobby flow creates a voice channel per match, and an event night
 * leaves dozens behind. Deleting a channel is irreversible, so this lists by
 * default and only ever deletes what is named explicitly or matched by an
 * explicit filter.
 *
 * Creation time comes from the channel's snowflake, so "created yesterday" is
 * exact rather than inferred from the name.
 *
 * Anyone still connected is reported and the channel skipped unless --force —
 * deleting an occupied voice channel disconnects people mid-conversation.
 *
 *   npx tsx scripts/cleanupVoiceChannels.ts                       # list everything
 *   npx tsx scripts/cleanupVoiceChannels.ts --since=2026-07-31    # list ones created on/after
 *   npx tsx scripts/cleanupVoiceChannels.ts --since=2026-07-31 --keep=dota,valorant --apply
 *   npx tsx scripts/cleanupVoiceChannels.ts --ids=123,456 --apply
 */
import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../web/.env.local") });

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const SINCE = arg("since") ? new Date(arg("since")!) : null;
const KEEP = (arg("keep") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const IDS = (arg("ids") || "").split(",").map(s => s.trim()).filter(Boolean);

/** Discord snowflake → creation time (epoch 2015-01-01). */
const createdAt = (id: string) => new Date(Number(BigInt(id) >> 22n) + 1420070400000);

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_SERVER_ID || process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) { console.error("DISCORD_BOT_TOKEN and DISCORD_SERVER_ID required"); process.exit(1); }

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  await client.login(token);
  const guild = await client.guilds.fetch(guildId);
  const channels = await guild.channels.fetch();

  const voice = [...channels.values()]
    .filter((c): c is NonNullable<typeof c> => !!c && (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice))
    .sort((a, b) => createdAt(a.id).getTime() - createdAt(b.id).getTime());

  console.log(`=== ${voice.length} voice channels in "${guild.name}" ===\n`);
  const doomed: typeof voice = [];

  for (const c of voice) {
    const made = createdAt(c.id);
    const parent = c.parent?.name || "—";
    const occupied = (c as any).members?.size || 0;
    const keptByName = KEEP.some(k => c.name.toLowerCase().includes(k) || parent.toLowerCase().includes(k));
    const inWindow = !SINCE || made >= SINCE;
    const targeted = IDS.length ? IDS.includes(c.id) : (inWindow && !keptByName && (KEEP.length > 0 || IDS.length > 0));

    const flag = targeted ? (occupied && !FORCE ? "SKIP (occupied)" : "DELETE") : keptByName ? "keep (name)" : inWindow ? "—" : "keep (older)";
    console.log(`  ${flag.padEnd(16)} ${c.id}  ${made.toISOString().slice(0, 16).replace("T", " ")}  [${parent}]  ${c.name}${occupied ? `  (${occupied} connected)` : ""}`);
    if (targeted && (!occupied || FORCE)) doomed.push(c);
  }

  if (!KEEP.length && !IDS.length) {
    console.log(`\nListing only. Pass --keep=dota,valorant (with --since=) or --ids= to select what to delete.`);
    await client.destroy();
    return;
  }

  console.log(`\n${doomed.length} channel(s) selected for deletion.`);
  if (!APPLY) { console.log("DRY RUN — nothing deleted. Re-run with --apply."); await client.destroy(); return; }

  for (const c of doomed) {
    try { await c.delete("CS2 event cleanup"); console.log(`  deleted ${c.name}`); }
    catch (e: any) { console.log(`  FAILED ${c.name}: ${e?.message || e}`); }
  }
  await client.destroy();
  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
