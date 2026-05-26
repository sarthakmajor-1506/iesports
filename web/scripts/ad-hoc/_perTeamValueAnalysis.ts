import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
})});
import { computeTeamAnalytics, findUpcomingMatch, generateMatchupAdvice } from "../../lib/valorantTeamAnalytics";

const db = getFirestore();
const TID = "league-of-rising-stars-ascension";

(async () => {
  const tref = db.collection("valorantTournaments").doc(TID);
  const [teamsSnap, matchesSnap, standingsSnap] = await Promise.all([
    tref.collection("teams").get(),
    tref.collection("matches").get(),
    tref.collection("standings").get(),
  ]);
  const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const standings = standingsSnap.docs.map(d => ({ teamId: d.id, ...d.data() } as any));

  const sortedStandings = [...standings].sort((a, b) => {
    if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
    const ra = (a.roundsWon ?? 0) - (a.roundsLost ?? 0);
    const rb = (b.roundsWon ?? 0) - (b.roundsLost ?? 0);
    return rb - ra;
  });

  for (const team of teams.sort((a, b) => a.teamIndex - b.teamIndex)) {
    const standing = standings.find(s => s.teamId === team.id);
    const a = computeTeamAnalytics(team, standing || null, matches, standings) as any;
    const upcoming = findUpcomingMatch(matches, team.id);
    if (upcoming) {
      const oppId = upcoming.team1Id === team.id ? upcoming.team2Id : upcoming.team1Id;
      const oppTeam = teams.find(t => t.id === oppId);
      const oppStanding = standings.find(s => s.teamId === oppId) || null;
      if (oppTeam) {
        const oppA = computeTeamAnalytics(oppTeam, oppStanding, matches, standings);
        a.upcomingMatch = generateMatchupAdvice(a, oppA, upcoming, { logo: oppTeam.teamLogo });
      }
    }
    const rank = sortedStandings.findIndex(s => s.teamId === team.id) + 1;
    console.log(`\n========== #${rank} ${team.teamName} (${team.id}) ==========`);
    console.log(`  Record: ${a.standing?.wins || 0}-${a.standing?.draws || 0}-${a.standing?.losses || 0}, ${a.standing?.points || 0} pts, round diff ${(a.standing?.roundsWon || 0) - (a.standing?.roundsLost || 0)}`);
    console.log(`  Recent form: ${a.form.recent.join(" ")} ${a.form.streak ? `(${a.form.streak.count}-game ${a.form.streak.type})` : ""}`);
    console.log(`  Insights: ${a.insights.length}`);
    a.insights.forEach((i: any) => console.log(`    [${i.kind}] ${i.headline}`));
    if (a.upcomingMatch) {
      console.log(`  NEXT MATCH: vs ${a.upcomingMatch.opponent.teamName} | map picks: ${a.upcomingMatch.mapPicks.length}, tactical: ${a.upcomingMatch.tactical.length}, key matchups: ${a.upcomingMatch.keyMatchups.length}`);
    } else {
      console.log(`  No upcoming match scheduled.`);
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
