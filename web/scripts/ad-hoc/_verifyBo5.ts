import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const t:any=(await db.collection("valorantTournaments").doc("league-of-rising-stars-ascension").get()).data();
  const m:any=(await db.collection("valorantTournaments").doc("league-of-rising-stars-ascension").collection("matches").doc("lb-final").get()).data();
  const ist=(z:string)=>new Date(z).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit",hour12:true});
  // simulate each surface's bestOf resolution
  const tournPageBo = m.bracketType==="grand_final"?(t.grandFinalBestOf||3):(m.id==="lb-final"&&t.lbFinalBestOf?t.lbFinalBestOf:(t.bracketBestOf||2));
  const matchDetailBo = m.bestOf ? m.bestOf : tournPageBo; // post-fix
  const adminBo = m.bracketType==="grand_final"?(t.grandFinalBestOf||3):(m.id==="lb-final"&&t.lbFinalBestOf?t.lbFinalBestOf:(m.isBracket?(t.bracketBestOf||2):2));
  console.log(`MATCH: ${m.team1Name} vs ${m.team2Name} | match.bestOf=${m.bestOf} | sched=${ist(m.scheduledTime)}`);
  console.log(`tournament.lbFinalBestOf=${t.lbFinalBestOf}`);
  console.log(`Resolved BO -> tournament-page card: ${tournPageBo} | match-detail page: ${matchDetailBo} | admin panel: ${adminBo}`);
  console.log(`ALL BO5? ${tournPageBo===5&&matchDetailBo===5&&adminBo===5 ? "✅ YES":"❌ mismatch"}`);
  process.exit(0);
})();
