import { config } from "dotenv"; config({ path: ".env.local" });
const KEY=process.env.STEAM_API_KEY||"";
(async()=>{
  const r=await fetch(`https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${KEY}`);
  const j:any=await r.json();
  const games:any[]=j?.result?.games||[];
  const ours=games.find(g=>String(g.match_id)==="8840753040");
  // also grab any FULL live game (10 players, mid-game) to see real position ranges
  const full=games.find(g=>{const sb=g.scoreboard;return sb && (sb.radiant?.players?.length||0)+(sb.dire?.players?.length||0)>=8 && sb.duration>120;});
  const dumpPlayer=(p:any)=>JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k])=>/position|hero_id|account|kills|net_worth/.test(k))));
  if(ours){const p=(ours.scoreboard?.dire?.players||[])[0]||(ours.scoreboard?.radiant?.players||[])[0];
    console.log("OUR match player fields:",p?Object.keys(p).join(", "):"none");
    console.log("OUR sample:",p?dumpPlayer(p):"-");
    console.log("OUR scoreboard keys:",Object.keys(ours.scoreboard||{}).join(", "));}
  if(full){console.log("\nFULL live game",full.match_id,"dur",Math.round(full.scoreboard.duration/60)+"m");
    console.log("tower_state radiant/dire:",full.scoreboard.radiant?.tower_state,full.scoreboard.dire?.tower_state,"barracks:",full.scoreboard.radiant?.barracks_state,full.scoreboard.dire?.barracks_state);
    const ps=[...(full.scoreboard.radiant?.players||[]),...(full.scoreboard.dire?.players||[])];
    ps.slice(0,4).forEach(p=>console.log("  ",dumpPlayer(p)));
    const xs=ps.map(p=>p.position_x).filter((v:any)=>v!=null), ys=ps.map(p=>p.position_y).filter((v:any)=>v!=null);
    if(xs.length)console.log(`  position_x range [${Math.min(...xs)}, ${Math.max(...xs)}]  position_y range [${Math.min(...ys)}, ${Math.max(...ys)}]`);
    else console.log("  NO position_x/y fields present in scoreboard players");
  } else console.log("\n(no full mid-game live game available right now to sample position ranges)");
  process.exit(0);
})();
