import type { Firestore } from "firebase-admin/firestore";
import { recomputeCS2Standings, sortCS2Standings } from "@/lib/recomputeCS2Standings";
import { sendCS2MatchResult, sendCS2TournamentComplete } from "@/lib/discord";

/**
 * The CS2 match-result settle cascade: write the result, announce to
 * Discord, recompute standings or advance the bracket, and stamp a champion
 * if this was the final. Originally lived inline in
 * api/admin/cs2-manual-result/route.ts — extracted so the MatchZy webhook
 * (api/cs2/matchzy-events) and the manual admin fallback both run through
 * exactly one implementation. Two copies of bracket-advance logic is how a
 * grand final gets seeded wrong mid-event.
 *
 * `source: "manual-admin"` with no `games` override reproduces the original
 * route's behaviour byte for byte (single game1, 13-0/0-13 default rounds).
 * `source: "matchzy"` passes `games: {}` — per-map game{N} data has already
 * been written incrementally by round_end/map_result events before
 * series_end calls this, and re-synthesizing game1 here would clobber it.
 */

export type CS2GamesPatch = Record<string, {
  team1RoundsWon: number;
  team2RoundsWon: number;
  status?: "completed";
  map?: string;
  completedAt?: string;
}>;

export interface SettleCS2MatchInput {
  tournamentId: string;
  matchId: string;
  winner: "team1" | "team2";
  /** Round score of the deciding map — used for the Discord message and, when
   *  `games` is omitted, to synthesize a single `game1` (the manual-admin
   *  shape). Ignored for scoring when `games` is provided. */
  team1Rounds?: number | null;
  team2Rounds?: number | null;
  team1SeriesScore?: number;
  team2SeriesScore?: number;
  /** Explicit per-map patch. Pass `{}` (not undefined) to settle without
   *  touching any game{N} field — the matchzy path's normal case. */
  games?: CS2GamesPatch;
  source: "manual-admin" | "matchzy";
  enteredBy?: string;
}

export interface SettleCS2MatchResult {
  ok: boolean;
  error?: string;
  winner?: "team1" | "team2";
  winnerName?: string;
  matchId?: string;
  discordAnnounce?: any;
  standingsRefresh?: any;
  bracketAdvance?: any;
  championAnnounce?: any;
}

export async function settleCS2Match(db: Firestore, input: SettleCS2MatchInput): Promise<SettleCS2MatchResult> {
  const { tournamentId, matchId, winner, source } = input;
  const tref = db.collection("cs2Tournaments").doc(tournamentId);
  const ref = tref.collection("matches").doc(matchId);
  const [snap, tSnap] = await Promise.all([ref.get(), tref.get()]);
  if (!snap.exists) return { ok: false, error: "match not found" };
  const m: any = snap.data();
  const tournament: any = tSnap.data() || {};

  const nowIso = new Date().toISOString();
  const winnerName = winner === "team1" ? m.team1Name : m.team2Name;

  const team1RoundsWon = input.team1Rounds ?? (winner === "team1" ? 13 : 0);
  const team2RoundsWon = input.team2Rounds ?? (winner === "team2" ? 13 : 0);
  const team1SeriesScore = input.team1SeriesScore ?? (winner === "team1" ? 1 : 0);
  const team2SeriesScore = input.team2SeriesScore ?? (winner === "team2" ? 1 : 0);

  const gamesPatch: CS2GamesPatch = input.games ?? {
    game1: { team1RoundsWon, team2RoundsWon, completedAt: nowIso, status: "completed" },
  };

  await ref.set({
    status: "completed",
    team1Score: team1SeriesScore,
    team2Score: team2SeriesScore,
    winner,
    completedAt: nowIso,
    ...gamesPatch,
    result: {
      source,
      winnerTeam: winner,
      enteredBy: input.enteredBy || (source === "matchzy" ? "matchzy-webhook" : "admin-panel"),
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
    try { standingsRefresh = await recomputeCS2Standings(db, tournamentId); }
    catch (e: any) { standingsRefresh = { error: e?.message || String(e) }; }

    try { bracketAdvance = await maybeSeedCS2Semifinals(db, tournamentId); }
    catch (e: any) { bracketAdvance = { error: e?.message || String(e) }; }
  } else {
    try { bracketAdvance = await maybeSeedCS2Final(db, tournamentId); }
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

  return { ok: true, winner, winnerName, matchId, discordAnnounce, standingsRefresh, bracketAdvance, championAnnounce };
}

/**
 * Once both groups have finished their 6 round-robin matches, seed the two
 * semifinal placeholder matches (ids "cs2-sf1" / "cs2-sf2") from the group
 * standings. Crossover seeding (GroupA #1 vs GroupB #2, GroupB #1 vs GroupA
 * #2) avoids an all-one-group final when possible. No-op if the group stage
 * isn't done yet, or if the semifinal docs don't exist / are already seeded.
 */
async function maybeSeedCS2Semifinals(db: Firestore, tournamentId: string): Promise<{ seeded: boolean; reason?: string }> {
  const tref = db.collection("cs2Tournaments").doc(tournamentId);

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
  const batch = db.batch();
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
async function maybeSeedCS2Final(db: Firestore, tournamentId: string): Promise<{ seeded: boolean; reason?: string }> {
  const tref = db.collection("cs2Tournaments").doc(tournamentId);

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
