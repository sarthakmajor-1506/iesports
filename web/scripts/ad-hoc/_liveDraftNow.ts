import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getLiveLeagueMatch } from "../../lib/dotaLive";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const KEY=process.env.STEAM_API_KEY||"";
(async()=>{
  // which Domin8 match is live + dotaMatchId + side mapping
  const ms=await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches").where("status","==","live").get();
  let mInfo:any=null;
  ms.forEach(d=>{const m:any=d.data();mInfo={id:d.id,dmid:String(m.dotaMatchId||m.game1?.dotaMatchId||""),t1:m.team1Name,t2:m.team2Name,radiantTeam:m.vetoState?.radiantTeam,isT1Rad:m.vetoState?.radiantTeam!=="team2"};});
  // also scan live feed for any league 19822 game (in case Firestore not yet flipped)
  const games=(await (await fetch(`https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${KEY}`)).json())?.result?.games||[];
  const ourGames=games.filter((g:any)=>g.league_id===19822);
  console.log("Firestore live match:",mInfo?`${mInfo.id} ${mInfo.t1} vs ${mInfo.t2} dmid=${mInfo.dmid}`:"(none flipped yet)");
  console.log("league 19822 live games:",ourGames.map((g:any)=>`${g.match_id}(dur ${Math.round((g.scoreboard?.duration||0)/60)}m, picks R${g.scoreboard?.radiant?.picks?.length||0}/D${g.scoreboard?.dire?.picks?.length||0})`).join(", ")||"none");
  const dmid = mInfo?.dmid && ourGames.find((g:any)=>String(g.match_id)===mInfo.dmid) ? mInfo.dmid : (ourGames[0]?.match_id?String(ourGames[0].match_id):mInfo?.dmid);
  if(!dmid){console.log("no live match found");process.exit(0);}
  const r=await getLiveLeagueMatch(String(dmid),KEY);
  console.log(`\n=== MATCH ${dmid} (dur ${r.durationSec}s) ===`);
  if(mInfo) console.log(`SIDES: Radiant=${mInfo.isT1Rad?mInfo.t1:mInfo.t2}  Dire=${mInfo.isT1Rad?mInfo.t2:mInfo.t1}`);
  const d=r.draft!;
  console.log("RADIANT picks:",d.radiant.picks.map(h=>h.name).join(", ")||"-");
  console.log("RADIANT bans:",d.radiant.bans.map(h=>h.name).join(", ")||"-");
  console.log("DIRE picks:",d.dire.picks.map(h=>h.name).join(", ")||"-");
  console.log("DIRE bans:",d.dire.bans.map(h=>h.name).join(", ")||"-");
  console.log("\nplayers:");
  const show=(s:any,l:string)=>(s?.players||[]).forEach((p:any)=>console.log(`  ${l} ${p.name.padEnd(16)} ${p.heroName}`));
  show(r.radiant,"R");show(r.dire,"D");
  process.exit(0);
})();
