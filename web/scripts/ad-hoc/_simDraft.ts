import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="domin8-ultimate-tilt-proof-tournament";
(async()=>{
  const ts=await db.collection("tournaments").doc(TID).collection("teams").get();
  const teams:any[]=ts.docs.map(d=>({id:d.id,...(d.data() as any)}));
  const ms=await db.collection("tournaments").doc(TID).collection("matches").get();
  const matches:any[]=ms.docs.map(d=>({id:d.id,...(d.data() as any)}));
  // for team-1 (10k ke Pohe), show its upcoming opponents' ban targets
  const teamId="team-1";
  const upcoming=matches.filter(m=>(m.team1Id===teamId||m.team2Id===teamId)&&m.status!=="completed"&&m.scheduledTime&&m.team1Name!=="TBD"&&m.team2Name!=="TBD");
  for(const m of upcoming){
    const oppId=m.team1Id===teamId?m.team2Id:m.team1Id;
    const opp=teams.find(t=>t.id===oppId);
    const oppName=m.team1Id===teamId?m.team2Name:m.team1Name;
    const bans=(opp.members||[]).filter((p:any)=>(p.dotaHeroPool||[]).length).map((p:any)=>{const sig=[...p.dotaHeroPool].sort((a:any,b:any)=>b.games-a.games)[0];return `${p.steamName}→${sig.hero}(${sig.winPct}%)`;});
    console.log(`vs ${oppName}: BAN ${bans.join(", ")}`);
  }
  // 10k's own picks
  const me=teams.find(t=>t.id===teamId);
  const picks=(me.members||[]).filter((p:any)=>(p.dotaHeroPool||[]).length).map((p:any)=>{const sig=[...p.dotaHeroPool].sort((a:any,b:any)=>b.games-a.games)[0];return `${p.steamName}→${sig.hero}(${sig.winPct}%)`;});
  console.log(`\n10k ke Pohe PICKS: ${picks.join(", ")}`);
  process.exit(0);
})();
