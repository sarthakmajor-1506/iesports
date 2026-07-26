import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const ist=(z:string)=>z?new Date(z).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit",hour12:true}):"—";
(async()=>{
  const col=db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches");
  for(const id of ["r3-match-1","r3-match-2","r3-match-3","r3-match-4","r3-match-5"]){
    const d:any=(await col.doc(id).get()).data();
    console.log(`${id}: status=${d.status.padEnd(9)} ${ist(d.scheduledTime)}  ${d.team1Name} vs ${d.team2Name}  | live-cruft: dotaMatchId=${d.dotaMatchId??"—"} lobbyStatus=${d.lobbyStatus??"—"} vetoState=${d.vetoState?"PRESENT":"—"}`);
  }
  const q=await db.collection("botQueues").where("tournamentId","==","domin8-ultimate-tilt-proof-tournament").where("tournamentMatchId","==","r3-match-1").get();
  console.log(`\nr3-match-1 botQueues remaining: ${q.size} (expect 0)`);
  process.exit(0);
})();
