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
  console.log(`Resetting ${matches.size} matches to clean state...`);
  for (const md of matches.docs) {
    await md.ref.set({
      status: "pending",
      lobbyName: null, lobbyPassword: null, lobbySetAt: null,
      botQueueId: null, lobbyMode: null, lobbyStatus: null,
      waitingRoomVcId: null, team1VcId: null, team2VcId: null,
      team1Score: 0, team2Score: 0, winner: null,
      dotaMatchId: null, completedAt: null,
      vetoState: null,
      vcStatus: null,
      discordOpsMessageIds: [],
      resultMessageId: null,
    }, { merge: true });
    console.log(`  ✓ ${md.id}`);
  }
  console.log("\nDone. All matches clean.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
