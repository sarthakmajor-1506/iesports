import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const screenshotIds=["8822786393","8822928117","8832008522","8832216343"];
(async()=>{
  const ms=await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches").get();
  console.log("=== all completed matches (id | teams | score | completedAt | dotaMatchId | hasPlayerStats) ===");
  ms.docs.map(d=>({id:d.id,...(d.data() as any)})).filter((m:any)=>m.status==="completed").sort((a:any,b:any)=>String(a.completedAt).localeCompare(String(b.completedAt))).forEach((m:any)=>{
    const dmid=m.dotaMatchId||m.game1?.dotaMatchId||"-";
    const ps=(m.game1?.playerStats||[]).length;
    const match=screenshotIds.includes(String(dmid))?"  <<< SCREENSHOT":"";
    console.log(`  ${m.id.padEnd(12)} ${(m.team1Name+" v "+m.team2Name).padEnd(40)} ${m.team1Score}-${m.team2Score} ${String(m.completedAt).slice(0,10)} dmid=${dmid} ps=${ps}${match}`);
  });
  console.log("\nscreenshot IDs:",screenshotIds.join(", "));
  process.exit(0);
})();
