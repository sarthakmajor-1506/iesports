import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });
(async()=>{
  const db=getFirestore();
  const d=(await db.collection("valorantTournaments").doc("league-of-rising-stars-ascension").collection("matches").doc("round4-match2").get()).data()!;
  console.log(JSON.stringify({team1Name:d.team1Name,team2Name:d.team2Name,status:d.status,team1Score:d.team1Score,team2Score:d.team2Score,
    g1:{map:d.games?.game1?.mapName,winner:d.games?.game1?.winner,score:`${d.games?.game1?.team1RoundsWon}-${d.games?.game1?.team2RoundsWon}`,status:d.games?.game1?.status},
    g2:{map:d.games?.game2?.mapName,winner:d.games?.game2?.winner,score:`${d.games?.game2?.team1RoundsWon}-${d.games?.game2?.team2RoundsWon}`,status:d.games?.game2?.status}},null,2));
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
