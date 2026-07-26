import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="domin8-ultimate-tilt-proof-tournament";
const APPLY=process.argv.includes("--apply");
// helper: p(name, side, level, nw, k,d,a)
const P=(name:string,side:string,level:number,netWorth:number,k:number,d:number,a:number)=>({
  accountId:null,name,steamName:name,uid:null,side,hero:"?",heroIcon:null,
  kills:k,deaths:d,assists:a,level,netWorth,gpm:0,xpm:0,lastHits:0,denies:0,heroDamage:0,towerDamage:0,heroHealing:0,items:[null,null,null,null,null,null],neutralItem:null,
});
type M={mid:string;dmid:string;radTeamId:string;direTeamId:string;radScore:number;direScore:number;dur:number;date:string;players:any[]};
const MATCHES:M[]=[
  // r2-match-3 : Toxic(radiant,won) vs Versatile Dogs(dire). 54-43, 53:07, 5/24
  {mid:"r2-match-3",dmid:"8822786393",radTeamId:"team-2",direTeamId:"team-3",radScore:54,direScore:43,dur:53*60+7,date:"2026-05-24T02:08:00+05:30",players:[
    P("MiyaMC [-DV-]","radiant",6,27855,12,9,28),P("enoughofgrief-_-|","radiant",15,17130,8,9,26),P("Caterpillar_ [Sexzy]","radiant",7,35248,20,6,21),P("ITACHI","radiant",5,13952,8,16,24),P("PABLO","radiant",5,27062,6,4,32),
    P("SMooth OperaTorrr [-AKS]","dire",15,16519,6,13,19),P("Default'11 [Noida]","dire",9,22319,16,11,16),P("kysms [@420]","dire",5,28492,14,7,20),P("Naruto Uzumaki [^nMn^]","dire",5,7987,4,12,22),P("Choco De Ke Gayab [U1trA]","dire",23,11803,2,11,20),
  ]},
  // r2-match-4 : Dog Tamers(radiant,won) vs Toxic(dire). 50-54, 1:05:36, 5/24
  {mid:"r2-match-4",dmid:"8822928117",radTeamId:"team-4",direTeamId:"team-2",radScore:50,direScore:54,dur:65*60+36,date:"2026-05-24T05:02:00+05:30",players:[
    P("BAZOOOXA [M4KS]","radiant",5,46420,14,6,24),P("L [B.k.G]","radiant",5,26515,9,12,22),P("bRiSINGR [LMKSY]","radiant",18,33944,13,7,23),P("Mr Pig [M4KS]","radiant",8,15062,3,18,29),P("Ninja [@420]","radiant",29,25302,10,11,26),
    P("Caterpillar_ [Sexzy]","dire",23,38349,20,7,22),P("ITACHI","dire",5,14090,4,12,27),P("PABLO","dire",5,27323,6,8,25),P("MiyaMC [-DV-]","dire",9,32836,12,10,15),P("enoughofgrief-_-|","dire",24,24240,12,13,28),
  ]},
  // r2-match-5 : Toxic(radiant,won) vs 10k ke Pohe(dire). 44-38, 57:39, 5/30
  {mid:"r2-match-5",dmid:"8832008522",radTeamId:"team-2",direTeamId:"team-1",radScore:44,direScore:38,dur:57*60+39,date:"2026-05-30T23:43:00+05:30",players:[
    P("enoughofgrief-_-|","radiant",25,20522,0,7,25),P("MiyaMC [-DV-]","radiant",9,29377,7,10,20),P("Caterpillar_ [Sexzy]","radiant",9,30607,24,7,8),P("Bubble","radiant",5,13737,1,9,14),P("PABLO","radiant",5,28011,12,5,14),
    P("Kiluminati..! [Go420]","dire",5,32678,11,9,14),P("Aomine","dire",10,9312,4,11,23),P("zu mu mu!","dire",5,21059,9,12,19),P("bRiSINGR [LMKSY]","dire",18,27861,9,6,13),P("ITACHI","dire",5,12600,5,6,26),
  ]},
];
(async()=>{
  for(const m of MATCHES){
    const ref=db.collection("tournaments").doc(TID).collection("matches").doc(m.mid);
    const cur:any=(await ref.get()).data();
    const winnerSide = "radiant"; // all 3 screenshots are Radiant victories (radTeamId set to winner)
    const game1={...(cur.game1||{}),dotaMatchId:m.dmid,status:"completed",winner:winnerSide,radiantScore:m.radScore,direScore:m.direScore,radiantTeamId:m.radTeamId,direTeamId:m.direTeamId,durationSeconds:m.dur,playerStats:m.players,source:"screenshot-manual"};
    console.log(`${m.mid}: ${cur.team1Name} v ${cur.team2Name} | radiant=${m.radTeamId} ${m.radScore}-${m.direScore} dire=${m.direTeamId} | ${m.players.length} players, winnerSide=${winnerSide}, dur=${Math.round(m.dur/60)}m`);
    if(APPLY){ await ref.set({game1,dotaMatchId:m.dmid},{merge:true}); }
  }
  console.log(APPLY?"\n✅ APPLIED — 3 matches enriched with scoreboards":"\n🟡 DRY-RUN — pass --apply");
  process.exit(0);
})();
