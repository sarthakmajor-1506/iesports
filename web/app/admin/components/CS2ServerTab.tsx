"use client";

/**
 * CS2 game-server control tab — full control surface for the RCON/MatchZy
 * pipeline. Everything goes through `/api/admin/cs2-server`:
 *   - polls action:"state" → reads `cs2ServerControl/state` (bot publishes live)
 *   - command actions      → enqueues `cs2ServerCommands` (bot runs over RCON)
 *
 * Unlike BotLobbyTab, this does NOT use a client-side onSnapshot — neither
 * `cs2ServerControl` nor `cs2ServerCommands` has a firestore.rules entry
 * (default-deny), so the browser has no read access to them directly. State
 * is polled through this route's Admin-SDK-backed `state` action instead.
 * See docs/CS2_LIVE_PIPELINE_PLAN.md.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CS2_ACTIVE_DUTY_MAPS } from "@/lib/cs2Maps";

interface ServerState {
  status?: "unknown" | "online" | "offline" | "error";
  hostname?: string | null;
  map?: string | null;
  humans?: number | null;
  maxPlayers?: number | null;
  loadedMatchId?: string | null;
  lastCommand?: string | null;
  lastError?: string | null;
  host?: string | null;
  port?: number;
  updatedAt?: string;
}
interface CmdLog { id: string; action?: string; status?: string; error?: string | null; createdAt?: string }
interface TournamentOpt { id: string; name: string; status: string }
interface MatchOpt { id: string; team1Name: string; team2Name: string; team1Id: string; team2Id: string; isBracket: boolean; status: string; matchzyMatchId?: number }

const POLL_MS = 5000;

const sectionStyle: React.CSSProperties = { background: "#0f1014", border: "1px solid #1e1e22", borderRadius: 12, padding: 18, marginBottom: 16 };
const labelStyle: React.CSSProperties = { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#888", display: "block", marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", background: "#0a0b0e", border: "1px solid #2a2a2e", borderRadius: 8, color: "#e6e7ee", fontSize: "0.85rem", fontFamily: "inherit", boxSizing: "border-box" };
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
const btn = (color: string, disabled = false): React.CSSProperties => ({
  padding: "9px 16px", borderRadius: 8, border: 0, cursor: disabled ? "not-allowed" : "pointer",
  fontWeight: 800, fontSize: "0.78rem", background: disabled ? "#33343a" : color, color: "#fff",
  fontFamily: "inherit", whiteSpace: "nowrap", opacity: disabled ? 0.6 : 1,
});

function randomPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function CS2ServerTab({ adminKey }: { adminKey: string }) {
  const [state, setState] = useState<ServerState | null>(null);
  const [cmds, setCmds] = useState<CmdLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  const [tournaments, setTournaments] = useState<TournamentOpt[]>([]);
  const [tournamentId, setTournamentId] = useState("");
  const [matches, setMatches] = useState<MatchOpt[]>([]);
  const [matchId, setMatchId] = useState("");
  const [numMaps, setNumMaps] = useState(1);
  const [plannedMaps, setPlannedMaps] = useState<string[]>([CS2_ACTIVE_DUTY_MAPS[0]]);
  const [validation, setValidation] = useState<{ ok: boolean; detail: string } | null>(null);

  const [mapToChange, setMapToChange] = useState(CS2_ACTIVE_DUTY_MAPS[0]);
  const [password, setPassword] = useState("");

  const api = useCallback(async (action: string, params?: any) => {
    const res = await fetch("/api/admin/cs2-server", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminKey, action, params }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "request failed");
    return j;
  }, [adminKey]);

  const refresh = useCallback(async () => {
    try {
      const j = await api("state");
      setState(j.state || null);
      setCmds(j.recentCommands || []);
    } catch (e: any) { setMsg(`state: ${e.message}`); }
    finally { setLoaded(true); }
  }, [api]);

  // Poll instead of onSnapshot — see file header.
  const visibleRef = useRef(true);
  useEffect(() => {
    if (!adminKey) return;
    refresh();
    const onVis = () => { visibleRef.current = !document.hidden; };
    document.addEventListener("visibilitychange", onVis);
    const interval = setInterval(() => { if (visibleRef.current) refresh(); }, POLL_MS);
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(interval); };
  }, [adminKey, refresh]);

  // Not folded into the 5s state poll: list-tournaments scans whole
  // collections, so it is refreshed on mount and on demand only. The manual
  // button matters because a tournament seeded while this tab is open would
  // otherwise never appear in the dropdown.
  const loadTournaments = useCallback(async () => {
    if (!adminKey) return;
    try {
      const res = await fetch("/api/admin/list-tournaments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey, game: "cs2" }),
      });
      const j = await res.json();
      if (j.tournaments) setTournaments(j.tournaments);
    } catch { /* dropdown just stays as-is */ }
  }, [adminKey]);

  useEffect(() => { loadTournaments(); }, [loadTournaments]);

  // Load matches for the selected tournament (public detail endpoint).
  useEffect(() => {
    if (!tournamentId) { setMatches([]); return; }
    fetch(`/api/tournaments/detail?id=${encodeURIComponent(tournamentId)}&game=cs2`)
      .then(r => r.json())
      .then(j => setMatches(j.matches || []))
      .catch(() => setMatches([]));
  }, [tournamentId]);

  const selectedMatch = matches.find(m => m.id === matchId);

  useEffect(() => {
    if (!selectedMatch) return;
    const n = selectedMatch.isBracket ? 3 : 1; // group=BO1, bracket=BO3 default; admin can override map count implicitly via list length below
    setNumMaps(n);
    setPlannedMaps((prev) => {
      const next = [...prev];
      while (next.length < n) next.push(CS2_ACTIVE_DUTY_MAPS[next.length % CS2_ACTIVE_DUTY_MAPS.length]);
      return next.slice(0, n);
    });
    setValidation(null);
  }, [selectedMatch?.id]);

  const cmd = async (action: string, params?: any, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(action); setMsg(`⏳ ${action}…`);
    try {
      const j = await api(action, params);
      setMsg(`✓ ${action} sent${j.commandId ? ` (${j.commandId.slice(0, 6)})` : ""} — bot picking up…`);
      setTimeout(refresh, 1500);
    } catch (e: any) { setMsg(`✗ ${action}: ${e.message}`); }
    finally { setBusy(null); }
  };

  // The panel has no direct route to CS2_MATCH_CONFIG_TOKEN (it never
  // touches the browser — see cs2-server route's prepare_server action), so
  // roster validation goes through a dedicated server-side action rather
  // than calling match-config directly.
  const validateRosters = async () => {
    if (!tournamentId || !matchId) return;
    setBusy("validate"); setValidation(null);
    try {
      const j = await api("validate_roster", { tournamentId, matchId });
      setValidation(j.ok
        ? { ok: true, detail: "All rostered players have a linked Steam64." }
        : { ok: false, detail: j.error || "validation failed" });
    } catch (e: any) {
      setValidation({ ok: false, detail: e.message });
    } finally { setBusy(null); }
  };

  if (!adminKey) return <div style={{ color: "#888", padding: 20 }}>Enter admin key to use the CS2 Server panel.</div>;
  if (!loaded) return <div style={{ color: "#888", padding: 20 }}>Loading CS2 server state…</div>;

  const s = state || {};
  const online = s.status === "online";
  const statusColor = online ? "#22c55e" : s.status === "error" ? "#ef4444" : s.status === "offline" ? "#ef4444" : "#eab308";
  const updatedAgeSec = s.updatedAt ? Math.round((Date.now() - new Date(s.updatedAt).getTime()) / 1000) : null;
  // The bot deliberately suppresses identical heartbeats and only forces a
  // write every LIVENESS_FLOOR_MS (5 min, see bot/src/services/cs2-server.ts),
  // so on an idle server `updatedAt` is routinely ~5 minutes old while the bot
  // is perfectly healthy. Anything at or under that is normal; warn only well
  // past it, otherwise this fires constantly and trains you to ignore it.
  const staleBot = updatedAgeSec !== null && updatedAgeSec > 420;

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Status bar */}
      <div style={{ ...sectionStyle, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <span style={labelStyle}>Server</span>
          <span style={{ fontWeight: 800, color: statusColor, textTransform: "uppercase" }}>{s.status || "unknown"}</span>
        </div>
        <div>
          <span style={labelStyle}>Hostname</span>
          <span style={{ color: "#e6e7ee" }}>{s.hostname || "—"}</span>
        </div>
        <div>
          <span style={labelStyle}>Map</span>
          <span style={{ color: "#e6e7ee" }}>{s.map || "—"}</span>
        </div>
        <div>
          <span style={labelStyle}>Players</span>
          <span style={{ color: "#e6e7ee", fontWeight: 800 }}>{s.humans ?? "—"}{s.maxPlayers ? ` / ${s.maxPlayers}` : ""}</span>
        </div>
        <div>
          <span style={labelStyle}>Loaded match</span>
          <span style={{ color: "#e6e7ee" }}>{s.loadedMatchId || "none"}</span>
        </div>
        <button style={{ ...btn("#374151"), marginLeft: "auto" }} onClick={refresh}>↻ Refresh</button>
      </div>

      {staleBot && (
        <div style={{ ...sectionStyle, borderColor: "#7c5e10", color: "#fcd34d" }}>
          Bot hasn&apos;t reported in {Math.round(updatedAgeSec! / 60)} min — it may be down. Check the Railway logs before running commands.
        </div>
      )}
      {s.lastError && <div style={{ ...sectionStyle, borderColor: "#7f1d1d", color: "#fca5a5" }}>Last error: {s.lastError}</div>}
      {msg && <div style={{ marginBottom: 12, color: msg.startsWith("✗") ? "#fca5a5" : "#86efac", fontSize: "0.8rem" }}>{msg}</div>}

      {/* Prepare server */}
      <div style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 6, color: "#e6e7ee" }}>1. Prepare Server (optional)</div>
        <div style={{ color: "#888", fontSize: "0.78rem", marginBottom: 12 }}>
          Best-effort attempt to set the webhook cvars globally. These are
          CounterStrikeSharp plugin cvars, which do not reliably apply over RCON and
          cannot be read back to confirm, so treat a green tick here as &quot;sent&quot;, not
          &quot;applied&quot;. You do not need this: Load Match sends the same settings inside
          the match config, which is the path that actually works and which reverts
          automatically when the series ends.
        </div>
        <button style={btn("#7c3aed", busy === "prepare_server")} disabled={busy === "prepare_server"}
          onClick={() => cmd("prepare_server")}>Prepare Server</button>
      </div>

      {/* Load a match */}
      <div style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 14, color: "#e6e7ee" }}>2. Load a Match</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={labelStyle}>Tournament</span>
              <button
                style={{ background: "none", border: 0, color: "#3CCBFF", cursor: "pointer", fontSize: "0.62rem", fontWeight: 800, padding: 0, fontFamily: "inherit" }}
                onClick={loadTournaments}
              >↻ reload list</button>
            </div>
            <select style={selectStyle} value={tournamentId} onChange={e => { setTournamentId(e.target.value); setMatchId(""); }}>
              <option value="">— select —</option>
              {tournaments.map(t => <option key={t.id} value={t.id}>{t.name} ({t.status})</option>)}
            </select>
          </div>
          <div>
            <span style={labelStyle}>Match</span>
            <select style={selectStyle} value={matchId} onChange={e => setMatchId(e.target.value)} disabled={!tournamentId}>
              <option value="">— select —</option>
              {matches.map(m => (
                <option key={m.id} value={m.id}>
                  {m.id} — {m.team1Name} vs {m.team2Name} ({m.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedMatch && (
          <>
            <span style={labelStyle}>Maps ({numMaps === 1 ? "BO1" : "BO3"})</span>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {plannedMaps.map((mp, i) => (
                <select key={i} style={{ ...selectStyle, width: "auto", minWidth: 140 }} value={mp}
                  onChange={e => setPlannedMaps(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}>
                  {CS2_ACTIVE_DUTY_MAPS.map(am => <option key={am} value={am}>{am}</option>)}
                </select>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button style={btn("#0891b2", busy === "validate")} disabled={busy === "validate"} onClick={validateRosters}>
                Validate Rosters
              </button>
              <button
                style={btn("#16a34a", busy === "load_match" || validation?.ok !== true)}
                disabled={busy === "load_match" || validation?.ok !== true}
                onClick={async () => {
                  setBusy("load_match"); setMsg("⏳ saving planned maps…");
                  try {
                    await api("save_planned_maps", { tournamentId, matchId, plannedMaps });
                    await cmd("load_match", { tournamentId, matchId });
                  } catch (e: any) { setMsg(`✗ load_match: ${e.message}`); }
                  finally { setBusy(null); }
                }}
              >▶ Load Match</button>
              {validation && (
                <span style={{ color: validation.ok ? "#86efac" : "#fca5a5", fontSize: "0.78rem" }}>{validation.detail}</span>
              )}
            </div>
            {validation?.ok !== true && (
              <div style={{ color: "#666", fontSize: "0.72rem", marginTop: 8 }}>
                Run "Validate Rosters" successfully before Load Match unlocks — an unlinked
                Steam64 means that player literally cannot join a whitelisted server.
              </div>
            )}
          </>
        )}
      </div>

      {/* Match control */}
      <div style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 14, color: "#e6e7ee" }}>3. Match Control</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btn("#16a34a", busy === "start")} disabled={busy === "start"} onClick={() => cmd("start")}>Start</button>
          <button style={btn("#16a34a", busy === "force_start")} disabled={busy === "force_start"} onClick={() => cmd("force_start", undefined, "Force-start even if not all players are ready?")}>Force Start</button>
          <button style={btn("#eab308", busy === "pause")} disabled={busy === "pause"} onClick={() => cmd("pause")}>Pause</button>
          <button style={btn("#eab308", busy === "unpause")} disabled={busy === "unpause"} onClick={() => cmd("unpause")}>Unpause</button>
          <button style={btn("#0891b2", busy === "restart_match")} disabled={busy === "restart_match"} onClick={() => cmd("restart_match", undefined, "Restart the current match?")}>Restart</button>
          <button style={btn("#b91c1c", busy === "end_match")} disabled={busy === "end_match"} onClick={() => cmd("end_match", undefined, "End the match now?")}>End Match</button>
          <button style={btn("#b91c1c", busy === "force_end")} disabled={busy === "force_end"} onClick={() => cmd("force_end", undefined, "Force-end the match immediately? This does not produce a normal result.")}>Force End</button>
        </div>
      </div>

      {/* Server admin */}
      <div style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 14, color: "#e6e7ee" }}>4. Server Admin</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <select style={{ ...selectStyle, width: "auto", minWidth: 140 }} value={mapToChange} onChange={e => setMapToChange(e.target.value)}>
            {CS2_ACTIVE_DUTY_MAPS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button style={btn("#0891b2", busy === "change_map")} disabled={busy === "change_map"} onClick={() => cmd("change_map", { map: mapToChange })}>Change Map</button>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input style={{ ...inputStyle, width: 180 }} value={password} onChange={e => setPassword(e.target.value)} placeholder="join password" />
          <button style={btn("#374151")} onClick={() => setPassword(randomPassword())}>Generate</button>
          <button style={btn("#7c3aed", busy === "set_password" || !password)} disabled={busy === "set_password" || !password}
            onClick={() => cmd("set_password", { password })}>Set Password</button>
        </div>
        <div style={{ color: "#666", fontSize: "0.72rem", marginTop: 8 }}>
          Rotate this every match — a stale password from an earlier round can let people
          walk into a live game.
        </div>
        <div style={{ marginTop: 12 }}>
          <button style={btn("#374151", busy === "reload_admins")} disabled={busy === "reload_admins"} onClick={() => cmd("reload_admins")}>Reload Admins</button>
        </div>
      </div>

      {/* Command log */}
      <div style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 10, color: "#e6e7ee" }}>Recent Commands</div>
        {cmds.length === 0 && <div style={{ color: "#888", fontSize: "0.8rem" }}>none</div>}
        {cmds.map(c => (
          <div key={c.id} style={{ display: "flex", gap: 10, fontSize: "0.76rem", padding: "4px 0", borderBottom: "1px solid #18181c" }}>
            <span style={{ color: "#9ca3af", minWidth: 90 }}>{c.action}</span>
            <span style={{ color: c.status === "done" ? "#86efac" : c.status === "error" ? "#fca5a5" : "#fcd34d", minWidth: 70 }}>{c.status}</span>
            <span style={{ color: "#666", flex: 1 }}>{c.error || c.createdAt || ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
