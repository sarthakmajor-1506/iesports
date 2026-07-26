import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const KEY=process.env.STEAM_API_KEY||"";
(async()=>{
  const ms=await db.collection("tournaments").doc("domin8-ultimate-tilt-proof-tournament").collection("matches").where("status","==","live").get();
  console.log(`live matches: ${ms.size}`);
  const liveFeed=(await (await fetch(`https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${KEY}`)).json())?.result?.games||[];
  const liveIds=new Set(liveFeed.map((g:any)=>String(g.match_id)));
  for(const d of ms.docs){const m:any=d.data();const dmid=String(m.dotaMatchId||m.game1?.dotaMatchId||"");
    const stillLive=liveIds.has(dmid);
    console.log(`  ${d.id}: ${m.team1Name} vs ${m.team2Name} dotaMatchId=${dmid} ${stillLive?"STILL LIVE in feed":"ENDED (needs settle)"}`);
  }
  process.exit(0);
})();
