import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const MAIN="120363409054463438@g.us", METOO="120363408716274772@g.us", MUTH="120363408184829697@g.us";
const now=()=>new Date().toISOString();
const mainMsg=`🏆 *LOWER BRACKET R1 — RESULT*\n*#METOO ESPORTS* def. *RADIANT REAPERS* 2-1 in a nail-biter — #METOO survives and advances! 🫡\nGG *RADIANT REAPERS*, eliminated after a gritty lower-bracket run. 👏\n\n⚔️ *NEXT — Lower Bracket R2*\n*MUTH MANTRALAYA vs #METOO ESPORTS* — win or go home. 🔥`;
const metooMsg=`🚀 *#METOO ESPORTS — YOU ADVANCE!* 2-1 over Radiant Reapers, clutch series. Next up: *MUTH MANTRALAYA (LB R2)*.\n\n📊 *Scout — a rematch you must flip:*\n🔸 MUTH beat you *2-0 in Swiss (Ascent 13-3, Icebox 13-6)* — don't let it repeat.\n🔸 Their engine: *Bhavya* (Raze, 38 first kills) + *Kush* (Chamber/Jett, 51 FK — most in the league). Two elite fraggers.\n🎯 *BAN ASCENT* (their 3-0 fortress where they smashed you 13-3). Force *Haven* (your 2-1 best). Trade hard, deny Kush/Bhavya free entries, and don't let KaruiTaiki get isolated.`;
const muthMsg=`🔱 *MUTH MANTRALAYA — LB R2 vs #METOO ESPORTS*\nYou've got their number — *2-0 in Swiss (Ascent 13-3, Icebox 13-6)*. Run it back.\n🔸 Their one real threat: *Little Blessing* (Jett, 35 FK) — shut him down and they fold.\n🎯 *Force ASCENT* (your 3-0 fortress) and *ban Haven* (#METOO's best, your weakest). Let *Bhavya + Kush* cook; *MuthMantri* anchors util. Close it fast. 🔥`;
const metooPhones=["919993380221","917869174364","917400850810","916265840388","918349396235"];
const muthPhones=["917470929889","919399729438","916232974749","917999704001"]; // 5th (WALTERBLUE/919669802332) skipped per instruction
const docs=[
  {action:"send-text",target:{id:MAIN},text:mainMsg,source:"lbr1-result"},
  {action:"send-text",target:{id:METOO},text:metooMsg,source:"lbr1-winner-insight"},
  {action:"send-text",target:{id:MUTH},text:muthMsg,source:"lbr1-muth-insight"},
  {action:"add-participants",target:{id:METOO},participantPhones:metooPhones,sleep:[1500,2800],source:"metoo-roster-add"},
  {action:"add-participants",target:{id:MUTH},participantPhones:muthPhones,sleep:[1500,2800],source:"muth-roster-add"},
];
(async()=>{
  const refs:any[]=[];
  for(const d of docs){const r=await db.collection("whatsappOutbox").add({...d,status:"pending",createdAt:now()});refs.push({id:r.id,label:d.source,ref:r});}
  console.log("enqueued:",refs.map(r=>r.label).join(", "));
  for(let i=0;i<40;i++){
    await new Promise(r=>setTimeout(r,2500));
    const states=await Promise.all(refs.map(async r=>{const d:any=(await r.ref.get()).data();return {l:r.label,s:d.status,e:d.error};}));
    const pending=states.filter(s=>s.s==="pending");
    if(pending.length===0){console.log("\nALL DONE:");states.forEach(s=>console.log(`  ${s.l}: ${s.s}${s.e?" ERR:"+s.e:""}`));process.exit(0);}
    process.stdout.write(`[${states.filter(s=>s.s!=="pending").length}/${refs.length}]`);
  }
  console.log("\nTIMEOUT — current:"); (await Promise.all(refs.map(async r=>{const d:any=(await r.ref.get()).data();return `${r.label}:${d.status}`;}))).forEach(x=>console.log("  "+x));
  process.exit(0);
})();
