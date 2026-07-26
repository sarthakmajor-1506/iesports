import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const LEAGUE=19822;
(async()=>{
  for(const tid of ["dota-test-major-shrey","domin8-ultimate-tilt-proof-tournament"]){
    await db.collection("tournaments").doc(tid).set({dotaLeagueId:LEAGUE},{merge:true});
    const d:any=(await db.collection("tournaments").doc(tid).get()).data();
    console.log(`${tid}: dotaLeagueId=${d.dotaLeagueId}  name="${d.name}"`);
  }
  process.exit(0);
})();
