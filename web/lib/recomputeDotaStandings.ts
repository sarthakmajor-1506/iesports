import type { Firestore } from "firebase-admin/firestore";

/**
 * Recompute and write the entire `standings` subcollection for a Dota
 * tournament from its completed matches. Idempotent — safe to call
 * multiple times. Call this from every code path that mutates a match
 * result (auto-resolve, manual entry, reset).
 *
 * Standings shape (matches what /api/tournaments/detail reads + the
 * tournament-detail page renders):
 *   { teamId, teamName, played, wins, losses, draws, points,
 *     killsFor, killsAgainst, killDiff, mapsWon, mapsLost }
 *
 * Returns the count of standings rows written.
 */
export async function recomputeDotaStandings(
  db: Firestore,
  tournamentId: string,
  collection: string = "tournaments",
): Promise<{ written: number; matchesUsed: number; warning?: string }> {
  const tref = db.collection(collection).doc(tournamentId);
  const msnap = await tref.collection("matches").where("status", "==", "completed").get();
  if (msnap.empty) return { written: 0, matchesUsed: 0, warning: "no completed matches" };

  type S = {
    teamId: string; teamName: string;
    played: number; wins: number; losses: number; draws: number;
    points: number;
    killsFor: number; killsAgainst: number;
    mapsWon: number; mapsLost: number;
  };
  const std: Record<string, S> = {};
  const init = (tid: string, name: string) => {
    if (!std[tid]) std[tid] = {
      teamId: tid, teamName: name || tid,
      played: 0, wins: 0, losses: 0, draws: 0, points: 0,
      killsFor: 0, killsAgainst: 0,
      mapsWon: 0, mapsLost: 0,
    };
  };

  let used = 0;
  for (const doc of msnap.docs) {
    const m: any = doc.data();
    if (!m.team1Id || !m.team2Id) continue;
    // Derive winner from score when missing (handles old data shape).
    let winner: "team1" | "team2" | "draw" | null = m.winner ?? null;
    if (!winner) {
      const t1 = m.team1Score ?? 0;
      const t2 = m.team2Score ?? 0;
      if (t1 > t2) winner = "team1";
      else if (t2 > t1) winner = "team2";
      else if (t1 === t2 && t1 > 0) winner = "draw";
    }
    if (!winner) continue;
    used++;

    init(m.team1Id, m.team1Name);
    init(m.team2Id, m.team2Name);
    const a = std[m.team1Id];
    const b = std[m.team2Id];
    a.played++; b.played++;

    const t1Maps = m.team1Score || 0;
    const t2Maps = m.team2Score || 0;
    a.mapsWon += t1Maps; a.mapsLost += t2Maps;
    b.mapsWon += t2Maps; b.mapsLost += t1Maps;

    if (winner === "team1") { a.wins++; b.losses++; a.points += 3; }
    else if (winner === "team2") { b.wins++; a.losses++; b.points += 3; }
    else { a.draws++; b.draws++; a.points++; b.points++; }

    // Kill totals from playerStats when present (lets killDiff act as tiebreaker)
    const ps: any[] = m.game1?.playerStats || m.playerStats || [];
    if (Array.isArray(ps) && ps.length > 0) {
      const team1Side = m.result?.team1Side || m.game1?.team1Side;
      let t1K = 0, t2K = 0;
      for (const p of ps) {
        const k = p.kills || 0;
        if (team1Side) {
          if (p.side === team1Side) t1K += k; else t2K += k;
        } else if (p.teamId) {
          if (p.teamId === m.team1Id) t1K += k;
          else if (p.teamId === m.team2Id) t2K += k;
        }
      }
      a.killsFor += t1K; a.killsAgainst += t2K;
      b.killsFor += t2K; b.killsAgainst += t1K;
    }
  }

  // Replace the entire standings subcollection (overwrite each row; delete
  // any rows for teams that no longer have completed matches).
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
      killDiff: s.killsFor - s.killsAgainst,
    }, { merge: false });
  }
  await batch.commit();
  return { written: newIds.size, matchesUsed: used };
}
