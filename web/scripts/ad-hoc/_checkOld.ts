import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  for(const mid of ["r2-match-1","r3-match-6","r1-match-4","r3-match-1"]){
    const m:any=(await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches").doc(mid).get()).data();
    const dmid=String(m.dotaMatchId||m.game1?.dotaMatchId||"");
    const od:any=await (await fetch(`https://api.opendota.com/api/matches/${dmid}`)).json();
    console.log(`${mid} dmid=${dmid} completedAt=${m.completedAt||"?"} -> OpenDota: leagueid=${od?.leagueid??"—"} players=${od?.players?od.players.length:"none"} ${od?.error||""}`);
  }
  process.exit(0);
})();
