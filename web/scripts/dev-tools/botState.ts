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
(async () => {
  const s = await db.collection("botLobbyControl").doc("state").get();
  console.log("=== botLobbyControl/state ===");
  console.log(JSON.stringify(s.data(), null, 2));
  const cmds = await db.collection("botLobbyCommands").orderBy("createdAt", "desc").limit(5).get();
  console.log("\n=== Last 5 botLobbyCommands ===");
  for (const d of cmds.docs) {
    const c: any = d.data();
    console.log(`  ${d.id}  ${c.action}  status=${c.status}  createdAt=${c.createdAt}  error=${c.error || "—"}`);
  }
  const queues = await db.collection("botQueues").where("status", "in", ["open", "in_progress"]).get();
  console.log(`\n=== Active botQueues (${queues.size}) ===`);
  for (const d of queues.docs) {
    const q: any = d.data();
    console.log(`  ${d.id}  status=${q.status}  dotaMatchId=${q.dotaMatchId || "—"}  scheduledTime=${q.scheduledTime || "—"}  tournamentMatchId=${q.tournamentMatchId || "—"}`);
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
