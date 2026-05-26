import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  computeTeamAnalytics,
  generateMatchupAdvice,
  generateTeamInsights,
  findUpcomingMatch,
  type MatchDoc,
  type StandingEntry,
  type TeamDocLite,
} from "@/lib/valorantTeamAnalytics";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET(req: NextRequest) {
  const tournamentId = req.nextUrl.searchParams.get("tournamentId");
  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!tournamentId || !teamId) {
    return NextResponse.json({ error: "tournamentId and teamId required" }, { status: 400 });
  }

  try {
    const tref = adminDb.collection("valorantTournaments").doc(tournamentId);
    const [tDoc, teamsSnap, matchesSnap, standingsSnap] = await Promise.all([
      tref.get(),
      tref.collection("teams").get(),
      tref.collection("matches").get(),
      tref.collection("standings").get(),
    ]);

    if (!tDoc.exists) return NextResponse.json({ error: "tournament not found" }, { status: 404 });

    const teams: TeamDocLite[] = teamsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const focal = teams.find(t => t.id === teamId);
    if (!focal) return NextResponse.json({ error: "team not found in this tournament" }, { status: 404 });

    const matches: MatchDoc[] = matchesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const standings: StandingEntry[] = standingsSnap.docs.map(d => ({ teamId: d.id, ...(d.data() as any) }));
    const sortedStandings = [...standings].sort((a, b) => {
      if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
      const ra = (a.roundsWon ?? 0) - (a.roundsLost ?? 0);
      const rb = (b.roundsWon ?? 0) - (b.roundsLost ?? 0);
      if (rb !== ra) return rb - ra;
      const ma = (a.mapsWon ?? 0) - (a.mapsLost ?? 0);
      const mb = (b.mapsWon ?? 0) - (b.mapsLost ?? 0);
      if (mb !== ma) return mb - ma;
      return (b.wins ?? 0) - (a.wins ?? 0);
    });
    const rank = sortedStandings.findIndex(s => s.teamId === teamId) + 1;
    const focalStanding = standings.find(s => s.teamId === teamId) || null;

    const analytics: any = computeTeamAnalytics(focal, focalStanding, matches, standings);
    analytics.rank = rank > 0 ? rank : null;
    analytics.totalTeams = standings.length;

    const upcoming = findUpcomingMatch(matches, teamId);
    if (upcoming) {
      const oppId = upcoming.team1Id === teamId ? upcoming.team2Id : upcoming.team1Id;
      const oppTeam = teams.find(t => t.id === oppId);
      const oppStanding = standings.find(s => s.teamId === oppId) || null;
      if (oppTeam) {
        const oppAnalytics = computeTeamAnalytics(oppTeam, oppStanding, matches, standings);
        analytics.upcomingMatch = generateMatchupAdvice(analytics, oppAnalytics, upcoming, { logo: oppTeam.teamLogo });
        analytics.insights = generateTeamInsights(analytics);
      }
    }

    const teamLogos: Record<string, string> = {};
    teams.forEach(t => { if (t.teamLogo) teamLogos[t.id] = t.teamLogo; });

    const tournament = tDoc.data() as any;
    return NextResponse.json({
      tournament: {
        id: tournamentId,
        name: tournament.name,
        format: tournament.format,
        currentMatchDay: tournament.currentMatchDay,
      },
      analytics,
      teamLogos,
    });
  } catch (e: any) {
    console.error("[team-analytics] error:", e?.message || e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
