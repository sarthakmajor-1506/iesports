/** Swap scheduledTime between two matches in a tournament.
 *  Usage: npx tsx scripts/swapMatchTimes.ts <tid> <matchIdA> <matchIdB> [--swap] */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });
const [tid, a, b] = process.argv.slice(2);
const DO = process.argv.includes("--swap");
(async () => {
  const db = getFirestore();
  const col = db.collection("tournaments").doc(tid).collection("matches");
  const ma = (await col.doc(a).get()).data();
  const mb = (await col.doc(b).get()).data();
  const fmt = (iso?: string) => iso ? new Date(iso).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"})+" IST" : "—";
  console.log(`${a}: ${ma?.team1Name} vs ${ma?.team2Name}  ${fmt(ma?.scheduledTime)}`);
  console.log(`${b}: ${mb?.team1Name} vs ${mb?.team2Name}  ${fmt(mb?.scheduledTime)}`);
  if (!DO) { console.log("\n🟡 Dry run. add --swap"); return; }
  await col.doc(a).update({ scheduledTime: mb?.scheduledTime ?? null });
  await col.doc(b).update({ scheduledTime: ma?.scheduledTime ?? null });
  console.log(`\n✅ Swapped. ${a} → ${fmt(mb?.scheduledTime)} | ${b} → ${fmt(ma?.scheduledTime)}`);
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
