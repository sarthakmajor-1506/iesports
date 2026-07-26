import * as admin from "firebase-admin"; import {config} from "dotenv"; config({path:".env.local"});
if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=admin.firestore();
(async()=>{const s=await db.collection("valorantTournaments").doc("league-of-rising-stars-ascension").collection("teams").get();
const r:any[]=[];s.forEach(t=>{const d:any=t.data();r.push([t.id,d.teamName,d.whatsappTeamGroupId||"—"]);});
r.sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})).forEach(x=>console.log(`${x[0].padEnd(8)} ${(x[1]||"").padEnd(26)} ${x[2]}`));process.exit(0);})();
