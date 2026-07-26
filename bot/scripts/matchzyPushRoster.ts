/**
 * Push registered CS2 players into a self-hosted MAT (MatchZy Auto Tournament)
 * instance's player pool, ready for an admin to build the bracket in MAT's
 * own dashboard. Requires MATCHZY_DATABASE_URL in .env (MAT's Postgres
 * connection string) — will not run without it.
 *
 * Run from /bot:  npx tsx scripts/matchzyPushRoster.ts --tid=<cs2TournamentId>
 */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import { initFirebase } from "../src/services/firebase";
import { pushCS2Roster, closeMatchzyPool } from "../src/services/matchzy";

const arg = (k: string) => (process.argv.find(a => a.startsWith(`--${k}=`)) || "").split("=")[1];
const TID = arg("tid");

(async () => {
  if (!TID) { console.error("Usage: npx tsx scripts/matchzyPushRoster.ts --tid=<cs2TournamentId>"); process.exit(1); }
  initFirebase();
  const { pushed, skipped } = await pushCS2Roster(TID);
  console.log(`Pushed ${pushed} player(s) into MAT, skipped ${skipped} (missing steamId).`);
  await closeMatchzyPool();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
