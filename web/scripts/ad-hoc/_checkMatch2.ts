import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
const db = getFirestore();
const TID = "dota-test-major-shrey";
const names: Record<number, string> = { [-1]: "NONE", 0: "UI", 1: "READYUP", 2: "SERVERSETUP", 3: "RUN", 4: "POSTGAME", 5: "NOTREADY", 6: "SERVERASSIGN" };
(async () => {
  const s = (await db.collection("botLobbyControl").doc("state").get()).data() as any;
  console.log("=== Bot live state ===");
  console.log(`  gcReady=${s.gcReady}  status=${s.status}  lobbyState=${s.lobbyState}(${names[s.lobbyState]||"?"})`);
  console.log(`  memberCount=${s.memberCount}  bot.lobbyMatchId=${s.lobbyMatchId || "—"}`);
  console.log(`  lastLobbyFields: ${s.lastLobbyFields}`);
  console.log(`  updatedAt: ${s.updatedAt}\n`);

  for (const id of ["r1-match-1", "r1-match-2", "r1-match-3", "r1-match-4", "r1-match-5"]) {
    const m = (await db.collection("tournaments").doc(TID).collection("matches").doc(id).get()).data() as any;
    if (!m) continue;
    console.log(`${id}: status=${m.status}  dotaMatchId=${m.dotaMatchId || "—"}  team1=${m.team1Name}  team2=${m.team2Name}`);
  }

  // Active botQueues for this tournament
  const qs = await db.collection("botQueues").where("tournamentId", "==", TID).get();
  console.log(`\n=== Bot queues for ${TID} ===`);
  for (const q of qs.docs) {
    const d: any = q.data();
    console.log(`  ${q.id}  status=${d.status}  matchId=${d.tournamentMatchId}  dotaMatchId=${d.dotaMatchId || "—"}  capturedAt=${d.dotaMatchIdCapturedAt || "—"}`);
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
