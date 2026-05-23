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
  const TID = "domin8-ultimate-tilt-proof-tournament";
  const lb = await db.collection("tournaments").doc(TID).collection("leaderboard").limit(3).get();
  console.log(`leaderboard size: ${lb.size}`);
  for (const d of lb.docs) {
    console.log(`\n${d.id}:`);
    console.log(JSON.stringify(d.data(), null, 2));
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
