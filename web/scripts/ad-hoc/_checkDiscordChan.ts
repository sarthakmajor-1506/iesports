import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
const cid = "1507408605593206844";
const tok = process.env.DISCORD_BOT_TOKEN;
(async () => {
  const r = await fetch(`https://discord.com/api/v10/channels/${cid}`, { headers: { Authorization: `Bot ${tok}` } });
  console.log(`channel fetch: HTTP ${r.status}`);
  if (r.ok) { const d = await r.json() as any; console.log(`  name: ${d.name}, guild: ${d.guild_id}, type: ${d.type}`); }
  else console.log(`  ${await r.text()}`);
  const sendRes = await fetch(`https://discord.com/api/v10/channels/${cid}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bot ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: "test from setLobby diag script — feel free to delete" }),
  });
  console.log(`POST test message: HTTP ${sendRes.status}`);
  if (!sendRes.ok) console.log(`  ${await sendRes.text()}`);
  process.exit(0);
})();
