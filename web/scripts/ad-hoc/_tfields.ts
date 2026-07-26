import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const t:any=(await db.collection("valorantTournaments").doc("league-of-rising-stars-ascension").get()).data();
  console.log("bracketBestOf:",t.bracketBestOf,"| lbFinalBestOf:",t.lbFinalBestOf,"| grandFinalBestOf:",t.grandFinalBestOf,"| eliminationBestOf:",t.eliminationBestOf);
  process.exit(0);
})();
