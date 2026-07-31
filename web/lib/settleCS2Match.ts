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
  /** "draw" is valid for group games only — the group stage is MR16 with no
   *  overtime, so 8-8 happens. A bracket match must produce a winner or the
   *  play-off cannot advance, and is rejected. */
  winner: "team1" | "team2" | "draw";
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
  winner?: "team1" | "team2" | "draw";
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

  const isDraw = winner === "draw";

  // A drawn bracket match would leave the play-off with no team to advance,
  // and maybeSeedCS2Final would read `winner` as neither side. Refuse it here
  // rather than writing a result the bracket cannot act on.
  if (isDraw && m.isBracket) {
    return { ok: false, error: "a bracket match cannot be drawn — it must produce a winner to advance" };
  }

  const nowIso = new Date().toISOString();
  const winnerName = isDraw ? "Draw" : winner === "team1" ? m.team1Name : m.team2Name;

  const team1RoundsWon = input.team1Rounds ?? (winner === "team1" ? 13 : 0);
  const team2RoundsWon = input.team2Rounds ?? (winner === "team2" ? 13 : 0);
  // Series score is maps won. Nobody wins the map in a drawn BO1, so a draw is
  // 0-0 — which also keeps recomputeCS2Standings' mapDiff honest, and makes
  // the match card's existing `team1Score === team2Score` draw styling fire.
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
    isBracket: !!m.isBracket, bracketLabel: m.bracketLabel, isDraw,
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
  } else if (winner !== "draw") {
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
 * Seed the semifinal placeholders ("cs2-sf1" / "cs2-sf2") from group
 * standings, one group at a time.
 *
 * Crossover seeding — SF1 = Group A #1 vs Group B #2, SF2 = Group B #1 vs
 * Group A #2 — matching the published fixture sheet and avoiding an
 * all-one-group final where possible.
 *
 * Per group, not all-or-nothing: the two groups play back to back, so Group A
 * is settled a full hour before Group B finishes, and an admin naturally wants
 * the A side of the bracket visible as soon as it is known. Each group's slots
 * fill the moment that group's six matches are complete.
 *
 * Every write is guarded on the slot still reading "TBD", so this is safe to
 * call after every result and cannot overwrite a bracket that has since been
 * corrected by hand. That guard used to live on SF1's team1 alone and stood in
 * for the whole bracket: seeding one group first would have permanently
 * skipped the other, leaving those slots on TBD with no way back short of
 * editing Firestore.
 */
export async function maybeSeedCS2Semifinals(
  db: Firestore,
  tournamentId: string,
): Promise<{ seeded: boolean; slots?: string[]; reason?: string }> {
  const tref = db.collection("cs2Tournaments").doc(tournamentId);

  const groupMatchesSnap = await tref.collection("matches").where("isBracket", "==", false).get();
  const groupMatches = groupMatchesSnap.docs.map(d => d.data() as any);
  if (groupMatches.length === 0) return { seeded: false, reason: "no group matches" };

  const sf1Ref = tref.collection("matches").doc("cs2-sf1");
  const sf2Ref = tref.collection("matches").doc("cs2-sf2");
  const [sf1Snap, sf2Snap] = await Promise.all([sf1Ref.get(), sf2Ref.get()]);
  if (!sf1Snap.exists || !sf2Snap.exists) return { seeded: false, reason: "semifinal placeholders not found" };
  const sf1: any = sf1Snap.data();
  const sf2: any = sf2Snap.data();

  const standingsSnap = await tref.collection("standings").get();
  const standings = standingsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

  const groupDone = (gid: string) => {
    const inGroup = groupMatches.filter(m => (m.groupId || "A") === gid);
    return inGroup.length > 0 && inGroup.every(m => m.status === "completed");
  };

  const nowIso = new Date().toISOString();
  const batch = db.batch();
  const slots: string[] = [];

  // Group A → SF1 team1 (the #1 seed) and SF2 team2 (the #2 seed).
  if (groupDone("A")) {
    const a = sortCS2Standings(standings.filter(s => s.groupId === "A"));
    if (a.length >= 2) {
      if (sf1.team1Id === "TBD") {
        batch.set(sf1Ref, { team1Id: a[0].teamId, team1Name: a[0].teamName, seededAt: nowIso }, { merge: true });
        slots.push(`sf1.team1=${a[0].teamName}`);
      }
      if (sf2.team2Id === "TBD") {
        batch.set(sf2Ref, { team2Id: a[1].teamId, team2Name: a[1].teamName, seededAt: nowIso }, { merge: true });
        slots.push(`sf2.team2=${a[1].teamName}`);
      }
    }
  }

  // Group B → SF2 team1 (the #1 seed) and SF1 team2 (the #2 seed).
  if (groupDone("B")) {
    const b = sortCS2Standings(standings.filter(s => s.groupId === "B"));
    if (b.length >= 2) {
      if (sf2.team1Id === "TBD") {
        batch.set(sf2Ref, { team1Id: b[0].teamId, team1Name: b[0].teamName, seededAt: nowIso }, { merge: true });
        slots.push(`sf2.team1=${b[0].teamName}`);
      }
      if (sf1.team2Id === "TBD") {
        batch.set(sf1Ref, { team2Id: b[1].teamId, team2Name: b[1].teamName, seededAt: nowIso }, { merge: true });
        slots.push(`sf1.team2=${b[1].teamName}`);
      }
    }
  }

  if (!slots.length) return { seeded: false, reason: "nothing to seed (group unfinished or slots already filled)" };
  await batch.commit();
  return { seeded: true, slots };
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
