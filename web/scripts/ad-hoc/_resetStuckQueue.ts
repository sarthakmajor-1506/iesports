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
const TID = "dota-test-major-shrey";
(async () => {
  const cands = await db.collection("botQueues").get();
  let touched = 0;
  for (const d of cands.docs) {
    const data = d.data() as any;
    if (data.tournamentId === TID) {
      console.log(`  ${d.id}: status=${data.status} createdAt=${data.createdAt} → cancelled`);
      await d.ref.set({ status: "cancelled", cancelledAt: new Date().toISOString(), cancelledReason: "stale-pre-deploy-stuck-queue" }, { merge: true });
      touched++;
    }
  }
  console.log(`\nReset ${touched} stuck queues.`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
