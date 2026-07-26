import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const ref=db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches").doc("r3-match-2");
  const b:any=(await ref.get()).data();
  console.log(`BEFORE: ${b.team1Name} (${b.team1Id}) vs ${b.team2Name} (${b.team2Id})`);
  await ref.update({ team1Id:"team-1", team1Name:"10k ke Pohe" });
  const a:any=(await ref.get()).data();
  console.log(`AFTER : ${a.team1Name} (${a.team1Id}) vs ${a.team2Name} (${a.team2Id})  status=${a.status}`);
  process.exit(0);
})();
