import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const g=(id:string)=>({type:"group",id});
const MAIN="120363409054463438@g.us", METOO="120363408716274772@g.us", MUTH="120363408184829697@g.us";
const mainMsg=`🏆 *LOWER BRACKET R1 — RESULT*\n*#METOO ESPORTS* def. *RADIANT REAPERS* 2-1 in a nail-biter — #METOO survives and advances! 🫡\nGG *RADIANT REAPERS*, eliminated after a gritty lower-bracket run. 👏\n\n⚔️ *NEXT — Lower Bracket R2*\n*MUTH MANTRALAYA vs #METOO ESPORTS* — win or go home. 🔥`;
const metooMsg=`🚀 *#METOO ESPORTS — YOU ADVANCE!* 2-1 over Radiant Reapers, clutch series. Next up: *MUTH MANTRALAYA (LB R2)*.\n\n📊 *Scout — a rematch you must flip:*\n🔸 MUTH beat you *2-0 in Swiss (Ascent 13-3, Icebox 13-6)* — don't let it repeat.\n🔸 Their engine: *Bhavya* (Raze, 38 first kills) + *Kush* (Chamber/Jett, 51 FK — most in the league). Two elite fraggers.\n🎯 *BAN ASCENT* (their 3-0 fortress where they smashed you 13-3). Force *Haven* (your 2-1 best). Trade hard, deny Kush/Bhavya free entries, and don't let KaruiTaiki get isolated.`;
const muthMsg=`🔱 *MUTH MANTRALAYA — LB R2 vs #METOO ESPORTS*\nYou've got their number — *2-0 in Swiss (Ascent 13-3, Icebox 13-6)*. Run it back.\n🔸 Their one real threat: *Little Blessing* (Jett, 35 FK) — shut him down and they fold.\n🎯 *Force ASCENT* (your 3-0 fortress) and *ban Haven* (#METOO's best, your weakest). Let *Bhavya + Kush* cook; *MuthMantri* anchors util. Close it fast. 🔥`;
const docs=[
  {target:g(MAIN),text:mainMsg,source:"lbr1-result-v2"},
  {target:g(METOO),text:metooMsg,source:"lbr1-winner-insight-v2"},
  {target:g(MUTH),text:muthMsg,source:"lbr1-muth-insight-v2"},
];
(async()=>{
  const refs:any[]=[];
  for(const d of docs){const r=await db.collection("whatsappOutbox").add({action:"send-text",...d,status:"pending",createdAt:new Date().toISOString()});refs.push({label:d.source,ref:r});}
  for(let i=0;i<24;i++){
    await new Promise(r=>setTimeout(r,2500));
    const states=await Promise.all(refs.map(async r=>{const d:any=(await r.ref.get()).data();return {l:r.label,s:d.status,e:d.error};}));
    if(states.every(s=>s.s!=="pending")){console.log("ALL MESSAGES:");states.forEach(s=>console.log(`  ${s.l}: ${s.s}${s.e?" ERR:"+s.e:""}`));process.exit(0);}
  }
  console.log("timeout"); process.exit(0);
})();
