import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="league-of-rising-stars-ascension";
(async()=>{
  console.log("=== WA bot state ===");
  const st:any=(await db.collection("whatsappStatus").doc("state").get()).data();
  console.log("state="+(st?.state)+" lastSeen="+(st?.lastSeen||st?.updatedAt));
  console.log("\n=== LB matches status + announced ===");
  const ms=await db.collection("valorantTournaments").doc(TID).collection("matches").get();
  ms.docs.map(d=>({id:d.id,...(d.data() as any)})).filter((m:any)=>/lb-|wb-/.test(m.id)).forEach((m:any)=>{
    console.log(`  ${m.id} [${m.bracketLabel||""}] status=${m.status} score=${m.team1Score}-${m.team2Score} ${m.team1Name} v ${m.team2Name} completedAt=${m.completedAt||"-"} announced=${m.resultAnnouncedAt||"-"}`);
  });
  console.log("\n=== recent result-announcer outbox docs ===");
  const q=await db.collection("whatsappOutbox").where("source","==","result-announcer").get();
  q.docs.map(d=>({id:d.id,...(d.data() as any)})).sort((a:any,b:any)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,6).forEach((d:any)=>{
    console.log(`  [${d.id}] status=${d.status} dedupe=${d.dedupeKey} target=${d.target?.id} createdAt=${d.createdAt} ${d.error?"ERR:"+d.error:""}`);
  });
  process.exit(0);
})();
