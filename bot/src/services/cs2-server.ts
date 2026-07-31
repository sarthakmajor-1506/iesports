/**
 * Web-driven CS2 match server control.
 *
 * Same shape as bot-lobby.ts, for the same reason: web (Vercel) shouldn't
 * hold a socket to the game server, so control flows through Firestore.
 *   - web writes a command    → `cs2ServerCommands/{id}` {action, params, status:"pending"}
 *   - bot executes over RCON  → updates the command doc {status:"done"|"error"}
 *   - bot publishes live state → `cs2ServerControl/state` (admin panel polls this)
 *
 * The bot is the RCON caller (not Vercel) because it's a long-lived process
 * that can hold retry/backoff state, and because serverless functions would
 * pay connect+auth on every call.
 *
 * IMPORTANT: RCON output is advisory. Match state (live scores, map results,
 * series winner) arrives via the MatchZy webhook into Firestore — never parse
 * it out of `status`. See docs/CS2_TOURNAMENT_CONTEXT.md.
 *
 * Inert until CS2_RCON_HOST + CS2_RCON_PASSWORD are set.
 */
import type { Firestore } from "firebase-admin/firestore";
import { rconExec, rconArg, rconTargetFromEnv, parseStatus } from "./cs2-rcon";

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

const cfg = {
  status: "unknown" as ServerStatus,
  hostname: null as string | null,
  map: null as string | null,
  humans: null as number | null,
  maxPlayers: null as number | null,
  loadedMatchId: null as string | null,
};

// Diff-suppression, copied deliberately from bot-lobby.ts. The heartbeat
// there was the platform's #1 Firestore write source before it was hashed;
// this poller is slower (20s vs 1.5s) but idles for weeks between events, so
// the same guard applies. Only write when the payload actually changes, with
// a liveness floor so the panel can still tell the bot is alive.
let lastPayloadHash = "";
let lastWriteAt = 0;
const LIVENESS_FLOOR_MS = 5 * 60 * 1000;

// RCON polling is a network round-trip to a box in another datacenter, so it
// runs far slower than the Dota GC heartbeat. Server state changes on the
// order of minutes (map changes, players connecting), not milliseconds.
const POLL_MS = Number(process.env.CS2_STATUS_POLL_MS || 20_000);

let processing = false;

async function publishState(db: Firestore, patch: StatePatch = {}): Promise<void> {
  Object.assign(cfg, patch);
  const payload = {
    status: cfg.status,
    hostname: cfg.hostname,
    map: cfg.map,
    humans: cfg.humans,
    maxPlayers: cfg.maxPlayers,
    loadedMatchId: cfg.loadedMatchId,
    lastCommand: patch.lastCommand ?? null,
    lastError: patch.lastError ?? null,
    host: process.env.CS2_RCON_HOST || null,
    port: Number(process.env.CS2_RCON_PORT || 27015),
  };

  const hash = JSON.stringify(payload);
  const now = Date.now();
  if (hash === lastPayloadHash && now - lastWriteAt < LIVENESS_FLOOR_MS) return;
  lastPayloadHash = hash;
  lastWriteAt = now;

  await db.collection("cs2ServerControl").doc("state").set(
    { ...payload, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

async function pollStatus(db: Firestore): Promise<void> {
  const r = await rconExec(["status"]);
  if (!r.ok) {
    await publishState(db, { status: "offline", lastError: r.error || "status failed" });
    return;
  }
  const s = parseStatus(r.output);
  await publishState(db, {
    status: "online",
    hostname: s.hostname,
    map: s.map,
    humans: s.humans,
    maxPlayers: s.maxPlayers,
    lastError: null,
  });
}

// ── Command dispatch ─────────────────────────────────────────────────────

/**
 * Every action maps to console commands verified against MatchZy's source
 * (ConsoleCommands.cs) or Valve's own cvars. Nothing here is guessed — if
 * you add an action, confirm the command exists before shipping it.
 */
async function runCommand(
  db: Firestore,
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

      const r = await rconExec([`matchzy_loadmatch_url ${rconArg(url)} ${rconArg(key)} ${rconArg(value)}`]);
      if (!r.ok) return { ok: false, error: r.error };
      // Recorded so the panel can show which match the server is holding.
      // Confirmation that it actually loaded comes from the series_start
      // webhook, not from this echo.
      await publishState(db, { loadedMatchId: params.matchId ? String(params.matchId) : null });
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
      await pollStatus(db);
      const r = await rconExec(["status"]);
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
    const r = await rconExec(cmds);
    return r.ok ? { ok: true, result: r.output } : { ok: false, error: r.error };
  }
}

// ── Entry point ──────────────────────────────────────────────────────────

export function startCS2ServerControl(db: Firestore): void {
  if (!rconTargetFromEnv()) {
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

  setInterval(() => { pollStatus(db).catch(() => {}); }, POLL_MS);
  pollStatus(db).catch(() => {});

  db.collection("cs2ServerCommands").where("status", "==", "pending")
    .onSnapshot(async (snap) => {
      if (processing) return;
      const docs = snap.docs.sort((a, b) =>
        String(a.data().createdAt || "").localeCompare(String(b.data().createdAt || ""))
      );
      if (!docs.length) return;
      processing = true;
      try {
        for (const d of docs) {
          const c = d.data() as any;
          await d.ref.set({ status: "processing", updatedAt: new Date().toISOString() }, { merge: true });
          console.log(`[CS2] ▶ ${d.id} action=${c.action}`);
          const r = await runCommand(db, c.action, c.params || {});
          await d.ref.set({
            status: r.ok ? "done" : "error",
            result: r.result ?? null,
            error: r.error ?? null,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          await publishState(db, {
            lastCommand: c.action,
            lastError: r.ok ? null : (r.error || "error"),
          });
          console.log(`[CS2] ${r.ok ? "✅" : "✗"} ${d.id} ${r.error || ""}`);
        }
      } catch (e: any) {
        console.error("[CS2] consumer error:", e?.message || e);
      } finally {
        processing = false;
      }
    }, (err) => console.error("[CS2] snapshot error:", err?.message || err));

  if (!process.env.CS2_RCON_PORT) {
    console.warn("[CS2] CS2_RCON_PORT unset — defaulting to 27015. Set it explicitly if the server uses another port.");
  }
  console.log(`[CS2] RCON control running → ${process.env.CS2_RCON_HOST}:${process.env.CS2_RCON_PORT || 27015}`);
}
