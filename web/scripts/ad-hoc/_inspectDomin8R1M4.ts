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
  const ref = db.collection("tournaments").doc(TID).collection("matches").doc("r1-match-4");
  const d: any = (await ref.get()).data();
  if (!d) { console.log("not found"); return; }
  console.log(JSON.stringify(d, null, 2));
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
