import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g,"\n") }) });
const db = getFirestore(getApp());
(async () => {
  const snap = await db.collection("users").get();
  const dateKeys = new Map<string, number>();
  snap.docs.forEach(d => Object.entries(d.data() as any).forEach(([k,v]) => {
    if (/at$|At$|date/i.test(k) && v) dateKeys.set(k,(dateKeys.get(k)||0)+1);
  }));
  console.log("date-ish fields present on users:");
  [...dateKeys.entries()].sort((a,b)=>b[1]-a[1]).forEach(([k,c])=>console.log(`  ${k.padEnd(24)} ${c}`));
  const sample = snap.docs.find(d => (d.data() as any).steamLinkedAt);
  if (sample) { const s:any = sample.data();
    console.log("\nsample values:", JSON.stringify({createdAt:s.createdAt, steamLinkedAt:s.steamLinkedAt, discordConnectedAt:s.discordConnectedAt})); }
})().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)});
