import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="domin8-ultimate-tilt-proof-tournament";
// normalize IGN (strip clan tags/spaces) for matching across matches
const norm=(s:string)=>String(s||"").toLowerCase().replace(/\[.*?\]/g,"").replace(/[^a-z0-9]/g,"").trim();
// current roster IGNs by team
const ROSTER:Record<string,string[]>={
  "10k ke Pohe":["Aomine","bRiSINGR","zu mu mu!","Bubble","/"],
  "Toxic but Talented":["Caterpillar_","PABLO","enoughofgrief-_-|","MiyaMC","Mr Pig"],
  "Versatile Dogs":["kysms","Default'11","SMooth OperaTorrr","Naruto Uzumaki","Mr. Walru5"],
  "Dog Tamers":["BAZOOOXA","PMA","Kiluminati..!","Ninja","ITACHI"],
};
(async()=>{
  const ms=await db.collection("tournaments").doc(TID).collection("matches").where("status","==","completed").get();
  // collect every playerStat row with match id
  const rows:any[]=[];
  ms.forEach(d=>{const m:any=d.data();const ps=m.game1?.playerStats||[];ps.forEach((p:any)=>rows.push({mid:d.id,name:p.name,n:norm(p.name),k:p.kills,dth:p.deaths,a:p.assists,nw:p.netWorth,gpm:p.gpm,lvl:p.level,side:p.side,hero:p.hero}));});
  for(const [team,igns] of Object.entries(ROSTER)){
    console.log(`\n===== ${team} =====`);
    for(const ign of igns){
      const key=norm(ign);
      const mine=rows.filter(r=>r.n===key||r.n.includes(key)||key.includes(r.n));
      if(!mine.length){console.log(`  ${ign.padEnd(20)} — NO match data found`);continue;}
      const g=mine.length;
      const sum=(f:string)=>mine.reduce((s,r)=>s+(r[f]||0),0);
      const avgK=(sum("k")/g).toFixed(1),avgD=(sum("dth")/g).toFixed(1),avgA=(sum("a")/g).toFixed(1);
      const kda=((sum("k")+sum("a"))/Math.max(1,sum("dth"))).toFixed(2);
      const withGpm=mine.filter(r=>r.gpm>0); const avgGpm=withGpm.length?Math.round(withGpm.reduce((s,r)=>s+r.gpm,0)/withGpm.length):"-";
      console.log(`  ${ign.padEnd(20)} ${g}g  avg ${avgK}/${avgD}/${avgA}  KDA ${kda}  avgGPM ${avgGpm}  | per-game: ${mine.map(r=>`${r.mid.replace("-match","m").replace("r","R")}:${r.hero||"?"} ${r.k}/${r.dth}/${r.a}${r.gpm?` g${r.gpm}`:""}`).join("  ")}`);
    }
  }
  process.exit(0);
})();
