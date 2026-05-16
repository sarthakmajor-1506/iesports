/**
 * Inspect / reset the bubble-vs-major test lobby so the system can be
 * tested again from scratch.
 *
 *  - botQueues/tournament_zz-test-dota-lobby-flow_r1-match-1_g1  (the trigger)
 *  - botLobbies where queueId == that                           (the bot's lobby record)
 *  - tournaments/zz-test-dota-lobby-flow/matches/r1-match-1      (lobby fields on the match)
 *
 * Default: inspect (read-only). With --reset: delete the queue doc, clear
 * the match's lobby fields, and mark any botLobbies doc cancelled so a
 * fresh "Set Lobby & Notify" click creates a clean new lobby.
 *
 * NOTE: this does NOT destroy the actual in-Dota GC lobby — only the bot's
 * live Steam session can (click "Destroy" in the Discord lobby panel).
 *
 * Run: npx tsx scripts/resetDotaLobbyTest.ts            # inspect
 *      npx tsx scripts/resetDotaLobbyTest.ts --reset    # reset for re-test
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }) });
}

const TID = "zz-test-dota-lobby-flow";
const MID = "r1-match-1";
const QUEUE_ID = `tournament_${TID}_${MID}_g1`;
const DO_RESET = process.argv.includes("--reset");

async function main() {
  const db = getFirestore();

  const qRef = db.collection("botQueues").doc(QUEUE_ID);
  const qSnap = await qRef.get();
  console.log(`botQueues/${QUEUE_ID}: ${qSnap.exists ? `status=${qSnap.data()?.status} players=${(qSnap.data()?.players||[]).length}` : "(none)"}`);

  const lobbies = await db.collection("botLobbies").where("queueId", "==", QUEUE_ID).get();
  console.log(`botLobbies (queueId=${QUEUE_ID}): ${lobbies.size} doc(s)`);
  lobbies.forEach(d => console.log(`  ${d.id}: status=${d.data().status} gcLobbyId=${d.data().gcLobbyId} created=${d.data().createdAt}`));

  const mRef = db.collection("tournaments").doc(TID).collection("matches").doc(MID);
  const m = (await mRef.get()).data() || {};
  console.log(`match ${MID}: lobbyName=${m.lobbyName ?? "—"} botQueueId=${m.botQueueId ?? "—"} lobbyStatus=${m.lobbyStatus ?? "—"} status=${m.status}`);

  if (!DO_RESET) {
    console.log(`\n🟡 Inspect only. Re-run with --reset to clear for a fresh test.`);
    if (lobbies.size > 0) {
      console.log(`\n⚠️  An in-Dota GC lobby likely still exists. Click "Destroy" in the`);
      console.log(`    Discord lobby control panel (Shrey/admin) to kill it before re-testing.`);
    }
    return;
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  if (qSnap.exists) { await qRef.delete(); console.log(`\n✅ Deleted botQueues/${QUEUE_ID}`); }
  // Intentionally NOT touching botLobbies — leave it for the bot's Discord
  // "Destroy" handler so that button still works on the live GC lobby.
  if (lobbies.size > 0) {
    console.log(`ℹ️  Left botLobbies doc(s) intact — destroy the live GC lobby via the Discord "Destroy" button.`);
  }
  await mRef.set({
    lobbyName: FieldValue.delete(),
    lobbyPassword: FieldValue.delete(),
    lobbySetAt: FieldValue.delete(),
    botQueueId: FieldValue.delete(),
    lobbyMode: FieldValue.delete(),
    lobbyStatus: FieldValue.delete(),
    waitingRoomVcId: FieldValue.delete(),
  }, { merge: true });
  console.log(`✅ Cleared lobby fields on match ${MID}`);
  console.log(`\nData reset. Still destroy the live GC lobby via the Discord "Destroy"`);
  console.log(`button if one is open, then click "Set Lobby & Notify" again to re-test.`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
