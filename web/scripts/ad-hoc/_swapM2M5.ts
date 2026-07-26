import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const ist=(z:string)=>z?new Date(z).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit",hour12:true}):"—";
(async()=>{
  const col=db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches");
  const m2:any=(await col.doc("r3-match-2").get()).data();
  const m5:any=(await col.doc("r3-match-5").get()).data();
  const t2=m2.scheduledTime, t5=m5.scheduledTime;
  console.log(`BEFORE  M2 ${ist(t2)}  |  M5 ${ist(t5)}`);
  const batch=db.batch();
  batch.update(col.doc("r3-match-2"),{scheduledTime:t5});
  batch.update(col.doc("r3-match-5"),{scheduledTime:t2});
  await batch.commit();
  // verify full night
  const snap=await col.get(); const rows:any[]=[];
  snap.forEach(m=>{const d:any=m.data(); if(m.id.startsWith("r3-")&&d.status!=="completed")rows.push(d);});
  rows.sort((a,b)=>(a.scheduledTime||"").localeCompare(b.scheduledTime||""));
  console.log("\nAFTER — R3 night order:"); let g=1;
  for(const d of rows) console.log(`  game ${g++}: ${d.id.padEnd(11)} ${ist(d.scheduledTime).padEnd(22)} ${d.team1Name} vs ${d.team2Name}`);
  process.exit(0);
})();
