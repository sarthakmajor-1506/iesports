import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const KEY=process.env.STEAM_API_KEY||"";
(async()=>{
  // 1) which Domin8 match is live in Firestore
  console.log("=== Firestore: live/match-running matches ===");
  for(const tid of ["domin8-ultimate-tilt-proof-tournament","dota-test-major-shrey"]){
    const ms=await db.collection("tournaments").doc(tid).collection("matches").where("status","==","live").get();
    ms.forEach(d=>{const m:any=d.data();console.log(`  ${tid}/${d.id}: ${m.team1Name} vs ${m.team2Name} dotaMatchId=${m.dotaMatchId??"—"} lobbyStatus=${m.lobbyStatus}`);});
  }
  // 2) scan league 19822 live games
  const r=await fetch(`https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${KEY}`);
  const games:any[]=(await r.json())?.result?.games||[];
  const ours=games.filter(g=>g.league_id===19822);
  console.log(`\n=== league 19822 live games: ${ours.length} ===`);
  for(const g of ours){
    const sb=g.scoreboard||{};
    const rp=sb.radiant?.picks?.length||0, rb=sb.radiant?.bans?.length||0, dp=sb.dire?.picks?.length||0, dbn=sb.dire?.bans?.length||0;
    console.log(`match=${g.match_id} dur=${Math.round((sb.duration||0)/60)}m players=${(g.players||[]).length} R(p${rp}/b${rb}) D(p${dp}/b${dbn}) spectators=${g.spectators} delay=${g.stream_delay_s}s`);
    console.log("  players:",(g.players||[]).map((p:any)=>`${p.name||p.account_id}(t${p.team}${p.hero_id?`,h${p.hero_id}`:""})`).join(", "));
  }
  process.exit(0);
})();
