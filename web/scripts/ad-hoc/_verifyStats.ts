import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
(async()=>{
  const m:any=(await db.collection("tournaments").doc("dota-test-major-shrey").collection("matches").doc("r1-match-1").get()).data();
  const g=m.game1||{};
  console.log("game1.winner:",g.winner,"| radiantScore:",g.radiantScore,"direScore:",g.direScore,"| radiantTeamId:",g.radiantTeamId,"direTeamId:",g.direTeamId);
  console.log("playerStats count:",(g.playerStats||[]).length,"| draft picks R/D:",(g.draft?.radiant?.picks||[]).length,"/",(g.draft?.dire?.picks||[]).length);
  (g.playerStats||[]).slice(0,2).forEach((p:any)=>console.log("  ",p.side,p.hero,`${p.kills}/${p.deaths}/${p.assists}`,"nw"+p.netWorth,"items:",(p.items||[]).filter((x:any)=>x).map((x:any)=>x.name).join(",")||"none"));
  process.exit(0);
})();
