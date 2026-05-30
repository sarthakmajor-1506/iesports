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
const SHREY_UID = "steam_76561198089387830";
const APPLY = process.argv.includes("--apply");
(async () => {
  const res = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${process.env.STEAM_API_KEY}&steamids=76561198089387830`);
  const data = await res.json();
  const profile = data?.response?.players?.[0];
  if (!profile) { console.log("Steam profile not found"); process.exit(1); }
  console.log(`Steam name: ${profile.personaname}`);
  console.log(`Avatar: ${profile.avatarfull}`);
  const updates = {
    steamName: profile.personaname,
    steamAvatar: profile.avatarfull,
    fullName: profile.realname || "Shrey Jain",
  };
  console.log("Updates:", JSON.stringify(updates));
  if (APPLY) {
    await db.collection("users").doc(SHREY_UID).set(updates, { merge: true });
    console.log("Applied.");
  } else {
    console.log("Dry-run.");
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
