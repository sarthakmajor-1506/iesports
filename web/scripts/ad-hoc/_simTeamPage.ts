import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="domin8-ultimate-tilt-proof-tournament";
const norm=(s:string)=>String(s||"").toLowerCase().replace(/\[.*?\]/g,"").replace(/[^a-z0-9]/g,"").trim();
(async()=>{
  const ts=await db.collection("tournaments").doc(TID).collection("teams").get();
  const teams=ts.docs.map(d=>({id:d.id,...(d.data() as any)}));
  const ms=await db.collection("tournaments").doc(TID).collection("matches").get();
  const matches=ms.docs.map(d=>({id:d.id,...(d.data() as any)}));
  for(const teamId of ["team-1","team-4"]){
    const team:any=teams.find(t=>t.id===teamId);
    const mine=matches.filter((m:any)=>m.team1Id===teamId||m.team2Id===teamId);
    const completed=mine.filter((m:any)=>m.status==="completed");
    const won=(m:any)=>m.winner==="team1"?m.team1Id===teamId:m.winner==="team2"?m.team2Id===teamId:(m.team1Id===teamId?(m.team1Score>m.team2Score):(m.team2Score>m.team1Score));
    const wins=completed.filter(won).length;
    // roster name-match coverage
    const ourSide=(m:any)=>m.game1?.radiantTeamId===teamId?"radiant":m.game1?.direTeamId===teamId?"dire":null;
    const rows:any[]=[]; completed.forEach((m:any)=>{const s=ourSide(m);(m.game1?.playerStats||[]).filter((p:any)=>p.side===s).forEach((p:any)=>rows.push({name:p.name,hero:p.hero,d:p.deaths,k:p.kills}));});
    console.log(`\n${team.teamName} [${teamId}]: ${completed.length} completed, ${wins}W-${completed.length-wins}L, statRows=${rows.length}`);
    (team.members||[]).forEach((mem:any)=>{const key=norm(mem.steamName);const nm=(rn:string,k:string)=>rn===k?true:(rn.length<3||k.length<3)?false:(rn.includes(k)||k.includes(rn));const mr=rows.filter(r=>nm(norm(r.name),key));console.log(`   ${mem.steamName.padEnd(20)} matched ${mr.length} rows ${mr.length?`(heroes: ${[...new Set(mr.map(r=>r.hero).filter(h=>h&&h!=="?"))].slice(0,4).join(",")})`:"⚠ NO MATCH"}`);});
    const up=mine.filter((m:any)=>m.status!=="completed"&&m.scheduledTime).length;
    console.log(`   upcoming: ${up}`);
  }
  process.exit(0);
})();
