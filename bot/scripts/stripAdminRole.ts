/**
 * Remove the 'Admin' role (1480061162530934896) from every member except
 * major1506_31908 (1302366375263735808), iesportofficial (1475547333595758592),
 * and the iesports bot (1476680900287791124, which also holds admin via its
 * own 'iesports' role regardless). Confirmed with the user before running.
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/bot/.env" });
import { Client, GatewayIntentBits } from "discord.js";

const ADMIN_ROLE_ID = "1480061162530934896";
const KEEP_UIDS = new Set([
  "1302366375263735808", // major1506_31908
  "1475547333595758592", // iesportofficial
  "1476680900287791124", // iesports bot
]);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once("ready", async () => {
  try {
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
    await guild.members.fetch();
    const role = await guild.roles.fetch(ADMIN_ROLE_ID);
    if (!role) { console.error("Admin role not found"); process.exit(1); }

    const toRemove = guild.members.cache.filter(m => m.roles.cache.has(ADMIN_ROLE_ID) && !KEEP_UIDS.has(m.id));

    console.log(`Removing '${role.name}' role from ${toRemove.size} member(s):`);
    for (const m of toRemove.values()) {
      try {
        await m.roles.remove(role);
        console.log(`  ✅ removed from ${m.user.tag} (${m.id})`);
      } catch (e: any) {
        console.log(`  ❌ failed for ${m.user.tag} (${m.id}): ${e.message}`);
      }
    }
    console.log("\nDone. Remaining Admin-role holders:");
    const remaining = guild.members.cache.filter(m => m.roles.cache.has(ADMIN_ROLE_ID) || KEEP_UIDS.has(m.id));
    // re-fetch fresh state
    await guild.members.fetch();
    const after = guild.members.cache.filter(m => m.roles.cache.has(ADMIN_ROLE_ID));
    for (const m of after.values()) console.log(`  - ${m.user.tag} (${m.id})`);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
