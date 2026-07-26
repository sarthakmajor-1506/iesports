import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const ist=(z:string)=>z?new Date(z).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit",hour12:true}):"— (no time)";
(async()=>{
  const ms=await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches").get();
  const all=ms.docs.map(d=>({id:d.id,...(d.data() as any)}));
  // group by round prefix
  const byRound:Record<string,any[]>={};
  all.forEach((m:any)=>{const r=(m.id.match(/^r(\d+)-/)||[])[1]||"other";(byRound[r]=byRound[r]||[]).push(m);});
  for(const r of Object.keys(byRound).sort((a,b)=>Number(a)-Number(b))){
    console.log(`\n=== Round ${r} (${byRound[r].length} matches) ===`);
    byRound[r].sort((a:any,b:any)=>a.id.localeCompare(b.id,undefined,{numeric:true})).forEach((m:any)=>{
      console.log(`  ${m.id.padEnd(12)} ${(m.status||"").padEnd(10)} ${ist(m.scheduledTime).padEnd(24)} ${m.team1Name} vs ${m.team2Name}`);
    });
  }
  process.exit(0);
})();
