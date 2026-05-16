import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n") }) });
const TID = "domin8-ultimate-tilt-proof-tournament";
(async () => {
  const db = getFirestore();
  const ms = await db.collection("tournaments").doc(TID).collection("matches").get();
  ms.docs.forEach(d => console.log(d.id, "=>", JSON.stringify(d.data())));
  console.log("\n--- one team doc ---");
  const ts = await db.collection("tournaments").doc(TID).collection("teams").limit(1).get();
  ts.docs.forEach(d => console.log(d.id, "=>", JSON.stringify(d.data())));
  process.exit(0);
})();
