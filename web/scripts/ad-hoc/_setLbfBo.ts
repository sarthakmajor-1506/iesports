import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const ref=db.collection("valorantTournaments").doc("league-of-rising-stars-ascension");
  await ref.update({lbFinalBestOf:5});
  const t:any=(await ref.get()).data();
  console.log("lbFinalBestOf now:",t.lbFinalBestOf);
  process.exit(0);
})();
