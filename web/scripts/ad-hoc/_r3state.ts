import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const ist=(z:string)=>z?new Date(z).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit",hour12:true}):"—";
(async()=>{
  const col=db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches");
  const snap=await col.get();
  const rows:any[]=[];
  snap.forEach(m=>{const d:any=m.data();if(m.id.startsWith("r3-"))rows.push(d);});
  rows.sort((a,b)=>(a.scheduledTime||"").localeCompare(b.scheduledTime||""));
  for(const d of rows){
    console.log(`${d.id}: status=${(d.status||"").padEnd(9)} ${ist(d.scheduledTime).padEnd(22)} ${d.team1Name} vs ${d.team2Name}${d.winner?`  [WINNER ${d.winner}]`:""}`);
  }
  process.exit(0);
})();
