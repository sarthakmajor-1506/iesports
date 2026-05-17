/**
 * Standalone Domin8 (or any tournament) Dota result resolver via the GC.
 * Thin wrapper over src/services/dota-results.ts so it shares ONE
 * implementation with the bot's Firestore-triggered job.
 *
 * Run from /bot:
 *   npx tsx scripts/gcFetchDotaResults.ts                         # preview
 *   npx tsx scripts/gcFetchDotaResults.ts --apply                 # write
 *   npx tsx scripts/gcFetchDotaResults.ts --tid=<id> --matchid=8813888349 --apply
 *
 * ⚠️ Takes the iesportsbot GC session. If the Railway bot is live it will win
 *    the single-session fight and this times out — STOP/pause the Railway bot
 *    first, or just use the bot-side job (write a doc to `dotaResultJobs`).
 */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { initFirebase } from "../src/services/firebase";
import { getDotaBot } from "../src/services/dota-gc";
import { resolveDotaResults } from "../src/services/dota-results";

const arg = (k: string) => (process.argv.find(a => a.startsWith(`--${k}=`)) || "").split("=")[1];
const TID = arg("tid") || "domin8-ultimate-tilt-proof-tournament";
const APPLY = process.argv.includes("--apply");
const FORCED = process.argv.filter(a => a.startsWith("--matchid=")).map(a => a.split("=")[1]);
if (!FORCED.includes("8813888349")) FORCED.push("8813888349"); // confirmed from screenshot

async function main() {
  const db = initFirebase();
  console.log(`Resolving Dota results for ${TID} (apply=${APPLY})`);
  console.log("Connecting GC as iesportsbot — disconnects the live Railway bot…\n");
  await getDotaBot().connect();
  const report = await resolveDotaResults(db, {
    tournamentId: TID,
    apply: APPLY,
    forcedMatchIds: FORCED,
    log: (s) => console.log(s),
  });
  console.log("\n=== REPORT ===");
  console.log(`resolved=${report.resolved.length} unresolved=[${report.unresolved.join(", ")}] candidatesTried=${report.candidatesTried} written=${report.written}`);
  for (const r of report.resolved) console.log(`  ${r.tournamentMatchId} ← dota ${r.dotaMatchId} : ${r.winnerName} (ov ${r.overlap}/10, ${Math.round(r.durationSec / 60)}m)`);
  if (!APPLY) console.log("\n🟡 Read-only. Re-run with --apply to write.");
  console.log("⚠️  Restart/redeploy the Railway bot afterward to restore its GC session.");
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
