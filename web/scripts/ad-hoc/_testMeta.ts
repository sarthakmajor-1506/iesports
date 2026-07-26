import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const m:any=(await db.collection("tournaments").doc("dota-test-major-shrey").collection("matches").doc("r1-match-1").get()).data();
  const isT1Rad = m?.vetoState?.radiantTeam !== "team2";
  console.log("dotaMatchId:", m?.dotaMatchId || m?.game1?.dotaMatchId || "—");
  console.log("status:", m?.status, "| bestOf:", m?.bestOf, "| radiantTeam:", m?.vetoState?.radiantTeam||"(default team1)");
  console.log("Radiant:", isT1Rad?m?.team1Name:m?.team2Name, "| Dire:", isT1Rad?m?.team2Name:m?.team1Name);
  console.log("series score R-D:", isT1Rad?`${m?.team1Score}-${m?.team2Score}`:`${m?.team2Score}-${m?.team1Score}`);
  process.exit(0);
})();
