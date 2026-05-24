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
  const terms = ["killu", "money", "illuminati"];
  for (const d of allSnap.docs) {
    const u: any = d.data();
    const blob = JSON.stringify(u).toLowerCase();
    for (const term of terms) {
      if (blob.includes(term)) {
        console.log(`\n[match: "${term}"] UID: ${d.id}`);
        console.log(`  fullName: ${u.fullName || "—"}`);
        console.log(`  steamName: ${u.steamName || "—"}`);
        console.log(`  steamId: ${u.steamId || "—"}`);
        console.log(`  discordUsername: ${u.discordUsername || "—"}  discordId: ${u.discordId || "—"}`);
        console.log(`  dotaRankTier: ${u.dotaRankTier ?? "—"}  bracket: ${u.dotaBracket || "—"}`);
        break;
      }
    }
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
