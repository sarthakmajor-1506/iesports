import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g,"\n") }) });
const db = getFirestore(getApp());
const ms = (v:any):number => {
  if (!v) return NaN;
  if (typeof v === "object" && v._seconds != null) return v._seconds*1000;
  if (typeof v?.toMillis === "function") return v.toMillis();
  const t = Date.parse(String(v)); return t;
};
const WANT = ["raunak","rajat","abhay","punit","rushabh","ishu","ankish","aman","naman","rishab","patni"];
(async () => {
  const cutoff = Date.now() - 7*24*3600*1000;
  const snap = await db.collection("users").get();
  const recent = snap.docs.map(d=>({uid:d.id,...(d.data() as any)}))
    .filter(u => { const t = Math.max(ms(u.createdAt)||0, ms(u.steamLinkedAt)||0); return t >= cutoff; });
  console.log(`accounts created/linked in last 7 days: ${recent.length}`);
  const reg = await db.collection("cs2Tournaments").doc("cs2-royal-sports-league").collection("soloPlayers").get();
  const regSet = new Set(reg.docs.map(d=>d.id));
  console.log("");
  for (const n of WANT) {
    const hits = recent.filter(u => [u.fullName,u.steamName,u.discordUsername].filter(Boolean)
      .some((f:string)=>String(f).toLowerCase().includes(n)));
    if (!hits.length) { console.log(`${n.padEnd(9)} -> NONE`); continue; }
    console.log(`${n.padEnd(9)} ->`);
    hits.forEach(h=>console.log(`     ${(h.fullName||"(no name)").padEnd(22)} steam=${String(h.steamName||"-").padEnd(18)} steamId=${h.steamId?"yes":"NO "} reg=${regSet.has(h.uid)?"yes":"no "} ${h.uid}`));
  }
})().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)});
