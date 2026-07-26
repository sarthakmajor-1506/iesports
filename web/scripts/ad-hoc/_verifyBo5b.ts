import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const t:any=(await db.collection("valorantTournaments").doc("league-of-rising-stars-ascension").get()).data();
  const m:any=(await db.collection("valorantTournaments").doc("league-of-rising-stars-ascension").collection("matches").doc("lb-final").get()).data();
  console.log("RAW: match.bestOf =", m.bestOf, "| tournament.lbFinalBestOf =", t.lbFinalBestOf, "| m.bracketType =", m.bracketType, "| m.id =", m.id, "| m.isBracket =", m.isBracket);
  // tournament-page card logic (line 1802): grand_final? else (id==lb-final && lbFinalBestOf)? lbFinalBestOf : bracketBestOf
  let tp;
  if(m.bracketType==="grand_final") tp=t.grandFinalBestOf||3;
  else if(m.id==="lb-final" && t.lbFinalBestOf) tp=t.lbFinalBestOf;
  else tp=t.bracketBestOf||2;
  console.log("tournament-page card BO =", tp);
  console.log("match-detail BO =", m.bestOf || tp);
  process.exit(0);
})();
