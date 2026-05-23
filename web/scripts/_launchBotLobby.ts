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
  // Snapshot current state before launching
  const s = (await db.collection("botLobbyControl").doc("state").get()).data() as any;
  console.log("=== Current bot state ===");
  console.log(`  status=${s.status}  gcReady=${s.gcReady}  lobbyState=${s.lobbyState}`);
  console.log(`  memberCount=${s.memberCount}  lobbyMatchId=${s.lobbyMatchId || "—"}`);
  console.log(`  members: ${JSON.stringify(s.members)}`);
  console.log(`  lastLobbyFields: ${s.lastLobbyFields}\n`);

  if (s.lobbyState < 0) {
    console.log("⚠️  No active lobby (lobbyState=-1). Nothing to launch.");
    return;
  }

  // Fire launch command regardless of member count — Valve will reject if invalid
  const ref = await db.collection("botLobbyCommands").add({
    action: "launch", params: {}, status: "pending",
    createdAt: new Date().toISOString(), createdBy: "admin-launch-script",
  });
  console.log(`Sent launch: botLobbyCommands/${ref.id}`);

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const d = (await ref.get()).data() as any;
    if (d.status === "done" || d.status === "error") {
      console.log(`Launch: status=${d.status} error=${d.error || "—"}`);
      const s2 = (await db.collection("botLobbyControl").doc("state").get()).data() as any;
      console.log(`Bot state after: status=${s2.status} lobbyState=${s2.lobbyState} members=${s2.memberCount} lobbyMatchId=${s2.lobbyMatchId || "—"}`);
      return;
    }
  }
  console.log("⚠️  Launch processing timed out");
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
