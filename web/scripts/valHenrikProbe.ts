import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
const KEY=process.env.HENRIK_API_KEY!;
const P="29c7a26a-3a9b-58d8-9659-3e160dd8689e"; // Secondtonone (ALPHAS sub)
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function tryUrl(label:string,url:string){
  for(let a=1;a<=3;a++){
    const r=await fetch(url,{headers:{Authorization:KEY}});
    if(r.status===429){ console.log(`${label}: 429 (try ${a})`); await sleep(32000); continue; }
    let j:any=null; try{ j=await r.json(); }catch{}
    const d=j?.data;
    const n=Array.isArray(d)?d.length:(d?.matches?.length ?? (d?(typeof d):0));
    console.log(`${label}: HTTP ${r.status}  dataLen=${n}  ${j?.status?("status="+j.status):""} ${j?.errors?JSON.stringify(j.errors).slice(0,160):""}`);
    if(Array.isArray(d)&&d.length){
      d.slice(0,3).forEach((m:any)=>console.log(`   ${m?.metadata?.matchid||m?.meta?.id} ${m?.metadata?.game_start_patched||m?.meta?.started_at||m?.metadata?.started_at} ${m?.metadata?.map||m?.meta?.map?.name} ${m?.metadata?.mode||m?.meta?.mode}`));
    }
    return;
  }
}
(async()=>{
  await tryUrl("v3 size=25","https://api.henrikdev.xyz/valorant/v3/by-puuid/matches/ap/"+P+"?size=25"); await sleep(3000);
  await tryUrl("v4 size=25","https://api.henrikdev.xyz/valorant/v4/by-puuid/matches/ap/pc/"+P+"?size=25"); await sleep(3000);
  await tryUrl("v4 mode=custom","https://api.henrikdev.xyz/valorant/v4/by-puuid/matches/ap/pc/"+P+"?mode=custom&size=10"); await sleep(3000);
  await tryUrl("v1 stored by-puuid","https://api.henrikdev.xyz/valorant/v1/by-puuid/stored-matches/ap/"+P+"?size=20"); 
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
