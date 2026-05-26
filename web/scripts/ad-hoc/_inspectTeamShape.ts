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
const TID = "league-of-rising-stars-ascension";
(async () => {
  const t = (await db.collection("valorantTournaments").doc(TID).get()).data() as any;
  console.log("teamCount:", t.teamCount, "playersSnapshotLen:", t.playersSnapshot?.length);
  console.log("bracketTeams:", JSON.stringify(t.bracketTeams)?.slice(0, 500));
  console.log("\n--- playersSnapshot[0]:");
  console.log(JSON.stringify(t.playersSnapshot?.[0] || null, null, 2));
  console.log("\n--- playersSnapshot[1]:");
  console.log(JSON.stringify(t.playersSnapshot?.[1] || null, null, 2));
  // Look for any team-roster field
  for (const k of Object.keys(t).sort()) {
    const v = t[k];
    if (Array.isArray(v) && v.length && typeof v[0] === "object" && (v[0].teamId || v[0].teamName || v[0].members)) {
      console.log(`\n--- field "${k}" length=${v.length}, sample[0]:`);
      console.log(JSON.stringify(v[0], null, 2));
    }
  }
  // Also try a subcollection scan
  const subcols = await db.collection("valorantTournaments").doc(TID).listCollections();
  console.log("\n--- subcollections:", subcols.map(c => c.id));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
