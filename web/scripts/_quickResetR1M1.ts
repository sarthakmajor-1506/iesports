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
(async () => {
  const TID = "dota-test-major-shrey";
  const matchRef = db.collection("tournaments").doc(TID).collection("matches").doc("r1-match-1");
  await matchRef.update({
    status: "pending", team1Score: 0, team2Score: 0,
    botQueueId: FieldValue.delete(), lobbyName: FieldValue.delete(),
    lobbyPassword: FieldValue.delete(), lobbyMode: FieldValue.delete(),
    lobbyStatus: FieldValue.delete(), lobbySetAt: FieldValue.delete(),
    vetoState: FieldValue.delete(), game1: FieldValue.delete(),
    games: FieldValue.delete(), dotaMatchId: FieldValue.delete(),
    startedAt: FieldValue.delete(), completedAt: FieldValue.delete(),
  });
  const stale = await db.collection("botQueues")
    .where("tournamentId", "==", TID)
    .where("tournamentMatchId", "==", "r1-match-1").get();
  for (const d of stale.docs) await d.ref.delete();
  console.log(`✓ r1-match-1 reset, ${stale.size} stale queue(s) deleted`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
