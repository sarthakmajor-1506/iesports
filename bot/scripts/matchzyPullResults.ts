/**
 * Mirror MAT's (MatchZy Auto Tournament) current bracket/results into
 * cs2Tournaments/{tid}/teams and .../matches so the existing iesports CS2
 * tournament page renders them. Safe to re-run — every write is an upsert.
 * Requires MATCHZY_DATABASE_URL in .env.
 *
 * Run from /bot:  npx tsx scripts/matchzyPullResults.ts --tid=<cs2TournamentId>
 */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import { initFirebase } from "../src/services/firebase";
import { pullCS2Results, closeMatchzyPool } from "../src/services/matchzy";

const arg = (k: string) => (process.argv.find(a => a.startsWith(`--${k}=`)) || "").split("=")[1];
const TID = arg("tid");

(async () => {
  if (!TID) { console.error("Usage: npx tsx scripts/matchzyPullResults.ts --tid=<cs2TournamentId>"); process.exit(1); }
  initFirebase();
  const { teams, matches } = await pullCS2Results(TID);
  console.log(`Synced ${teams} team(s) and ${matches} match(es) from MAT into cs2Tournaments/${TID}.`);
  await closeMatchzyPool();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
