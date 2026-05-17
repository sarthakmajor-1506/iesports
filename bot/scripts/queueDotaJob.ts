/**
 * Queue a Dota result-fetch job for the bot to process (it holds the GC).
 * Run from /bot:  npx tsx scripts/queueDotaJob.ts [--tid=<id>] [--matchid=<dota>]...
 */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import { initFirebase } from "../src/services/firebase";

const arg = (k: string) => (process.argv.find(a => a.startsWith(`--${k}=`)) || "").split("=")[1];
const TID = arg("tid") || "domin8-ultimate-tilt-proof-tournament";
const FORCED = process.argv.filter(a => a.startsWith("--matchid=")).map(a => a.split("=")[1]);
if (!FORCED.includes("8813888349")) FORCED.push("8813888349");

(async () => {
  const db = initFirebase();
  const id = `${TID}-${Date.now()}`;
  await db.collection("dotaResultJobs").doc(id).set({
    tournamentId: TID,
    status: "pending",
    apply: true,
    forcedMatchIds: FORCED,
    note: "GC-resolve unresolved Dota matches; screenshot 8813888349 force-included",
    createdAt: new Date().toISOString(),
  });
  const all = await db.collection("dotaResultJobs").get();
  console.log(`queued dotaResultJobs/${id}`);
  console.log("all jobs:", all.docs.map(d => `${d.id}=${d.data().status}`).join(", "));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
