import { config } from "dotenv"; config({ path: ".env.local" });
const ids=["8822786393","8822928117","8832008522","8832216343"];
const KEY=process.env.STEAM_API_KEY||"";
(async()=>{
  const heroes=(await (await fetch("https://api.opendota.com/api/heroes")).json()) as any[];
  const hn:Record<number,string>={}; heroes.forEach(h=>hn[h.id]=h.localized_name);
  for(const id of ids){
    const j:any=await (await fetch("https://api.opendota.com/api/matches/"+id)).json();
    if(!j||j.radiant_win==null){console.log(`\n### ${id}: OpenDota NOT available (${j?.error||"-"}) leagueid=${j?.leagueid??"-"}`);continue;}
    console.log(`\n### ${id}: leagueid=${j.leagueid} radiant_win=${j.radiant_win} ${j.radiant_score}-${j.dire_score} dur=${Math.round(j.duration/60)}m start=${new Date((j.start_time||0)*1000).toISOString()}`);
    (j.players||[]).forEach((p:any)=>console.log(`   ${p.isRadiant?"R":"D"} ${(p.personaname||p.account_id||"anon").slice(0,18).padEnd(18)} ${hn[p.hero_id].padEnd(16)} ${p.kills}/${p.deaths}/${p.assists} nw${p.net_worth} lvl${p.level}`));
  }
  process.exit(0);
})();
