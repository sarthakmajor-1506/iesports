import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const m:any=(await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches").doc("r3-match-2").get()).data();
  console.log("r3-match-2: "+m.team1Name+" (t1="+m.team1Id+") vs "+m.team2Name+" (t2="+m.team2Id+")");
  console.log("status="+m.status+" score="+m.team1Score+"-"+m.team2Score+" winner="+(m.winner||"-")+" dotaMatchId="+(m.dotaMatchId||m.game1?.dotaMatchId||"-")+" sched="+m.scheduledTime+" bestOf="+m.bestOf);
  console.log("vetoState.radiantTeam="+(m.vetoState?.radiantTeam||"-"));
  process.exit(0);
})();
