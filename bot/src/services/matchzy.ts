/**
 * DB-level bridge between iesports (Firestore) and a self-hosted
 * MatchZy Auto Tournament instance (Postgres) — see conversation notes.
 *
 * MAT has no public REST API for external integration, so this talks
 * directly to its Postgres schema (confirmed from its source at
 * https://github.com/sivert-io/matchzy-auto-tournament, api/src/config/database.schema.ts).
 * MAT's `tournament` table is a single row (id always = 1) — one
 * active tournament per MAT instance, which matches iesports' cadence
 * of running one CS2 tournament at a time.
 *
 * Division of ownership:
 * - iesports owns registration (cs2Tournaments/{id}/soloPlayers).
 * - MAT owns team shuffling/drafting, bracket structure, and running
 *   matches on the CS2 dedicated server (admin builds the bracket in
 *   MAT's own dashboard after roster push — that step is intentionally
 *   NOT automated here; map pool / best-of / bracket type are per-event
 *   judgment calls better made by a human in MAT's UI).
 * - pushCS2Roster: registered players -> MAT (players + shuffle_tournament_players)
 * - pullCS2Results: MAT's teams/matches/results -> iesports Firestore mirror,
 *   in the exact shape app/cs2/tournament/[id]/page.tsx already reads
 *   (team1Id/team1Name/team1Score/team2Id/team2Name/team2Score/status/
 *   isBracket/bracketType/scheduledTime, teams collection with members[]).
 *
 * Inert until MATCHZY_DATABASE_URL is set — safe to import/deploy before
 * the MAT instance exists.
 */
import { Pool } from "pg";
import { getDb } from "./firebase";

let pool: Pool | null = null;

function getMatchzyPool(): Pool {
  if (!process.env.MATCHZY_DATABASE_URL) {
    throw new Error("MATCHZY_DATABASE_URL not set — MAT sync is not configured yet");
  }
  if (!pool) {
    pool = new Pool({ connectionString: process.env.MATCHZY_DATABASE_URL });
  }
  return pool;
}

// ── PUSH: registered CS2 players -> MAT's player pool ─────────────────────

export interface CS2SoloPlayer {
  uid: string;
  steamId: string;
  steamName: string;
  steamAvatar: string;
}

/**
 * Upserts every registered player for a CS2 tournament into MAT's `players`
 * table and registers them for the (single, id=1) shuffle tournament.
 * Safe to re-run — both writes are idempotent (ON CONFLICT DO UPDATE / DO NOTHING).
 */
export async function pushCS2Roster(tournamentId: string): Promise<{ pushed: number; skipped: number }> {
  const db = getDb();
  const mat = getMatchzyPool();

  const soloPlayersSnap = await db.collection("cs2Tournaments").doc(tournamentId).collection("soloPlayers").get();
  const players = soloPlayersSnap.docs.map(d => d.data() as CS2SoloPlayer);

  let pushed = 0, skipped = 0;
  const client = await mat.connect();
  try {
    await client.query("BEGIN");
    for (const p of players) {
      if (!p.steamId) { skipped++; continue; }
      await client.query(
        `INSERT INTO players (id, name, avatar_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url, updated_at = EXTRACT(EPOCH FROM NOW())::INTEGER`,
        [p.steamId, p.steamName || p.steamId, p.steamAvatar || null]
      );
      await client.query(
        `INSERT INTO shuffle_tournament_players (tournament_id, player_id)
         VALUES (1, $1)
         ON CONFLICT (tournament_id, player_id) DO NOTHING`,
        [p.steamId]
      );
      pushed++;
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return { pushed, skipped };
}

// ── PULL: MAT's bracket/results -> iesports Firestore mirror ──────────────

type MatTeamRow = { id: string; name: string; tag: string | null; players: string };
type MatMatchRow = {
  id: number; slug: string; round: number; match_number: number; bracket: string | null;
  team1_id: string | null; team2_id: string | null; winner_id: string | null;
  status: string; created_at: number; loaded_at: number | null; completed_at: number | null;
};
type MatMapResultRow = { match_slug: string; map_number: number; map_name: string | null; team1_score: number; team2_score: number; winner_team: string | null };
type MatPlayerStatRow = {
  player_id: string; match_slug: string; team: string; won_match: boolean;
  adr: number | null; kills: number | null; deaths: number | null; assists: number | null;
  headshots: number | null; kast: number | null; mvps: number | null; score: number | null; rounds_played: number | null;
};

const BRACKET_TYPE_MAP: Record<string, string> = {
  WB: "upper", LB: "lower", GF: "grand_final", GF_RESET: "grand_final_reset",
};
const MAT_STATUS_MAP: Record<string, string> = {
  completed: "completed", live: "live", in_progress: "live",
  pending: "pending", scheduled: "pending", ready: "pending", veto: "pending",
};

/**
 * Mirrors MAT's teams + matches (+ per-map and per-player stats) for the
 * single active tournament (id=1) into cs2Tournaments/{tournamentId}/teams
 * and .../matches, in the field shape the existing CS2 tournament page reads.
 * Safe to re-run on an interval — every write is an upsert (merge: true).
 */
export async function pullCS2Results(tournamentId: string): Promise<{ teams: number; matches: number }> {
  const db = getDb();
  const mat = getMatchzyPool();
  const tRef = db.collection("cs2Tournaments").doc(tournamentId);

  const teamsRes = await mat.query<MatTeamRow>(`SELECT id, name, tag, players FROM teams`);
  const matchesRes = await mat.query<MatMatchRow>(`SELECT * FROM matches WHERE tournament_id = 1`);
  const mapResultsRes = await mat.query<MatMapResultRow>(`SELECT * FROM match_map_results`);
  const playerStatsRes = await mat.query<MatPlayerStatRow>(`SELECT * FROM player_match_stats`);

  const mapResultsBySlug = new Map<string, MatMapResultRow[]>();
  for (const r of mapResultsRes.rows) {
    const arr = mapResultsBySlug.get(r.match_slug) || [];
    arr.push(r);
    mapResultsBySlug.set(r.match_slug, arr);
  }
  const statsBySlug = new Map<string, MatPlayerStatRow[]>();
  for (const r of playerStatsRes.rows) {
    const arr = statsBySlug.get(r.match_slug) || [];
    arr.push(r);
    statsBySlug.set(r.match_slug, arr);
  }

  const teamNameById = new Map<string, string>();
  const batch1 = db.batch();
  for (const t of teamsRes.rows) {
    teamNameById.set(t.id, t.name);
    let memberIds: string[] = [];
    try { memberIds = JSON.parse(t.players || "[]"); } catch { /* leave empty */ }
    const teamRef = tRef.collection("teams").doc(t.id);
    batch1.set(teamRef, {
      teamName: t.tag ? `[${t.tag}] ${t.name}` : t.name,
      memberSteamIds: memberIds, // resolved to full member objects by the admin/UI-side steamId lookup, same as existing CS2 team docs
      source: "matchzy",
    }, { merge: true });
  }
  await batch1.commit();

  const batch2 = db.batch();
  for (const m of matchesRes.rows) {
    const mapResults = (mapResultsBySlug.get(m.slug) || []).sort((a, b) => a.map_number - b.map_number);
    const team1Score = mapResults.reduce((n, r) => n + (r.winner_team === "team1" ? 1 : 0), 0);
    const team2Score = mapResults.reduce((n, r) => n + (r.winner_team === "team2" ? 1 : 0), 0);
    const games = mapResults.map(r => ({
      mapName: r.map_name,
      team1RoundsWon: r.team1_score,
      team2RoundsWon: r.team2_score,
      winner: r.winner_team,
    }));
    const playerStats = (statsBySlug.get(m.slug) || []).map(s => ({
      steamId: s.player_id, team: s.team, won: s.won_match,
      kills: s.kills, deaths: s.deaths, assists: s.assists, headshots: s.headshots,
      adr: s.adr, kast: s.kast, mvps: s.mvps, score: s.score, roundsPlayed: s.rounds_played,
    }));

    const matchRef = tRef.collection("matches").doc(m.slug);
    batch2.set(matchRef, {
      matchDay: m.round,
      matchNumber: m.match_number,
      isBracket: !!m.bracket,
      bracketType: m.bracket ? (BRACKET_TYPE_MAP[m.bracket] || m.bracket.toLowerCase()) : null,
      team1Id: m.team1_id,
      team1Name: m.team1_id ? (teamNameById.get(m.team1_id) || "TBD") : "TBD",
      team2Id: m.team2_id,
      team2Name: m.team2_id ? (teamNameById.get(m.team2_id) || "TBD") : "TBD",
      team1Score, team2Score,
      winnerId: m.winner_id,
      status: MAT_STATUS_MAP[m.status] || "pending",
      scheduledTime: m.loaded_at ? new Date(m.loaded_at * 1000).toISOString() : null,
      completedAt: m.completed_at ? new Date(m.completed_at * 1000).toISOString() : null,
      games,
      playerStats,
      source: "matchzy",
    }, { merge: true });
  }
  await batch2.commit();

  return { teams: teamsRes.rows.length, matches: matchesRes.rows.length };
}

export async function closeMatchzyPool(): Promise<void> {
  if (pool) { await pool.end(); pool = null; }
}
