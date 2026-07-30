import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdmin } from "@/lib/verifyAdmin";
import { recomputeCS2Standings, sortCS2Standings } from "@/lib/recomputeCS2Standings";
import { sendCS2MatchResult, sendCS2TournamentComplete } from "@/lib/discord";

/**
 * Manual CS2 match result entry. CS2 has no live result webhook yet (the
 * MatchZy/RCON pipeline is still being built — see
 * docs/CS2_TOURNAMENT_CONTEXT.md phases 2-4), so every CS2 result is entered
 * by an admin for now. Mirrors dota-manual-result/route.ts's shape so the
 * same standings + leaderboard rendering logic works unchanged.
 *
 * POST { adminKey|authToken, tournamentId, matchId, winner: "team1"|"team2",
 *        team1Rounds?, team2Rounds? }
 *
 * After writing the result:
 *   - a Discord channel announcement is posted (fire-and-forget, never fails
 *     the request) — CS2 has no bot result-announcer watching Firestore yet
 *     (that's still TODO per docs/CS2_TOURNAMENT_CONTEXT.md phase 6), so this
 *     route posts directly instead of relying on the bot
 *   - non-bracket (group) matches trigger a full grouped standings recompute
 *   - once every group match is complete, the two semifinal placeholder
 *     matches are auto-seeded from the group standings (crossover seeding:
 *     GroupA #1 vs GroupB #2, GroupB #1 vs GroupA #2)
 *   - once both semifinals are complete, the final placeholder match is
 *     auto-seeded from the semifinal winners
 *   - if this IS the final match, the tournament is stamped
 *     championTeamId/championTeamName/status:"ended" and a champion
 *     announcement is posted
 *
 * This only fires for the fixed 2-group / 4-team playoff shape this route
 * was built for (semifinal match ids "cs2-sf1"/"cs2-sf2", final "cs2-final").
 * Tournaments that don't use those ids are unaffected — the auto-seed steps
 * silently no-op when those match docs don't exist.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try { await verifyAdmin({ adminKey: body.adminKey, authToken: body.authToken }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const tournamentId = String(body.tournamentId || "").trim();
  const matchId = String(body.matchId || "").trim();
  const winner = String(body.winner || "").trim();
  const team1Rounds = Number.isFinite(body.team1Rounds) ? Number(body.team1Rounds) : null;
  const team2Rounds = Number.isFinite(body.team2Rounds) ? Number(body.team2Rounds) : null;

  if (!tournamentId || !matchId) return NextResponse.json({ error: "tournamentId and matchId required" }, { status: 400 });
  if (winner !== "team1" && winner !== "team2") return NextResponse.json({ error: "winner must be 'team1' or 'team2'" }, { status: 400 });

  const tref = adminDb.collection("cs2Tournaments").doc(tournamentId);
  const ref = tref.collection("matches").doc(matchId);
  const [snap, tSnap] = await Promise.all([ref.get(), tref.get()]);
  if (!snap.exists) return NextResponse.json({ error: "match not found" }, { status: 404 });
  const m: any = snap.data();
  const tournament: any = tSnap.data() || {};

  const nowIso = new Date().toISOString();
  const winnerName = winner === "team1" ? m.team1Name : m.team2Name;
  const team1RoundsWon = team1Rounds ?? (winner === "team1" ? 13 : 0);
  const team2RoundsWon = team2Rounds ?? (winner === "team2" ? 13 : 0);
  const team1SeriesScore = winner === "team1" ? 1 : 0;
  const team2SeriesScore = winner === "team2" ? 1 : 0;

  await ref.set({
    status: "completed",
    team1Score: team1SeriesScore,
    team2Score: team2SeriesScore,
    winner,
    completedAt: nowIso,
    game1: {
      team1RoundsWon, team2RoundsWon,
      completedAt: nowIso,
      status: "completed",
    },
    result: {
      source: "manual-admin",
      winnerTeam: winner,
      enteredBy: "admin-panel",
      enteredAt: nowIso,
    },
  }, { merge: true });

  const bo = m.isBracket
    ? (m.bracketType === "grand_final" ? (tournament.grandFinalBestOf || 3) : (tournament.bracketBestOf || 3))
    : (tournament.matchesPerRound || 1);

  const discordAnnounce = await sendCS2MatchResult({
    team1Name: m.team1Name, team2Name: m.team2Name, winnerName,
    team1RoundsWon, team2RoundsWon, team1SeriesScore, team2SeriesScore, bo,
    isBracket: !!m.isBracket, bracketLabel: m.bracketLabel,
    channelIdOverride: tournament.discordChannelId,
  }).catch((e: any) => ({ ok: false, error: e?.message || String(e) }));

  let standingsRefresh: any = null;
  let bracketAdvance: any = null;
  let championAnnounce: any = null;

  if (!m.isBracket) {
    try { standingsRefresh = await recomputeCS2Standings(adminDb, tournamentId); }
    catch (e: any) { standingsRefresh = { error: e?.message || String(e) }; }

    try { bracketAdvance = await maybeSeedCS2Semifinals(tournamentId); }
    catch (e: any) { bracketAdvance = { error: e?.message || String(e) }; }
  } else {
    try { bracketAdvance = await maybeSeedCS2Final(tournamentId); }
    catch (e: any) { bracketAdvance = { error: e?.message || String(e) }; }

    if (matchId === "cs2-final") {
      await tref.set({
        championTeamId: winner === "team1" ? m.team1Id : m.team2Id,
        championTeamName: winnerName,
        status: "ended",
      }, { merge: true });

      championAnnounce = await sendCS2TournamentComplete({
        tournamentName: tournament.name || "CS2 Tournament",
        tournamentId,
        winnerName,
        prizePool: tournament.prizePool || "TBD",
        team1Name: m.team1Name, team2Name: m.team2Name,
        team1SeriesScore, team2SeriesScore,
        channelIdOverride: tournament.discordChannelId,
      }).catch((e: any) => ({ ok: false, error: e?.message || String(e) }));
    }
  }

  return NextResponse.json({ ok: true, winner, winnerName, matchId, discordAnnounce, standingsRefresh, bracketAdvance, championAnnounce });
}

/**
 * Once both groups have finished their 6 round-robin matches, seed the two
 * semifinal placeholder matches (ids "cs2-sf1" / "cs2-sf2") from the group
 * standings. Crossover seeding (GroupA #1 vs GroupB #2, GroupB #1 vs GroupA
 * #2) avoids an all-one-group final when possible. No-op if the group stage
 * isn't done yet, or if the semifinal docs don't exist / are already seeded.
 */
async function maybeSeedCS2Semifinals(tournamentId: string): Promise<{ seeded: boolean; reason?: string }> {
  const tref = adminDb.collection("cs2Tournaments").doc(tournamentId);

  const groupMatchesSnap = await tref.collection("matches").where("isBracket", "==", false).get();
  const groupMatches = groupMatchesSnap.docs.map(d => d.data());
  if (groupMatches.length === 0) return { seeded: false, reason: "no group matches" };
  if (groupMatches.some((m: any) => m.status !== "completed")) return { seeded: false, reason: "group stage not finished" };

  const sf1Ref = tref.collection("matches").doc("cs2-sf1");
  const sf2Ref = tref.collection("matches").doc("cs2-sf2");
  const [sf1Snap, sf2Snap] = await Promise.all([sf1Ref.get(), sf2Ref.get()]);
  if (!sf1Snap.exists || !sf2Snap.exists) return { seeded: false, reason: "semifinal placeholders not found" };
  if (sf1Snap.data()?.team1Id !== "TBD") return { seeded: false, reason: "already seeded" };

  const standingsSnap = await tref.collection("standings").get();
  const standings = standingsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  const groupA = sortCS2Standings(standings.filter(s => s.groupId === "A"));
  const groupB = sortCS2Standings(standings.filter(s => s.groupId === "B"));
  if (groupA.length < 2 || groupB.length < 2) return { seeded: false, reason: "not enough standings rows per group" };

  const nowIso = new Date().toISOString();
  const batch = adminDb.batch();
  batch.set(sf1Ref, {
    team1Id: groupA[0].teamId, team1Name: groupA[0].teamName,
    team2Id: groupB[1].teamId, team2Name: groupB[1].teamName,
    seededAt: nowIso,
  }, { merge: true });
  batch.set(sf2Ref, {
    team1Id: groupB[0].teamId, team1Name: groupB[0].teamName,
    team2Id: groupA[1].teamId, team2Name: groupA[1].teamName,
    seededAt: nowIso,
  }, { merge: true });
  await batch.commit();

  return { seeded: true };
}

/** Once both semifinals are complete, seed the final (id "cs2-final") from their winners. */
async function maybeSeedCS2Final(tournamentId: string): Promise<{ seeded: boolean; reason?: string }> {
  const tref = adminDb.collection("cs2Tournaments").doc(tournamentId);

  const [sf1Snap, sf2Snap, finalSnap] = await Promise.all([
    tref.collection("matches").doc("cs2-sf1").get(),
    tref.collection("matches").doc("cs2-sf2").get(),
    tref.collection("matches").doc("cs2-final").get(),
  ]);
  if (!sf1Snap.exists || !sf2Snap.exists || !finalSnap.exists) return { seeded: false, reason: "bracket docs not found" };

  const sf1: any = sf1Snap.data();
  const sf2: any = sf2Snap.data();
  if (sf1.status !== "completed" || sf2.status !== "completed") return { seeded: false, reason: "semifinals not finished" };
  if (finalSnap.data()?.team1Id !== "TBD") return { seeded: false, reason: "already seeded" };

  const sf1Winner = sf1.winner === "team1" ? { id: sf1.team1Id, name: sf1.team1Name } : { id: sf1.team2Id, name: sf1.team2Name };
  const sf2Winner = sf2.winner === "team1" ? { id: sf2.team1Id, name: sf2.team1Name } : { id: sf2.team2Id, name: sf2.team2Name };

  await tref.collection("matches").doc("cs2-final").set({
    team1Id: sf1Winner.id, team1Name: sf1Winner.name,
    team2Id: sf2Winner.id, team2Name: sf2Winner.name,
    seededAt: new Date().toISOString(),
  }, { merge: true });

  return { seeded: true };
}
