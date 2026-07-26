import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const col=db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches");
const ist=(z:string)=>z?new Date(z).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",weekday:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true}):"— (no time)";
(async()=>{
  const m1:any=(await col.doc("r4-match-1").get()).data();
  const m6:any=(await col.doc("r4-match-6").get()).data();
  console.log(`BEFORE  M1 ${ist(m1.scheduledTime)}  |  M6 ${ist(m6.scheduledTime)}`);
  // swap: M1 gets M6's (none), M6 gets M1's (11 PM)
  const batch=db.batch();
  batch.update(col.doc("r4-match-1"), m6.scheduledTime ? {scheduledTime:m6.scheduledTime} : {scheduledTime:FieldValue.delete()});
  batch.update(col.doc("r4-match-6"), m1.scheduledTime ? {scheduledTime:m1.scheduledTime} : {scheduledTime:FieldValue.delete()});
  await batch.commit();
  // verify full R4
  const ms=await col.get();
  const r=ms.docs.map(d=>({id:d.id,...(d.data() as any)})).filter((m:any)=>m.id.startsWith("r4-"));
  console.log("\n=== R4 after swap ===");
  console.log("THIS SAT (timed):");
  r.filter((m:any)=>m.scheduledTime).sort((a:any,b:any)=>a.scheduledTime.localeCompare(b.scheduledTime)).forEach((m:any)=>console.log(`  ${m.id}  ${ist(m.scheduledTime)}  ${m.team1Name} vs ${m.team2Name}`));
  console.log("NEXT WEEK (no time):");
  r.filter((m:any)=>!m.scheduledTime).forEach((m:any)=>console.log(`  ${m.id}  ${m.team1Name} vs ${m.team2Name}`));
  process.exit(0);
})();
