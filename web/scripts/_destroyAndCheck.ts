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
  const ref = await db.collection("botLobbyCommands").add({
    action: "destroy", params: {}, status: "pending",
    createdAt: new Date().toISOString(), createdBy: "cleanup-after-test",
  });
  console.log(`Sent destroy: ${ref.id}`);
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const d = (await ref.get()).data() as any;
    if (d.status === "done" || d.status === "error") {
      console.log(`Destroy: status=${d.status} error=${d.error || "—"}`);
      const s = (await db.collection("botLobbyControl").doc("state").get()).data() as any;
      console.log(`Bot state: status=${s.status} lobbyState=${s.lobbyState} members=${s.memberCount}`);
      return;
    }
  }
  console.log("⚠️  destroy timed out");
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
