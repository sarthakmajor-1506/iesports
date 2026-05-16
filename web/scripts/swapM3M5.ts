import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });
const TID = "domin8-ultimate-tilt-proof-tournament";
const DO = process.argv.includes("--swap");
(async () => {
  const db = getFirestore();
  const col = db.collection("tournaments").doc(TID).collection("matches");
  const m3 = (await col.doc("r1-match-3").get()).data();
  const m5 = (await col.doc("r1-match-5").get()).data();
  const fmt = (iso?: string) => iso ? new Date(iso).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"})+" IST" : "—";
  console.log(`M3 (r1-match-3): ${m3?.team1Name} vs ${m3?.team2Name}  time=${m3?.scheduledTime}  (${fmt(m3?.scheduledTime)})`);
  console.log(`M5 (r1-match-5): ${m5?.team1Name} vs ${m5?.team2Name}  time=${m5?.scheduledTime}  (${fmt(m5?.scheduledTime)})`);
  if (!DO) { console.log(`\n🟡 Dry run. --swap to exchange the two scheduledTime values.`); return; }
  await col.doc("r1-match-3").update({ scheduledTime: m5?.scheduledTime ?? null });
  await col.doc("r1-match-5").update({ scheduledTime: m3?.scheduledTime ?? null });
  console.log(`\n✅ Swapped. M3 → ${fmt(m5?.scheduledTime)} | M5 → ${fmt(m3?.scheduledTime)}`);
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
