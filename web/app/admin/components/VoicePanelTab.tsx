"use client";

/**
 * Voice Panel admin tab — single private voice channel control surface.
 *
 * - Live-subscribed to `discordVoicePanels/main` for current state.
 * - Owners (shrey, bubble, major) are baked into the API route and always have access.
 * - Admin can grant/revoke any other user as a "guest" — toggle ON gives them
 *   View+Connect+Speak, toggle OFF removes their overwrite (channel disappears for them).
 *
 * All Discord ops go through `/api/admin/voice-panel` which uses the bot token.
 */

import { useEffect, useMemo, useRef, useState } from "react";

interface PanelDoc {
  channelId?: string;
  guildId?: string;
  name?: string;
  tournamentId?: string | null;
  ownerDiscordIds?: string[];
  speakers?: string[];  // who has SPEAK perm besides owners — admin-toggled
  members?: { discordId: string; name: string; selfMute: boolean; selfDeaf: boolean; serverMute: boolean }[];
  updatedAt?: string;
}

interface TournamentOpt { id: string; name: string }

const labelStyle: React.CSSProperties = { fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#888", display: "block", marginBottom: 6 };
const sectionStyle: React.CSSProperties = { background: "#0f1014", border: "1px solid #1e1e22", borderRadius: 12, padding: 18, marginBottom: 16 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", background: "#0a0b0e", border: "1px solid #2a2a2e", borderRadius: 8, color: "#e6e7ee", fontSize: "0.85rem", fontFamily: "inherit", boxSizing: "border-box" };
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
const btn = (color: string): React.CSSProperties => ({
  padding: "8px 14px", borderRadius: 8, border: 0, cursor: "pointer", fontWeight: 800, fontSize: "0.75rem",
  background: color, color: "#fff", fontFamily: "inherit", whiteSpace: "nowrap",
});

export default function VoicePanelTab({ adminKey }: { adminKey: string }) {
  const [panel, setPanel] = useState<PanelDoc | null>(null);
  const [panelLoaded, setPanelLoaded] = useState(false);

  const [tournaments, setTournaments] = useState<TournamentOpt[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [customName, setCustomName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");


  // ─── Poll panel state via API ────────────────────────────────────────────
  // We can't use Firestore client onSnapshot here because the
  // `discordVoicePanels` collection isn't covered by client-side read rules.
  // Server route uses admin SDK to bypass rules; we poll every 3s to pick up
  // live members joining/leaving. Action calls return fresh state and apply
  // it immediately, so the UI reacts to button clicks without polling lag.
  const adminKeyRef = useRef(adminKey);
  useEffect(() => { adminKeyRef.current = adminKey; }, [adminKey]);

  useEffect(() => {
    let cancelled = false;
    const fetchState = async () => {
      try {
        const res = await fetch("/api/admin/voice-panel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get", ...adminKeyPayload(adminKeyRef.current) }),
        });
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setPanel((j.state as PanelDoc) || null);
        }
        setPanelLoaded(true);
      } catch {
        if (!cancelled) setPanelLoaded(true);
      }
    };
    fetchState();
    const id = setInterval(fetchState, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // ─── Load tournaments via admin API (bypasses client Firestore rules) ────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/list-tournaments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminKey }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(j.tournaments)) return;
        const opts: TournamentOpt[] = j.tournaments.map((t: any) => ({ id: t.id, name: t.name || t.id }));
        opts.sort((a, b) => a.name.localeCompare(b.name));
        setTournaments(opts);
      } catch {}
    })();
  }, [adminKey]);

  const callApi = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/voice-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...adminKeyPayload(adminKey), ...extra }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      // Apply fresh state returned by the action so UI updates synchronously
      // without waiting for the next poll tick.
      if ("state" in j) setPanel((j.state as PanelDoc) || null);
      return j;
    } catch (e: any) { setErr(e.message); throw e; }
    finally { setBusy(false); }
  };

  // ─── Actions ─────────────────────────────────────────────────────────────
  const onCreate = async () => {
    const tName = selectedTournamentId
      ? tournaments.find((t) => t.id === selectedTournamentId)?.name
      : customName.trim();
    if (!tName) return setErr("Pick a tournament or enter a custom name");
    await callApi("create", { name: tName, tournamentId: selectedTournamentId || null });
  };
  const onRename = async () => {
    const tName = selectedTournamentId
      ? tournaments.find((t) => t.id === selectedTournamentId)?.name
      : customName.trim();
    if (!tName) return setErr("Pick a tournament or enter a custom name");
    await callApi("rename", { name: tName, tournamentId: selectedTournamentId || null });
  };
  const onDelete = async () => {
    if (!confirm("Delete the voice channel? Members will be kicked.")) return;
    await callApi("delete");
  };
  const onUnmute = async (discordId: string) => callApi("unmute", { userId: discordId });
  const onMute = async (discordId: string) => callApi("mute", { userId: discordId });
  const onKick = async (discordId: string) => callApi("kick", { userId: discordId });

  // ─── Derived: who's in the channel right now ─────────────────────────────
  const ownerSet = useMemo(() => new Set(panel?.ownerDiscordIds || []), [panel?.ownerDiscordIds]);
  const speakersSet = useMemo(() => new Set(panel?.speakers || []), [panel?.speakers]);
  const liveMembers = panel?.members || [];

  if (!panelLoaded) return <div style={{ color: "#666", padding: 20 }}>Loading…</div>;

  // ─── No channel yet ──────────────────────────────────────────────────────
  if (!panel?.channelId) {
    return (
      <>
        <div style={sectionStyle}>
          <span style={labelStyle}>Create Voice Channel</span>
          <p style={{ fontSize: "0.78rem", color: "#888", lineHeight: 1.6, marginTop: 0, marginBottom: 14 }}>
            Creates a <b>public</b> voice channel in the iesports server. Anyone in the server
            can see and join, but everyone joins <b>muted</b> by default. Owners (Shrey, Bubble,
            Major) can speak immediately. For everyone else, click <b>Unmute</b> in the live
            members list once they join to give them mic.
          </p>
          <label style={{ ...labelStyle, marginTop: 4 }}>Pick a tournament for the channel name</label>
          <select value={selectedTournamentId} onChange={(e) => setSelectedTournamentId(e.target.value)} style={selectStyle}>
            <option value="">— Custom name —</option>
            {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {!selectedTournamentId && (
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Channel name" style={{ ...inputStyle, marginTop: 10 }} />
          )}
          <div style={{ marginTop: 14 }}>
            <button onClick={onCreate} disabled={busy} style={btn("#22c55e")}>{busy ? "Creating…" : "Create Channel"}</button>
          </div>
          {err && <div style={{ marginTop: 10, color: "#ef4444", fontSize: "0.78rem" }}>{err}</div>}
        </div>
      </>
    );
  }

  // ─── Channel exists ──────────────────────────────────────────────────────
  return (
    <>
      {/* Channel info + rename / delete */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <span style={labelStyle}>Active Channel</span>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#3CCBFF" }}>#{panel.name}</div>
            <div style={{ fontSize: "0.7rem", color: "#666", marginTop: 4, fontFamily: "ui-monospace, monospace" }}>{panel.channelId}</div>
          </div>
          <button onClick={onDelete} disabled={busy} style={btn("#ef4444")}>Delete Channel</button>
        </div>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #1e1e22" }}>
          <label style={labelStyle}>Rename (pick tournament or enter custom)</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <select value={selectedTournamentId} onChange={(e) => setSelectedTournamentId(e.target.value)} style={selectStyle}>
              <option value="">— Custom name —</option>
              {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={onRename} disabled={busy} style={btn("#3CCBFF")}>Rename</button>
          </div>
          {!selectedTournamentId && (
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="New channel name" style={{ ...inputStyle, marginTop: 8 }} />
          )}
        </div>
      </div>

      {/* Live members — with Mute/Unmute toggle per non-owner */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={labelStyle}>In the channel right now</span>
          <span style={{ fontSize: "0.66rem", color: "#666" }}>Granted users join muted by default — click Unmute to give them mic.</span>
        </div>
        {liveMembers.length === 0 ? (
          <div style={{ fontSize: "0.78rem", color: "#666", padding: "10px 0" }}>Empty — nobody connected.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {liveMembers.map((m) => {
              const isOwner = ownerSet.has(m.discordId);
              const canSpeak = isOwner || speakersSet.has(m.discordId);
              return (
                <div key={m.discordId} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.82rem", padding: "6px 10px", background: "#0a0b0e", borderRadius: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: canSpeak && !m.selfMute ? "#22c55e" : "#ef4444" }} title={canSpeak ? (m.selfMute ? "Self-muted" : "Can speak") : "Muted by admin"} />
                  <span style={{ flex: 1, color: "#e6e7ee" }}>{m.name}</span>
                  {isOwner ? (
                    <span style={{ fontSize: "0.6rem", padding: "2px 6px", borderRadius: 4, background: "rgba(60,203,255,0.15)", color: "#3CCBFF", fontWeight: 800 }}>OWNER</span>
                  ) : canSpeak ? (
                    <button onClick={() => onMute(m.discordId)} disabled={busy} style={btn("#f59e0b")}>Mute</button>
                  ) : (
                    <button onClick={() => onUnmute(m.discordId)} disabled={busy} style={btn("#22c55e")}>Unmute</button>
                  )}
                  {!isOwner && (
                    <button onClick={() => onKick(m.discordId)} disabled={busy} style={btn("#ef4444")} title="Disconnect them from the channel (they can rejoin)">Kick</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {err && <div style={{ marginTop: 10, color: "#ef4444", fontSize: "0.78rem" }}>{err}</div>}
      </div>
    </>
  );
}

/** Decide whether the admin's stored key is the ADMIN_SECRET string or a
 *  Firebase ID token, and put it in the right body field. Same dual-path the
 *  rest of the admin page uses. */
function adminKeyPayload(adminKey: string): { adminKey?: string; authToken?: string } {
  // Firebase ID tokens are JWT-shaped (three base64url segments separated by dots)
  // and much longer than the secret. Heuristic: tokens contain dots and length > 100.
  if (adminKey.includes(".") && adminKey.length > 100) return { authToken: adminKey };
  return { adminKey };
}
