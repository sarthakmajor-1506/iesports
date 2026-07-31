import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { cs2TokenValid, cs2ConfigToken } from "@/lib/cs2Auth";
import { resolveCS2Roster, safePlayerName } from "@/lib/resolveCS2Roster";
import { CS2_ACTIVE_DUTY_MAPS } from "@/lib/cs2Maps";

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

  const mapSides = maplist.map(() => "knife");

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

  return NextResponse.json({
    // String, not number. MatchZy/Get5 configs use a string matchid, and a
    // bare JSON number is a plausible cause of a silent parse rejection.
    matchid: String(m.matchzyMatchId),
    num_maps: numMaps,
    maplist,
    skip_veto: true,
    map_sides: mapSides,
    players_per_team: tournament.playersPerTeam || 5,
    clinch_series: true,
    team1: { name: safePlayerName(team1.teamName || m.team1Name) || "Team 1", players: team1Players },
    team2: { name: safePlayerName(team2.teamName || m.team2Name) || "Team 2", players: team2Players },
    // Applied by MatchZy when it loads this config, and reverted on series
    // end (matchzy_reset_cvars_on_series_end defaults true). This is the
    // reliable way to point the server at our webhook: these are
    // CounterStrikeSharp FakeConVars, and setting them ad-hoc over RCON
    // neither takes effect reliably nor reads back, so RCON cannot confirm
    // it worked. Scoping them per-match is also correct on a shared box —
    // the friend's own pugs never POST into our webhook.
    cvars: {
      matchzy_remote_log_url: `${CS2_PUBLIC_BASE_URL}/api/cs2/matchzy-events`,
      matchzy_remote_log_header_key: "X-IESports-Token",
      matchzy_remote_log_header_value: token,
      matchzy_whitelist_enabled_default: "true",
    },
  });
}
