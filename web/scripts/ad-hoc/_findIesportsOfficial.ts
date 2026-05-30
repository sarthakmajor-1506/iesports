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
(async () => {
  const all = await db.collection("users").get();
  const hits: any[] = [];
  all.forEach(d => {
    const u = d.data() as any;
    const blob = [u.discordUsername, u.fullName, u.steamName, u.riotGameName].filter(Boolean).join(" | ").toLowerCase();
    if (blob.includes("iesport") || blob.includes("ie sport") || blob.includes("ieofficial")) {
      hits.push({ uid: d.id, discordUsername: u.discordUsername, fullName: u.fullName, steamName: u.steamName, discordId: u.discordId, steamId: u.steamId, dotaRankTier: u.dotaRankTier });
    }
  });
  console.log(`Found ${hits.length} candidate(s):`);
  hits.forEach(h => console.log(`  ${h.uid}\n    discordUsername=${h.discordUsername} fullName=${h.fullName} steamName=${h.steamName} discordId=${h.discordId} steamId=${h.steamId} tier=${h.dotaRankTier}`));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
