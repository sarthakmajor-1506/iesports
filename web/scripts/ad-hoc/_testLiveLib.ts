import { config } from "dotenv"; config({ path: ".env.local" });
import { getLiveLeagueMatch } from "../../lib/dotaLive";
(async()=>{
  const r=await getLiveLeagueMatch("8840753040", process.env.STEAM_API_KEY||"");
  console.log("found:",r.found,"league:",r.leagueId,"durationSec:",r.durationSec,"spectators:",r.spectators);
  if(r.found){
    console.log(`Radiant ${r.radiant?.score} - ${r.dire?.score} Dire`);
    const show=(s:any,lbl:string)=>(s?.players||[]).forEach((p:any)=>console.log(`  ${lbl} ${p.name.padEnd(14)} ${p.heroName.padEnd(16)} ${p.kills}/${p.deaths}/${p.assists} lh${p.lastHits} nw${p.netWorth} gpm${p.gpm} lvl${p.level}`));
    show(r.radiant,"R"); show(r.dire,"D");
  }
  process.exit(0);
})();
