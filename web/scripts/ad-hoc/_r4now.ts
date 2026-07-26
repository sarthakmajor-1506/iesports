import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const ist=(z:string)=>z?new Date(z).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit",hour12:true}):"— (no time)";
(async()=>{
  const ms=await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches").get();
  ms.docs.map(d=>({id:d.id,...(d.data() as any)})).filter((m:any)=>m.id.startsWith("r4-")).sort((a:any,b:any)=>a.id.localeCompare(b.id,undefined,{numeric:true})).forEach((m:any)=>{
    console.log(`${m.id}: ${ist(m.scheduledTime).padEnd(24)} ${m.team1Name} vs ${m.team2Name}  status=${m.status}`);
  });
  process.exit(0);
})();
