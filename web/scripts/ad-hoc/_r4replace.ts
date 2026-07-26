import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="domin8-ultimate-tilt-proof-tournament";
const ist=(z:string)=>z?new Date(z).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit",hour12:true}):"— (no time / next week)";
(async()=>{
  const col=db.collection("tournaments").doc(TID).collection("matches");
  // clear scheduledTime on M1 and M6 -> show no time, go to next week
  for(const id of ["r4-match-1","r4-match-6"]) await col.doc(id).update({scheduledTime:FieldValue.delete()});
  // show resulting THIS-SAT order
  const ms=await col.get();
  const rows=ms.docs.map(d=>({id:d.id,...(d.data() as any)})).filter((m:any)=>m.id.startsWith("r4-"));
  console.log("=== R4 after change ===");
  console.log("THIS SATURDAY (with times):");
  rows.filter((m:any)=>m.scheduledTime).sort((a:any,b:any)=>a.scheduledTime.localeCompare(b.scheduledTime)).forEach((m:any)=>console.log(`  ${m.id}  ${ist(m.scheduledTime)}  ${m.team1Name} vs ${m.team2Name}`));
  console.log("NEXT WEEK (no time shown):");
  rows.filter((m:any)=>!m.scheduledTime).sort((a:any,b:any)=>a.id.localeCompare(b.id,undefined,{numeric:true})).forEach((m:any)=>console.log(`  ${m.id}  ${m.team1Name} vs ${m.team2Name}`));
  process.exit(0);
})();
