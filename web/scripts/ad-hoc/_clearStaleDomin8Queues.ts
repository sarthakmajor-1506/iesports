import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
})});
const db = getFirestore();
const DOMIN8 = "domin8-ultimate-tilt-proof-tournament";
(async () => {
  const qs = await db.collection("botQueues").where("tournamentId", "==", DOMIN8).get();
  let touched = 0;
  for (const q of qs.docs) {
    const qd = q.data() as any;
    if (qd.status === "in_progress" || qd.status === "pending" || qd.status === "open") {
      if (qd.dotaMatchId) {
        await q.ref.set({ status: "completed", completedAt: new Date().toISOString(), cleanupNote: "auto-marked-completed; had dotaMatchId" }, { merge: true });
        console.log(`  ✓ ${q.id}: in_progress → completed (had dotaMatchId)`);
      } else {
        await q.ref.set({ status: "cancelled", cancelledAt: new Date().toISOString(), cancelledReason: "preflight: stale, no dotaMatchId" }, { merge: true });
        console.log(`  ✓ ${q.id}: → cancelled`);
      }
      touched++;
    }
  }
  console.log(`\nCleaned ${touched} stale Domin8 queues.`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
