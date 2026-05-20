import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
const KEY=process.env.HENRIK_API_KEY!;
const S1=new Set(["de455ac6-a5c7-5dc5-abff-d80876c0b227","ea6dcb2c-fea9-58b5-91a5-9e3d2b2a52ff","e1e72a84-b097-5562-a015-99e53cb28f07","2ede81f3-ec9b-5a84-87d7-39cd95048e06","4fa2f597-1bc1-5ca5-a9db-6c06c84f9b6b","29c7a26a-3a9b-58d8-9659-3e160dd8689e"]);
const S2=new Set(["32115455-fd7c-5bbd-a16d-bf468a2fccaf","76399ccf-464b-50e0-a6c2-8f38c8544e77","ac3c4643-8367-54c8-854c-46d9e5f3a523","b0831c01-d138-5042-8265-6cb710901d7f","be80658b-6191-5d86-8d56-e4da65ddbc2f","fdbdfdeb-f968-5f65-9b9b-5407e7e6317c"]);
const CAND=["33ee02a3-5672-402b-8b1c-21826e970b00","d939e67a-386e-4c06-bb5f-1b3f5907811b","18ec7bd3-1852-4cb9-9a78-6d5ed4be343d","ced2b08c-2ef5-419d-9a9b-26fdbb464015"];
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function m(id:string){
  for(let a=1;a<=6;a++){
    const r=await fetch(`https://api.henrikdev.xyz/valorant/v2/match/${id}`,{headers:{Authorization:KEY}});
    if(r.status===429){ await sleep(30000+a*5000); continue; }
    if(!r.ok) return {err:r.status};
    return (await r.json()).data;
  }
  return {err:"retry-exhausted"};
}
(async()=>{
  for(const id of CAND){
    const d:any=await m(id);
    if(d?.err){ console.log(`${id}: ERR ${d.err}`); await sleep(4000); continue; }
    const ps:any[]=d?.players?.all_players||[];
    let a=0,b=0; const an:string[]=[],bn:string[]=[];
    for(const p of ps){ if(S1.has(p.puuid)){a++;an.push(p.name+"#"+p.tag);} if(S2.has(p.puuid)){b++;bn.push(p.name+"#"+p.tag);} }
    console.log(`\n${id}  ${d?.metadata?.map}  ${d?.metadata?.mode}  ${d?.metadata?.game_start_patched}`);
    console.log(`  ALPHAS=${a} [${an.join(", ")}]  BABYBOOMERS=${b} [${bn.join(", ")}]  total=${ps.length}`);
    await sleep(4000);
  }
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
