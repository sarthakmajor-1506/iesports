import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
const API = "https://discord.com/api/v10";
const TOKEN = process.env.DISCORD_BOT_TOKEN!;
const GUILD = process.env.DISCORD_SERVER_ID || process.env.DISCORD_GUILD_ID!;
const SHREY = "746803954767364147";
const H = { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" };
(async () => {
  if (!TOKEN || !GUILD) { console.error("missing token/guild"); process.exit(1); }
  // Reuse an existing Administrator role if one is assignable, else create one.
  const roles = await (await fetch(`${API}/guilds/${GUILD}/roles`, { headers: H })).json();
  const ADMIN_BIT = BigInt(8);
  const adminRole = (roles as any[]).find(r =>
    (BigInt(r.permissions) & ADMIN_BIT) === ADMIN_BIT && !r.managed && r.name !== "@everyone");
  let roleId: string, roleName: string;
  if (adminRole) {
    roleId = adminRole.id; roleName = adminRole.name;
    console.log(`Found existing admin role: ${roleName} (${roleId})`);
  } else {
    const res = await fetch(`${API}/guilds/${GUILD}/roles`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "Caster — All Access", permissions: "8", color: 0xf0b132, hoist: true, mentionable: false }),
    });
    if (!res.ok) { console.error("create role failed:", res.status, await res.text()); process.exit(1); }
    const r = await res.json(); roleId = r.id; roleName = r.name;
    console.log(`Created role: ${roleName} (${roleId})`);
  }
  const put = await fetch(`${API}/guilds/${GUILD}/members/${SHREY}/roles/${roleId}`, { method: "PUT", headers: H });
  if (put.ok) console.log(`✅ Assigned "${roleName}" to Shrey (${SHREY}) — he can now see ALL channels.`);
  else { console.error("assign failed:", put.status, await put.text()); process.exit(1); }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
