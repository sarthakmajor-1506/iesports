import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const ts=await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("teams").get();
  ts.docs.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true})).forEach(t=>{
    const d:any=t.data();
    console.log(`\n## ${t.id}  teamName="${d.teamName||d.name}"  memberKeys=[${Object.keys((d.members||[])[0]||{}).join(",")}]`);
    (d.members||[]).forEach((p:any,i:number)=>console.log(`  ${i+1}. name="${p.name||p.steamName||p.dotaName||""}" uid=${p.uid||"—"} steamId=${p.steamId||"—"} steam32=${p.steam32||"—"}`));
  });
  process.exit(0);
})();
