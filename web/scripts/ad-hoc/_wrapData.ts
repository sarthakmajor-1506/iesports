import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="league-of-rising-stars-ascension";
(async()=>{
  const t:any=(await db.collection("valorantTournaments").doc(TID).get()).data();
  console.log("=== TOURNAMENT DOC (prize/status/bracket-related keys) ===");
  console.log("status:",t.status,"| name:",t.name);
  console.log("prizePool:",JSON.stringify(t.prizePool));
  Object.keys(t).filter(k=>/prize|winner|champ|runner|mvp|bracket|reward/i.test(k)).forEach(k=>console.log("  "+k+":",JSON.stringify(t[k]).slice(0,200)));
  console.log("\n=== GRAND FINAL + bracket finals ===");
  const ms=await db.collection("valorantTournaments").doc(TID).collection("matches").get();
  ms.docs.map(d=>({id:d.id,...(d.data() as any)})).filter((m:any)=>/grand|final|gf|wb-final|lb-final/i.test(m.id)||/final/i.test(m.bracketLabel||"")).forEach((m:any)=>{
    console.log(`  ${m.id} [${m.bracketLabel}] ${m.team1Name} vs ${m.team2Name} | status=${m.status} score=${m.team1Score}-${m.team2Score} winner=${m.winnerName||m.winnerId||"—"} bestOf=${m.bestOf}`);
  });
  console.log("\n=== teams (id->name->roster size + logo) ===");
  const teams=await db.collection("valorantTournaments").doc(TID).collection("teams").get();
  teams.docs.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true})).forEach(t=>{const d:any=t.data();console.log(`  ${t.id} = ${d.teamName} (${(d.members||[]).length} players)${d.teamLogo?" [logo]":""}`);});
  process.exit(0);
})();
