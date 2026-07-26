import { config } from "dotenv"; config({ path: ".env.local" });
const LEAGUE:[string,string][]=[["8841547007","r3m1 10kPohe(D,won) vs Toxic(R)"],["8841465741","r3m3 10kPohe(R) vs DogTamers(D,won)"],["8841382804","r3m4 Toxic(R,won) vs Versatile(D)"],["8841284748","r3m5 Toxic(R) vs DogTamers(D,won)"]];
(async()=>{
  const heroes=(await (await fetch("https://api.opendota.com/api/heroes")).json()) as any[];
  const hn:Record<number,string>={}; heroes.forEach(h=>hn[h.id]=h.localized_name);
  const items=(await (await fetch("https://api.opendota.com/api/constants/items")).json()) as Record<string,any>;
  const inm:Record<number,string>={}; Object.entries(items).forEach(([k,v]:any)=>{if(v&&typeof v.id==="number")inm[v.id]=v.dname||k;});
  for(const [id,label] of LEAGUE){
    const j:any=await (await fetch(`https://api.opendota.com/api/matches/${id}`)).json();
    console.log(`\n=== ${label} (${id}) ===`);
    (j.players||[]).sort((a:any,b:any)=>(b.net_worth||0)-(a.net_worth||0)).forEach((p:any)=>{
      const its=[p.item_0,p.item_1,p.item_2,p.item_3,p.item_4,p.item_5].filter((x:number)=>x>0).map((x:number)=>inm[x]||("#"+x));
      const neutral=p.item_neutral?inm[p.item_neutral]:"";
      console.log(`  ${p.isRadiant?"R":"D"} ${String(p.personaname).slice(0,15).padEnd(15)} ${hn[p.hero_id].padEnd(15)} nw${String(p.net_worth).padStart(6)} | ${its.join(", ")}${neutral?` [N:${neutral}]`:""}`);
    });
    await new Promise(r=>setTimeout(r,900));
  }
  process.exit(0);
})();
