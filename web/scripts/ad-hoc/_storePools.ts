import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const TID="domin8-ultimate-tilt-proof-tournament";
const norm=(s:string)=>String(s||"").toLowerCase().replace(/\[.*?\]/g,"").replace(/[^a-z0-9]/g,"").trim();
const LEAGUE=["8841547007","8841465741","8841382804","8841284748"];
const APPLY=process.argv.includes("--apply");
(async()=>{
  const heroes=(await (await fetch("https://api.opendota.com/api/heroes")).json()) as any[];
  const hn:Record<number,string>={}; heroes.forEach(h=>hn[h.id]=h.localized_name);
  // IGN->account from league
  const ign2acct:Record<string,number>={};
  for(const id of LEAGUE){const j:any=await (await fetch(`https://api.opendota.com/api/matches/${id}`)).json();(j.players||[]).forEach((p:any)=>{if(p.account_id&&p.personaname)ign2acct[norm(p.personaname)]=p.account_id;});}
  const ts=await db.collection("tournaments").doc(TID).collection("teams").get();
  for(const t of ts.docs){
    const d:any=t.data(); const members=[...(d.members||[])];
    for(const p of members){
      let acct=ign2acct[norm(p.steamName)];
      if(!acct){const u:any=(await db.collection("users").doc(p.uid).get()).data();const sid=u?.steamId||(p.uid.startsWith("steam_")?p.uid.slice(6):null);if(sid&&/^\d{17}$/.test(String(sid)))acct=Number(BigInt(sid)-76561197960265728n);}
      if(!acct){p.dotaHeroPool=[];continue;}
      p.dotaAccountId=acct;
      try{
        const hs:any=await (await fetch(`https://api.opendota.com/api/players/${acct}/heroes`)).json();
        p.dotaHeroPool=Array.isArray(hs)?hs.filter((h:any)=>h.games>=4).sort((a:any,b:any)=>b.games-a.games).slice(0,6).map((h:any)=>({heroId:h.hero_id,hero:hn[h.hero_id],games:h.games,winPct:Math.round(100*h.win/h.games)})):[];
      }catch{p.dotaHeroPool=[];}
      await new Promise(r=>setTimeout(r,800));
    }
    console.log(`${d.teamName}: `+members.map((p:any)=>`${p.steamName}(${(p.dotaHeroPool||[]).length}h)`).join(" "));
    if(APPLY) await t.ref.set({members},{merge:true});
  }
  console.log(APPLY?"\n✅ stored hero pools on team docs":"\n🟡 DRY-RUN — pass --apply");
  process.exit(0);
})();
