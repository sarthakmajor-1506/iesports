import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="league-of-rising-stars-ascension";
const RANK_ORDER=["Radiant","Immortal","Ascendant","Diamond","Platinum","Gold","Silver","Bronze","Iron","Unranked"];
const baseRank=(s:string)=>{const b=String(s||"").split(" ")[0];return RANK_ORDER.includes(b)?b:"Unranked";};
(async()=>{
  const t:any=(await db.collection("valorantTournaments").doc(TID).get()).data();
  const teams=(await db.collection("valorantTournaments").doc(TID).collection("teams").get()).docs.map(d=>({id:d.id,...(d.data() as any)}));
  const matches=(await db.collection("valorantTournaments").doc(TID).collection("matches").get()).docs.map(d=>({id:d.id,...(d.data() as any)}));
  const lb=(await db.collection("valorantTournaments").doc(TID).collection("leaderboard").get()).docs.map(d=>({id:d.id,...(d.data() as any)}));
  const players=(await db.collection("valorantTournaments").doc(TID).collection("soloPlayers").get()).docs.map(d=>({uid:d.id,...(d.data() as any)}));
  const gf:any=matches.find((m:any)=>m.id==="grand-final");
  console.log("GF status:",gf.status,"-> wrap shows?",gf.status==="completed"?"YES":"NO (gated, correct while live)");
  // simulate completion to verify computation
  const winnerId=(gf.team1Score>=gf.team2Score)?gf.team1Id:gf.team2Id;
  const loserId=winnerId===gf.team1Id?gf.team2Id:gf.team1Id;
  const byId:any={};teams.forEach((t:any)=>byId[t.id]=t);
  console.log("\nIF completed now (2-2 -> team1 by tiebreak):");
  console.log("  Champion:",byId[winnerId]?.teamName,"prize ₹"+(t.prizeWinner||0).toLocaleString("en-IN"),"| roster:",(byId[winnerId]?.members||[]).map((m:any)=>m.riotGameName).join(", "));
  console.log("  Runner-up:",byId[loserId]?.teamName,"prize ₹"+(t.prizeRunnerUp||0).toLocaleString("en-IN"));
  // tier MVPs
  const rankByUid:any={};players.forEach((p:any)=>rankByUid[p.uid]=p.iesportsRank||p.riotRank||"");
  teams.forEach((tm:any)=>(tm.members||[]).forEach((m:any)=>{if(m.uid&&!rankByUid[m.uid])rankByUid[m.uid]=m.riotRank||"";}));
  const grp:any={};lb.forEach((l:any)=>{const tier=baseRank(rankByUid[l.uid||l.id]||"");(grp[tier]=grp[tier]||[]).push(l);});
  const kda=(l:any)=>((l.totalKills||0)+0.5*(l.totalAssists||0))/Math.max(1,l.totalDeaths||1);
  console.log("\n  TIER MVPs:");
  Object.keys(grp).sort((a,b)=>RANK_ORDER.indexOf(a)-RANK_ORDER.indexOf(b)).forEach(tier=>{
    const best=grp[tier].slice().sort((a:any,b:any)=>kda(b)-kda(a))[0];
    console.log(`    ${tier.padEnd(10)} ${best.name} (${best.totalKills}/${best.totalDeaths}/${best.totalAssists}, ${kda(best).toFixed(2)} KDA)`);
  });
  process.exit(0);
})();
