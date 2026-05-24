/**
 * Test the bot's GC by fetching a known-good match ID alongside ours.
 * If the historical Domin8 match (8813888349) also returns result=15,
 * the bot's GC is broken in general. If it returns valid data, the
 * problem is specific to our recent test matches.
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
const db = getFirestore();
(async () => {
  // Trigger result job on Domin8 tournament — known good matchIds
  const ref = await db.collection("dotaResultJobs").add({
    tournamentId: "domin8-ultimate-tilt-proof-tournament",
    status: "pending",
    apply: false,                    // don't actually write — just diagnose
    forcedMatchIds: ["8813888349"],  // known good from memory
    createdAt: new Date().toISOString(),
    createdBy: "diagnostic",
  });
  console.log(`Sent diagnostic job: ${ref.id}`);
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const d = (await ref.get()).data() as any;
    if (d.status === "done" || d.status === "error") {
      console.log(`\nstatus=${d.status}`);
      if (d.report) {
        console.log(`resolved=${d.report.resolved.length}  unresolved=${d.report.unresolved.length}  candidates=${d.report.candidatesTried}`);
        for (const r of d.report.resolved) console.log(`  ✓ ${r.tournamentMatchId} → ${r.winnerName} (overlap ${r.overlap}/10)`);
      }
      if (d.logs) {
        console.log("\nLogs (key lines):");
        for (const l of d.logs) {
          if (l.includes("result=") || l.includes("dota 8813") || l.includes("Pre-bound") || l.includes("iesportsbot steam32")) {
            console.log(`  ${l}`);
          }
        }
      }
      return;
    }
  }
  console.log("⚠️ timed out");
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
