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
const TID = "domin8-ultimate-tilt-proof-tournament";
const APPLY = process.argv.includes("--apply");
(async () => {
  const m = db.collection("tournaments").doc(TID).collection("matches");
  const a = (await m.doc("r3-match-1").get()).data() as any;
  const b = (await m.doc("r2-match-5").get()).data() as any;
  console.log("Current:");
  console.log(`  r3-match-1: ${a.scheduledTime}  ${a.team1Name} vs ${a.team2Name}`);
  console.log(`  r2-match-5: ${b.scheduledTime}  ${b.team1Name} vs ${b.team2Name}`);
  console.log("\nAfter swap:");
  console.log(`  r3-match-1: ${b.scheduledTime}  ${a.team1Name} vs ${a.team2Name}`);
  console.log(`  r2-match-5: ${a.scheduledTime}  ${b.team1Name} vs ${b.team2Name}`);
  if (APPLY) {
    await m.doc("r3-match-1").set({ scheduledTime: b.scheduledTime }, { merge: true });
    await m.doc("r2-match-5").set({ scheduledTime: a.scheduledTime }, { merge: true });
    console.log("\nApplied.");
  } else {
    console.log("\nDry-run only.");
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
