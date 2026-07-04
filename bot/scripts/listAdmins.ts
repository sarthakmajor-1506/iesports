/**
 * READ-ONLY diagnostic: list every role with Administrator permission on the
 * iesports Discord server, and which members hold each one. Makes no changes.
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/bot/.env" });
import { Client, GatewayIntentBits, PermissionsBitField } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once("ready", async () => {
  try {
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
    await guild.members.fetch();
    const adminRoles = guild.roles.cache.filter(r => r.permissions.has(PermissionsBitField.Flags.Administrator));

    console.log(`Guild: ${guild.name} (${guild.id})\n`);
    console.log("=== Roles with Administrator permission ===");
    for (const role of adminRoles.values()) {
      const members = guild.members.cache.filter(m => m.roles.cache.has(role.id));
      console.log(`\nRole: ${role.name} (${role.id}) — ${members.size} member(s)`);
      for (const m of members.values()) {
        console.log(`  - ${m.user.tag} (${m.user.id})${m.user.bot ? " [BOT]" : ""}`);
      }
    }

    console.log("\n=== Members with Administrator via any role (deduped) ===");
    const seen = new Set<string>();
    for (const m of guild.members.cache.values()) {
      if (m.permissions.has(PermissionsBitField.Flags.Administrator) && !seen.has(m.id)) {
        seen.add(m.id);
        console.log(`  - ${m.user.tag} (${m.user.id})${m.user.bot ? " [BOT]" : ""}`);
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
