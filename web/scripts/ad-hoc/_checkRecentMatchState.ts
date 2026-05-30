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
  const matches = await db.collection("tournaments").doc(TID).collection("matches").get();
  for (const d of matches.docs) {
    const m = d.data() as any;
    if (m.lobbySetAt || m.status !== "pending" || m.lobbyName) {
      console.log(`\n${d.id}:`);
      console.log(`  status=${m.status}`);
      console.log(`  lobbyName=${m.lobbyName} pw=${m.lobbyPassword}`);
      console.log(`  lobbySetAt=${m.lobbySetAt}`);
      console.log(`  lobbyMode=${m.lobbyMode} lobbyStatus=${m.lobbyStatus}`);
      console.log(`  botQueueId=${m.botQueueId}`);
      console.log(`  waitingRoomVcId=${m.waitingRoomVcId}`);
      console.log(`  discordOpsMessageIds=${JSON.stringify(m.discordOpsMessageIds)}`);
      console.log(`  vetoState=${JSON.stringify(m.vetoState)}`);
    }
  }
  console.log("\n=== Recent botQueues (this tournament) ===");
  const q = await db.collection("botQueues").where("tournamentId","==",TID).orderBy("createdAt","desc").limit(3).get();
  q.docs.forEach(qd => {
    const data = qd.data() as any;
    console.log(`  ${qd.id}: status=${data.status} createdAt=${data.createdAt} matchId=${data.tournamentMatchId} cmPick=${data.cmPick} lobbyId=${data.lobbyId}`);
  });
  console.log("\n=== Most recent botLobbyCommands (any tournament) ===");
  const cmds = await db.collection("botLobbyCommands").orderBy("createdAt","desc").limit(5).get();
  cmds.docs.forEach(c => {
    const data = c.data() as any;
    console.log(`  ${c.id}: action=${data.action} status=${data.status} createdBy=${data.createdBy} createdAt=${data.createdAt}`);
    if (data.error) console.log(`    error: ${data.error}`);
  });
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
