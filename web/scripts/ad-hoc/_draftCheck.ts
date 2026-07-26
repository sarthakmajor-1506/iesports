import { config } from "dotenv"; config({ path: ".env.local" });
const KEY=process.env.STEAM_API_KEY||"";
(async()=>{
  const r=await fetch(`https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${KEY}`);
  const j:any=await r.json();
  const games:any[]=j?.result?.games||[];
  // find a game currently IN DRAFT (duration 0, but has picks/bans) and a full game
  console.log("scanning",games.length,"live games for draft data...");
  const withTeamKeys=(g:any)=>{const sb=g.scoreboard;return sb?.radiant?Object.keys(sb.radiant):[];};
  // print team-object keys from first game that has a scoreboard
  const any=games.find(g=>g.scoreboard?.radiant);
  console.log("\nradiant team-object KEYS:", any?withTeamKeys(any).join(", "):"none");
  // look for picks/bans on several games
  for(const g of games.slice(0,8)){
    const sb=g.scoreboard; if(!sb) continue;
    const rp=sb.radiant?.picks?.length||0, rb=sb.radiant?.bans?.length||0, dp=sb.dire?.picks?.length||0, db=sb.dire?.bans?.length||0;
    const pb=g.scoreboard?.pick_ban?.length||0;
    console.log(`match=${g.match_id} dur=${Math.round((sb.duration||0)/60)}m R(picks ${rp}/bans ${rb}) D(picks ${dp}/bans ${db}) topPickBan=${pb}`);
    if(rb>0||rp>0){console.log("   R bans:",JSON.stringify(sb.radiant.bans),"R picks:",JSON.stringify(sb.radiant.picks));}
  }
  // our match specifically
  const ours=games.find(g=>String(g.match_id)==="8840753040");
  if(ours){const sb=ours.scoreboard;console.log("\nOUR match draft: R picks",JSON.stringify(sb.radiant?.picks),"R bans",JSON.stringify(sb.radiant?.bans),"D picks",JSON.stringify(sb.dire?.picks),"D bans",JSON.stringify(sb.dire?.bans));}
  process.exit(0);
})();
