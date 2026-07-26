import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  // prizeWinner / prizeRunnerUp drive the wrap. Change here anytime.
  const winner=Number(process.argv[2]||15000), runnerUp=Number(process.argv[3]||10000);
  await db.collection("valorantTournaments").doc("league-of-rising-stars-ascension").set({prizeWinner:winner,prizeRunnerUp:runnerUp},{merge:true});
  console.log(`set prizeWinner=₹${winner.toLocaleString("en-IN")} prizeRunnerUp=₹${runnerUp.toLocaleString("en-IN")}`);
  process.exit(0);
})();
