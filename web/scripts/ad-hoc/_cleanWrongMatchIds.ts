import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
const db = getFirestore();
const CURRENT_LIVE_MATCH = "8822426762";
(async () => {
  // The current live Major vs Money match should ONLY be on test/r1-match-2
  // (the queue that was created when admin clicked Set Lobby & Notify).
  // Anywhere else it appears was the heartbeat-sync overwriting old queues.
  const KEEP_AT = { tid: "dota-test-major-shrey", mid: "r1-match-2" };

  // Clean test/r1-match-3 (got accidentally stamped)
  const m3 = db.collection("tournaments").doc(KEEP_AT.tid).collection("matches").doc("r1-match-3");
  const m3d = (await m3.get()).data() as any;
  if (m3d?.dotaMatchId === CURRENT_LIVE_MATCH) {
    await m3.update({ dotaMatchId: FieldValue.delete(), status: "pending", startedAt: FieldValue.delete() });
    console.log(`✓ cleaned test/r1-match-3 — removed wrong dotaMatchId ${CURRENT_LIVE_MATCH}, reset to pending`);
  }

  // Clean Domin8 r1-match-1 and r1-match-2 (got wrong stamps from current test match)
  for (const mid of ["r1-match-1", "r1-match-2"]) {
    const ref = db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches").doc(mid);
    const d = (await ref.get()).data() as any;
    if (d?.dotaMatchId === CURRENT_LIVE_MATCH) {
      await ref.update({
        dotaMatchId: FieldValue.delete(),
        status: "pending", // these are domin8 matches that never actually played
        startedAt: FieldValue.delete(),
        completedAt: FieldValue.delete(),
        winner: FieldValue.delete(),
        games: FieldValue.delete(),
        result: FieldValue.delete(),
      });
      console.log(`✓ cleaned domin8/${mid} — removed wrong dotaMatchId ${CURRENT_LIVE_MATCH}, reset to pending`);
    } else {
      console.log(`  domin8/${mid}: dotaMatchId=${d?.dotaMatchId || "—"} (left alone)`);
    }
  }

  console.log(`\n${KEEP_AT.tid}/${KEEP_AT.mid} keeps dotaMatchId=${CURRENT_LIVE_MATCH} as the canonical record.`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
