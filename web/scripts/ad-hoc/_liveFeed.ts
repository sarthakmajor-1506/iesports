import { config } from "dotenv"; config({ path: ".env.local" });
const KEY=process.env.STEAM_API_KEY||"";
const MID="8840753040", LEAGUE=19822;
(async()=>{
  console.log("=== GetLiveLeagueGames (live scoreboard for league-tagged matches) ===");
  try{
    const r=await fetch(`https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${KEY}`);
    const j:any=await r.json();
    const games:any[]=j?.result?.games||[];
    console.log(`total live league games visible to API: ${games.length}`);
    const ours=games.find(g=>String(g.match_id)===MID || g.league_id===LEAGUE);
    if(!ours){console.log(`  our match ${MID}/league ${LEAGUE} NOT in live list (may need DotaTV delay ~2-5 min, or no spectator/caster).`);
      games.slice(0,5).forEach(g=>console.log(`   sample live: match=${g.match_id} league=${g.league_id} ${g.radiant_team?.team_name||"?"} vs ${g.dire_team?.team_name||"?"}`));
    } else {
      const s=ours.scoreboard||{};
      console.log(`  ✓ LIVE FEED FOUND. match=${ours.match_id} league=${ours.league_id} duration=${Math.round((s.duration||0)/60)}m`);
      console.log(`  Radiant ${s.radiant?.score??0} - ${s.dire?.score??0} Dire`);
      const dump=(side:any,label:string)=>{(side?.players||[]).forEach((p:any)=>console.log(`    ${label} acct=${p.account_id} hero=${p.hero_id} ${p.kills}/${p.death}/${p.assists} lh=${p.last_hits} gold=${p.net_worth??p.gold} gpm=${p.gold_per_min} xpm=${p.xp_per_min}`));};
      dump(s.radiant,"R"); dump(s.dire,"D");
    }
  }catch(e:any){console.log("  request failed:",e?.message||e);}

  console.log("\n=== GetMatchDetails (post-game; usually empty while live) ===");
  try{
    const r=await fetch(`https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1/?key=${KEY}&match_id=${MID}`);
    const j:any=await r.json();
    const res=j?.result;
    console.log(res?.error?`  ✗ ${res.error} (expected while in-progress)`:`  ✓ available: leagueid=${res?.leagueid} duration=${Math.round((res?.duration||0)/60)}m`);
  }catch(e:any){console.log("  failed:",e?.message||e);}

  console.log("\n=== OpenDota /live (top live games) ===");
  try{
    const r=await fetch("https://api.opendota.com/api/live");
    const j:any=await r.json();
    const ours=(Array.isArray(j)?j:[]).find((g:any)=>String(g.match_id)===MID||g.league_id===LEAGUE);
    console.log(ours?`  ✓ in OpenDota live: ${JSON.stringify(ours).slice(0,300)}`:`  ✗ not in OpenDota live top-list (${Array.isArray(j)?j.length:0} games; it only lists notable games)`);
  }catch(e:any){console.log("  failed:",e?.message||e);}
  process.exit(0);
})();
