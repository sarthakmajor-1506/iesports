import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({ projectId:process.env.FIREBASE_PROJECT_ID!, clientEmail:process.env.FIREBASE_CLIENT_EMAIL!, privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });
(async()=>{
  const d=(await getFirestore().collection("valorantTournaments").doc("league-of-rising-stars-ascension").collection("matches").doc("round4-match5").get()).data() as any;
  console.log(JSON.stringify({status:d.status,team1Name:d.team1Name,team2Name:d.team2Name,team1Score:d.team1Score,team2Score:d.team2Score,winner:d.winner,
    g1:{id:d.games?.game1?.valorantMatchId,map:d.games?.game1?.mapName,winner:d.games?.game1?.winner,score:`${d.games?.game1?.team1RoundsWon}-${d.games?.game1?.team2RoundsWon}`},
    g2:{id:d.games?.game2?.valorantMatchId,map:d.games?.game2?.mapName,winner:d.games?.game2?.winner,score:`${d.games?.game2?.team1RoundsWon}-${d.games?.game2?.team2RoundsWon}`},
    playerStats:Array.isArray(d.playerStats)?d.playerStats.length:0, team1Subs:(d.team1Subs||[]).map((s:any)=>s.name), team2Subs:(d.team2Subs||[]).map((s:any)=>s.name)},null,2));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
