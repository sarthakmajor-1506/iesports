import { config } from "dotenv"; config({ path: ".env.local" });
import { getLiveLeagueMatch } from "../../lib/dotaLive";
(async()=>{
  const r=await getLiveLeagueMatch("8840753040", process.env.STEAM_API_KEY||"");
  if(!r.draft){console.log("no draft");process.exit(0);}
  const show=(lbl:string,s:any)=>{console.log(`${lbl} BANS:`,s.bans.map((h:any)=>h.name).join(", ")||"-");console.log(`${lbl} PICKS:`,s.picks.map((h:any)=>h.name).join(", ")||"-");};
  show("RADIANT",r.draft.radiant); show("DIRE",r.draft.dire);
  console.log("\nsample portrait URL:",r.draft.dire.picks[0]?.portrait);
  process.exit(0);
})();
