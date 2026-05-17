/**
 * Locate the Valorant match DOMIN8 JANTA PARTY (DJP) vs MUTH MANTRALAYA
 * across valorantTournaments and dump everything relevant to a result
 * fetch: status, games map, scheduledTime, recorded subs, playerStats,
 * any prior fetch errors, and both team rosters (with PUUIDs).
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID!, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n") }) });

const NEEDLES = ["janta party","djp","muth mantralaya","mantralaya"];

async function main(){
  const db=getFirestore();
  const ts=await db.collection("valorantTournaments").get();
  for(const t of ts.docs){
    const ms=await t.ref.collection("matches").get();
    for(const m of ms.docs){
      const d=m.data() as any;
      const hay=`${d.team1Name||""} ${d.team2Name||""}`.toLowerCase();
      if(!NEEDLES.some(n=>hay.includes(n))) continue;
      console.log(`\n=== ${t.id} / matches/${m.id} ===`);
      console.log(JSON.stringify({
        team1Name:d.team1Name, team2Name:d.team2Name, team1Id:d.team1Id, team2Id:d.team2Id,
        status:d.status, bestOf:d.bestOf, team1Score:d.team1Score, team2Score:d.team2Score,
        scheduledTime:d.scheduledTime, isBracket:d.isBracket, bracketLabel:d.bracketLabel,
        games:d.games, team1Subs:d.team1Subs, team2Subs:d.team2Subs,
        valorantMatchId:d.valorantMatchId, lastFetchError:d.lastFetchError,
        playerStatsCount:Array.isArray(d.playerStats)?d.playerStats.length:0,
      },null,2));
      // rosters
      for(const tid of [d.team1Id,d.team2Id]){
        const td=(await t.ref.collection("teams").doc(tid).get()).data() as any;
        console.log(`\n  team ${tid} = ${td?.teamName}`);
        for(const mem of (td?.members||[]) as any[])
          console.log(`    ${mem.riotGameName||mem.fullName||mem.uid}#${mem.riotTagLine||"?"}  puuid=${mem.riotPuuid||"—"}  uid=${mem.uid}`);
      }
    }
  }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
