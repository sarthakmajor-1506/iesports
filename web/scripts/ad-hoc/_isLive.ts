import { config } from "dotenv"; config({ path: ".env.local" });
(async()=>{
  const KEY=process.env.STEAM_API_KEY||"";
  const games=(await (await fetch(`https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${KEY}`)).json())?.result?.games||[];
  const ours=games.filter((g:any)=>g.league_id===19822);
  console.log(ours.length?`⚠️ ${ours.length} league-19822 game(s) LIVE: ${ours.map((g:any)=>g.match_id).join(", ")} — DO NOT redeploy bot`:"✅ no league-19822 game live — safe to deploy bot");
  process.exit(0);
})();
