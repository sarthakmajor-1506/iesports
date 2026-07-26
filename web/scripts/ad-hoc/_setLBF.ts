import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const ist=(z:string)=>z?new Date(z).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit",hour12:true}):"—";
(async()=>{
  const ref=db.collection("valorantTournaments").doc("league-of-rising-stars-ascension").collection("matches").doc("lb-final");
  const b:any=(await ref.get()).data();
  console.log(`BEFORE: ${b.team1Name} vs ${b.team2Name} | bestOf=${b.bestOf} bo=${b.bo??"-"} sched=${ist(b.scheduledTime)}`);
  // 3 PM IST Sat 20 Jun = 09:30 UTC. set bestOf:5 (and bo:5 if present for compat)
  const upd:any={ bestOf:5, scheduledTime:"2026-06-20T09:30:00Z" };
  if(b.bo!==undefined) upd.bo=5;
  await ref.update(upd);
  const a:any=(await ref.get()).data();
  console.log(`AFTER : ${a.team1Name} vs ${a.team2Name} | bestOf=${a.bestOf} bo=${a.bo??"-"} sched=${ist(a.scheduledTime)} status=${a.status}`);
  process.exit(0);
})();
