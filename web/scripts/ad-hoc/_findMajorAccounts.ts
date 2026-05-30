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
  const major = await db.collection("users").doc("discord_1302366375263735808").get();
  console.log("=== Major's user doc (discord_1302366375263735808) ===");
  if (major.exists) {
    const d = major.data() as any;
    console.log("  steamId:", d.steamId);
    console.log("  steamName:", d.steamName);
    console.log("  fullName:", d.fullName);
    console.log("  dotaRankTier:", d.dotaRankTier, "bracket:", d.dotaBracket);
    console.log("  discordUsername:", d.discordUsername);
  } else {
    console.log("  NOT FOUND");
  }

  console.log("\n=== Search for 'Major' + 'Major O' in users ===");
  const all = await db.collection("users").get();
  const candidates: any[] = [];
  all.forEach(doc => {
    const d = doc.data() as any;
    const nameFields = [d.steamName, d.fullName, d.discordUsername, d.riotGameName].filter(Boolean).join(" | ");
    if (/major/i.test(nameFields)) {
      candidates.push({ uid: doc.id, names: nameFields, steamId: d.steamId, steamName: d.steamName, fullName: d.fullName, discordUsername: d.discordUsername });
    }
  });
  candidates.forEach(c => console.log(`  ${c.uid}\n    names: ${c.names}\n    steamId: ${c.steamId}\n    steamName: ${c.steamName}`));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
