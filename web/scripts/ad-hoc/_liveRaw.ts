import { config } from "dotenv"; config({ path: ".env.local" });
const KEY=process.env.STEAM_API_KEY||"";
(async()=>{
  const r=await fetch(`https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${KEY}`);
  const j:any=await r.json();
  const games:any[]=j?.result?.games||[];
  const ours=games.find(g=>String(g.match_id)==="8840753040");
  if(!ours){console.log("not found now. league 19822 games:");games.filter(g=>g.league_id===19822).forEach(g=>console.log(JSON.stringify(g).slice(0,400)));process.exit(0);}
  console.log("TOP-LEVEL KEYS:",Object.keys(ours).join(", "));
  console.log("\nbasic players list:",JSON.stringify(ours.players||[]));
  console.log("\nradiant_team:",JSON.stringify(ours.radiant_team||null),"dire_team:",JSON.stringify(ours.dire_team||null));
  console.log("spectators:",ours.spectators,"| stream_delay_s:",ours.stream_delay_s,"| league_tier:",ours.league_tier);
  console.log("\nscoreboard present?",!!ours.scoreboard,"keys:",ours.scoreboard?Object.keys(ours.scoreboard).join(","):"—");
  if(ours.scoreboard){console.log("scoreboard.duration:",ours.scoreboard.duration);
    console.log("radiant players:",JSON.stringify((ours.scoreboard.radiant?.players||[]).map((p:any)=>({a:p.account_id,h:p.hero_id,k:p.kills,d:p.death,as:p.assists,nw:p.net_worth}))));
    console.log("dire players:",JSON.stringify((ours.scoreboard.dire?.players||[]).map((p:any)=>({a:p.account_id,h:p.hero_id,k:p.kills,d:p.death,as:p.assists,nw:p.net_worth}))));
  }
  process.exit(0);
})();
