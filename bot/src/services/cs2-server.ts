/**
 * Web-driven CS2 match server control.
 *
 * Same shape as bot-lobby.ts, for the same reason: web (Vercel) shouldn't
 * hold a socket to the game server, so control flows through Firestore.
 *   - web writes a command    → `cs2ServerCommands/{id}` {action, params, status:"pending"}
 *   - bot executes over RCON  → updates the command doc {status:"done"|"error"}
 *   - bot publishes live state → `cs2ServerControl/state{N}` (admin panel polls this)
 *
 * The bot is the RCON caller (not Vercel) because it's a long-lived process
 * that can hold retry/backoff state, and because serverless functions would
 * pay connect+auth on every call.
 *
 * MULTI-SERVER: the fixture sheet runs two matches per 20-minute slot, tagged
 * area 1 / area 2, and one game server can only hold one match. Each command
 * therefore carries `params.serverId` ("1" | "2"), defaulting to "1" so
 * anything written before this existed still lands on the original server.
 * State is published per server: server 1 stays at `cs2ServerControl/state`
 * (the doc the panel has always polled), server 2 at `.../state2`.
 *
 * The two servers run independently — a stuck RCON call on one must not hold
 * up the other's queue, or a slow load on area 1 delays the area 2 match that
 * is meant to start at the same minute. Hence per-server in-flight tracking
 * rather than one global lock.
 *
 * IMPORTANT: RCON output is advisory. Match state (live scores, map results,
 * series winner) arrives via the MatchZy webhook into Firestore — never parse
 * it out of `status`. See docs/CS2_TOURNAMENT_CONTEXT.md.
 *
 * Inert until CS2_RCON_HOST + CS2_RCON_PASSWORD are set.
 */
import type { Firestore } from "firebase-admin/firestore";
import { rconExec, rconArg, cs2ServersFromEnv, parseStatus, type CS2ServerDef } from "./cs2-rcon";

type ServerStatus = "unknown" | "online" | "offline" | "error";

interface StatePatch {
  status?: ServerStatus;
  hostname?: string | null;
  map?: string | null;
  humans?: number | null;
  maxPlayers?: number | null;
  loadedMatchId?: string | null;
  lastCommand?: string | null;
  lastError?: string | null;
}

interface ServerRuntime {
  def: CS2ServerDef;
  cfg: {
    status: ServerStatus;
    hostname: string | null;
    map: string | null;
    humans: number | null;
    maxPlayers: number | null;
    loadedMatchId: string | null;
  };
  // Diff-suppression, copied deliberately from bot-lobby.ts. The heartbeat
  // there was the platform's #1 Firestore write source before it was hashed;
  // this poller is slower (20s vs 1.5s) but idles for weeks between events, so
  // the same guard applies. Only write when the payload actually changes, with
  // a liveness floor so the panel can still tell the bot is alive.
  lastPayloadHash: string;
  lastWriteAt: number;
  /** In-flight guard, per server — see the header. */
  processing: boolean;
}

const LIVENESS_FLOOR_MS = 5 * 60 * 1000;

// RCON polling is a network round-trip to a box in another datacenter, so it
// runs far slower than the Dota GC heartbeat. Server state changes on the
// order of minutes (map changes, players connecting), not milliseconds.
const POLL_MS = Number(process.env.CS2_STATUS_POLL_MS || 20_000);

const servers = new Map<string, ServerRuntime>();

/**
 * Server 1 publishes to `cs2ServerControl/state`, not `state1`. That doc id
 * predates the second server and is what an older admin panel build polls —
 * renaming it would blank the status bar mid-event for anyone on a cached
 * bundle.
 */
function stateDocId(serverId: string): string {
  return serverId === "1" ? "state" : `state${serverId}`;
}

function runtime(serverId: string): ServerRuntime | null {
  return servers.get(serverId) || null;
}

async function publishState(db: Firestore, s: ServerRuntime, patch: StatePatch = {}): Promise<void> {
  Object.assign(s.cfg, patch);
  const payload = {
    serverId: s.def.id,
    label: s.def.label,
    status: s.cfg.status,
    hostname: s.cfg.hostname,
    map: s.cfg.map,
    humans: s.cfg.humans,
    maxPlayers: s.cfg.maxPlayers,
    loadedMatchId: s.cfg.loadedMatchId,
    lastCommand: patch.lastCommand ?? null,
    lastError: patch.lastError ?? null,
    host: s.def.host,
    port: s.def.port,
  };

  const hash = JSON.stringify(payload);
  const now = Date.now();
  if (hash === s.lastPayloadHash && now - s.lastWriteAt < LIVENESS_FLOOR_MS) return;
  s.lastPayloadHash = hash;
  s.lastWriteAt = now;

  await db.collection("cs2ServerControl").doc(stateDocId(s.def.id)).set(
    { ...payload, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

async function pollStatus(db: Firestore, s: ServerRuntime): Promise<void> {
  const r = await rconExec(["status"], s.def);
  if (!r.ok) {
    await publishState(db, s, { status: "offline", lastError: r.error || "status failed" });
    return;
  }
  const st = parseStatus(r.output);
  await publishState(db, s, {
    status: "online",
    hostname: st.hostname,
    map: st.map,
    humans: st.humans,
    maxPlayers: st.maxPlayers,
    lastError: null,
  });
}

// ── Command dispatch ─────────────────────────────────────────────────────

/**
 * Every action maps to console commands verified against MatchZy's source
 * (ConsoleCommands.cs) or Valve's own cvars. Nothing here is guessed — if
 * you add an action, confirm the command exists before shipping it.
 *
 * Deliberately absent: `.stay` / `.switch`. MatchZy's OnTeamStay/OnTeamSwitch
 * both open with `if (player == null || !isSideSelectionPhase) return;`, and
 * an RCON command has no calling player, so issuing css_stay from here is a
 * silent no-op. Sides are chosen instead before the match loads, via the
 * match config's `map_sides` (team1_ct / team1_t skip the knife entirely) —
 * see web/app/api/cs2/match-config.
 */
async function runCommand(
  db: Firestore,
  s: ServerRuntime,
  action: string,
  params: any
): Promise<{ ok: boolean; result?: any; error?: string }> {
  switch (action) {
    // Point MatchZy at our match-config endpoint. The header args are how
    // MatchZy authenticates to us (matchzy_loadmatch_url <url> <key> <value>).
    case "load_match": {
      const url = String(params.url || "");
      if (!/^https:\/\//.test(url)) return { ok: false, error: "params.url must be an https URL" };
      const key = String(params.headerKey || "x-iesports-token");
      const value = String(params.headerValue || process.env.CS2_MATCH_CONFIG_TOKEN || "");
      if (!value) return { ok: false, error: "no config token (params.headerValue or CS2_MATCH_CONFIG_TOKEN)" };

      const r = await rconExec([`matchzy_loadmatch_url ${rconArg(url)} ${rconArg(key)} ${rconArg(value)}`], s.def);
      if (!r.ok) return { ok: false, error: r.error };

      // MatchZy refuses a load while it still holds a match and says so only
      // in the RCON reply:
      //   "[LoadMatchDataCommand] A match is already setup with id: -1,
      //    cannot load a new match!"
      // RCON succeeded, so without this the panel showed a green "done" while
      // the server quietly ignored every load. It cost an evening: the config
      // endpoint kept getting fetched (MatchZy downloads it before refusing),
      // which looked exactly like a working pipeline that had stopped
      // reporting. `End Match` clears the stuck state.
      if (/cannot load a new match|already setup with id/i.test(r.output || "")) {
        return {
          ok: false,
          error: `server still holds a match — run End Match first. MatchZy said: ${(r.output || "").trim().slice(0, 160)}`,
        };
      }
      // Recorded so the panel can show which match the server is holding.
      // Confirmation that it actually loaded comes from the series_start
      // webhook, not from this echo.
      await publishState(db, s, { loadedMatchId: params.matchId ? String(params.matchId) : null });
      return { ok: true, result: r.output };
    }

    case "start":         return exec(["css_start"]);
    case "force_start":   return exec(["css_forcestart"]);
    case "end_match":     return exec(["css_endmatch"]);
    case "force_end":     return exec(["css_forceend"]);
    case "restart_match": return exec(["css_restart"]);
    case "pause":         return exec(["css_forcepause"]);
    case "unpause":       return exec(["css_forceunpause"]);
    case "reload_admins": return exec(["reload_admins"]);

    case "change_map": {
      const map = String(params.map || "");
      if (!/^[a-z0-9_]+$/i.test(map)) return { ok: false, error: "params.map must be a bare map name" };
      return exec([`css_map ${rconArg(map)}`]);
    }

    // Per-match join password. Rotate this every match so a stale password
    // from a previous round can't be used to walk into a live game.
    case "set_password": {
      const pw = String(params.password ?? "");
      return exec([`sv_password ${rconArg(pw)}`]);
    }

    case "status": {
      await pollStatus(db, s);
      const r = await rconExec(["status"], s.def);
      return r.ok ? { ok: true, result: r.output } : { ok: false, error: r.error };
    }

    // Escape hatch. Deliberately unrestricted at this layer because the web
    // route in front of it is ADMIN_SECRET-gated and allowlists what it will
    // enqueue — see web/app/api/admin/cs2-server/route.ts.
    case "exec": {
      const raw = String(params.command || "");
      if (!raw.trim()) return { ok: false, error: "params.command required" };
      return exec([raw]);
    }

    default:
      return { ok: false, error: `unknown action "${action}"` };
  }

  async function exec(cmds: string[]) {
    const r = await rconExec(cmds, s.def);
    return r.ok ? { ok: true, result: r.output } : { ok: false, error: r.error };
  }
}

// ── Queue drain ──────────────────────────────────────────────────────────

/**
 * Run every pending command for one server, oldest first, then re-read until
 * the queue is empty. Re-reading matters: while a command is in flight the
 * snapshot listener keeps firing and finds this server busy, and without the
 * final re-read a command enqueued during a slow `load_match` would sit
 * pending until something else happened to wake the listener.
 *
 * Servers drain concurrently but each server drains serially — two loads
 * racing on one box would leave it holding whichever config landed last.
 */
async function drainServer(db: Firestore, serverId: string): Promise<void> {
  const s = runtime(serverId);
  if (!s || s.processing) return;
  s.processing = true;
  try {
    for (;;) {
      const snap = await db.collection("cs2ServerCommands").where("status", "==", "pending").get();
      const queue = snap.docs
        .filter(d => String((d.data() as any).params?.serverId || "1") === serverId)
        .sort((a, b) => String(a.data().createdAt || "").localeCompare(String(b.data().createdAt || "")));
      if (!queue.length) return;

      for (const d of queue) {
        const c = d.data() as any;
        await d.ref.set({ status: "processing", updatedAt: new Date().toISOString() }, { merge: true });
        console.log(`[CS2:${serverId}] ▶ ${d.id} action=${c.action}`);
        const r = await runCommand(db, s, c.action, c.params || {});
        await d.ref.set({
          status: r.ok ? "done" : "error",
          result: r.result ?? null,
          error: r.error ?? null,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        await publishState(db, s, {
          lastCommand: c.action,
          lastError: r.ok ? null : (r.error || "error"),
        });
        console.log(`[CS2:${serverId}] ${r.ok ? "✅" : "✗"} ${d.id} ${r.error || ""}`);
      }
    }
  } catch (e: any) {
    console.error(`[CS2:${serverId}] consumer error:`, e?.message || e);
  } finally {
    s.processing = false;
  }
}

// ── Entry point ──────────────────────────────────────────────────────────

export function startCS2ServerControl(db: Firestore): void {
  const defs = cs2ServersFromEnv();
  if (!defs.length) {
    // Name the specific missing variable. "not configured" alone can't
    // distinguish a missing host from a missing password, and these are set
    // on the Railway bot service separately from Vercel's env, so a
    // half-configured deploy is the common failure.
    const missing = [
      !process.env.CS2_RCON_HOST && "CS2_RCON_HOST",
      !process.env.CS2_RCON_PASSWORD && "CS2_RCON_PASSWORD",
    ].filter(Boolean).join(", ");
    console.log(`[CS2] RCON not configured — server control disabled (missing: ${missing})`);
    return;
  }

  for (const def of defs) {
    servers.set(def.id, {
      def,
      cfg: { status: "unknown", hostname: null, map: null, humans: null, maxPlayers: null, loadedMatchId: null },
      lastPayloadHash: "", lastWriteAt: 0, processing: false,
    });
  }

  for (const s of servers.values()) {
    setInterval(() => { pollStatus(db, s).catch(() => {}); }, POLL_MS);
    pollStatus(db, s).catch(() => {});
  }

  db.collection("cs2ServerCommands").where("status", "==", "pending")
    .onSnapshot(async (snap) => {
      const ids = new Set<string>();
      for (const d of snap.docs) ids.add(String((d.data() as any).params?.serverId || "1"));

      await Promise.all([...ids].map(async (serverId) => {
        if (runtime(serverId)) return drainServer(db, serverId);
        // A command aimed at a server this bot has no credentials for would
        // otherwise sit "pending" forever and read as "the bot is down".
        for (const d of snap.docs) {
          if (String((d.data() as any).params?.serverId || "1") !== serverId) continue;
          await d.ref.set({
            status: "error",
            error: `server "${serverId}" is not configured on the bot (set CS2_RCON_HOST_${serverId} / CS2_RCON_PASSWORD_${serverId})`,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }
      }));
    }, (err) => console.error("[CS2] snapshot error:", err?.message || err));

  if (!process.env.CS2_RCON_PORT) {
    console.warn("[CS2] CS2_RCON_PORT unset — defaulting to 27015. Set it explicitly if the server uses another port.");
  }
  for (const s of servers.values()) {
    console.log(`[CS2] RCON control running → server ${s.def.id} ${s.def.host}:${s.def.port}`);
  }
  if (servers.size === 1) {
    console.log("[CS2] only one server configured — set CS2_RCON_HOST_2 / CS2_RCON_PORT_2 / CS2_RCON_PASSWORD_2 to run the two fixture areas in parallel");
  }
}
