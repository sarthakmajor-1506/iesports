import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });
(async () => {
  const db = getFirestore();
  const test = await db.collection("tournaments").doc("zz-test-dota-lobby-flow").get();
  console.log(`test tournament exists: ${test.exists}`);
  const d = (await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").get()).data();
  console.log(`Domin8 discordChannelId: ${d?.discordChannelId}`);
  const teams = await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("teams").get();
  teams.forEach(t => console.log(`  ${t.id}: ${t.data().teamName}`));
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
