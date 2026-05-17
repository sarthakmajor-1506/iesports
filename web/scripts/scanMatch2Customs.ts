/**
 * Scan all 10 Domin8 Match-2 roster players' OpenDota recentMatches for a
 * CUSTOM-LOBBY game (lobby_type 1) on/after the tournament date, and tally
 * shared match_ids. Finds the game even if only a few players are public,
 * as long as ≥2 public players were in it.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });

const TID="domin8-ultimate-tilt-proof-tournament";
const OD="https://api.opendota.com/api";
const TOURNEY_START = Date.parse("2026-05-16T00:00:00Z")/1000;
const BASE=BigInt("76561197960265728");
const to32=(id?:string|null)=>{try{return id?(BigInt(id)-BASE).toString():null;}catch{return null;}};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

async function main(){
  const db=getFirestore();
  const m=(await db.collection("tournaments").doc(TID).collection("matches").doc("r1-match-2").get()).data()!;
  const roster:any[]=[];
  for(const tid of [m.team1Id,m.team2Id]){
    const t=(await db.collection("tournaments").doc(TID).collection("teams").doc(tid).get()).data();
    for(const mem of (t?.members||[]) as any[]){
      let s=null as string|null, name=mem.fullName||mem.uid;
      try{const u=(await db.collection("users").doc(mem.uid).get()).data()||{}; s=u.steamId||null; name=mem.fullName||u.steamName||mem.uid;}catch{}
      if(!s && typeof mem.uid==="string"&&mem.uid.startsWith("steam_")) s=mem.uid.slice(6);
      roster.push({name,steam32:to32(s),teamId:tid});
    }
  }
  console.log(`Match 2 roster (${roster.length}): ${roster.map(r=>r.name+(r.steam32?"":"(no steam)")).join(", ")}\n`);

  const tally=new Map<string,{count:number;start:number;players:string[]}>();
  for(const p of roster.filter(r=>r.steam32)){
    try{
      const rm=await (await fetch(`${OD}/players/${p.steam32}/recentMatches`)).json() as any[];
      await sleep(1100);
      const customs=(Array.isArray(rm)?rm:[]).filter(x=>x.lobby_type===1 && x.start_time>=TOURNEY_START);
      console.log(`  ${p.name.padEnd(20)} public=${Array.isArray(rm)&&rm.length?"yes":"no "}  tourney-custom-lobbies=${customs.length}${customs.map(c=>` ${c.match_id}`).join("")}`);
      for(const c of customs){ const e=tally.get(String(c.match_id))||{count:0,start:c.start_time,players:[]}; e.count++; e.players.push(p.name); tally.set(String(c.match_id),e); }
    }catch{ console.log(`  ${p.name}: fetch error`); }
  }
  const ranked=[...tally.entries()].sort((a,b)=>b[1].count-a[1].count);
  console.log(`\n=== shared tournament-day custom lobbies ===`);
  if(!ranked.length){ console.log("  NONE — no Match-2 player has a tournament-day custom-lobby game in public OpenDota history."); return; }
  ranked.forEach(([mid,e])=>console.log(`  ${mid}  players=${e.count} (${e.players.join(", ")})  start=${new Date(e.start*1000).toISOString()}`));
  const top=ranked[0];
  console.log(`\nBest candidate: ${top[0]} (${top[1].count} roster players). If correct:\n  npx tsx scripts/fetchDotaMatchResult.ts --match=r1-match-2 --anchor=827178822847430677 --matchid=${top[0]} --apply`);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
