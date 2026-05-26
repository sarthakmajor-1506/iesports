import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
})});
import { computeTeamAnalytics, findUpcomingMatch, generateMatchupAdvice, generateTeamInsights } from "../../lib/valorantTeamAnalytics";
const db = getFirestore();
const TID = "league-of-rising-stars-ascension";
(async () => {
  const tref = db.collection("valorantTournaments").doc(TID);
  const [teamsSnap, matchesSnap, standingsSnap] = await Promise.all([
    tref.collection("teams").get(), tref.collection("matches").get(), tref.collection("standings").get(),
  ]);
  const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const standings = standingsSnap.docs.map(d => ({ teamId: d.id, ...d.data() } as any));
  for (const teamId of ["team-2", "team-5", "team-10"]) {
    const team = teams.find(t => t.id === teamId)!;
    const standing = standings.find(s => s.teamId === teamId);
    const a = computeTeamAnalytics(team, standing || null, matches, standings) as any;
    const u = findUpcomingMatch(matches, teamId);
    if (u) {
      const oppId = u.team1Id === teamId ? u.team2Id : u.team1Id;
      const oppTeam = teams.find(t => t.id === oppId)!;
      const oppStanding = standings.find(s => s.teamId === oppId) || null;
      const oppA = computeTeamAnalytics(oppTeam, oppStanding, matches, standings);
      a.upcomingMatch = generateMatchupAdvice(a, oppA, u, { logo: oppTeam.teamLogo });
      a.insights = generateTeamInsights(a);
    }
    console.log(`\n=== ${team.teamName} (${teamId}) ===`);
    console.log(`  Record: ${a.standing.wins}W ${a.standing.draws}D ${a.standing.losses}L, ${a.standing.points} pts`);
    console.log(`  Pistol: ${a.rounds.pistol.won}/${a.rounds.pistol.played} = ${a.rounds.pistol.winRate}%`);
    console.log(`  1st Half: ${a.sideStats.attack.roundsWon}/${a.sideStats.attack.roundsPlayed} = ${a.sideStats.attack.winRate}%`);
    console.log(`  2nd Half: ${a.sideStats.defense.roundsWon}/${a.sideStats.defense.roundsPlayed} = ${a.sideStats.defense.winRate}%`);
    console.log(`  OD: FK=${a.openingDuels.firstKills} FD=${a.openingDuels.firstDeaths} winRate=${a.openingDuels.openingWinRate}%`);
    console.log(`  Players total: ${a.players.length}, core: ${a.players.filter((p:any) => p.isCoreSquad).length}, sub: ${a.players.filter((p:any) => !p.isCoreSquad).length}`);
    console.log(`  Insights:`);
    a.insights.forEach((i: any) => console.log(`    [${i.kind}] ${i.headline}`));
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
