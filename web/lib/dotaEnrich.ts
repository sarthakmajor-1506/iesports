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

export function isStuckLive(m: AnyMatch): boolean {
  return m?.status === "live" && !!(m?.dotaMatchId || m?.game1?.dotaMatchId);
}

/** Settle a match that's still `live` in Firestore but whose game has ended, from
 *  the public OpenDota result. Only fires when OpenDota actually has the finished
 *  result (radiant_win != null), so a genuinely in-progress game is never settled
 *  early. Writes team-based winner/scores (standings) + side-based game1 detail. */
export async function settleStuckLiveDotaMatch(adminDb: any, tournamentId: string, m: AnyMatch): Promise<AnyMatch> {
  try {
    if (!isStuckLive(m)) return m;
    const dmid = String(m.dotaMatchId || m.game1?.dotaMatchId);
    const od: any = await (await fetch(`https://api.opendota.com/api/matches/${dmid}`)).json();
    if (!od || od.radiant_win == null) return m; // not finished / not indexed yet → stay live
    const isT1Rad = m.vetoState?.radiantTeam !== "team2";
    const radiantWin = !!od.radiant_win;
    const winner = radiantWin === isT1Rad ? "team1" : "team2";
    const team1Score = winner === "team1" ? 1 : 0;
    const team2Score = winner === "team2" ? 1 : 0;
    const durationSec = od.duration || 0;
    const stats = await fetchDotaMatchStats(dmid);
    const radiantTeamId = isT1Rad ? m.team1Id : m.team2Id;
    const direTeamId = isT1Rad ? m.team2Id : m.team1Id;
    const nowIso = new Date().toISOString();
    const game1 = {
      ...(m.game1 || {}),
      dotaMatchId: dmid, status: "completed",
      winner: stats.winnerSide || (radiantWin ? "radiant" : "dire"),
      radiantScore: od.radiant_score || 0, direScore: od.dire_score || 0,
      radiantTeamId, direTeamId, durationSeconds: durationSec,
      ...(stats.found && stats.players.length ? { playerStats: stats.players, draft: stats.draft } : {}),
    };
    const update: any = {
      status: "completed", lobbyStatus: "completed", completedAt: nowIso,
      team1Score, team2Score, winner, durationSec, dotaMatchId: dmid, game1,
      result: { source: "auto-opendota-league", dotaMatchId: dmid, radiantWin, winnerTeam: winner, radiantScore: od.radiant_score, direScore: od.dire_score, durationSeconds: durationSec, fetchedAt: nowIso },
    };
    await adminDb.collection("tournaments").doc(tournamentId).collection("matches").doc(m.id).set(update, { merge: true });
    try {
      const qs = await adminDb.collection("botQueues").where("tournamentId", "==", tournamentId).where("tournamentMatchId", "==", m.id).get();
      for (const q of qs.docs) await q.ref.set({ status: "completed", dotaMatchId: dmid }, { merge: true });
    } catch { /* best-effort queue cleanup */ }
    return { ...m, ...update };
  } catch {
    return m;
  }
}

/** One-shot reconcile for a tournament's matches: auto-settle ended-but-live
 *  matches (gated by the live feed so in-progress games are never touched), then
 *  enrich completed matches missing per-player stats. Used by the detail route. */
export async function reconcileDotaMatches(adminDb: any, tournamentId: string, matches: AnyMatch[]): Promise<AnyMatch[]> {
  const live = matches.filter(isStuckLive);
  if (live.length) {
    // One Steam call: which match ids are STILL actually live? Only settle the
    // ones that have left the live feed (ended). Degrades safely if the key/feed
    // is unavailable (then OpenDota's radiant_win gate still prevents early settle).
    let liveIds = new Set<string>();
    try {
      const key = process.env.STEAM_API_KEY || "";
      if (key) {
        const games = (await (await fetch(`https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${key}`)).json())?.result?.games || [];
        liveIds = new Set(games.map((g: any) => String(g.match_id)));
      }
    } catch { /* fall through */ }
    const ended = live.filter((m) => !liveIds.has(String(m.dotaMatchId || m.game1?.dotaMatchId))).slice(0, 4);
    if (ended.length) {
      const settled = await Promise.all(ended.map((m) => settleStuckLiveDotaMatch(adminDb, tournamentId, m)));
      const byId = new Map(settled.map((m) => [m.id, m]));
      matches = matches.map((m) => byId.get(m.id) || m);
    }
  }
  return enrichDotaMatches(adminDb, tournamentId, matches);
}
