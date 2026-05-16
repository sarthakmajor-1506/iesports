/**
 * Force an OpenDota player refresh for bazooka, then poll his recentMatches
 * for a NEW game (newer than the last-known one) and report roster overlap
 * with Domin8 Match 2. Read-only re: our DB. Waits run via setTimeout
 * (in-process), not shell sleep.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });

const TID = "domin8-ultimate-tilt-proof-tournament";
const BAZOOKA_32 = "167947980";
const KNOWN_LATEST = 8812763773;          // his newest before refresh
const OD = "https://api.opendota.com/api";
const STEAM64_BASE = BigInt("76561197960265728");
const to32 = (id?:string|null)=>{ try{ return id?(BigInt(id)-STEAM64_BASE).toString():null;}catch{return null;} };
const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));

async function rosterSet(db:FirebaseFirestore.Firestore){
  const m=(await db.collection("tournaments").doc(TID).collection("matches").doc("r1-match-2").get()).data()!;
  const set=new Set<string>();
  for(const tid of [m.team1Id,m.team2Id]){
    const t=(await db.collection("tournaments").doc(TID).collection("teams").doc(tid).get()).data();
    for(const mem of (t?.members||[]) as any[]){
      let s=null as string|null;
      try{ s=(await db.collection("users").doc(mem.uid).get()).data()?.steamId||null; }catch{}
      if(!s && typeof mem.uid==="string" && mem.uid.startsWith("steam_")) s=mem.uid.slice(6);
      const s32=to32(s); if(s32) set.add(s32);
    }
  }
  return set;
}

async function main(){
  const db=getFirestore();
  const roster=await rosterSet(db);

  console.log(`POST refresh for bazooka (steam32=${BAZOOKA_32})…`);
  const r=await fetch(`${OD}/players/${BAZOOKA_32}/refresh`,{method:"POST"});
  console.log(`  refresh status: ${r.status}`);

  for(let attempt=1; attempt<=5; attempt++){
    await sleep(attempt===1?15000:22000);
    const rm = await (await fetch(`${OD}/players/${BAZOOKA_32}/recentMatches`)).json() as any[];
    const latest = Array.isArray(rm)&&rm.length?rm[0]:null;
    if(!latest){ console.log(`  attempt ${attempt}: no data`); continue; }
    const isNew = latest.match_id > KNOWN_LATEST;
    console.log(`  attempt ${attempt}: newest=${latest.match_id} start=${new Date(latest.start_time*1000).toISOString()} ${isNew?"← NEW":"(same as before)"}`);
    if(isNew){
      const det=await (await fetch(`${OD}/matches/${latest.match_id}`)).json();
      const ov=(det.players||[]).filter((p:any)=>roster.has(String(p.account_id))).length;
      console.log(`\n✅ NEW match ${latest.match_id} — rosterOverlap=${ov}/10`);
      console.log(ov>=6
        ? `   High overlap — likely the tournament game. Run:\n   npx tsx scripts/fetchDotaMatchResult.ts --match=r1-match-2 --anchor=827178822847430677 --apply`
        : `   Low overlap (${ov}/10, most players private). If this IS game 2, run:\n   npx tsx scripts/fetchDotaMatchResult.ts --match=r1-match-2 --anchor=827178822847430677 --matchid=${latest.match_id} --apply`);
      return;
    }
  }
  console.log(`\nNo new match after refresh + polling. OpenDota hasn't indexed a newer game for bazooka — either Match 2 isn't played/finished, indexing is still lagging (can take longer), or he used a different Steam account. Best: paste the Dota match ID.`);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
