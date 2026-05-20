/* Scan Henrik history (larger window, 429 backoff) for ALPHAS vs BABY BOOMERS
   round4-match5 games on ~2026-05-17. Seeds from subs + full rosters. */
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
const KEY=process.env.HENRIK_API_KEY!;
const REGION="ap";
const T1=["de455ac6-a5c7-5dc5-abff-d80876c0b227","ea6dcb2c-fea9-58b5-91a5-9e3d2b2a52ff","e1e72a84-b097-5562-a015-99e53cb28f07","2ede81f3-ec9b-5a84-87d7-39cd95048e06","4fa2f597-1bc1-5ca5-a9db-6c06c84f9b6b","29c7a26a-3a9b-58d8-9659-3e160dd8689e"]; // ALPHAS +sub Secondtonone
const T2=["32115455-fd7c-5bbd-a16d-bf468a2fccaf","76399ccf-464b-50e0-a6c2-8f38c8544e77","ac3c4643-8367-54c8-854c-46d9e5f3a523","b0831c01-d138-5042-8265-6cb710901d7f","be80658b-6191-5d86-8d56-e4da65ddbc2f","fdbdfdeb-f968-5f65-9b9b-5407e7e6317c"]; // BABYBOOMERS +sub Bubble
const S1=new Set(T1), S2=new Set(T2);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
// seed order: subs first (definitely played, fewer games since)
const SEEDS=["29c7a26a-3a9b-58d8-9659-3e160dd8689e","fdbdfdeb-f968-5f65-9b9b-5407e7e6317c",...T1.slice(0,5),...T2.slice(0,5)];
async function hist(puuid:string){
  for(let a=1;a<=6;a++){
    const r=await fetch(`https://api.henrikdev.xyz/valorant/v3/by-puuid/matches/${REGION}/${puuid}?size=25`,{headers:{Authorization:KEY}});
    if(r.ok) return (await r.json()).data||[];
    if(r.status===429){ const w=30000+a*5000; console.log(`  ${puuid.slice(0,8)} 429, wait ${w/1000}s`); await sleep(w); continue; }
    console.log(`  ${puuid.slice(0,8)} status ${r.status}`); return [];
  }
  return [];
}
(async()=>{
  const byId:Record<string,any>={};
  for(const s of SEEDS){
    const d=await hist(s); console.log(`seed ${s.slice(0,8)}: ${d.length} matches`);
    for(const md of d){ const id=md?.metadata?.matchid; if(id&&!byId[id]) byId[id]=md; }
    await sleep(2500);
  }
  const rows=Object.values(byId).map((md:any)=>{
    const ps:any[]=md?.players?.all_players||md?.players||[];
    let t1=0,t2=0; for(const p of ps){ if(S1.has(p?.puuid))t1++; if(S2.has(p?.puuid))t2++; }
    return {id:md?.metadata?.matchid,map:md?.metadata?.map,start:md?.metadata?.game_start_patched||md?.metadata?.started_at,mode:md?.metadata?.mode,t1,t2};
  }).filter(r=>r.t1>=3&&r.t2>=3).sort((a:any,b:any)=>String(b.start).localeCompare(String(a.start)));
  console.log(`\n=== candidate joint matches (t1>=3 & t2>=3) ===`);
  rows.forEach((r:any)=>console.log(`${r.id}  ${r.start}  ${r.map}  ${r.mode}  ALPHAS=${r.t1} BABY=${r.t2}`));
  if(!rows.length) console.log("none — try larger size / different seeds");
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
