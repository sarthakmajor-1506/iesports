import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });
(async () => {
  const db = getFirestore();
  const ref = db.collection("tournaments").doc("zz-test-dota-lobby-flow");
  await ref.update({ discordChannelId: "1504860772545859605" });
  const d = (await ref.get()).data();
  console.log(`zz-test-dota-lobby-flow.discordChannelId = ${d?.discordChannelId}`);
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
