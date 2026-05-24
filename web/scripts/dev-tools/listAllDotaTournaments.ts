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
  const snap = await db.collection("tournaments").get();
  for (const d of snap.docs) {
    const t: any = d.data();
    console.log(`${d.id}\n  name=${t.name}\n  status=${t.status}\n  startDate=${t.startDate}\n  discordChannelId=${t.discordChannelId || "—"}\n  isTestTournament=${t.isTestTournament || false}\n`);
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
