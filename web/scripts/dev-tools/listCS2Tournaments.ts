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
  const snap = await db.collection("cs2Tournaments").get();
  console.log(`Found ${snap.size} CS2 tournaments:`);
  for (const d of snap.docs) {
    const t = d.data();
    console.log(`  ${d.id}  | name="${t.name}"  | startDate=${t.startDate}  | endDate=${t.endDate}  | regDeadline=${t.registrationDeadline}  | status=${t.status}  | format=${t.format}`);
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
