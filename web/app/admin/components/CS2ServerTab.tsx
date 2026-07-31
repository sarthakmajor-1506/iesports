"use client";

/**
 * CS2 game-server control tab — full control surface for the RCON/MatchZy
 * pipeline. Everything goes through `/api/admin/cs2-server`:
 *   - polls action:"state" → reads `cs2ServerControl/state{N}` (bot publishes live)
 *   - command actions      → enqueues `cs2ServerCommands` (bot runs over RCON)
 *
 * Unlike BotLobbyTab, this does NOT use a client-side onSnapshot — neither
 * `cs2ServerControl` nor `cs2ServerCommands` has a firestore.rules entry
 * (default-deny), so the browser has no read access to them directly. State
 * is polled through this route's Admin-SDK-backed `state` action instead.
 * See docs/CS2_LIVE_PIPELINE_PLAN.md.
 *
 * TWO SERVERS: the fixture sheet runs two matches per 20-minute slot, area 1
 * and area 2, and one game server holds one match. Every command carries the
 * selected `serverId`, and selecting a match snaps the server picker to that
 * match's `area` — the single likeliest mistake on the night is loading the
 * area 2 match onto the box already running area 1, which kicks the live game.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CS2_ACTIVE_DUTY_MAPS, CS2_MAP_SIDES, cs2MapSideLabel } from "@/lib/cs2Maps";

interface ServerState {
  serverId?: string;
  label?: string;
  configured?: boolean;
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
interface CmdLog { id: string; action?: string; status?: string; error?: string | null; createdAt?: string; serverId?: string }
interface TournamentOpt { id: string; name: string; status: string }
interface MatchOpt {
  id: string; team1Name: string; team2Name: string; team1Id: string; team2Id: string;
  isBracket: boolean; status: string; matchzyMatchId?: number;
  bracketType?: string; area?: number; maxRounds?: number;
  plannedMaps?: string[]; plannedMapSides?: string[];
}
interface TournamentFormat {
  matchesPerRound?: number; bracketBestOf?: number; grandFinalBestOf?: number;
  groupMaxRounds?: number; bracketMaxRounds?: number;
}

/**
 * Maps handed to MatchZy must number exactly the best-of, or match-config
 * discards the list and falls back to the default map. Derived from the
 * tournament doc rather than assumed: Royal Sports League is BO1 throughout
 * (play-offs included), and a hardcoded BO3 here would put a three-map list
 * in front of a play-off that has one 20-minute slot.
 */
function bestOfFor(m: MatchOpt | undefined, t: TournamentFormat | null): number {
  if (!m) return 1;
  if (m.isBracket) {
    return Number(m.bracketType === "grand_final" ? t?.grandFinalBestOf : t?.bracketBestOf) || 1;
  }
  return Number(t?.matchesPerRound) || 1;
}

/** The round limits this tournament actually uses, plus a smoke-test length. */
const MR_PRESETS = [
  { value: 2, label: "MR2 — smoke test (first to 2)" },
  { value: 6, label: "MR6 — short (first to 4)" },
  { value: 16, label: "MR16 — league (first to 9)" },
  { value: 24, label: "MR24 — play-off (first to 13)" },
];

/** mp_maxrounds the server will actually get — mirrors api/cs2/match-config. */
function maxRoundsFor(m: MatchOpt | undefined, t: TournamentFormat | null): number {
  if (!m) return 24;
  return Number(m.maxRounds)
    || Number(m.isBracket ? t?.bracketMaxRounds : t?.groupMaxRounds)
    || (m.isBracket ? 24 : 16);
}

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
  const [servers, setServers] = useState<ServerState[]>([]);
  const [serverId, setServerId] = useState("1");
  const [cmds, setCmds] = useState<CmdLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  const [tournaments, setTournaments] = useState<TournamentOpt[]>([]);
  const [tournamentId, setTournamentId] = useState("");
  const [tFormat, setTFormat] = useState<TournamentFormat | null>(null);
  const [matches, setMatches] = useState<MatchOpt[]>([]);
  const [matchId, setMatchId] = useState("");
  const [numMaps, setNumMaps] = useState(1);
  const [plannedMaps, setPlannedMaps] = useState<string[]>([CS2_ACTIVE_DUTY_MAPS[0]]);
  const [plannedMapSides, setPlannedMapSides] = useState<string[]>(["knife"]);
  const [matchMaxRounds, setMatchMaxRounds] = useState("16");
  const [validation, setValidation] = useState<{ ok: boolean; detail: string } | null>(null);

  const [mapToChange, setMapToChange] = useState(CS2_ACTIVE_DUTY_MAPS[0]);
  const [password, setPassword] = useState("");
  const [liveMaxRounds, setLiveMaxRounds] = useState("");
  const [liveFreezeTime, setLiveFreezeTime] = useState("5");

  // Every command names its server. `serverId` sits outside `params` so that
  // the route decides routing once, in one place, for both the passthrough
  // commands and the ones it rewrites (load_match, prepare_server).
  const api = useCallback(async (action: string, params?: any, targetServerId?: string) => {
    const res = await fetch("/api/admin/cs2-server", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminKey, action, params, serverId: targetServerId ?? serverId }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "request failed");
    return j;
  }, [adminKey, serverId]);

  const refresh = useCallback(async () => {
    try {
      const j = await api("state");
      setServers(j.servers || (j.state ? [j.state] : []));
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

  // Load matches for the selected tournament (public detail endpoint). The
  // tournament doc comes back with them and carries the format — best-of and
  // round limits are read from it, never assumed here.
  useEffect(() => {
    if (!tournamentId) { setMatches([]); setTFormat(null); return; }
    fetch(`/api/tournaments/detail?id=${encodeURIComponent(tournamentId)}&game=cs2`)
      .then(r => r.json())
      .then(j => { setMatches(j.matches || []); setTFormat(j.tournament || null); })
      .catch(() => { setMatches([]); setTFormat(null); });
  }, [tournamentId]);

  const selectedMatch = matches.find(m => m.id === matchId);
  const bestOf = bestOfFor(selectedMatch, tFormat);

  useEffect(() => {
    if (!selectedMatch) return;
    const n = bestOfFor(selectedMatch, tFormat);
    setNumMaps(n);
    setPlannedMaps((prev) => {
      const saved = selectedMatch.plannedMaps?.length === n ? selectedMatch.plannedMaps : prev;
      const next = [...saved];
      while (next.length < n) next.push(CS2_ACTIVE_DUTY_MAPS[next.length % CS2_ACTIVE_DUTY_MAPS.length]);
      return next.slice(0, n);
    });
    setPlannedMapSides(() => {
      const saved = selectedMatch.plannedMapSides?.length === n ? selectedMatch.plannedMapSides : null;
      // Knife by default — the sides override exists for when a knife can't
      // be played, not as the normal path.
      return saved ?? Array.from({ length: n }, () => "knife");
    });
    // Seeded from what this match would get anyway (its own maxRounds, else
    // the tournament's stage default), so leaving it alone changes nothing.
    setMatchMaxRounds(String(maxRoundsFor(selectedMatch, tFormat)));
    // The area on the fixture sheet IS the server the match belongs on.
    if (selectedMatch.area === 1 || selectedMatch.area === 2) setServerId(String(selectedMatch.area));
    setValidation(null);
  }, [selectedMatch?.id, tFormat]);

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

  const s = servers.find(sv => String(sv.serverId || "1") === serverId) || {};
  const ageSec = (sv: ServerState) => sv.updatedAt ? Math.round((Date.now() - new Date(sv.updatedAt).getTime()) / 1000) : null;
  const updatedAgeSec = ageSec(s);
  // The bot deliberately suppresses identical heartbeats and only forces a
  // write every LIVENESS_FLOOR_MS (5 min, see bot/src/services/cs2-server.ts),
  // so on an idle server `updatedAt` is routinely ~5 minutes old while the bot
  // is perfectly healthy. Anything at or under that is normal; warn only well
  // past it, otherwise this fires constantly and trains you to ignore it.
  const staleBot = updatedAgeSec !== null && updatedAgeSec > 420;
  const statusColorOf = (sv: ServerState) =>
    sv.status === "online" ? "#22c55e" : sv.status === "error" || sv.status === "offline" ? "#ef4444" : "#eab308";

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Server picker + status. Both servers are always shown: on a two-area
          night the question is never "how is the server", it's "which of the
          two is free". */}
      <div style={{ ...sectionStyle, display: "flex", gap: 12, flexWrap: "wrap" }}>
        {["1", "2"].map((id) => {
          const sv = servers.find(x => String(x.serverId || "1") === id) || {};
          const active = id === serverId;
          const unconfigured = sv.configured === false;
          return (
            <button key={id} onClick={() => setServerId(id)} style={{
              flex: "1 1 300px", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              background: active ? "#15171d" : "#0a0b0e",
              border: `1px solid ${active ? "#3CCBFF" : "#1e1e22"}`,
              borderRadius: 10, padding: 14,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontWeight: 800, color: active ? "#3CCBFF" : "#e6e7ee" }}>Server {id}</span>
                <span style={{ fontWeight: 800, fontSize: "0.72rem", color: statusColorOf(sv), textTransform: "uppercase" }}>
                  {unconfigured ? "not configured" : (sv.status || "unknown")}
                </span>
                {sv.host && <span style={{ fontSize: "0.68rem", color: "#666" }}>{sv.host}:{sv.port}</span>}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: "0.72rem", color: "#9ca3af" }}>
                <span>map <b style={{ color: "#e6e7ee" }}>{sv.map || "—"}</b></span>
                <span>players <b style={{ color: "#e6e7ee" }}>{sv.humans ?? "—"}{sv.maxPlayers ? `/${sv.maxPlayers}` : ""}</b></span>
                <span>match <b style={{ color: "#e6e7ee" }}>{sv.loadedMatchId || "none"}</b></span>
              </div>
              {unconfigured && (
                <div style={{ fontSize: "0.68rem", color: "#fcd34d", marginTop: 8 }}>
                  Set CS2_RCON_HOST_{id} / CS2_RCON_PORT_{id} / CS2_RCON_PASSWORD_{id} on the Railway bot service.
                </div>
              )}
            </button>
          );
        })}
        <button style={{ ...btn("#374151"), alignSelf: "center" }} onClick={refresh}>↻ Refresh</button>
      </div>

      <div style={{ marginBottom: 12, fontSize: "0.75rem", color: "#9ca3af" }}>
        Commands below go to <b style={{ color: "#3CCBFF" }}>Server {serverId}</b>{s.hostname ? ` (${s.hostname})` : ""}.
      </div>

      {staleBot && (
        <div style={{ ...sectionStyle, borderColor: "#7c5e10", color: "#fcd34d" }}>
          Bot hasn&apos;t reported for server {serverId} in {Math.round(updatedAgeSec! / 60)} min — it may be down. Check the Railway logs before running commands.
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
                  {m.id}{m.area ? ` [area ${m.area}]` : ""} — {m.team1Name} vs {m.team2Name} ({m.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedMatch && (
          <>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12, fontSize: "0.74rem", color: "#9ca3af" }}>
              <span>format <b style={{ color: "#e6e7ee" }}>BO{bestOf}</b></span>
              <span>stage <b style={{ color: "#e6e7ee" }}>{selectedMatch.isBracket ? "play-off" : "league"}</b></span>
            </div>

            {/* Round limit, saved onto the match doc on Load Match. Match-config
                prefers this over the tournament's group/bracket defaults, so a
                game shortened on the night to claw back time survives a reload. */}
            <span style={labelStyle}>Rounds (mp_maxrounds)</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <select style={{ ...selectStyle, width: "auto", minWidth: 210 }}
                value={MR_PRESETS.some(p => String(p.value) === matchMaxRounds) ? matchMaxRounds : "custom"}
                onChange={e => { if (e.target.value !== "custom") setMatchMaxRounds(e.target.value); }}>
                {MR_PRESETS.map(p => <option key={p.value} value={String(p.value)}>{p.label}</option>)}
                <option value="custom">custom…</option>
              </select>
              <input style={{ ...inputStyle, width: 90 }} value={matchMaxRounds} inputMode="numeric"
                onChange={e => setMatchMaxRounds(e.target.value.replace(/\D/g, "").slice(0, 2))} />
              <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>
                {Number(matchMaxRounds) >= 2
                  ? `first to ${Math.floor(Number(matchMaxRounds) / 2) + 1}, halftime after ${Number(matchMaxRounds) / 2}`
                  : "2–60"}
                {Number(matchMaxRounds) % 2 === 1 && <b style={{ color: "#fcd34d" }}> · odd number splits the halves unevenly</b>}
              </span>
            </div>

            {/* The fixture sheet's area is the server this match belongs on.
                Loading it onto the other box would kick whatever is live
                there, so the mismatch is called out rather than silently
                allowed — overriding is still possible, deliberately. */}
            {selectedMatch.area && String(selectedMatch.area) !== serverId && (
              <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, border: "1px solid #7c5e10", color: "#fcd34d", fontSize: "0.74rem" }}>
                This match is area {selectedMatch.area} but Server {serverId} is selected — loading it here will interrupt whatever Server {serverId} is running.
              </div>
            )}

            <span style={labelStyle}>Maps &amp; sides (BO{numMaps})</span>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              {plannedMaps.map((mp, i) => (
                <div key={i} style={{ display: "flex", gap: 6 }}>
                  <select style={{ ...selectStyle, width: "auto", minWidth: 140 }} value={mp}
                    onChange={e => setPlannedMaps(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}>
                    {CS2_ACTIVE_DUTY_MAPS.map(am => <option key={am} value={am}>{am}</option>)}
                  </select>
                  <select style={{ ...selectStyle, width: "auto", minWidth: 190 }} value={plannedMapSides[i] || "knife"}
                    onChange={e => setPlannedMapSides(prev => {
                      const next = [...prev];
                      while (next.length < plannedMaps.length) next.push("knife");
                      next[i] = e.target.value;
                      return next.slice(0, plannedMaps.length);
                    })}>
                    {CS2_MAP_SIDES.map(sd => (
                      <option key={sd} value={sd}>
                        {cs2MapSideLabel(sd, selectedMatch.team1Name, selectedMatch.team2Name)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ color: "#666", fontSize: "0.72rem", marginBottom: 12 }}>
              Leave on <b>Knife round</b> for the normal flow — the knife winner types <b>.stay</b> or <b>.switch</b> in
              game. Those two are chat commands only: MatchZy ignores them unless a player sends them, so the panel
              cannot press them for you. Picking a side here instead skips the knife entirely, which is the way to
              settle sides from admin when a team is short or the slot is running late. Applies on Load Match.
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
                    await api("save_planned_maps", {
                      tournamentId, matchId, plannedMaps, plannedMapSides,
                      maxRounds: Number(matchMaxRounds) || undefined,
                    });
                    // Prefill the live push with what this match asked for —
                    // on MatchZy 0.8.5 it will need pushing again once live.
                    setLiveMaxRounds(String(Number(matchMaxRounds) || ""));
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

      {/* Live match rules. Separate from the match config on purpose: MatchZy
          0.8.5 execs live.cfg AFTER applying the config's cvars, so on that
          build the round limit we send is overwritten the moment the match
          goes live and a group game runs to 13 instead of 9. Pushing them here
          once the match is live is the only fix that doesn't need file access
          to the box. Newer builds hold the config value and this is a no-op. */}
      <div style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 6, color: "#e6e7ee" }}>5. Live Match Rules</div>
        <div style={{ color: "#888", fontSize: "0.78rem", marginBottom: 12 }}>
          Push straight onto Server {serverId} right now. Use this if the scoreboard shows the wrong
          round limit after going live — older MatchZy builds let their own live.cfg overwrite what we
          sent with the match. Takes effect from the next round.
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <span style={labelStyle}>Max rounds</span>
            <input style={{ ...inputStyle, width: 110 }} value={liveMaxRounds} inputMode="numeric"
              onChange={e => setLiveMaxRounds(e.target.value.replace(/\D/g, ""))} placeholder="16" />
          </div>
          <div>
            <span style={labelStyle}>Freeze time (s)</span>
            <input style={{ ...inputStyle, width: 110 }} value={liveFreezeTime} inputMode="numeric"
              onChange={e => setLiveFreezeTime(e.target.value.replace(/\D/g, ""))} placeholder="5" />
          </div>
          <button style={btn("#7c3aed", busy === "live_rules")}
            disabled={busy === "live_rules" || (!liveMaxRounds && !liveFreezeTime)}
            onClick={async () => {
              setBusy("live_rules"); setMsg("⏳ pushing match rules…");
              try {
                if (liveMaxRounds) await api("exec", { command: `mp_maxrounds ${Number(liveMaxRounds)}` });
                if (liveFreezeTime) await api("exec", { command: `mp_freezetime ${Number(liveFreezeTime)}` });
                setMsg(`✓ sent to Server ${serverId} — check the scoreboard next round`);
                setTimeout(refresh, 1500);
              } catch (e: any) { setMsg(`✗ live rules: ${e.message}`); }
              finally { setBusy(null); }
            }}>Apply to Server {serverId}</button>
          {selectedMatch && (
            <button style={btn("#374151")} onClick={() => {
              setLiveMaxRounds(matchMaxRounds);
              setLiveFreezeTime("5");
            }}>Use match values (MR{matchMaxRounds || maxRoundsFor(selectedMatch, tFormat)})</button>
          )}
        </div>

        {/* Friendly fire is its own control rather than another text field: it
            is a yes/no that gets flipped mid-event (usually off after someone
            team-kills), and typing a cvar value under time pressure is how you
            end up sending mp_friendlyfire 10. Sent immediately, like the rest
            of this section — it does not wait for a match load. */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>Friendly fire</span>
          {([["ON", "1", "#b91c1c"], ["OFF", "0", "#374151"]] as const).map(([label, value, colour]) => (
            <button key={value} style={btn(colour, busy === `ff${value}`)} disabled={busy === `ff${value}`}
              onClick={async () => {
                setBusy(`ff${value}`); setMsg(`⏳ friendly fire ${label}…`);
                try {
                  await api("exec", { command: `mp_friendlyfire ${value}` });
                  setMsg(`✓ friendly fire ${label} on Server ${serverId} — applies next round`);
                  setTimeout(refresh, 1500);
                } catch (e: any) { setMsg(`✗ friendly fire: ${e.message}`); }
                finally { setBusy(null); }
              }}>Friendly fire {label}</button>
          ))}
          <span style={{ fontSize: "0.72rem", color: "#666" }}>
            Takes effect from the next round. MatchZy&apos;s live.cfg sets this at go-live, so re-apply after a match starts.
          </span>
        </div>
      </div>

      {/* Command log */}
      <div style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 10, color: "#e6e7ee" }}>Recent Commands</div>
        {cmds.length === 0 && <div style={{ color: "#888", fontSize: "0.8rem" }}>none</div>}
        {cmds.map(c => (
          <div key={c.id} style={{ display: "flex", gap: 10, fontSize: "0.76rem", padding: "4px 0", borderBottom: "1px solid #18181c" }}>
            {/* Two servers share this log — without the id you cannot tell
                which box an error came from. */}
            <span style={{ color: "#6b7280", minWidth: 22 }}>S{c.serverId || "1"}</span>
            <span style={{ color: "#9ca3af", minWidth: 90 }}>{c.action}</span>
            <span style={{ color: c.status === "done" ? "#86efac" : c.status === "error" ? "#fca5a5" : "#fcd34d", minWidth: 70 }}>{c.status}</span>
            <span style={{ color: "#666", flex: 1 }}>{c.error || c.createdAt || ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
