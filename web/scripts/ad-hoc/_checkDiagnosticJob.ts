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
  const snap = await db.collection("dotaResultJobs").orderBy("createdAt", "desc").limit(3).get();
  for (const d of snap.docs) {
    const j: any = d.data();
    console.log(`${d.id}  status=${j.status}  tid=${j.tournamentId}  createdAt=${j.createdAt}`);
    if (j.logs) for (const l of j.logs.slice(-15)) console.log(`  ${l}`);
    console.log("");
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
