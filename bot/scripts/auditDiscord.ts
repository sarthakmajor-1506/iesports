/**
 * Read-only audit of the Discord server.
 *
 * Answers the questions that decide a restructure: what channels exist, who can
 * actually see each one, and which are dead. "Last message" is the important
 * column — a channel nobody has posted in for months is clutter regardless of
 * how sensible its name is.
 */
import { Client, GatewayIntentBits, ChannelType, PermissionsBitField } from "discord.js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../web/.env.local") });

const createdAt = (id: string) => new Date(Number(BigInt(id) >> 22n) + 1420070400000);
const ago = (d?: Date | null) => {
  if (!d) return "never";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return days === 0 ? "today" : days === 1 ? "1d" : `${days}d`;
};

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_SERVER_ID || process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) { console.error("need DISCORD_BOT_TOKEN + DISCORD_SERVER_ID"); process.exit(1); }

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  await client.login(token);
  const guild = await client.guilds.fetch(guildId);
  await guild.roles.fetch();
  const channels = await guild.channels.fetch();

  console.log(`\n=== ${guild.name} · ${guild.memberCount} members ===\n`);

  // ── roles ──────────────────────────────────────────────────────────────
  console.log("ROLES");
  const members = await guild.members.fetch().catch(() => null);
  const roles = [...guild.roles.cache.values()].sort((a, b) => b.position - a.position);
  for (const r of roles) {
    if (r.name === "@everyone") { console.log(`  @everyone`); continue; }
    const count = members ? members.filter(m => m.roles.cache.has(r.id)).size : r.members.size;
    const admin = r.permissions.has(PermissionsBitField.Flags.Administrator) ? " [ADMIN]" : "";
    const bot = r.managed ? " (bot/integration)" : "";
    console.log(`  ${String(count).padStart(4)} members  ${r.name}${admin}${bot}`);
  }

  // ── channels by category ───────────────────────────────────────────────
  const all = [...channels.values()].filter(Boolean) as any[];
  const cats = all.filter(c => c.type === ChannelType.GuildCategory).sort((a, b) => a.position - b.position);
  const orphans = all.filter(c => c.type !== ChannelType.GuildCategory && !c.parentId);

  const everyoneId = guild.roles.everyone.id;

  const describe = async (c: any, indent = "    ") => {
    const kind = c.type === ChannelType.GuildVoice ? "voice"
      : c.type === ChannelType.GuildForum ? "forum"
      : c.type === ChannelType.GuildAnnouncement ? "news" : "text";

    // Who can see it?
    const ov = c.permissionOverwrites?.cache;
    const everyoneOv = ov?.get(everyoneId);
    const hiddenFromEveryone = everyoneOv?.deny?.has(PermissionsBitField.Flags.ViewChannel);
    const allowedRoles = ov ? [...ov.values()]
      .filter((o: any) => o.type === 0 && o.id !== everyoneId && o.allow.has(PermissionsBitField.Flags.ViewChannel))
      .map((o: any) => guild.roles.cache.get(o.id)?.name).filter(Boolean) : [];
    const vis = hiddenFromEveryone ? (allowedRoles.length ? `PRIVATE → ${allowedRoles.join(", ")}` : "PRIVATE") : "public";

    // Can @everyone talk?
    const everyoneCanSend = !everyoneOv?.deny?.has(PermissionsBitField.Flags.SendMessages);

    let last: Date | null = null;
    let msgs = "";
    if (kind === "text" || kind === "news") {
      try {
        const fetched = await c.messages.fetch({ limit: 1 });
        const m = fetched.first();
        last = m ? m.createdAt : null;
        msgs = last ? `last ${ago(last)}` : "EMPTY";
      } catch { msgs = "no access"; }
    } else if (kind === "voice") {
      msgs = `${c.members?.size || 0} connected`;
    }

    console.log(`${indent}${kind.padEnd(5)} ${vis.padEnd(34)} ${msgs.padEnd(12)} ${everyoneCanSend && kind !== "voice" ? "everyone-can-post" : ""}  #${c.name}`);
  };

  console.log(`\nCHANNELS (${all.filter(c => c.type !== ChannelType.GuildCategory).length} total, ${cats.length} categories)\n`);
  for (const cat of cats) {
    const kids = all.filter(c => c.parentId === cat.id).sort((a, b) => a.position - b.position);
    console.log(`  ▸ ${cat.name}  (${kids.length})`);
    for (const c of kids) await describe(c);
    console.log("");
  }
  if (orphans.length) {
    console.log(`  ▸ (no category)  (${orphans.length})`);
    for (const c of orphans) await describe(c);
  }

  await client.destroy();
}
main().catch(e => { console.error(e); process.exit(1); });
