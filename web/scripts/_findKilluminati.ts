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
  const allSnap = await db.collection("users").get();
  for (const d of allSnap.docs) {
    const u: any = d.data();
    const blob = JSON.stringify(u).toLowerCase();
    if (blob.includes("killuminati") || blob.includes("kill_uminati") || blob.includes("kill uminati")) {
      console.log(`\nUID: ${d.id}`);
      console.log(`  fullName: ${u.fullName}`);
      console.log(`  steamName: ${u.steamName}`);
      console.log(`  steamId: ${u.steamId}`);
      console.log(`  steamAvatar: ${u.steamAvatar?.slice(0, 80) || "—"}`);
      console.log(`  discordUsername: ${u.discordUsername}`);
      console.log(`  discordId: ${u.discordId}`);
      console.log(`  dotaRankTier: ${u.dotaRankTier}  dotaBracket: ${u.dotaBracket}`);
    }
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
