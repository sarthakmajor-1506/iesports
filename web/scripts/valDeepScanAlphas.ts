/* Deep scan via Henrik v1 stored-matches (longer history) for any 2026-05-17
   game joining ALPHAS+BABYBOOMERS (incl. subs). 429 backoff. */
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
const KEY=process.env.HENRIK_API_KEY!;
const T1=["de455ac6-a5c7-5dc5-abff-d80876c0b227","ea6dcb2c-fea9-58b5-91a5-9e3d2b2a52ff","e1e72a84-b097-5562-a015-99e53cb28f07","2ede81f3-ec9b-5a84-87d7-39cd95048e06","4fa2f597-1bc1-5ca5-a9db-6c06c84f9b6b","29c7a26a-3a9b-58d8-9659-3e160dd8689e"];
const T2=["32115455-fd7c-5bbd-a16d-bf468a2fccaf","76399ccf-464b-50e0-a6c2-8f38c8544e77","ac3c4643-8367-54c8-854c-46d9e5f3a523","b0831c01-d138-5042-8265-6cb710901d7f","be80658b-6191-5d86-8d56-e4da65ddbc2f","fdbdfdeb-f968-5f65-9b9b-5407e7e6317c"];
const S1=new Set(T1),S2=new Set(T2),ALL=[...T1,...T2];
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function stored(p:string){
  for(let a=1;a<=6;a++){
    const r=await fetch(`https://api.henrikdev.xyz/valorant/v1/by-puuid/stored-matches/ap/${p}?size=20`,{headers:{Authorization:KEY}});
    if(r.status===429){ await sleep(30000+a*5000); continue; }
    if(!r.ok){ console.log(`  ${p.slice(0,8)} HTTP ${r.status}`); return []; }
    return (await r.json()).data||[];
  }
  return [];
}
(async()=>{
  const byId:Record<string,any>={};
  for(const p of ALL){
    const d=await stored(p);
    const may17=d.filter((m:any)=>String(m?.meta?.started_at||"").startsWith("2026-05-17")).length;
    console.log(`${p.slice(0,8)}: ${d.length} stored, ${may17} on 2026-05-17`);
    for(const m of d){ const id=m?.meta?.id; if(id&&!byId[id]) byId[id]=m; }
    await sleep(2200);
  }
  const rows=Object.values(byId).map((m:any)=>{
    // stored-matches shape differs; players under m.players or m.stats? probe both
    const ps:any[]=m?.players?.all_players||m?.players||[];
    let t1=0,t2=0; for(const p of ps){ const pu=p?.puuid; if(S1.has(pu))t1++; if(S2.has(pu))t2++; }
    return {id:m?.meta?.id,start:m?.meta?.started_at,map:m?.meta?.map?.name,mode:m?.meta?.mode,t1,t2,np:ps.length};
  }).sort((a:any,b:any)=>String(b.start).localeCompare(String(a.start)));
  console.log(`\n=== all 2026-05-17 matches across the 12 ===`);
  rows.filter((r:any)=>String(r.start).startsWith("2026-05-17")).forEach((r:any)=>console.log(`${r.id} ${r.start} ${r.map} ${r.mode} players=${r.np} A=${r.t1} B=${r.t2}`));
  console.log(`\n=== joint (A>=3 & B>=3) any date ===`);
  rows.filter((r:any)=>r.t1>=3&&r.t2>=3).forEach((r:any)=>console.log(`${r.id} ${r.start} ${r.map} ${r.mode} A=${r.t1} B=${r.t2}`));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
