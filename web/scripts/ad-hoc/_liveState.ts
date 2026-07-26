import { config } from "dotenv"; config({ path: ".env.local" });
const KEY=process.env.STEAM_API_KEY||"";
(async()=>{
  const games=(await (await fetch(`https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${KEY}`)).json())?.result?.games||[];
  const g=games.find((x:any)=>String(x.match_id)==="8841465741");
  if(!g){console.log("match not in live feed (may have ended)");process.exit(0);}
  const sb=g.scoreboard||{};
  const nameOf:Record<string,string>={}; (g.players||[]).forEach((p:any)=>{if(p.account_id!=null)nameOf[p.account_id]=p.name;});
  console.log(`dur=${Math.floor((sb.duration||0)/60)}:${String(Math.round((sb.duration||0)%60)).padStart(2,"0")}  Radiant ${sb.radiant?.score||0} - ${sb.dire?.score||0} Dire  roshanResp=${sb.roshan_respawn_timer||0}`);
  const heroes=(await (await fetch("https://api.opendota.com/api/heroes")).json()) as any[];
  const hn:Record<number,string>={}; heroes.forEach(h=>hn[h.id]=h.localized_name);
  const dump=(side:any,lbl:string)=>{
    let nw=0; (side?.players||[]).forEach((p:any)=>{nw+=p.net_worth||0;});
    console.log(`\n${lbl} (picks: ${(side?.picks||[]).map((x:any)=>hn[x.hero_id]).join(", ")})  TEAM NW=${nw}  towers=${side?.tower_state}`);
    (side?.players||[]).sort((a:any,b:any)=>(b.net_worth||0)-(a.net_worth||0)).forEach((p:any)=>console.log(`  ${(nameOf[p.account_id]||p.account_id).padEnd(16)} ${hn[p.hero_id].padEnd(16)} L${p.level} ${p.kills}/${p.death}/${p.assists} nw${p.net_worth} lh${p.last_hits} gpm${p.gold_per_min}`));
  };
  dump(sb.radiant,"RADIANT (10k ke Pohe)");
  dump(sb.dire,"DIRE (Dog Tamers)");
  process.exit(0);
})();
