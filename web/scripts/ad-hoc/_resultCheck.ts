import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const KEY=process.env.STEAM_API_KEY||"";
const MID="8840753040";
(async()=>{
  console.log("=== FIRESTORE match doc ===");
  const m:any=(await db.collection("tournaments").doc("dota-test-major-shrey").collection("matches").doc("r1-match-1").get()).data();
  console.log("status:",m.status,"| lobbyStatus:",m.lobbyStatus,"| dotaMatchId:",m.dotaMatchId,"| startedAt:",m.startedAt,"| completedAt:",m.completedAt??"—");
  console.log("scores:",m.team1Score,"-",m.team2Score,"| winner:",m.winner??"—","| game1:",JSON.stringify(m.game1??null),"| result:",JSON.stringify(m.result??null));

  console.log("\n=== botQueues for this match ===");
  const qs=await db.collection("botQueues").where("tournamentMatchId","==","r1-match-1").get();
  qs.forEach(q=>{const d:any=q.data();console.log(`[${q.id}] status=${d.status} dotaMatchId=${d.dotaMatchId??"—"} tid=${d.tournamentId}`);});

  console.log("\n=== Steam GetMatchDetails (post-game record) ===");
  try{
    const r=await fetch(`https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1/?key=${KEY}&match_id=${MID}`);
    const j:any=await r.json(); const res=j?.result;
    if(!res||res.error){console.log("  ✗",res?.error||"no result (match not finalized / not public yet)");}
    else{console.log(`  ✓ leagueid=${res.leagueid} duration=${Math.round(res.duration/60)}m radiant_win=${res.radiant_win} dur=${res.duration}s`);
      console.log(`  Radiant ${res.radiant_score} - ${res.dire_score} Dire`);
      (res.players||[]).forEach((p:any)=>console.log(`    slot${p.player_slot} hero=${p.hero_id} ${p.kills}/${p.deaths}/${p.assists} lh=${p.last_hits} gpm=${p.gold_per_min}`));
    }
  }catch(e:any){console.log("  failed:",e?.message||e);}

  console.log("\n=== OpenDota ===");
  try{
    const r=await fetch(`https://api.opendota.com/api/matches/${MID}`); const j:any=await r.json();
    if(j?.players){console.log(`  ✓ indexed: radiant_win=${j.radiant_win} duration=${Math.round((j.duration||0)/60)}m leagueid=${j.leagueid}`);}
    else console.log("  ✗ not indexed yet:",j?.error||"-");
  }catch(e:any){console.log("  failed:",e?.message||e);}

  console.log("\n=== live feed (still in-progress?) ===");
  try{
    const r=await fetch(`https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${KEY}`); const j:any=await r.json();
    const ours=(j?.result?.games||[]).find((g:any)=>String(g.match_id)===MID);
    console.log(ours?`  still LIVE in feed, duration=${Math.round((ours.scoreboard?.duration||0)/60)}m`:"  NOT in live feed anymore (game ended)");
  }catch(e:any){console.log("  failed:",e?.message||e);}
  process.exit(0);
})();
