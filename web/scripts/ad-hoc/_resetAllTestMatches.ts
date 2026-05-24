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
  // 1. Destroy any active bot lobby
  const cmdRef = await db.collection("botLobbyCommands").add({
    action: "destroy", params: {}, status: "pending",
    createdAt: new Date().toISOString(), createdBy: "reset-all-tests",
  });
  console.log(`✓ Enqueued bot destroy command: ${cmdRef.id}`);

  // 2. Reset all 5 r1-match-* docs
  for (const id of ["r1-match-1", "r1-match-2", "r1-match-3", "r1-match-4", "r1-match-5"]) {
    const ref = db.collection("tournaments").doc(TID).collection("matches").doc(id);
    if (!(await ref.get()).exists) { console.log(`  skip ${id}`); continue; }
    await ref.update({
      status: "pending", team1Score: 0, team2Score: 0,
      botQueueId: FieldValue.delete(), lobbyName: FieldValue.delete(),
      lobbyPassword: FieldValue.delete(), lobbyMode: FieldValue.delete(),
      lobbyStatus: FieldValue.delete(), lobbySetAt: FieldValue.delete(),
      team1Subs: FieldValue.delete(), team2Subs: FieldValue.delete(),
      vetoState: FieldValue.delete(), game1: FieldValue.delete(),
      games: FieldValue.delete(), dotaMatchId: FieldValue.delete(),
      winner: FieldValue.delete(), winnerTeamId: FieldValue.delete(),
      completedAt: FieldValue.delete(), startedAt: FieldValue.delete(),
      durationSec: FieldValue.delete(), dataSource: FieldValue.delete(),
      result: FieldValue.delete(), playerStats: FieldValue.delete(),
      waitingRoomVcId: FieldValue.delete(),
      team1VcId: FieldValue.delete(), team2VcId: FieldValue.delete(),
      vcStatus: FieldValue.delete(), vcLiveStatus: FieldValue.delete(),
      discordOpsMessageIds: FieldValue.delete(),
    });
    console.log(`  ✓ reset ${id}`);
  }

  // 3. Delete all stale botQueues for this tournament
  const stale = await db.collection("botQueues").where("tournamentId", "==", TID).get();
  for (const d of stale.docs) { await d.ref.delete(); console.log(`  ✓ deleted queue ${d.id}`); }

  // 4. Wait for destroy to complete
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const d = (await cmdRef.get()).data() as any;
    if (d.status === "done" || d.status === "error") {
      const s = (await db.collection("botLobbyControl").doc("state").get()).data() as any;
      console.log(`\nBot: destroy=${d.status}  state.status=${s.status}  gcReady=${s.gcReady}  lobbyState=${s.lobbyState}  members=${s.memberCount}`);
      break;
    }
  }

  console.log(`\n✅ All 5 matches reset. Test on r1-match-1.`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
