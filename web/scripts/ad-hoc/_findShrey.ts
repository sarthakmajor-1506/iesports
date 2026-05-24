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
  const all = await db.collection("users").get();
  for (const d of all.docs) {
    const u: any = d.data();
    const blob = (JSON.stringify(u) || "").toLowerCase();
    if (blob.includes("shrey")) {
      const steam32 = u.steamId ? (BigInt(u.steamId) - BigInt("76561197960265728")).toString() : "—";
      console.log(`UID: ${d.id}\n  fullName: ${u.fullName}\n  steamName: ${u.steamName}\n  steamId: ${u.steamId}  (steam32=${steam32})\n  discordUsername: ${u.discordUsername}  discordId: ${u.discordId}\n`);
    }
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
