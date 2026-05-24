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
const TID = "domin8-ultimate-tilt-proof-tournament";
const MID = "r2-match-2";

(async () => {
  // 1) Destroy any active bot lobby right now
  const cmdRef = await db.collection("botLobbyCommands").add({
    action: "destroy", params: {}, status: "pending",
    createdAt: new Date().toISOString(), createdBy: "reset-r2m2",
  });
  console.log(`✓ destroy command: ${cmdRef.id}`);

  // 2) Reset the match doc
  const mref = db.collection("tournaments").doc(TID).collection("matches").doc(MID);
  await mref.update({
    status: "pending",
    botQueueId: FieldValue.delete(),
    lobbyName: FieldValue.delete(),
    lobbyPassword: FieldValue.delete(),
    lobbyMode: FieldValue.delete(),
    lobbyStatus: FieldValue.delete(),
    lobbySetAt: FieldValue.delete(),
    waitingRoomVcId: FieldValue.delete(),
    team1VcId: FieldValue.delete(),
    team2VcId: FieldValue.delete(),
    team1Subs: FieldValue.delete(),
    team2Subs: FieldValue.delete(),
    vetoState: FieldValue.delete(),
    game1: FieldValue.delete(),
    games: FieldValue.delete(),
    dotaMatchId: FieldValue.delete(),
    winner: FieldValue.delete(),
    winnerTeamId: FieldValue.delete(),
    startedAt: FieldValue.delete(),
    completedAt: FieldValue.delete(),
    discordOpsMessageIds: FieldValue.delete(),
  });
  console.log(`✓ ${MID} reset to pending, all lobby/game fields wiped`);

  // 3) Delete stale botQueue
  const stale = await db.collection("botQueues")
    .where("tournamentId", "==", TID)
    .where("tournamentMatchId", "==", MID).get();
  for (const d of stale.docs) { await d.ref.delete(); console.log(`✓ deleted queue ${d.id}`); }

  // 4) Wait for destroy to finalize
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const d = (await cmdRef.get()).data() as any;
    if (d?.status === "done" || d?.status === "error") {
      const s = (await db.collection("botLobbyControl").doc("state").get()).data() as any;
      console.log(`\nBot: destroy=${d.status}  state.status=${s?.status}  gcReady=${s?.gcReady}  lobbyState=${s?.lobbyState}`);
      break;
    }
  }
  console.log(`\n✅ ${MID} ready — re-fire Set Lobby & Notify from admin.`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
