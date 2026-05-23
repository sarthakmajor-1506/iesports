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
  const tid = "cs2-prelims-april-2026";
  const doc = await db.collection("cs2Tournaments").doc(tid).get();
  console.log(`Tournament ${tid}:`);
  console.log(JSON.stringify(doc.data(), null, 2));
  const matches = await db.collection("cs2Tournaments").doc(tid).collection("matches").get();
  console.log(`\nMatches (${matches.size}):`);
  for (const m of matches.docs) {
    const d = m.data();
    console.log(`  ${m.id}: scheduledTime=${d.scheduledTime}  status=${d.status}  ${d.team1Name || "?"} vs ${d.team2Name || "?"}`);
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
