import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { enrichDotaMatch, needsDotaEnrich } from "../../lib/dotaEnrich";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="domin8-ultimate-tilt-proof-tournament";
(async()=>{
  const ms=await db.collection("tournaments").doc(TID).collection("matches").get();
  const all=ms.docs.map(d=>({id:d.id,...d.data()})) as any[];
  const todo=all.filter(needsDotaEnrich);
  console.log(`completed matches missing details: ${todo.length} -> ${todo.map(m=>m.id).join(", ")||"none"}`);
  for(const m of todo){
    const before=(m.game1?.playerStats||[]).length;
    const out=await enrichDotaMatch(db,TID,m);
    const after=(out.game1?.playerStats||[]).length;
    console.log(`  ${m.id}: ${m.team1Name} vs ${m.team2Name} -> ${after?`enriched (${after} players)`:"OpenDota not ready yet"}`);
  }
  process.exit(0);
})();
