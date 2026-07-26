/**
 * Ad-hoc: full agent/map/h2h aggregation for ALL 10 Ascension teams + h2h matrix.
 * Read-only.
 */
import * as admin from "firebase-admin";
import { config } from "dotenv";
config({ path: ".env.local" });
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
const db = admin.firestore();
const TID = "league-of-rising-stars-ascension";

const ROLE: Record<string, string> = {};
[["Jett","Raze","Reyna","Phoenix","Yoru","Neon","Iso","Waylay"],"Duelist"] as any;
const map4: [string[],string][] = [
  [["Jett","Raze","Reyna","Phoenix","Yoru","Neon","Iso","Waylay"],"Duelist"],
  [["Sova","Breach","Skye","KAY/O","Fade","Gekko","Tejo"],"Initiator"],
  [["Brimstone","Omen","Viper","Astra","Harbor","Clove"],"Controller"],
  [["Killjoy","Cypher","Sage","Chamber","Deadlock","Vyse"],"Sentinel"],
];
map4.forEach(([arr,r])=>arr.forEach(a=>ROLE[a]=r));

function games(d:any){ return [d.game1,d.game2,d.game3].filter(g=>g&&g.playerStats); }

async function main(){
  const teamsSnap = await db.collection("valorantTournaments").doc(TID).collection("teams").get();
  const NAME: Record<string,string> = {}; const ROSTER: Record<string,Set<string>> = {};
  teamsSnap.forEach(t=>{ const d:any=t.data(); NAME[t.id]=d.teamName||t.id; ROSTER[t.id]=new Set((d.members||[]).map((p:any)=>p.riotPuuid)); });

  const snap = await db.collection("valorantTournaments").doc(TID).collection("matches").get();
  const real = snap.docs.map(d=>d.data()).filter((d:any)=>games(d).length>0 && !d._dummyPlayoff);

  for (const tid of Object.keys(NAME).sort()){
    console.log(`\n######## ${NAME[tid]} (${tid}) ########`);
    const mapRec:Record<string,{w:number,l:number}>={}; const bans:Record<string,number>={}; const picks:Record<string,number>={};
    const players:Record<string,any>={};
    for(const m of real){
      const isT1=m.team1Id===tid,isT2=m.team2Id===tid; if(!isT1&&!isT2)continue;
      (m.vetoState?.actions||[]).forEach((ac:any)=>{ const t=ac.team==="team1"?m.team1Id:m.team2Id; if(t!==tid)return;
        if(ac.action==="ban")bans[ac.map]=(bans[ac.map]||0)+1; if(ac.action==="pick")picks[ac.map]=(picks[ac.map]||0)+1; });
      for(const g of games(m)){
        const myRW=isT1?g.team1RoundsWon:g.team2RoundsWon, opRW=isT1?g.team2RoundsWon:g.team1RoundsWon;
        mapRec[g.mapName]=mapRec[g.mapName]||{w:0,l:0}; myRW>opRW?mapRec[g.mapName].w++:mapRec[g.mapName].l++;
        for(const p of g.playerStats){ if(p.teamId!==tid)continue; const k=p.puuid||p.name;
          const pl=players[k]||(players[k]={name:p.name,agents:{},k:0,d:0,a:0,score:0,rounds:0,fk:0,fd:0,g:0});
          pl.agents[p.agent]=(pl.agents[p.agent]||0)+1; pl.k+=p.kills||0;pl.d+=p.deaths||0;pl.a+=p.assists||0;
          pl.score+=p.score||0;pl.rounds+=g.roundsPlayed||0;pl.fk+=p.firstKills||0;pl.fd+=p.firstDeaths||0;pl.g++; }
      }
    }
    console.log("MAPS:",Object.entries(mapRec).map(([m,r])=>`${m} ${r.w}-${r.l}`).join(" | ")||"none");
    console.log("bans:",Object.entries(bans).sort((a,b)=>b[1]-a[1]).map(([m,c])=>`${m}x${c}`).join(", ")||"-","| picks:",Object.entries(picks).sort((a,b)=>b[1]-a[1]).map(([m,c])=>`${m}x${c}`).join(", ")||"-");
    Object.entries(players).sort((a:any,b:any)=>(b[1].score/b[1].rounds)-(a[1].score/a[1].rounds)).forEach(([pu,p]:any)=>{
      const star=ROSTER[tid]?.has(pu)?"*":" ";
      const pool=Object.entries(p.agents).sort((a:any,b:any)=>b[1]-a[1]).map(([ag,c])=>`${ag}(${ROLE[ag]?.[0]||"?"})x${c}`).join(", ");
      console.log(`  ${star}${p.name.padEnd(16)} ACS${Math.round(p.score/Math.max(p.rounds,1))} ${p.k}-${p.d}-${p.a} FK${p.fk}/FD${p.fd} [${p.g}g] ${pool}`);
    });
  }

  // FULL H2H MATRIX
  console.log("\n\n===== HEAD-TO-HEAD (all pairs that played) =====");
  const seen=new Set<string>();
  for(const m of real){
    const a=m.team1Id,b=m.team2Id; const key=[a,b].sort().join("|");
    // aggregate all series between this pair
    if(seen.has(key))continue; seen.add(key);
    const series=real.filter((x:any)=>(x.team1Id===a&&x.team2Id===b)||(x.team1Id===b&&x.team2Id===a));
    for(const s of series){
      const maps=games(s).map(g=>`${g.mapName} ${g.team1RoundsWon}-${g.team2RoundsWon}`).join(", ");
      console.log(`${NAME[s.team1Id]} ${s.team1Score}-${s.team2Score} ${NAME[s.team2Id]}  [${s.bracketLabel||"swiss"} d${s.matchDay}.${s.matchIndex}]  (${maps})`);
    }
  }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
