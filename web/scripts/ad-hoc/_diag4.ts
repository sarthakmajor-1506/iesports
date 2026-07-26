import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="league-of-rising-stars-ascension";
(async()=>{
  console.log("=== matches completed after 09:50 ===");
  const ms=await db.collection("valorantTournaments").doc(TID).collection("matches").get();
  ms.docs.map(d=>({id:d.id,...(d.data() as any)})).filter((m:any)=>m.completedAt&&m.completedAt>"2026-06-07T09:50").forEach((m:any)=>console.log(`  ${m.id} ${m.team1Name} ${m.team1Score}-${m.team2Score} ${m.team2Name} completedAt=${m.completedAt} announced=${m.resultAnnouncedAt||"NOT-ANNOUNCED"}`));
  console.log("\n=== outbox docs after 09:50 ===");
  const q=await db.collection("whatsappOutbox").get();
  q.docs.map(d=>({id:d.id,...(d.data() as any)})).filter((d:any)=>String(d.createdAt)>"2026-06-07T09:50").sort((a:any,b:any)=>String(a.createdAt).localeCompare(String(b.createdAt))).forEach((d:any)=>console.log(`  [${d.id}] ${d.createdAt} src=${d.source||"-"} status=${d.status} target=${d.target?.id||"-"} ${d.error?"ERR:"+d.error.slice(0,60):""}`));
  process.exit(0);
})();
