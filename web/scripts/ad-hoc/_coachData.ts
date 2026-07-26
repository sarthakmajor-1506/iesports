import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="domin8-ultimate-tilt-proof-tournament";
// 4 league matches (last Sat) -> which tournament match + teams
const LEAGUE:[string,string,string][]=[
  ["8841547007","r3-match-1","10kPohe vs Toxic"],
  ["8841465741","r3-match-3","10kPohe vs DogTamers"],
  ["8841382804","r3-match-4","Toxic vs Versatile"],
  ["8841284748","r3-match-5","Toxic vs DogTamers"],
];
const LANE:Record<number,string>={1:"safe",2:"mid",3:"off",4:"jungle"};
(async()=>{
  const heroes=(await (await fetch("https://api.opendota.com/api/heroes")).json()) as any[];
  const hn:Record<number,string>={}; heroes.forEach(h=>hn[h.id]=h.localized_name);
  // current rosters (post-reshuffle) for upcoming-match context
  const ts=await db.collection("tournaments").doc(TID).collection("teams").get();
  console.log("=== CURRENT ROSTERS (post 7 Jun reshuffle) ===");
  ts.docs.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true})).forEach(t=>{const d:any=t.data();console.log(`  ${d.teamName}: `+(d.members||[]).map((p:any)=>p.steamName).join(", "));});

  for(const [dmid,mid,label] of LEAGUE){
    const j:any=await (await fetch(`https://api.opendota.com/api/matches/${dmid}`)).json();
    const m:any=(await db.collection("tournaments").doc(TID).collection("matches").doc(mid).get()).data();
    const radTeam=m.game1?.radiantTeamId, direTeam=m.game1?.direTeamId;
    const tnameById:Record<string,string>={}; ts.docs.forEach(t=>tnameById[t.id]=(t.data() as any).teamName);
    console.log(`\n================ ${mid} (${label}) match ${dmid} ================`);
    console.log(`Radiant=${tnameById[radTeam]||radTeam} ${j.radiant_score} - ${j.dire_score} Dire=${tnameById[direTeam]||direTeam} | ${Math.round(j.duration/60)}m | radiant_win=${j.radiant_win}`);
    // draft
    const picks=(j.picks_bans||[]).filter((p:any)=>p.is_pick).map((p:any)=>`${p.team===0?"R":"D"}:${hn[p.hero_id]}`);
    const bans=(j.picks_bans||[]).filter((p:any)=>!p.is_pick).map((p:any)=>`${p.team===0?"R":"D"}:${hn[p.hero_id]}`);
    console.log("PICKS:",picks.join(" ")||"-");
    console.log("BANS:",bans.join(" ")||"-");
    console.log("PLAYERS (side | name | hero | lane | KDA | NW | GPM/XPM | LH/DN | heroDmg | towerDmg | heal | obs/sen):");
    (j.players||[]).sort((a:any,b:any)=>(b.net_worth||0)-(a.net_worth||0)).forEach((p:any)=>{
      const items=[p.item_0,p.item_1,p.item_2,p.item_3,p.item_4,p.item_5].filter((x:any)=>x).length;
      console.log(`  ${p.isRadiant?"R":"D"} ${String(p.personaname||p.account_id).slice(0,16).padEnd(16)} ${hn[p.hero_id].padEnd(15)} ${(LANE[p.lane_role]||"?").padEnd(5)} ${p.kills}/${p.deaths}/${p.assists} nw${String(p.net_worth).padStart(6)} ${p.gold_per_min}/${p.xp_per_min} ${p.last_hits}/${p.denies} hd${p.hero_damage} td${p.tower_damage} heal${p.hero_healing} v${p.obs_placed||0}/${p.sen_placed||0} items${items}`);
    });
  }
  process.exit(0);
})();
