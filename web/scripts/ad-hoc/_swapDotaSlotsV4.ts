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
  const matches = db.collection("tournaments").doc(TID).collection("matches");
  const r2m6 = (await matches.doc("r2-match-6").get()).data() as any;
  const r3m1 = (await matches.doc("r3-match-1").get()).data() as any;
  console.log("Current:");
  console.log(`  r2-match-6: ${r2m6.scheduledTime}  ${r2m6.team1Name} vs ${r2m6.team2Name}`);
  console.log(`  r3-match-1: ${r3m1.scheduledTime}  ${r3m1.team1Name} vs ${r3m1.team2Name}`);
  console.log(`\nAfter swap:`);
  console.log(`  r2-match-6: ${r3m1.scheduledTime}  ${r2m6.team1Name} vs ${r2m6.team2Name}`);
  console.log(`  r3-match-1: ${r2m6.scheduledTime}  ${r3m1.team1Name} vs ${r3m1.team2Name}`);
  if (APPLY) {
    await matches.doc("r2-match-6").set({ scheduledTime: r3m1.scheduledTime }, { merge: true });
    await matches.doc("r3-match-1").set({ scheduledTime: r2m6.scheduledTime }, { merge: true });
    console.log("\nApplied.");
  } else {
    console.log("\nDry-run only. Re-run with --apply.");
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
