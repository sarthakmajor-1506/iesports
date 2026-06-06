/**
 * Settle a Dota tournament match from the PUBLIC league-match record (OpenDota),
 * for when the bot's GC postgame handler missed it (e.g. bot restarted mid-game).
 * Works because league-tagged matches (league 19822) are public. Maps Radiant/Dire
 * to team1/team2 via the match's vetoState.
 *   npx tsx scripts/settleDotaFromPublic.ts <tournamentId> <matchId>        # dry-run
 *   npx tsx scripts/settleDotaFromPublic.ts <tournamentId> <matchId> --apply
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { fetchDotaMatchStats } from "../lib/dotaMatchStats";
if(!getApps().length)initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")})});
const db=getFirestore();
const [tid,mid]=process.argv.slice(2); const APPLY=process.argv.includes("--apply");
(async()=>{
  const mref=db.collection("tournaments").doc(tid).collection("matches").doc(mid);
  const m:any=(await mref.get()).data();
  if(!m){console.log("match not found");process.exit(1);}
  const dotaMatchId=String(m.dotaMatchId||m.game1?.dotaMatchId||"");
  if(!dotaMatchId){console.log("no dotaMatchId on match");process.exit(1);}
  const od:any=await (await fetch(`https://api.opendota.com/api/matches/${dotaMatchId}`)).json();
  if(od?.radiant_win==null){console.log("OpenDota has no result yet for",dotaMatchId,"-",od?.error||"");process.exit(1);}
  const isT1Rad = m.vetoState?.radiantTeam !== "team2";
  const radiantWin=!!od.radiant_win;
  const winner = (radiantWin===isT1Rad) ? "team1" : "team2"; // radiant=team1 & radiant won -> team1, etc.
  const winnerName = winner==="team1"?m.team1Name:m.team2Name;
  const team1Score = winner==="team1"?1:0, team2Score = winner==="team2"?1:0;
  const durationSec=od.duration||0;
  console.log(`match ${dotaMatchId}: Radiant=${isT1Rad?m.team1Name:m.team2Name} ${od.radiant_score}-${od.dire_score} Dire=${isT1Rad?m.team2Name:m.team1Name}`);
  console.log(`radiant_win=${radiantWin} -> WINNER ${winner} (${winnerName}), ${Math.round(durationSec/60)}m. series ${m.team1Name} ${team1Score}-${team2Score} ${m.team2Name}`);
  // Full per-player stats + draft (the league tag makes these public) so the
  // match-detail page + MVP + expanded card light up. game1.winner is SIDE-based
  // ("radiant"/"dire") as those UIs expect; top-level `winner` stays team-based.
  const stats = await fetchDotaMatchStats(dotaMatchId);
  const radiantTeamId = isT1Rad ? m.team1Id : m.team2Id;
  const direTeamId = isT1Rad ? m.team2Id : m.team1Id;
  console.log(`per-player stats: ${stats.found ? `${stats.players.length} players, draft ${stats.draft.radiant.picks.length}+${stats.draft.dire.picks.length} picks` : "NOT available yet"}`);
  if(!APPLY){console.log("\n🟡 DRY-RUN — pass --apply");process.exit(0);}
  const nowIso=new Date().toISOString();
  const game1: any = {
    dotaMatchId, status:"completed", winner: stats.winnerSide || (radiantWin?"radiant":"dire"),
    durationSeconds:durationSec, completedAt:nowIso,
    radiantScore: od.radiant_score||0, direScore: od.dire_score||0,
    radiantTeamId, direTeamId,
  };
  if (stats.found) { game1.playerStats = stats.players; game1.draft = stats.draft; }
  await mref.update({
    status:"completed", lobbyStatus:"completed", completedAt:nowIso,
    team1Score, team2Score, winner, durationSec, dotaMatchId,
    game1,
    games:{game1:{dotaMatchId,status:"completed",winner,durationSeconds:durationSec,completedAt:nowIso}},
    result:{source:"opendota-league-fallback",dotaMatchId,radiantWin,winnerTeam:winner,radiantScore:od.radiant_score,direScore:od.dire_score,durationSeconds:durationSec,fetchedAt:nowIso},
  });
  // close the stale botQueue
  const qs=await db.collection("botQueues").where("tournamentId","==",tid).where("tournamentMatchId","==",mid).get();
  for(const q of qs.docs) await q.ref.set({status:"completed",dotaMatchId},{merge:true});
  console.log(`✅ settled. ${winnerName} wins. botQueues closed: ${qs.size}`);
  process.exit(0);
})();
