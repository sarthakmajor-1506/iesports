import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="domin8-ultimate-tilt-proof-tournament";
const norm=(s:string)=>String(s||"").toLowerCase().replace(/\[.*?\]/g,"").replace(/[^a-z0-9]/g,"").trim();
const LEAGUE=["8841547007","8841465741","8841382804","8841284748"];
(async()=>{
  // 1) IGN(norm) -> account_id from league matches
  const ign2acct:Record<string,number>={};
  for(const id of LEAGUE){const j:any=await (await fetch(`https://api.opendota.com/api/matches/${id}`)).json();(j.players||[]).forEach((p:any)=>{if(p.account_id&&p.personaname)ign2acct[norm(p.personaname)]=p.account_id;});}
  // 2) current rosters -> resolve account_id (league map, else user.steamId->steam32)
  const ts=await db.collection("tournaments").doc(TID).collection("teams").get();
  const out:any[]=[];
  for(const t of ts.docs){const d:any=t.data();
    for(const p of (d.members||[])){
      const key=norm(p.steamName); let acct=ign2acct[key]; let src="league";
      if(!acct){ // fallback: user doc steamId
        const u:any=(await db.collection("users").doc(p.uid).get()).data();
        const sid=u?.steamId||u?.steamId64||(p.uid.startsWith("steam_")?p.uid.slice(6):null);
        if(sid&&/^\d{17}$/.test(String(sid))){acct=Number(BigInt(sid)-76561197960265728n);src="steamId";}
      }
      out.push({team:d.teamName,ign:p.steamName,uid:p.uid,acct:acct||null,src:acct?src:"NONE"});
    }
  }
  out.forEach(r=>console.log(`${r.team.slice(0,14).padEnd(14)} ${r.ign.padEnd(20)} acct=${r.acct||"—"} (${r.src})`));
  // emit acct list for next step
  console.log("\nACCTJSON="+JSON.stringify(out.filter(r=>r.acct).map(r=>({ign:r.ign,team:r.team,acct:r.acct}))));
  process.exit(0);
})();
