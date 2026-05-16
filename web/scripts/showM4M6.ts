import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });
const TID = "domin8-ultimate-tilt-proof-tournament";
(async () => {
  const db = getFirestore();
  const col = db.collection("tournaments").doc(TID).collection("matches");
  const fmt = (iso?: string) => iso ? new Date(iso).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"})+" IST" : "—";
  for (const id of ["r1-match-4","r1-match-6"]) {
    const m = (await col.doc(id).get()).data();
    console.log(`${id}: ${m?.team1Name}(${m?.team1Id}) vs ${m?.team2Name}(${m?.team2Id})  idx=${m?.matchIndex}  status=${m?.status}  time=${m?.scheduledTime} (${fmt(m?.scheduledTime)})`);
  }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
