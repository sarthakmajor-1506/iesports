import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const col=db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches");
(async()=>{
  await col.doc("r4-match-1").update({scheduledTime:"2026-06-13T17:30:00Z"}); // 11 PM Sat IST
  const ms=await col.get();
  const r=ms.docs.map(d=>({id:d.id,...(d.data() as any)})).filter((m:any)=>m.id.startsWith("r4-"));
  const ist=(z:string)=>z?new Date(z).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",weekday:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true}):"—";
  r.forEach((m:any)=>console.log(`${m.id} matchIndex=${m.matchIndex} time=${ist(m.scheduledTime)} ${m.team1Name} v ${m.team2Name}`));
  process.exit(0);
})();
