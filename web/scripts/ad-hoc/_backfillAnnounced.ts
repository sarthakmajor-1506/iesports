import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const ts=await db.collection("tournaments").where("game","==","dota2").get();
  let n=0;
  for(const t of ts.docs){
    const ms=await db.collection("tournaments").doc(t.id).collection("matches").get();
    for(const m of ms.docs){const d:any=m.data();if(d.status==="completed"&&!d.resultAnnouncedAt){await m.ref.set({resultAnnouncedAt:new Date().toISOString(),resultAnnouncedBackfill:true},{merge:true});n++;}}
  }
  console.log(`backfilled resultAnnouncedAt on ${n} existing completed dota matches (won't be re-announced)`);
  process.exit(0);
})();
