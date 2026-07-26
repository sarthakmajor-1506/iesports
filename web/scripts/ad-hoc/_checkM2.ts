import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const m:any=(await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches").doc("r3-match-2").get()).data();
  console.log(`r3-match-2: ${m.team1Name} vs ${m.team2Name}`);
  console.log(`status=${m.status} lobbyStatus=${m.lobbyStatus??"—"} dotaMatchId=${m.dotaMatchId??"—"} botQueueId=${m.botQueueId??"—"} startedAt=${m.startedAt??"—"} vetoState=${m.vetoState?"present":"—"} game1=${m.game1?"present":"—"}`);
  const qs=await db.collection("botQueues").where("tournamentId","==","domin8-ultimate-tilt-proof-tournament").where("tournamentMatchId","==","r3-match-2").get();
  console.log(`botQueues: ${qs.size}`);qs.forEach(q=>{const d:any=q.data();console.log(`  [${q.id}] status=${d.status} dotaMatchId=${d.dotaMatchId??"—"}`);});
  process.exit(0);
})();
