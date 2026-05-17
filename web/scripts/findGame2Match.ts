/**
 * Find Domin8 Match 2's Dota game without relying on roster overlap:
 *  (a) dump every tournament-related botLobbies/botQueues + any captured
 *      dotaMatchId/winner (the bot's own record, most authoritative);
 *  (b) list bazooka's full recentMatches with lobby_type — bot-hosted
 *      tournament games are CUSTOM LOBBIES (lobby_type 1), which stand out
 *      from pub matchmaking even when teammates are private.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });

const BAZOOKA_32 = "167947980";
const OD = "https://api.opendota.com/api";
const LOBBY = (n:number)=>({0:"public-mm",1:"PRACTICE/CUSTOM",2:"tournament",4:"coop-bots",5:"team-match",6:"solo-q",7:"ranked",8:"1v1mid",9:"battle-cup"} as any)[n] ?? `lt${n}`;

async function main(){
  const db=getFirestore();

  console.log("=== bot records (tournament_ queues + their lobbies) ===");
  const qs=await db.collection("botQueues").get();
  const tq=qs.docs.filter(d=>d.id.startsWith("tournament_"));
  for(const q of tq){
    console.log(`  queue ${q.id}: status=${q.data().status}`);
    const ls=await db.collection("botLobbies").where("queueId","==",q.id).get();
    ls.forEach(l=>{const x=l.data();console.log(`     lobby ${l.id}: status=${x.status} dotaMatchId=${x.dotaMatchId} winner=${x.winner} created=${x.createdAt}`);});
  }
  const anyMid=await db.collection("botLobbies").where("dotaMatchId","!=",null).get().catch(()=>null);
  if(anyMid && !anyMid.empty){ console.log("  botLobbies WITH a dotaMatchId:");
    anyMid.forEach(l=>{const x=l.data();console.log(`     ${l.id}: dotaMatchId=${x.dotaMatchId} winner=${x.winner} queueId=${x.queueId}`);}); }
  else console.log("  (no botLobbies has a dotaMatchId — bot never captured a match id)");

  console.log("\n=== bazooka recentMatches (newest → oldest) ===");
  const rm=await (await fetch(`${OD}/players/${BAZOOKA_32}/recentMatches`)).json() as any[];
  if(!Array.isArray(rm)||!rm.length){ console.log("  no public recent matches"); return; }
  rm.forEach(m=>{
    const win=(m.player_slot<128)===m.radiant_win;
    const mark=m.lobby_type===1?" ★ CUSTOM LOBBY":"";
    console.log(`  ${m.match_id}  ${new Date(m.start_time*1000).toISOString()}  ${LOBBY(m.lobby_type).padEnd(15)} ${win?"W":"L"} ${Math.round(m.duration/60)}m K${m.kills}/D${m.deaths}/A${m.assists}${mark}`);
  });
  const customs=rm.filter(m=>m.lobby_type===1);
  console.log(`\n${customs.length} custom-lobby game(s) in bazooka's recent history.`);
  if(customs.length){
    console.log(`Most recent custom lobby = likely Domin8 Match 2:`);
    const c=customs[0];
    console.log(`  match ${c.match_id}  ${new Date(c.start_time*1000).toISOString()}  ${(c.player_slot<128)===c.radiant_win?"Dog Tamers side WON":"Dog Tamers side LOST"}`);
    console.log(`\nIf that's it, write the result with:\n  npx tsx scripts/fetchDotaMatchResult.ts --match=r1-match-2 --anchor=827178822847430677 --matchid=${c.match_id} --apply`);
  }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
