import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdmin } from "@/lib/verifyAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { resolveCS2Roster } from "@/lib/resolveCS2Roster";
import { CS2_ACTIVE_DUTY_MAPS, CS2_MAP_SIDES } from "@/lib/cs2Maps";
import { cs2ConfigToken } from "@/lib/cs2Auth";

/**
 * CS2 game-server control — one route, action-dispatched. Same shape as
 * admin/bot-lobby, for the same reason: web (Vercel) can't hold an RCON
 * socket to a box in another datacenter, so this is a thin Firestore bridge:
 *   - action:"state"  → read `cs2ServerControl/state{N}` (bot publishes live here)
 *   - any command     → enqueue `cs2ServerCommands/{id}` {status:"pending"}
 *                        which the bot consumes via onSnapshot and runs over RCON.
 *
 * NOTE: `cs2ServerControl` / `cs2ServerCommands` are NOT in firestore.rules
 * (default-deny), so the admin panel must poll this route's `state` action —
 * it cannot use a client-side onSnapshot like BotLobbyTab does.
 *
 * TWO SERVERS: the fixture sheet runs two matches per 20-minute slot (area 1
 * and area 2) and one game server holds one match, so every command carries
 * `params.serverId` ("1" | "2"). It defaults to "1", which is both the
 * original single-server behaviour and the right answer for any panel build
 * that predates the second box. Server 1's state stays at
 * `cs2ServerControl/state`; server 2 is at `state2`.
 *
 * Command actions: load_match | start | force_start | end_match | force_end |
 *                   restart_match | pause | unpause | reload_admins |
 *                   change_map | set_password | status | exec
 * Plus `prepare_server` — a bundled one-shot setup action handled entirely
 * server-side (see below) so CS2_MATCH_CONFIG_TOKEN never reaches the browser.
 *
 * RCON output is advisory. Match state (live scores, results) arrives via
 * the MatchZy webhook (api/cs2/matchzy-events) into Firestore, never from
 * parsing RCON `status`. See docs/CS2_LIVE_PIPELINE_PLAN.md.
 */

const COMMAND_ACTIONS = new Set([
  "load_match", "start", "force_start", "end_match", "force_end",
  "restart_match", "pause", "unpause", "reload_admins",
  "change_map", "set_password", "status", "exec",
]);

// Server ids are the fixture sheet's areas — a match tagged area 2 belongs on
// server 2. Ids, not hostnames: the credentials live only on the bot (Railway
// env), so web never needs to know where a server actually is.
const SERVER_IDS = ["1", "2"] as const;
const STATE_DOC_IDS: Record<string, string> = { "1": "state", "2": "state2" };

/** Unknown/missing ids fall back to "1", the pre-second-server behaviour. */
function normalizeServerId(raw: unknown): string {
  const id = String(raw ?? "1").trim();
  return (SERVER_IDS as readonly string[]).includes(id) ? id : "1";
}

// `iesports.in` 307-redirects to `www.iesports.in` — MatchZy's HTTP client is
// not guaranteed to follow redirects, and a redirected POST is silent data
// loss. Every URL handed to MatchZy must use this base, never
// NEXT_PUBLIC_APP_URL (which is the non-www form used elsewhere in the repo).
const CS2_PUBLIC_BASE_URL = process.env.CS2_PUBLIC_BASE_URL || "https://www.iesports.in";

// Allowlist for the `exec` escape hatch. The bot's rconExec/exec action is
// deliberately unrestricted (see bot/src/services/cs2-server.ts:165-166) —
// this route is the only thing standing between an admin session and
// arbitrary RCON commands, so only permit known-safe cvar reads/writes.
const EXEC_PREFIXES = [
  "matchzy_remote_log_url", "matchzy_remote_log_header_key", "matchzy_remote_log_header_value",
  "matchzy_whitelist_enabled_default", "matchzy_kick_when_no_match_loaded",
  "matchzy_autostart_mode", "matchzy_hostname_format", "sv_password", "tv_delay",
  "css_plugins", "meta", "find", "status",
  // Match-rule cvars, needed live rather than only in the match config:
  // MatchZy 0.8.5 execs live.cfg AFTER applying the config's cvars, so on that
  // build our mp_maxrounds is overwritten at the moment the match goes live
  // and a group game silently runs to 13 instead of 9. Pushing them again once
  // the match is live is the only fix that doesn't need file access to the box.
  "mp_maxrounds", "mp_freezetime", "mp_overtime_enable", "mp_overtime_maxrounds",
  "mp_halftime_duration", "mp_round_restart_delay", "mp_warmuptime",
  "mp_friendlyfire",
];

function execCommandAllowed(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/[\r\n;"]/.test(trimmed)) return false; // no command chaining / smuggling
  const head = trimmed.split(/\s+/)[0].toLowerCase();
  return EXEC_PREFIXES.some((p) => head === p.toLowerCase());
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try { await verifyAdmin({ adminKey: body.adminKey, authToken: body.authToken }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const action = String(body.action || "");

  // ── Live state read (panel polls this — no onSnapshot, see header) ──────
  if (action === "state") {
    const [snaps, recent] = await Promise.all([
      Promise.all(SERVER_IDS.map((id) => adminDb.collection("cs2ServerControl").doc(STATE_DOC_IDS[id]).get())),
      // Two servers means two streams of commands into one log, so the window
      // is wider than the old 8 — with both areas loading at the same minute,
      // 8 entries could hide everything server 2 did.
      adminDb.collection("cs2ServerCommands").orderBy("createdAt", "desc").limit(20).get(),
    ]);

    const blank = {
      status: "unknown", hostname: null, map: null, humans: null, maxPlayers: null,
      loadedMatchId: null, lastCommand: null, lastError: null, host: null, port: 0,
    };
    const servers = SERVER_IDS.map((id, i) => ({
      serverId: id,
      label: `Server ${id}`,
      // A server that has never been configured on the bot has no state doc at
      // all. Reported as "unknown" rather than omitted, so the panel can show
      // the slot and say it isn't wired up yet.
      configured: snaps[i].exists,
      ...blank,
      ...(snaps[i].exists ? snaps[i].data() : {}),
    }));

    return NextResponse.json({
      ok: true,
      servers,
      // Kept for older panel bundles that read `state` directly.
      state: servers[0],
      recentCommands: recent.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  }

  // ── One-shot event setup — never sent from the browser, so the shared
  // token stays server-side. Enqueues the same cvars as EXEC_PREFIXES would
  // allow individually; bundled here so the panel doesn't need the secret.
  if (action === "prepare_server") {
    const token = cs2ConfigToken();
    if (!token) {
      return NextResponse.json({ error: "CS2_MATCH_CONFIG_TOKEN not configured on web" }, { status: 500 });
    }
    // Each server needs its own copy of these cvars — they are per-box plugin
    // settings, not anything Firestore holds.
    const serverId = normalizeServerId(body.serverId ?? body.params?.serverId);
    const webhookUrl = `${CS2_PUBLIC_BASE_URL}/api/cs2/matchzy-events`;
    const commands = [
      `matchzy_remote_log_url "${webhookUrl}"`,
      `matchzy_remote_log_header_key "X-IESports-Token"`,
      `matchzy_remote_log_header_value "${token}"`,
      `matchzy_whitelist_enabled_default true`,
      `matchzy_autostart_mode 1`,
    ];
    const commandIds: string[] = [];
    for (const command of commands) {
      const ref = await adminDb.collection("cs2ServerCommands").add({
        action: "exec",
        params: { command, serverId },
        serverId,
        status: "pending",
        createdAt: new Date().toISOString(),
        createdBy: body.by || "admin-panel",
        serverCreatedAt: FieldValue.serverTimestamp(),
      });
      commandIds.push(ref.id);
    }
    return NextResponse.json({ ok: true, commandIds, action, serverId });
  }

  // ── Roster validation — same resolution the match-config endpoint uses,
  // so a roster that validates clean here cannot fail differently when
  // MatchZy actually loads the match. Pure read, nothing enqueued.
  if (action === "validate_roster") {
    const tournamentId = String(body.params?.tournamentId || "").trim();
    const matchId = String(body.params?.matchId || "").trim();
    if (!tournamentId || !matchId) {
      return NextResponse.json({ error: "params.tournamentId and params.matchId required" }, { status: 400 });
    }
    const resolved = await resolveCS2Roster(adminDb, tournamentId, matchId);
    if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error, missing: resolved.missing });
    return NextResponse.json({ ok: true });
  }

  // ── Save the admin's map picks onto the match doc before load_match reads
  // them. Separate from load_match itself so "validate" can run first
  // without side effects.
  //
  // `plannedMapSides` rides along here because sides are decided at the same
  // moment as maps and by the same person. It is the only way an admin can
  // settle sides at all: MatchZy's .stay/.switch handlers open with
  // `if (player == null || !isSideSelectionPhase) return;`, so an RCON-issued
  // css_stay is a silent no-op — the knife winner must type it in game. Set a
  // side here and MatchZy skips the knife round entirely.
  if (action === "save_planned_maps") {
    const tournamentId = String(body.params?.tournamentId || "").trim();
    const matchId = String(body.params?.matchId || "").trim();
    const plannedMaps = Array.isArray(body.params?.plannedMaps) ? body.params.plannedMaps.map(String) : [];
    if (!tournamentId || !matchId || !plannedMaps.length) {
      return NextResponse.json({ error: "params.tournamentId, params.matchId and a non-empty params.plannedMaps required" }, { status: 400 });
    }
    if (!plannedMaps.every((mp: string) => CS2_ACTIVE_DUTY_MAPS.includes(mp))) {
      return NextResponse.json({ error: "plannedMaps must be from the Active Duty pool" }, { status: 400 });
    }

    const patch: any = { plannedMaps };

    // Round limit for this match. Stored on the match doc because that is
    // where match-config looks first (ahead of the tournament's
    // groupMaxRounds / bracketMaxRounds), so a game shortened on the night to
    // claw back time survives a reload without touching tournament config.
    // Bounded rather than free-form: this ends up in a console command, and a
    // typo'd 160 is a match nobody can finish.
    if (body.params?.maxRounds !== undefined) {
      const mr = Number(body.params.maxRounds);
      if (!Number.isInteger(mr) || mr < 2 || mr > 60) {
        return NextResponse.json({ error: "maxRounds must be a whole number between 2 and 60" }, { status: 400 });
      }
      patch.maxRounds = mr;
    }

    if (body.params?.plannedMapSides !== undefined) {
      const sides = Array.isArray(body.params.plannedMapSides) ? body.params.plannedMapSides.map(String) : [];
      if (sides.length !== plannedMaps.length || !sides.every((s: string) => CS2_MAP_SIDES.includes(s))) {
        return NextResponse.json({ error: `plannedMapSides must be one of ${CS2_MAP_SIDES.join(" | ")} per planned map` }, { status: 400 });
      }
      patch.plannedMapSides = sides;
    }

    await adminDb.collection("cs2Tournaments").doc(tournamentId)
      .collection("matches").doc(matchId)
      .set(patch, { merge: true });
    return NextResponse.json({ ok: true });
  }

  // ── Enqueue a command for the bot ───────────────────────────────────────
  if (!COMMAND_ACTIONS.has(action)) {
    return NextResponse.json({ error: `unknown action "${action}"` }, { status: 400 });
  }

  const params: any = { ...(body.params || {}) };
  // Which box this command lands on. Written into params (where the bot reads
  // it) and onto the command doc itself (so the panel's log can show it).
  const serverId = normalizeServerId(body.serverId ?? params.serverId);
  params.serverId = serverId;

  if (action === "change_map") {
    const map = String(params.map || "");
    if (!/^[a-z0-9_]+$/i.test(map)) {
      return NextResponse.json({ error: "params.map must be a bare map name" }, { status: 400 });
    }
  }

  if (action === "set_password") {
    params.password = String(params.password ?? "").slice(0, 30);
  }

  if (action === "exec") {
    const raw = String(params.command || "");
    if (!execCommandAllowed(raw)) {
      return NextResponse.json({ error: "command not allowlisted for exec" }, { status: 400 });
    }
  }

  // load_match is not a passthrough: resolve the tournament/match, allocate
  // a numeric MatchZy match id, and build the config URL for MatchZy to GET.
  if (action === "load_match") {
    const tournamentId = String(params.tournamentId || "").trim();
    const matchId = String(params.matchId || "").trim();
    if (!tournamentId || !matchId) {
      return NextResponse.json({ error: "params.tournamentId and params.matchId required" }, { status: 400 });
    }

    const matchRef = adminDb.collection("cs2Tournaments").doc(tournamentId)
      .collection("matches").doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) {
      return NextResponse.json({ error: "match not found" }, { status: 404 });
    }

    const token = cs2ConfigToken();
    if (!token) {
      return NextResponse.json({ error: "CS2_MATCH_CONFIG_TOKEN not configured on web" }, { status: 500 });
    }

    // MatchZy 0.8.5 treats matchid as numeric in places — never reuse our
    // string doc ids (e.g. "cs2-sf1") here.
    // MatchZy parses matchid as a 32-bit int. A Date.now() millisecond
    // timestamp is 13 digits (~1.79e12), which overflows it, and MatchZy then
    // rejects the ENTIRE match config with nothing but "Match load failed!" —
    // no field named, no parse error, and the HTTP fetch still succeeds, so
    // the failure looks like it could be anything. Seconds fit comfortably
    // (~1.79e9 < 2^31-1) until 2038.
    // Still never reuse our string doc ids (e.g. "cs2-sf1") here.
    let matchzyMatchId = Math.floor(Date.now() / 1000);
    // Two loads within the same second would collide on the reverse index and
    // silently route one match's webhook events into the other's document.
    for (let i = 0; i < 10; i++) {
      const clash = await adminDb.collection("cs2MatchzyIndex").doc(String(matchzyMatchId)).get();
      if (!clash.exists) break;
      matchzyMatchId += 1;
    }

    await matchRef.set({ matchzyMatchId }, { merge: true });
    await adminDb.collection("cs2MatchzyIndex").doc(String(matchzyMatchId)).set({
      tournamentId, matchId, createdAt: new Date().toISOString(),
    });

    const configUrl = `${CS2_PUBLIC_BASE_URL}/api/cs2/match-config/${matchId}?t=${encodeURIComponent(tournamentId)}`;
    params.url = configUrl;
    params.headerKey = "X-IESports-Token";
    params.headerValue = token; // bot also falls back to CS2_MATCH_CONFIG_TOKEN if omitted
    params.matchId = matchId;
  }

  const ref = await adminDb.collection("cs2ServerCommands").add({
    action,
    params,
    serverId,
    status: "pending",
    createdAt: new Date().toISOString(),
    createdBy: body.by || "admin-panel",
    serverCreatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, commandId: ref.id, action, serverId });
}
