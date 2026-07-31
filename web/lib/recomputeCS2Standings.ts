import type { Firestore } from "firebase-admin/firestore";

/**
 * Recompute and write the `standings` subcollection for a CS2 tournament
 * from its completed group-stage matches. Idempotent — safe to call after
 * every result entry. Mirrors recomputeDotaStandings.ts, but:
 *   - only considers non-bracket matches (isBracket guard, see
 *     docs/CLAUDE_CONTEXT.md "Critical guard: Swiss vs bracket matches")
 *   - is group-aware: each standings row carries a `groupId` so the
 *     tournament page can render one table per group
 *   - uses the canonical CS2 tiebreaker chain from
 *     docs/CS2_TOURNAMENT_CONTEXT.md: points → roundDiff → mapDiff → wins
 *
 * Points: 3 for a win, 1 each for a draw, 0 for a loss. A drawn match is a
 * real outcome in this format — the group stage is MR16, so 8-8 is reachable
 * and there is no overtime — and a draw that silently vanished from the table
 * would leave two teams showing fewer games played than they had played.
 *
 * Standings shape:
 *   { teamId, teamName, groupId, played, wins, draws, losses, points,
 *     roundsWon, roundsLost, roundDiff, mapsWon, mapsLost, mapDiff }
 */
export async function recomputeCS2Standings(
  db: Firestore,
  tournamentId: string,
): Promise<{ written: number; matchesUsed: number; warning?: string }> {
  const tref = db.collection("cs2Tournaments").doc(tournamentId);
  const msnap = await tref
    .collection("matches")
    .where("isBracket", "==", false)
    .where("status", "==", "completed")
    .get();
  if (msnap.empty) return { written: 0, matchesUsed: 0, warning: "no completed group matches" };

  type S = {
    teamId: string; teamName: string; groupId: string;
    played: number; wins: number; draws: number; losses: number; points: number;
    roundsWon: number; roundsLost: number;
    mapsWon: number; mapsLost: number;
  };
  const std: Record<string, S> = {};
  const init = (tid: string, name: string, groupId: string) => {
    if (!std[tid]) std[tid] = {
      teamId: tid, teamName: name || tid, groupId,
      played: 0, wins: 0, draws: 0, losses: 0, points: 0,
      roundsWon: 0, roundsLost: 0, mapsWon: 0, mapsLost: 0,
    };
  };

  let used = 0;
  for (const doc of msnap.docs) {
    const m: any = doc.data();
    if (!m.team1Id || !m.team2Id) continue;

    // "draw" is an explicit outcome written by settleCS2Match, not the absence
    // of a winner. A completed match with neither — a result that was never
    // entered properly — is still skipped, because counting it would award
    // points nobody earned.
    let winner: "team1" | "team2" | "draw" | null = m.winner ?? null;
    if (!winner) {
      const t1 = m.team1Score ?? 0;
      const t2 = m.team2Score ?? 0;
      if (t1 > t2) winner = "team1";
      else if (t2 > t1) winner = "team2";
    }
    if (!winner) continue;
    used++;

    const groupId = m.groupId || "A";
    init(m.team1Id, m.team1Name, groupId);
    init(m.team2Id, m.team2Name, groupId);
    const a = std[m.team1Id];
    const b = std[m.team2Id];
    a.played++; b.played++;

    // Maps won (BO1 group stage: 1-0 or 0-1)
    const t1Maps = m.team1Score || 0;
    const t2Maps = m.team2Score || 0;
    a.mapsWon += t1Maps; a.mapsLost += t2Maps;
    b.mapsWon += t2Maps; b.mapsLost += t1Maps;

    // Round score from the decisive map, for the roundDiff tiebreaker.
    // Manual result entry stores round score on the last map played
    // (game{N} where N = total maps played), defaulting to game1.
    const lastGameKey = `game${Math.max(t1Maps + t2Maps, 1)}`;
    const lastGame = m[lastGameKey] || m.games?.[lastGameKey] || m.game1 || {};
    const t1Rounds = lastGame.team1RoundsWon ?? 0;
    const t2Rounds = lastGame.team2RoundsWon ?? 0;
    a.roundsWon += t1Rounds; a.roundsLost += t2Rounds;
    b.roundsWon += t2Rounds; b.roundsLost += t1Rounds;

    if (winner === "draw") { a.draws++; b.draws++; a.points += 1; b.points += 1; }
    else if (winner === "team1") { a.wins++; b.losses++; a.points += 3; }
    else { b.wins++; a.losses++; b.points += 3; }
  }

  // Replace the entire standings subcollection (delete rows for teams that
  // no longer have completed matches, overwrite the rest).
  const existing = await tref.collection("standings").get();
  const batch = db.batch();
  const newIds = new Set(Object.keys(std));
  for (const d of existing.docs) {
    if (!newIds.has(d.id)) batch.delete(d.ref);
  }
  for (const tid of newIds) {
    const s = std[tid];
    batch.set(tref.collection("standings").doc(tid), {
      ...s,
      roundDiff: s.roundsWon - s.roundsLost,
      mapDiff: s.mapsWon - s.mapsLost,
    }, { merge: false });
  }
  await batch.commit();
  return { written: newIds.size, matchesUsed: used };
}

/** Canonical CS2 tiebreaker (see docs/CS2_TOURNAMENT_CONTEXT.md). Keep this
 *  in sync with any other place that sorts CS2 standings (the tournament
 *  page render and the bracket auto-seed logic in cs2-manual-result). */
export function sortCS2Standings<T extends { points: number; roundDiff?: number; mapDiff?: number; wins: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if ((b.roundDiff || 0) !== (a.roundDiff || 0)) return (b.roundDiff || 0) - (a.roundDiff || 0);
    if ((b.mapDiff || 0) !== (a.mapDiff || 0)) return (b.mapDiff || 0) - (a.mapDiff || 0);
    return b.wins - a.wins;
  });
}
