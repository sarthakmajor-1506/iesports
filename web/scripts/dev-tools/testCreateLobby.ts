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
  console.log("Sending CREATE command to bot...");
  const ref = await db.collection("botLobbyCommands").add({
    action: "create",
    params: { name: "IEsports Lobby", password: "265", region: "India", gameMode: "CM" },
    status: "pending",
    createdAt: new Date().toISOString(),
    createdBy: "diagnostic-script",
  });
  console.log(`Created: botLobbyCommands/${ref.id}`);
  console.log("Polling for result (every 3s, max 2 min)...\n");
  const start = Date.now();
  let last = "";
  while (Date.now() - start < 120000) {
    await new Promise(r => setTimeout(r, 3000));
    const d = (await ref.get()).data() as any;
    const cur = `status=${d.status} error=${d.error || "—"} result=${JSON.stringify(d.result || null)}`;
    if (cur !== last) { console.log(`  [${new Date().toISOString()}] ${cur}`); last = cur; }
    if (d.status === "done" || d.status === "error") {
      const s = (await db.collection("botLobbyControl").doc("state").get()).data() as any;
      console.log(`\n=== bot state after create ===`);
      console.log(`  gcReady=${s.gcReady}  status=${s.status}  lobbyState=${s.lobbyState}  members=${s.memberCount}  lobbyMatchId=${s.lobbyMatchId}`);
      console.log(`  lastError=${s.lastError}  lastLobbyFields=${s.lastLobbyFields}`);
      return;
    }
  }
  console.log("⚠️ Timed out after 2 min — bot is hung or not processing commands");
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
