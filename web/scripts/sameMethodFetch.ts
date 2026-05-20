/* Use the EXACT method the platform uses on player join:
   GET api.opendota.com/api/players/{steam32}/recentMatches
   for every Domin8 played-match roster player, and look for
   match 8813888349 + any tournament-day practice lobby. */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });
const TID="domin8-ultimate-tilt-proof-tournament";
const PLAYED=["r1-match-1","r1-match-2","r1-match-3","r1-match-5","r1-match-6"];
const TARGET="8813888349";
const BASE=BigInt("76561197960265728");
const to32=(s?:string|null)=>{try{return s?(BigInt(s)-BASE).toString():null;}catch{return null;}};
const sleep=(m:number)=>new Promise(r=>setTimeout(r,m));
const D0=Date.parse("2026-05-16T00:00:00Z")/1000;
(async()=>{
  const db=getFirestore(); const seen=new Set<string>(); const roster:any[]=[];
  for(const id of PLAYED){
    const md=(await db.collection("tournaments").doc(TID).collection("matches").doc(id).get()).data(); if(!md)continue;
    for(const tid of [md.team1Id,md.team2Id]){
      const t=(await db.collection("tournaments").doc(TID).collection("teams").doc(tid).get()).data();
      for(const m of (t?.members||[])as any[]){
        let s:string|null=null;
        try{s=(await db.collection("users").doc(m.uid).get()).data()?.steamId||null;}catch{}
        if(!s&&typeof m.uid==="string"&&m.uid.startsWith("steam_"))s=m.uid.slice(6);
        const s32=to32(s); const key=s32||m.uid; if(seen.has(key))continue; seen.add(key);
        roster.push({name:m.fullName||m.uid,s32});
      }
    }
  }
  console.log(`Roster players: ${roster.length} (${roster.filter(r=>r.s32).length} with steam)`);
  let foundTarget=false; const dayLobbies:any[]=[];
  for(const p of roster.filter(r=>r.s32)){
    let rm:any[]=[];
    try{ rm=await(await fetch(`https://api.opendota.com/api/players/${p.s32}/recentMatches`)).json() as any[]; }catch{}
    await sleep(1100);
    const arr=Array.isArray(rm)?rm:[];
    const hit=arr.find(x=>String(x.match_id)===TARGET);
    const day=arr.filter(x=>x.start_time>=D0);
    if(hit){foundTarget=true; console.log(`  ★ ${p.name}: HAS ${TARGET} lobby_type=${hit.lobby_type}`);}
    for(const d of day) dayLobbies.push({who:p.name,mid:d.match_id,lt:d.lobby_type,t:new Date(d.start_time*1000).toISOString()});
    console.log(`  ${p.name.padEnd(18)} public=${arr.length?"Y":"N"} recent=${arr.length} tourneyDay=${day.length} ${day.map(d=>`${d.match_id}(lt${d.lobby_type})`).join(",")}`);
  }
  console.log(`\nMatch ${TARGET} present in ANY player's OpenDota history: ${foundTarget?"YES":"NO"}`);
  const lt1=dayLobbies.filter(d=>d.lt===1);
  console.log(`Tournament-day PRACTICE lobbies (lt=1) across all players: ${lt1.length}`);
  lt1.forEach(d=>console.log(`  ${d.mid} ${d.who} ${d.t}`));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
