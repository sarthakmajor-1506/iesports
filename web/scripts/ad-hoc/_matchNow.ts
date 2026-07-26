import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const m:any=(await db.collection("valorantTournaments").doc("league-of-rising-stars-ascension").collection("matches").doc("lb-r1-m2").get()).data();
  console.log(`lb-r1-m2: ${m.team1Name} vs ${m.team2Name} | status=${m.status} | score=${m.team1Score}-${m.team2Score} | winner=${m.winnerName||m.winnerId||"— (not decided)"}`);
  process.exit(0);
})();
