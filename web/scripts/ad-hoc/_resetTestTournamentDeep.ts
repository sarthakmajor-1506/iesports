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
const TID = "dota-test-major-shrey";
(async () => {
  console.log(`Deep-reset ${TID}\n`);
  const tref = db.collection("tournaments").doc(TID);

  console.log("=== Step 1: Reset all matches to pending, clear all derived state ===");
  const matches = await tref.collection("matches").get();
  for (const md of matches.docs) {
    await md.ref.set({
      status: "pending",
      lobbyName: null, lobbyPassword: null, lobbySetAt: null,
      botQueueId: null, lobbyMode: null, lobbyStatus: null,
      waitingRoomVcId: null, team1VcId: null, team2VcId: null,
      team1Score: 0, team2Score: 0, winner: null,
      dotaMatchId: null, completedAt: null, startedAt: null,
      vetoState: null, vcStatus: null,
      discordOpsMessageIds: [], resultMessageId: null,
      lastSetLobbyDiag: null,
      seriesAutoComputed: null,
      game1: null, game2: null, game1MatchId: null, game2MatchId: null,
      game1Winner: null, game2Winner: null,
      vcLiveStatus: null,
    }, { merge: true });
    console.log(`  ✓ ${md.id}`);
  }

  console.log("\n=== Step 2: Cancel all botQueues for this tournament ===");
  const queues = await db.collection("botQueues").where("tournamentId", "==", TID).get();
  for (const q of queues.docs) {
    await q.ref.set({
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      cancelledReason: "deep-reset for retest",
    }, { merge: true });
    console.log(`  ✓ ${q.id}`);
  }

  console.log("\n=== Step 3: Clear botLobbyControl/state to idle ===");
  await db.collection("botLobbyControl").doc("state").set({
    status: "idle",
    lobbyName: null, password: null, region: null, gameMode: null,
    lastError: null, lastCommand: "deep-reset",
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  console.log("  ✓ botLobbyControl/state");

  console.log("\n=== Step 4: Cancel any recent botLobbyCommands (pending/processing) ===");
  const pendingCmds = await db.collection("botLobbyCommands").where("status", "in", ["pending", "processing"]).get();
  for (const c of pendingCmds.docs) {
    await c.ref.set({
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      cancelledReason: "deep-reset for retest",
    }, { merge: true });
    console.log(`  ✓ ${c.id}: ${(c.data() as any).action}`);
  }

  console.log("\n=== Step 5: Cancel any recent botDiscordCommands (pending/processing) ===");
  const pendingDiscordCmds = await db.collection("botDiscordCommands").where("status", "in", ["pending", "processing"]).get();
  for (const c of pendingDiscordCmds.docs) {
    await c.ref.set({
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      cancelledReason: "deep-reset for retest",
    }, { merge: true });
    console.log(`  ✓ ${c.id}: ${(c.data() as any).action}`);
  }

  console.log(`\n✅ Deep-reset complete.`);
  console.log(`   ${matches.size} matches → pending`);
  console.log(`   ${queues.size} botQueues → cancelled`);
  console.log(`   ${pendingCmds.size} botLobbyCommands → cancelled`);
  console.log(`   ${pendingDiscordCmds.size} botDiscordCommands → cancelled`);
  console.log(`   botLobbyControl/state → idle`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
