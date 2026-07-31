import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { cs2TokenValid, cs2ConfigToken } from "@/lib/cs2Auth";
import { resolveCS2Roster, resolveCS2SteamIds, safePlayerName } from "@/lib/resolveCS2Roster";
import { CS2_ACTIVE_DUTY_MAPS, CS2_MAP_SIDES } from "@/lib/cs2Maps";

/**
 * MatchZy match-config server. MatchZy GETs this when told to
 * `matchzy_loadmatch_url "<this-url>" "X-IESports-Token" "<token>"` (issued by
 * web/app/api/admin/cs2-server's load_match action). Returns the MatchZy
 * match-config JSON: rosters (Steam64 only), maplist, sides, cvars.
 *
 * Auth is a static shared-secret header (CS2_MATCH_CONFIG_TOKEN), the same
 * value the load_match action injects. Failing auth returns a bare 401 with
 * no other detail — this endpoint must not double as a match/tournament
 * existence oracle.
 *
 * Roster resolution is shared with the admin panel's "Validate Rosters"
 * action via lib/resolveCS2Roster.ts, so a roster that validates clean can
 * never fail differently here.
 *
 * See docs/CS2_LIVE_PIPELINE_PLAN.md Task 2 for the full contract.
 */

export const dynamic = "force-dynamic";

const DEFAULT_MAPS_BO1 = ["de_mirage"];
const DEFAULT_MAPS_BO3 = ["de_mirage", "de_inferno", "de_nuke"];

// Must be the www. form — iesports.in 307-redirects, and MatchZy is not
// guaranteed to follow redirects on the webhook POST.
const CS2_PUBLIC_BASE_URL = process.env.CS2_PUBLIC_BASE_URL || "https://www.iesports.in";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const token = cs2ConfigToken();
  if (!token || !cs2TokenValid(req.headers.get("x-iesports-token"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { matchId } = await params;
  const tournamentId = String(req.nextUrl.searchParams.get("t") || "").trim();
  if (!tournamentId || !matchId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const resolved = await resolveCS2Roster(adminDb, tournamentId, matchId);
  if (!resolved.ok) {
    const status = resolved.error === "tournament or match not found" ? 404 : 409;
    return NextResponse.json({ error: resolved.error, missing: resolved.missing }, { status });
  }
  const { team1, team2, team1Players, team2Players, tournament, match: m } = resolved;

  if (!m.matchzyMatchId) {
    return NextResponse.json({ error: "match has no matchzyMatchId — was load_match run through the admin panel?" }, { status: 500 });
  }

  // Best-of derivation — must match web/lib/settleCS2Match.ts exactly, or the
  // config we hand the server and the score we later expect to settle disagree.
  const numMaps = m.isBracket
    ? (m.bracketType === "grand_final" ? (tournament.grandFinalBestOf || 3) : (tournament.bracketBestOf || 3))
    : (tournament.matchesPerRound || 1);

  let maplist: string[] = Array.isArray(m.plannedMaps) && m.plannedMaps.length === numMaps
    ? m.plannedMaps
    : (numMaps === 1 ? DEFAULT_MAPS_BO1 : DEFAULT_MAPS_BO3);

  // Never hand MatchZy a map outside the pool, even if plannedMaps was
  // tampered with or mistyped in the admin panel.
  if (!maplist.every((mp) => CS2_ACTIVE_DUTY_MAPS.includes(mp))) {
    maplist = numMaps === 1 ? DEFAULT_MAPS_BO1 : DEFAULT_MAPS_BO3;
  }

  // Sides per map. Default is a knife round, which is what players expect —
  // but the knife decision itself can only be made in game (MatchZy's
  // .stay/.switch handlers bail out when there is no calling player, so the
  // admin panel cannot issue them over RCON). When an admin needs the
  // decision settled up front — a team a player short, or a slot running
  // late — they set `plannedMapSides` on the match and MatchZy skips the
  // knife. Length must match the maplist or MatchZy rejects the whole config.
  const mapSides = Array.isArray(m.plannedMapSides)
    && m.plannedMapSides.length === maplist.length
    && m.plannedMapSides.every((s: string) => CS2_MAP_SIDES.includes(s))
      ? m.plannedMapSides
      : maplist.map(() => "knife");

  // MR16 for the group stage, MR24 for bracket games, matching the published
  // fixture sheet. Per-match `maxRounds` wins if set, then the tournament's
  // own overrides, then these defaults.
  const maxRounds = Number(m.maxRounds)
    || Number(m.isBracket ? tournament.bracketMaxRounds : tournament.groupMaxRounds)
    || (m.isBracket ? 24 : 16);

  // Freeze time, same resolution order as maxRounds.
  //
  // WARNING: on MatchZy 0.8.5 (server 1) these cvars do NOT reliably survive
  // going live — that build execs live.cfg after applying the match config's
  // cvars, so live.cfg's mp_maxrounds/mp_freezetime win and a group game runs
  // to 13 instead of 9. Newer builds (server 2 is on 0.8.68) apply the config
  // cvars a second AFTER live.cfg and hold. Where the round limit matters,
  // confirm it in game and push it again from the admin panel's live cvars
  // control if the server ignored it.
  const freezeTime = Number(m.freezeTime) || Number(tournament.freezeTime) || 5;

  // Spectators. With matchzy_whitelist_enabled_default on, anyone not named in
  // this config is refused at connect — including an admin, a caster, or a
  // player watching the other group's game. This is the ONLY way for them to
  // get in (short of GOTV, which is a delayed stream, not the server).
  //
  // Sources are merged so a tournament-wide list (admins, casters) doesn't
  // have to be repeated on all 15 matches, while a single match can still add
  // someone for one game. Entries are uids or bare Steam64s; unresolvable ones
  // are dropped, never fatal — a missing spectator must not stop a match.
  const spectatorEntries = [
    ...(Array.isArray(tournament.spectatorUids) ? tournament.spectatorUids : []),
    ...(Array.isArray(m.spectatorUids) ? m.spectatorUids : []),
  ].map(String);
  const spectators = spectatorEntries.length
    ? (await resolveCS2SteamIds(adminDb, tournamentId, spectatorEntries)).players
    : {};

  // Diagnostic breadcrumb: proves whether MatchZy actually reached us. When a
  // load fails, the server only ever says "Match load failed!" with no reason,
  // so without this there is no way to tell a failed fetch from a rejected
  // payload. Cheap (a handful of writes per event) and fire-and-forget.
  adminDb.collection("cs2MatchConfigRequests").add({
    at: new Date().toISOString(),
    tournamentId, matchId,
    matchzyMatchId: m.matchzyMatchId,
    userAgent: req.headers.get("user-agent") || null,
    ip: req.headers.get("x-forwarded-for") || null,
  }).catch(() => {});

  const config: Record<string, unknown> = {
    // Number, per MatchZy's documented schema (`"matchid": 27`). It was
    // briefly sent as a string while chasing a load failure, which was wrong
    // and is what kept the payload rejected after the player-name fix.
    matchid: Number(m.matchzyMatchId),
    num_maps: numMaps,
    maplist,
    skip_veto: true,
    map_sides: mapSides,
    players_per_team: tournament.playersPerTeam || 5,
    clinch_series: true,
    team1: { name: safePlayerName(team1.teamName || m.team1Name) || "Team 1", players: team1Players },
    team2: { name: safePlayerName(team2.teamName || m.team2Name) || "Team 2", players: team2Players },
    // Omitted entirely when empty: MatchZy reads `spectators.players`, and an
    // empty object is one more field on a payload whose only rejection
    // message is "Match load failed!".
    ...(Object.keys(spectators).length ? { spectators: { players: spectators } } : {}),
    // Applied by MatchZy when it loads this config, and reverted on series
    // end (matchzy_reset_cvars_on_series_end defaults true). Scoping them
    // per-match is correct on a shared box — the friend's own pugs never
    // POST into our webhook.
    cvars: {
      matchzy_remote_log_url: `${CS2_PUBLIC_BASE_URL}/api/cs2/matchzy-events`,
      matchzy_remote_log_header_key: "X-IESports-Token",
      matchzy_remote_log_header_value: token,
      // Whitelist OFF by default. It restricts connections to the Steam64s on
      // this match's roster, which is only safe when those rosters are
      // complete — and on the night they were not: loading a semifinal kicked
      // everyone who had been added to a team by hand or had registered late,
      // including players who were mid-game. A locked-out roster stops an
      // event dead, while an open server just risks a stranger joining a
      // password-protected match.
      //
      // Set `enforceWhitelist: true` on the tournament once its rosters are
      // known-good to get the protection back. Note css_whitelist is a TOGGLE,
      // not a setter, so this cvar is the only reliable way to set the state.
      matchzy_whitelist_enabled_default: tournament.enforceWhitelist ? "true" : "false",
      // Round limit per the published fixture sheet: group games are MR16
      // (first to 9), play-offs MR24 (first to 13). CS2 defaults to 24, so
      // without this every group game would run to 13 and blow through its
      // 20-minute slot. Overridable per match via `maxRounds` on the match
      // doc for a one-off (a re-run, or a shortened game to claw back time).
      mp_maxrounds: String(maxRounds),
      // Buy time between rounds. CS2 defaults to 15s and MatchZy's live.cfg
      // usually sets 15-20; at MR16 across a back-to-back schedule that is
      // several minutes per match spent standing still. Overridable per
      // tournament or per match.
      mp_freezetime: String(freezeTime),
    },
  };

  /**
   * Bisection aid. MatchZy reports a rejected config as nothing but
   * "Match load failed!", with no field named and no parse error, so the only
   * way to find an incompatible key is to remove keys until it loads.
   * `?omit=cvars,map_sides` drops those top-level keys from the response.
   *
   * Token-gated like the rest of the route, and inert unless the parameter is
   * passed, so it costs nothing in normal operation. Worth keeping: the next
   * MatchZy upgrade can change the accepted schema and this is the only
   * practical way to re-find the offending key.
   */
  const omit = (req.nextUrl.searchParams.get("omit") || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  for (const key of omit) delete config[key];

  return NextResponse.json(config);
}
