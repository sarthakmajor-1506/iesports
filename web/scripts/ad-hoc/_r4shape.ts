import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const ts=await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("teams").get();
  console.log("TEAMS:");ts.docs.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true})).forEach(t=>console.log("  "+t.id+" = "+(t.data() as any).teamName));
  const m:any=(await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches").doc("r4-match-1").get()).data();
  console.log("\nr4-match-1 base fields:");
  ["tournamentId","matchDay","matchIndex","isBracket","bestOf","status","team1Score","team2Score","team1Id","team1Name","team2Id","team2Name","team1Logo","team2Logo","createdAt"].forEach(k=>console.log("  "+k+" = "+JSON.stringify(m[k])));
  process.exit(0);
})();
