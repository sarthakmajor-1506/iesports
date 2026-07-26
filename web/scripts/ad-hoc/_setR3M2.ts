import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const ref=db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches").doc("r3-match-2");
  const now=new Date().toISOString();
  await ref.set({
    status:"completed", team1Score:1, team2Score:0, winner:"team1",
    completedAt:now, lobbyStatus:"completed",
    resultAnnouncedAt:now, resultAnnouncedBackfill:true, // suppress announcer (manual, no auto-post)
    result:{source:"manual-admin",winnerTeam:"team1",fetchedAt:now},
  },{merge:true});
  const m:any=(await ref.get()).data();
  console.log("UPDATED r3-match-2: status="+m.status+" "+m.team1Name+" "+m.team1Score+"-"+m.team2Score+" "+m.team2Name+" winner="+m.winner+" ("+(m.winner==="team1"?m.team1Name:m.team2Name)+")");
  process.exit(0);
})();
