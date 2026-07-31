/**
 * Pre-event RCON check for every configured CS2 server.
 *
 * Answers the three questions that actually block a match night, in the order
 * they bite: does the host/port accept a connection, does the password
 * authenticate, and is MatchZy loaded. A server that answers `status` but has
 * no MatchZy is the nastiest of the three — everything looks fine until
 * `matchzy_loadmatch_url` silently does nothing.
 *
 * Reads CS2_RCON_* / CS2_RCON_*_2 from the bot's .env, or takes one server
 * inline (useful the moment someone pastes new credentials into WhatsApp,
 * before they are added to Railway):
 *
 *   npx tsx scripts/pingCS2Servers.ts
 *   npx tsx scripts/pingCS2Servers.ts --host=1.2.3.4 --port=27021 --password=xxx
 */
import * as dotenv from "dotenv";
import * as path from "path";
import { rconExec, cs2ServersFromEnv, parseStatus, type CS2ServerDef } from "../src/services/cs2-rcon";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const arg = (name: string): string | undefined =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function check(def: CS2ServerDef): Promise<boolean> {
  console.log(`\n=== ${def.label} — ${def.host}:${def.port} ===`);

  const st = await rconExec(["status"], def);
  if (!st.ok) {
    console.log(`  ✗ ${st.error}`);
    return false;
  }
  const s = parseStatus(st.output);
  console.log(`  ✓ rcon ok   hostname="${s.hostname || "?"}"  map=${s.map || "?"}  players=${s.humans ?? "?"}/${s.maxPlayers ?? "?"}`);

  const plugins = await rconExec(["css_plugins list"], def);
  const hasMatchZy = /matchzy/i.test(plugins.output || "");
  console.log(`  ${hasMatchZy ? "✓" : "✗"} MatchZy ${hasMatchZy ? "loaded" : "NOT found — matchzy_loadmatch_url will do nothing"}`);
  if (plugins.output) {
    plugins.output.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 12)
      .forEach(l => console.log(`      ${l}`));
  }
  return hasMatchZy;
}

async function main() {
  const host = arg("host");
  const defs: CS2ServerDef[] = host
    ? [{ id: arg("id") || "adhoc", label: "inline", host, port: Number(arg("port") || 27015), password: arg("password") || "" }]
    : cs2ServersFromEnv();

  if (!defs.length) {
    console.log("No servers configured. Set CS2_RCON_HOST / CS2_RCON_PASSWORD (and the _2 pair for the second server), or pass --host/--port/--password.");
    process.exit(1);
  }

  const results = await Promise.all(defs.map(check));
  console.log(`\n${results.filter(Boolean).length}/${defs.length} server(s) ready.`);
  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
