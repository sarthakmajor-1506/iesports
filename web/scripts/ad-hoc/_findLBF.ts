import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const ist=(z:string)=>z?new Date(z).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit",hour12:true}):"—";
(async()=>{
  // search both valorant + dota tournaments for toofani/muth matchups
  for(const [coll,tcoll] of [["valorantTournaments","valorant"],["tournaments","dota"]] as any){
    const ts=await db.collection(coll).get();
    for(const t of ts.docs){
      const ms=await db.collection(coll).doc(t.id).collection("matches").get();
      ms.forEach(m=>{const d:any=m.data();const blob=`${d.team1Name} ${d.team2Name} ${d.bracketLabel||""}`.toLowerCase();
        if(blob.includes("toofani")||blob.includes("muth")||/lower bracket final|lb.?final|lb-final/i.test(blob)){
          console.log(`[${tcoll}/${t.id}] ${m.id} [${d.bracketLabel||(d.isBracket?"bracket":"swiss")}] ${d.team1Name} vs ${d.team2Name} | bestOf=${d.bestOf} status=${d.status} sched=${ist(d.scheduledTime)}`);
        }});
    }
  }
  process.exit(0);
})();
