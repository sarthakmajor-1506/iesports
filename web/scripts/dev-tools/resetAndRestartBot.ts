/**
 * Force a clean slate before restart:
 *  1. Enqueue a `destroy` command for the bot (kills any ghost lobby Valve
 *     might still think the bot has)
 *  2. Reset r1-match-1 to pending (clear lobby/status fields)
 *  3. Delete the stale tournament_dota-test-major-shrey_r1-match-1_g1 queue
 *  4. Close out ALL old March botQueues (status → closed) so they stop
 *     polluting the heartbeat sync + cron scans
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
  // 1. Enqueue destroy command — bot consumes via onSnapshot within ~1s
  const cmdRef = await db.collection("botLobbyCommands").add({
    action: "destroy",
    params: {},
    status: "pending",
    createdAt: new Date().toISOString(),
    createdBy: "reset-script",
  });
  console.log(`✓ Enqueued destroy command: botLobbyCommands/${cmdRef.id}`);

  // 2. Reset r1-match-1
  const matchRef = db.collection("tournaments").doc(TID).collection("matches").doc("r1-match-1");
  await matchRef.update({
    status: "pending",
    team1Score: 0, team2Score: 0,
    botQueueId: FieldValue.delete(),
    lobbyName: FieldValue.delete(),
    lobbyPassword: FieldValue.delete(),
    lobbyMode: FieldValue.delete(),
    lobbyStatus: FieldValue.delete(),
    lobbySetAt: FieldValue.delete(),
    team1Subs: FieldValue.delete(),
    team2Subs: FieldValue.delete(),
    vetoState: FieldValue.delete(),
    game1: FieldValue.delete(),
    games: FieldValue.delete(),
    winnerTeamId: FieldValue.delete(),
    completedAt: FieldValue.delete(),
    startedAt: FieldValue.delete(),
    dotaMatchId: FieldValue.delete(),
    durationSec: FieldValue.delete(),
    dataSource: FieldValue.delete(),
  });
  console.log("✓ r1-match-1 reset to pending");

  // 3. Delete the stale tournament queue doc
  const stale = await db.collection("botQueues")
    .where("tournamentId", "==", TID)
    .where("tournamentMatchId", "==", "r1-match-1").get();
  for (const d of stale.docs) {
    await d.ref.delete();
    console.log(`✓ Deleted stale queue: botQueues/${d.id}`);
  }

  // 4. Close out ALL non-test botQueues so cron + heartbeat stop scanning them.
  //    Anything with scheduledTime older than 7 days = dead, force-close.
  const cutoff = Date.now() - 7 * 86400 * 1000;
  const allQs = await db.collection("botQueues")
    .where("status", "in", ["open", "in_progress"]).get();
  let closed = 0;
  for (const d of allQs.docs) {
    const q: any = d.data();
    // Skip the test queue (already deleted above)
    if (q.tournamentId === TID) continue;
    const sched = q.scheduledTime ? Date.parse(q.scheduledTime) : 0;
    if (!sched || sched < cutoff) {
      await d.ref.set({ status: "closed", closedAt: new Date().toISOString(), closedReason: "cleanup-stale-queue" }, { merge: true });
      closed++;
    }
  }
  console.log(`✓ Closed ${closed} stale botQueues (>7 days old)`);

  console.log("\nReady to restart Railway. The bot will:");
  console.log("  - Re-connect to Steam + GC");
  console.log("  - Send fresh DestroyLobby on first GC welcome (clears any ghost lobby)");
  console.log("  - Resume cron loop with clean queue collection");
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
