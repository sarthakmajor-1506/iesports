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
const TID = "league-of-rising-stars-ascension";
(async () => {
  const teams = await db.collection("valorantTournaments").doc(TID).collection("teams").get();
  console.log("subcollection 'teams' size:", teams.size);
  teams.docs.slice(0, 3).forEach(d => {
    console.log("\n--- doc id:", d.id);
    console.log(JSON.stringify(d.data(), null, 2));
  });
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
