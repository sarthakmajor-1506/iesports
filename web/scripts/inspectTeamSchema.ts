import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
if (!getApps().length) initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n") }) });
const db = getFirestore();
const TID = "league-of-rising-stars-ascension";

async function run() {
  // List all subcollections under the tournament doc
  const tRef = db.collection("valorantTournaments").doc(TID);
  const subs = await tRef.listCollections();
  console.log("Subcollections:", subs.map(c => c.id).join(", "));

  // Inspect ONE match doc fully (round1-match5 = DJP vs Radiant)
  const m = (await tRef.collection("matches").doc("round1-match5").get()).data() || {};
  console.log("\n──── round1-match5 fields ────");
  console.log(Object.keys(m).sort().join(", "));
  console.log("\nfull doc:");
  console.log(JSON.stringify(m, null, 2));

  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
