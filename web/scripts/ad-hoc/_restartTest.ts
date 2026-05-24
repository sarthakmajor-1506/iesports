/**
 * Hard reset to restart the Dota test from scratch:
 *  1. Destroy any active bot lobby
 *  2. Reset r1-match-1 to pending (wipe lobby/game/match-id fields)
 *  3. Delete the stale botQueue for r1-match-1
 *  4. Wait for bot to confirm idle
 */
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
const TID = "dota-test-major-shrey";

(async () => {
  // 1. Destroy
  const cmdRef = await db.collection("botLobbyCommands").add({
    action: "destroy", params: {}, status: "pending",
    createdAt: new Date().toISOString(), createdBy: "restart-test",
  });
  console.log(`✓ Sent destroy: ${cmdRef.id}`);

  // 2. Reset r1-match-1
  const matchRef = db.collection("tournaments").doc(TID).collection("matches").doc("r1-match-1");
  await matchRef.update({
    status: "pending", team1Score: 0, team2Score: 0,
    botQueueId: FieldValue.delete(), lobbyName: FieldValue.delete(),
    lobbyPassword: FieldValue.delete(), lobbyMode: FieldValue.delete(),
    lobbyStatus: FieldValue.delete(), lobbySetAt: FieldValue.delete(),
    vetoState: FieldValue.delete(), game1: FieldValue.delete(),
    games: FieldValue.delete(), dotaMatchId: FieldValue.delete(),
    winnerTeamId: FieldValue.delete(),
    startedAt: FieldValue.delete(), completedAt: FieldValue.delete(),
    durationSec: FieldValue.delete(), dataSource: FieldValue.delete(),
    waitingRoomVcId: FieldValue.delete(),
    team1VcId: FieldValue.delete(), team2VcId: FieldValue.delete(),
    team1Subs: FieldValue.delete(), team2Subs: FieldValue.delete(),
    vcStatus: FieldValue.delete(), vcLiveStatus: FieldValue.delete(),
  });
  console.log("✓ r1-match-1 reset to pending");

  // 3. Delete stale queue
  const stale = await db.collection("botQueues")
    .where("tournamentId", "==", TID)
    .where("tournamentMatchId", "==", "r1-match-1").get();
  for (const d of stale.docs) { await d.ref.delete(); console.log(`✓ Deleted queue: ${d.id}`); }

  // 4. Wait for destroy + verify
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const d = (await cmdRef.get()).data() as any;
    if (d.status === "done" || d.status === "error") {
      const s = (await db.collection("botLobbyControl").doc("state").get()).data() as any;
      console.log(`\n✅ Destroy complete. Bot state: status=${s.status} gcReady=${s.gcReady} lobbyState=${s.lobbyState} members=${s.memberCount}`);
      console.log("\nReady to retest. Go to admin → r1-match-1 → Set Lobby & Notify.");
      return;
    }
  }
  console.log("⚠️  destroy timed out — check Railway logs");
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
