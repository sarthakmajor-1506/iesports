/**
 * Enqueue a `dotaResultJobs` doc so the Railway bot resolves a Dota
 * tournament's outstanding matches from its GC match history.
 *
 *   npx tsx scripts/enqueueDotaResultFetch.ts                   # dota-test-major-shrey
 *   npx tsx scripts/enqueueDotaResultFetch.ts --tid=<id>        # any tournament
 *   npx tsx scripts/enqueueDotaResultFetch.ts --matchid=NNNNN   # also force a specific dota match
 *
 * After enqueue, polls the doc until status flips to "done" / "error"
 * (or 5min timeout) and prints the report.
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();

const arg = (k: string) => (process.argv.find(a => a.startsWith(`--${k}=`)) || "").split("=")[1];
const TID = arg("tid") || "dota-test-major-shrey";
const FORCED = process.argv.filter(a => a.startsWith("--matchid=")).map(a => a.split("=")[1]);

const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 5 * 60_000;

async function run() {
  console.log(`Enqueueing dotaResultJobs for ${TID}...`);
  if (FORCED.length) console.log(`Forced dota match ids: ${FORCED.join(", ")}`);

  const ref = await db.collection("dotaResultJobs").add({
    tournamentId: TID,
    status: "pending",
    apply: true,
    forcedMatchIds: FORCED,
    createdAt: new Date().toISOString(),
    serverCreatedAt: FieldValue.serverTimestamp(),
    createdBy: "scripts/enqueueDotaResultFetch.ts",
  });
  console.log(`✓ Created dotaResultJobs/${ref.id}\n`);

  console.log("Polling for completion (bot cron ticks every minute)...");
  const start = Date.now();
  let lastStatus = "";
  while (Date.now() - start < TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const snap = await ref.get();
    const data = snap.data() as any;
    if (!data) { console.log("  doc disappeared — abort"); return; }
    if (data.status !== lastStatus) {
      lastStatus = data.status;
      console.log(`  [${new Date().toISOString()}] status=${data.status}`);
    }
    if (data.status === "done" || data.status === "error") {
      console.log("\n=== JOB RESULT ===");
      if (data.error) console.log(`error: ${data.error}`);
      if (data.report) {
        const r = data.report;
        console.log(`resolved   : ${r.resolved.length}`);
        console.log(`unresolved : [${r.unresolved.join(", ") || "—"}]`);
        console.log(`candidates : ${r.candidatesTried}`);
        console.log(`written    : ${r.written}`);
        for (const x of r.resolved) {
          console.log(`  • ${x.tournamentMatchId} ← dota ${x.dotaMatchId} : ${x.winnerName} (ov ${x.overlap}, ${Math.round(x.durationSec/60)}m)`);
        }
      }
      if (data.logs) {
        console.log("\n--- logs (tail) ---");
        for (const l of data.logs.slice(-40)) console.log("  " + l);
      }
      return;
    }
  }
  console.log("\n⚠️  Timed out after 5min. Check Firestore manually: dotaResultJobs/" + ref.id);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
