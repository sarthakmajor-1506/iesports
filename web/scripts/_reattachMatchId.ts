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
const TID = "dota-test-major-shrey";
const DOTA_MATCH_ID = "8821987573";

(async () => {
  // Put dotaMatchId back on r1-match-1 so results can be resolved after the game
  await db.collection("tournaments").doc(TID).collection("matches").doc("r1-match-1").set({
    dotaMatchId: DOTA_MATCH_ID,
    status: "live",
    lobbyStatus: "match-running",
    startedAt: new Date().toISOString(),
    game1: { dotaMatchId: DOTA_MATCH_ID, status: "in_progress" },
  }, { merge: true });
  console.log(`✓ Re-attached dotaMatchId=${DOTA_MATCH_ID} to r1-match-1`);
  console.log(`  status: live (back to live so Resolve via GC stays available)`);
  console.log(`\nWatch the match: https://www.dotabuff.com/matches/${DOTA_MATCH_ID}`);
  console.log(`After it ends, hit admin → Step 4 → Resolve via GC to capture results.`);

  // Now since the user wanted to "restart the test" — instead of restarting on
  // r1-match-1 (which has the live match), point them to r1-match-2 for the
  // next test. We already added r1-match-2..5 earlier.
  const m2 = (await db.collection("tournaments").doc(TID).collection("matches").doc("r1-match-2").get()).data() as any;
  console.log(`\nFor the NEXT test attempt: use r1-match-2 (status=${m2?.status || "?"}).`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
