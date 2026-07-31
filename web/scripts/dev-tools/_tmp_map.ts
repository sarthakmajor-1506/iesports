import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g,"\n") }) });
const db = getFirestore(getApp());
const ROSTERS: Record<string,string[]> = {
  "UTSAV ULTIMATES":  ["Raunak","Rajat","Aman","Abhay","Rishabh"],
  "SURANA STRIKERS":  ["Utkarsh","Anshul","Rishav","Naman","Rishab"],
  "HM GLADIATORS":    ["Punit","Saumil","Ayush","Rushabh","Rishabh Patni"],
  "BKT TITANS":       ["Piyush","Pranay","Ishu","Yash","Abhishek"],
  "OSCAR":            ["Aradhya","Subodh","Mihir","Naman","Akshay"],
  "FANBOY":           ["Ankish","Harshal","Vishesh","Pulkit","Samyak"],
};
(async () => {
  const sp = await db.collection("cs2Tournaments").doc("cs2-royal-sports-league").collection("soloPlayers").get();
  const uids = sp.docs.map(d=>d.id);
  const users = await Promise.all(uids.map(u=>db.collection("users").doc(u).get()));
  const pool = users.map((u,i)=>({ uid: uids[i], ...(u.data() as any) }))
    .map(u=>({uid:u.uid, full:String(u.fullName||""), steam:String(u.steamName||""), disc:String(u.discordUsername||"")}));
  console.log(`registered pool: ${pool.length}\n`);
  const used = new Set<string>();
  for (const [team, names] of Object.entries(ROSTERS)) {
    console.log(`### ${team}`);
    for (const n of names) {
      const key = n.toLowerCase();
      const hits = pool.filter(p => [p.full,p.steam,p.disc].some(f=>f.toLowerCase().includes(key.split(" ")[0])));
      const exact = hits.filter(p => p.full.toLowerCase().includes(key));
      const cand = exact.length ? exact : hits;
      if (cand.length === 1) console.log(`   OK        ${n.padEnd(15)} -> ${cand[0].full||cand[0].steam} (${cand[0].uid})`);
      else if (cand.length === 0) console.log(`   MISSING   ${n.padEnd(15)} -> not registered`);
      else console.log(`   AMBIGUOUS ${n.padEnd(15)} -> ${cand.map(c=>`${c.full||c.steam}[${c.steam}]`).join("  |  ")}`);
      cand.forEach(c=>used.add(c.uid));
    }
    console.log("");
  }
  const unused = pool.filter(p=>!used.has(p.uid));
  console.log(`=== registered but not in any listed roster (${unused.length}) — likely NAWABZADE / GOKHRU SMASHERS ===`);
  unused.forEach(p=>console.log(`   ${(p.full||"(no name)").padEnd(22)} steam=${p.steam.padEnd(18)} discord=${p.disc}`));
})().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)});
