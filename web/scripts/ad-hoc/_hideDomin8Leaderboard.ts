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
  await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").set(
    { hideLeaderboard: true }, { merge: true },
  );
  console.log("✓ Domin8.hideLeaderboard = true");
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
