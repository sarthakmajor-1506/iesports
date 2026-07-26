import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  for(const id of ["r2-match-3","r2-match-4","r2-match-5"]){
    const m:any=(await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches").doc(id).get()).data();
    const g=m.game1||{};
    console.log(`${id}: ps=${(g.playerStats||[]).length} winner=${g.winner} radScore=${g.radiantScore} direScore=${g.direScore} radTeam=${g.radiantTeamId} | series team1Score=${m.team1Score} team2Score=${m.team2Score}`);
  }
  process.exit(0);
})();
