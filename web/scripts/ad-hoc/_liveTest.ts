import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const TID="dota-test-major-shrey", MID="r1-match-1";
  const m:any=(await db.collection("tournaments").doc(TID).collection("matches").doc(MID).get()).data();
  console.log("=== MATCH DOC ===");
  console.log("status:",m.status,"| lobbyStatus:",m.lobbyStatus,"| dotaMatchId:",m.dotaMatchId??"—","| startedAt:",m.startedAt??"—");
  console.log("scores:",m.team1Score,"-",m.team2Score,"| game1:",JSON.stringify(m.game1??null));
  console.log("teams:",m.team1Name,"vs",m.team2Name,"| botQueueId:",m.botQueueId??"—");

  console.log("\n=== botQueues for this match ===");
  const qs=await db.collection("botQueues").where("tournamentId","==",TID).where("tournamentMatchId","==",MID).get();
  qs.forEach(q=>{const d:any=q.data();console.log(`[${q.id}] status=${d.status} leagueId=${d.leagueId??"—"} dotaMatchId=${d.dotaMatchId??"—"} capturedAt=${d.dotaMatchIdCapturedAt??"—"} src=${d.dotaMatchIdSource??"—"}`);});

  console.log("\n=== bot published lobby state ===");
  for(const path of [["whatsappStatus","lobby"],["botStatus","lobby"],["lobbyState","current"],["whatsappStatus","dotaLobby"]]){
    const s=await db.collection(path[0]).doc(path[1]).get();
    if(s.exists){console.log(`${path[0]}/${path[1]}:`,JSON.stringify(s.data()).slice(0,1500));}
  }
  // list any status-ish collections
  console.log("\n=== scan likely live-state docs ===");
  for(const c of ["botLobbyState","dotaLobbyState","lobbyStatus","botHeartbeat"]){
    const snap=await db.collection(c).limit(3).get().catch(()=>null);
    if(snap&&!snap.empty){snap.forEach(d=>console.log(`${c}/${d.id}:`,JSON.stringify(d.data()).slice(0,800)));}
  }
  process.exit(0);
})();
