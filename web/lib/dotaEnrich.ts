/**
 * Auto-enrich a completed Dota match with full per-player stats + draft from the
 * public league record (OpenDota). Idempotent: skips matches that already have
 * game1.playerStats or that OpenDota hasn't indexed yet. Purely additive — fills
 * the side-based game1 detail fields the match page reads; leaves top-level
 * winner/scores (used by standings) untouched.
 */
import { fetchDotaMatchStats } from "./dotaMatchStats";

type AnyMatch = { id: string; [k: string]: any };

export function needsDotaEnrich(m: AnyMatch): boolean {
  const dmid = m?.dotaMatchId || m?.game1?.dotaMatchId;
  const hasStats = Array.isArray(m?.game1?.playerStats) && m.game1.playerStats.length > 0;
  return m?.status === "completed" && !!dmid && !hasStats;
}

export async function enrichDotaMatch(adminDb: any, tournamentId: string, m: AnyMatch): Promise<AnyMatch> {
  try {
    if (!needsDotaEnrich(m)) return m;
    const dmid = String(m.dotaMatchId || m.game1?.dotaMatchId);
    const stats = await fetchDotaMatchStats(dmid);
    if (!stats.found || !stats.players.length) return m; // not indexed yet — try again next load
    const isT1Rad = m.vetoState?.radiantTeam !== "team2"; // default Radiant = team1
    const radiantTeamId = isT1Rad ? m.team1Id : m.team2Id;
    const direTeamId = isT1Rad ? m.team2Id : m.team1Id;
    const game1 = {
      ...(m.game1 || {}),
      dotaMatchId: dmid,
      status: "completed",
      winner: stats.winnerSide,
      radiantScore: stats.radiantScore,
      direScore: stats.direScore,
      radiantTeamId,
      direTeamId,
      durationSeconds: stats.durationSec,
      playerStats: stats.players,
      draft: stats.draft,
    };
    await adminDb.collection("tournaments").doc(tournamentId).collection("matches").doc(m.id).set({ game1 }, { merge: true });
    return { ...m, game1 };
  } catch {
    return m; // never break the detail response over enrichment
  }
}

/** Enrich all completed-but-missing matches in one tournament response (bounded + parallel). */
export async function enrichDotaMatches(adminDb: any, tournamentId: string, matches: AnyMatch[]): Promise<AnyMatch[]> {
  const todo = matches.filter(needsDotaEnrich).slice(0, 8); // cap per request; the rest fill on later loads
  if (!todo.length) return matches;
  const enriched = await Promise.all(todo.map((m) => enrichDotaMatch(adminDb, tournamentId, m)));
  const byId = new Map(enriched.map((m) => [m.id, m]));
  return matches.map((m) => byId.get(m.id) || m);
}
