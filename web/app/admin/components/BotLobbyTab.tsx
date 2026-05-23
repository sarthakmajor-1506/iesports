"use client";

/**
 * Bot Lobby control tab — full control surface for the iesportsbot-hosted
 * Dota practice lobby.
 *
 * Web can't call the bot directly (bot holds the GC), so everything goes
 * through `/api/admin/bot-lobby`:
 *   - polls action:"state"  → reads `botLobbyControl/state` (bot publishes live)
 *   - command actions       → enqueues `botLobbyCommands` (bot consumes via GC)
 *
 * Create / invite all / kick / shuffle / flip / launch / destroy.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";

interface Member { steam32: string; name: string; team: number; teamLabel: string }
interface LobbyState {
  status?: string;
  gcReady?: boolean;
  lobbyName?: string | null;
  password?: string | null;
  region?: string | null;
  gameMode?: string | null;
  members?: Member[];
  memberCount?: number;
  lastError?: string | null;
  lastCommand?: string | null;
  updatedAt?: string;
}
interface CmdLog { id: string; action?: string; status?: string; error?: string | null; createdAt?: string }

const REGIONS = ["India", "SEA", "Singapore", "Dubai", "Europe", "US East", "US West", "Australia", "Japan"];
const MODES = [
  { v: "AP", l: "All Pick" }, { v: "CM", l: "Captains Mode" }, { v: "CD", l: "Captains Draft" },
  { v: "RD", l: "Random Draft" }, { v: "SD", l: "Single Draft" }, { v: "AR", l: "All Random" },
  { v: "ID", l: "Immortal Draft" },
];

const sectionStyle: React.CSSProperties = { background: "#0f1014", border: "1px solid #1e1e22", borderRadius: 12, padding: 18, marginBottom: 16 };
const labelStyle: React.CSSProperties = { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#888", display: "block", marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", background: "#0a0b0e", border: "1px solid #2a2a2e", borderRadius: 8, color: "#e6e7ee", fontSize: "0.85rem", fontFamily: "inherit", boxSizing: "border-box" };
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
const btn = (color: string, disabled = false): React.CSSProperties => ({
  padding: "9px 16px", borderRadius: 8, border: 0, cursor: disabled ? "not-allowed" : "pointer",
  fontWeight: 800, fontSize: "0.78rem", background: disabled ? "#33343a" : color, color: "#fff",
  fontFamily: "inherit", whiteSpace: "nowrap", opacity: disabled ? 0.6 : 1,
});

export default function BotLobbyTab({ adminKey }: { adminKey: string }) {
  const [state, setState] = useState<LobbyState | null>(null);
  const [cmds, setCmds] = useState<CmdLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  const [name, setName] = useState("IEsports Lobby");
  const [password, setPassword] = useState("ies");
  const [region, setRegion] = useState("India");
  const [gameMode, setGameMode] = useState("CM");
  const [inviteIds, setInviteIds] = useState("");
  const api = useCallback(async (action: string, params?: any) => {
    const res = await fetch("/api/admin/bot-lobby", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminKey, action, params }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "request failed");
    return j;
  }, [adminKey]);

  // Manual refresh button (rarely needed now that state arrives via onSnapshot).
  const refresh = useCallback(async () => {
    try {
      const j = await api("state");
      setState(j.state || null);
      setCmds(j.recentCommands || []);
    } catch (e: any) { setMsg(e.message); }
    finally { setLoaded(true); }
  }, [api]);

  // Real-time Firestore listeners — replace the 3s poll. Updates push from the
  // bot's heartbeat (every 1.5s) AND immediately after every command.
  useEffect(() => {
    if (!adminKey) return;
    const unsubState = onSnapshot(doc(db, "botLobbyControl", "state"), (snap) => {
      if (snap.exists()) setState(snap.data() as LobbyState);
      setLoaded(true);
    }, (err) => { setMsg(`state listen err: ${err.message}`); setLoaded(true); });
    const unsubCmds = onSnapshot(
      query(collection(db, "botLobbyCommands"), orderBy("createdAt", "desc"), limit(8)),
      (snap) => {
        setCmds(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CmdLog[]);
      },
      (err) => { setMsg(`cmds listen err: ${err.message}`); }
    );
    return () => { unsubState(); unsubCmds(); };
  }, [adminKey]);

  const cmd = async (action: string, params?: any, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(action); setMsg(`⏳ ${action}…`);
    try {
      const j = await api(action, params);
      setMsg(`✓ ${action} sent${j.commandId ? ` (${j.commandId.slice(0, 6)})` : ""} — bot picking up…`);
    } catch (e: any) { setMsg(`✗ ${action}: ${e.message}`); }
    finally { setBusy(null); }
  };

  if (!adminKey) return <div style={{ color: "#888", padding: 20 }}>Enter admin key to use the Bot Lobby panel.</div>;
  if (!loaded) return <div style={{ color: "#888", padding: 20 }}>Loading bot lobby state…</div>;

  const s = state || {};
  const members = s.members || [];
  const gcReady = !!s.gcReady;
  const active = s.status === "active" || s.status === "launching" || s.status === "launched";
  const byTeam = (t: number) => members.filter(m => m.team === t);

  const statusColor = s.status === "active" ? "#22c55e" : s.status === "launched" ? "#3b82f6"
    : s.status === "error" ? "#ef4444" : s.status === "idle" ? "#6b7280" : "#eab308";

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Status bar */}
      <div style={{ ...sectionStyle, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <span style={labelStyle}>GC</span>
          <span style={{ fontWeight: 800, color: gcReady ? "#22c55e" : "#ef4444" }}>
            {gcReady ? "● Connected" : "● Bot offline / connecting"}
          </span>
        </div>
        <div>
          <span style={labelStyle}>Lobby Status</span>
          <span style={{ fontWeight: 800, color: statusColor, textTransform: "uppercase" }}>{s.status || "idle"}</span>
        </div>
        <div>
          <span style={labelStyle}>Lobby</span>
          <span style={{ color: "#e6e7ee" }}>{s.lobbyName ? `${s.lobbyName} · pw:${s.password} · ${s.region}/${s.gameMode}` : "—"}</span>
        </div>
        <div>
          <span style={labelStyle}>Members</span>
          <span style={{ color: "#e6e7ee", fontWeight: 800 }}>{s.memberCount ?? members.length}</span>
        </div>
        <button style={{ ...btn("#374151"), marginLeft: "auto" }} onClick={refresh}>↻ Refresh</button>
      </div>

      {s.lastError && <div style={{ ...sectionStyle, borderColor: "#7f1d1d", color: "#fca5a5" }}>Last error: {s.lastError}</div>}
      {msg && <div style={{ marginBottom: 12, color: msg.startsWith("✗") ? "#fca5a5" : "#86efac", fontSize: "0.8rem" }}>{msg}</div>}
      {!gcReady && <div style={{ ...sectionStyle, borderColor: "#7c5e10", color: "#fcd34d" }}>
        Bot GC not connected — commands will queue and run once it's up. If it stays offline, redeploy the Railway bot.
      </div>}

      {/* Create */}
      <div style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 14, color: "#e6e7ee" }}>Create / Recreate Lobby</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><span style={labelStyle}>Lobby name</span><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></div>
          <div><span style={labelStyle}>Password</span><input style={inputStyle} value={password} onChange={e => setPassword(e.target.value)} /></div>
          <div><span style={labelStyle}>Region</span>
            <select style={selectStyle} value={region} onChange={e => setRegion(e.target.value)}>
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div><span style={labelStyle}>Game mode</span>
            <select style={selectStyle} value={gameMode} onChange={e => setGameMode(e.target.value)}>
              {MODES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
        </div>
        <button style={btn("#7c3aed", busy === "create" || !gcReady)}
          disabled={busy === "create" || !gcReady}
          onClick={() => cmd("create", { name, password, region, gameMode },
            active ? "A lobby is already active — recreate it (kicks everyone)?" : undefined)}>
          {active ? "Recreate Lobby" : "Create Lobby"}
        </button>
      </div>

      {/* Invite */}
      <div style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 14, color: "#e6e7ee" }}>Invite Players</div>
        <span style={labelStyle}>Steam32 IDs (comma / space / newline separated)</span>
        <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={inviteIds}
          onChange={e => setInviteIds(e.target.value)} placeholder="167947980, 123456789 …" />
        <div style={{ marginTop: 10 }}>
          <button style={btn("#0ea5e9", busy === "invite_all" || !active)}
            disabled={busy === "invite_all" || !active}
            onClick={() => {
              const ids = inviteIds.split(/[\s,]+/).map(x => x.trim()).filter(Boolean);
              if (!ids.length) { setMsg("✗ no steam32 ids"); return; }
              cmd("invite_all", { steam32s: ids });
            }}>Invite All</button>
        </div>
      </div>

      {/* Members */}
      <div style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 14, color: "#e6e7ee" }}>Lobby Members ({members.length})</div>
        {members.length === 0 && <div style={{ color: "#888", fontSize: "0.82rem" }}>No members yet.</div>}
        {[0, 1, 4].map(team => {
          const list = byTeam(team);
          if (!list.length) return null;
          const tcolor = team === 0 ? "#22c55e" : team === 1 ? "#ef4444" : "#9ca3af";
          return (
            <div key={team} style={{ marginBottom: 12 }}>
              <div style={{ ...labelStyle, color: tcolor }}>{team === 0 ? "Radiant" : team === 1 ? "Dire" : "Unassigned"} ({list.length})</div>
              {list.map(m => (
                <div key={m.steam32} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "#0a0b0e", borderRadius: 6, marginBottom: 4 }}>
                  <span style={{ color: "#e6e7ee", fontSize: "0.83rem", flex: 1 }}>{m.name}</span>
                  <span style={{ color: "#666", fontSize: "0.72rem" }}>{m.steam32}</span>
                  <button style={btn("#b91c1c", busy === "kick")} disabled={busy === "kick"}
                    onClick={() => cmd("kick", { steam32: m.steam32 }, `Kick ${m.name}?`)}>Kick</button>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 14, color: "#e6e7ee" }}>Lobby Actions</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btn("#0891b2", busy === "shuffle" || !active)} disabled={busy === "shuffle" || !active} onClick={() => cmd("shuffle")}>Balanced Shuffle</button>
          <button style={btn("#0891b2", busy === "flip" || !active)} disabled={busy === "flip" || !active} onClick={() => cmd("flip")}>Flip Teams</button>
          <button style={btn("#16a34a", busy === "launch" || !active)} disabled={busy === "launch" || !active} onClick={() => cmd("launch", undefined, "Launch the match now?")}>▶ Launch Match</button>
          <button style={btn("#b91c1c", busy === "destroy" || !active)} disabled={busy === "destroy" || !active} onClick={() => cmd("destroy", undefined, "Destroy the lobby? This kicks everyone.")}>Destroy Lobby</button>
        </div>
      </div>

      {/* Command log */}
      <div style={sectionStyle}>
        <div style={{ fontWeight: 800, marginBottom: 10, color: "#e6e7ee" }}>Recent Commands</div>
        {cmds.length === 0 && <div style={{ color: "#888", fontSize: "0.8rem" }}>none</div>}
        {cmds.map(c => (
          <div key={c.id} style={{ display: "flex", gap: 10, fontSize: "0.76rem", padding: "4px 0", borderBottom: "1px solid #18181c" }}>
            <span style={{ color: "#9ca3af", minWidth: 64 }}>{c.action}</span>
            <span style={{ color: c.status === "done" ? "#86efac" : c.status === "error" ? "#fca5a5" : "#fcd34d", minWidth: 70 }}>{c.status}</span>
            <span style={{ color: "#666", flex: 1 }}>{c.error || c.createdAt || ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
