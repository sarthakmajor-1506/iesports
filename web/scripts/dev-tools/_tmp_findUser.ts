import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, "\n") }) });
const db = getFirestore(getApp());
(async () => {
  const needles = process.argv.slice(2).map(s => s.toLowerCase());
  const snap = await db.collection("users").get();
  for (const d of snap.docs) {
    const u: any = d.data();
    const hay = [u.steamName, u.discordUsername, u.fullName].filter(Boolean).map(String);
    if (needles.some(n => hay.some(h => h.toLowerCase().includes(n)))) {
      console.log(`${d.id}\n   steam="${u.steamName||"-"}" discord="${u.discordUsername||"-"}" name="${u.fullName||"-"}" steamId=${u.steamId||"NONE"}`);
    }
  }
})().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)});
