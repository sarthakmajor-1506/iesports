"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface MatchPlayer {
  discordId: string;
  username: string;
  steamName: string | null;
}

interface PlayerStat {
  steamName: string;
  kills: number;
  deaths: number;
  assists: number;
  hero: string;
  heroImage?: string;
}

interface Lobby {
  id: string;
  dotaMatchId: string | null;
  winner: "radiant" | "dire" | null;
  duration: string | null;
  radiant: MatchPlayer[];
  dire: MatchPlayer[];
  playerStats: PlayerStat[] | null;
  completedAt: string | null;
  createdAt: string;
}

const DISCORD_SERVER_URL = "https://discord.gg/52EVZRbA";

const DISCORD_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.001.022.015.04.036.052a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
  </svg>
);

function formatDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }) + " IST"
  );
}

function formatDuration(dur: string | null) {
  if (!dur) return null;
  if (dur.includes(":")) return dur;
  const secs = parseInt(dur);
  if (isNaN(secs)) return dur;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function groupByDate(lobbies: Lobby[]) {
  const groups: Record<string, Lobby[]> = {};
  for (const l of lobbies) {
    const d = new Date(l.completedAt || l.createdAt);
    const key = d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
    if (!groups[key]) groups[key] = [];
    groups[key].push(l);
  }
  return groups;
}

// ── Smart Discord Button ──────────────────────────────────────────────────────
// - Not logged in → open Discord server as guest
// - Logged in, Discord not linked → trigger OAuth flow (/api/auth/discord)
// - Logged in, Discord linked → open the server directly
function DiscordButton() {
  const { user } = useAuth();
  const [discordLinked, setDiscordLinked] = useState(false);
  const [discordUsername, setDiscordUsername] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) { setReady(true); return; }
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setDiscordLinked(!!data.discordId);
        setDiscordUsername(data.discordUsername || "");
      }
      setReady(true);
    });
    return () => unsub();
  }, [user]);

  if (!ready) return null;

  const handleClick = () => {
    if (discordLinked) {
      // Connected → go straight to server
      window.open(DISCORD_SERVER_URL, "_blank");
    } else if (user) {
      // Logged in but Discord not linked → run OAuth
      window.location.href = `/api/auth/discord?uid=${user.uid}`;
    } else {
      // Guest → open server
      window.open(DISCORD_SERVER_URL, "_blank");
    }
  };

  return (
    <button
      onClick={handleClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontSize: 12,
        fontWeight: 700,
        color: "#fff",
        background: "#5865F2",
        borderRadius: 8,
        padding: "7px 16px",
        border: "none",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background 0.15s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#4752C4")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#5865F2")}
    >
      {DISCORD_SVG}
      {discordLinked
        ? discordUsername
          ? `Open Discord`
          : "Open Discord Server"
        : user
        ? "Connect Discord to Join"
        : "Join Discord Server"}
    </button>
  );
}

// ── How It Works ──────────────────────────────────────────────────────────────
function HowItWorks() {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E5E3DF",
        borderRadius: 16,
        padding: "28px 32px",
        marginBottom: 36,
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#F05A28", textTransform: "uppercase", marginBottom: 4 }}>
          How It Works
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#111", letterSpacing: "-0.02em" }}>
          Play every Day
        </div>
        <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
          Daily 10-player lobbies · Auto-tracked results · Zero entry fee
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        {[
          {
            icon: "💬", step: 1, title: "Join the Discord",
            desc: "All matches run through our Discord server.",
            cta: <DiscordButton />,
          },
          {
            icon: "⚔️", step: 2, title: "Join the Queue",
            desc: "Join channel #queue. Once 10 players are in, the match is created automatically.",
            cta: null,
          },
          {
            icon: "🎮", step: 3, title: "Accept the Lobby Invite",
            desc: "The bot creates a Dota 2 lobby and sends a lobby invite to your account. Accept within 5 minutes.",
            cta: null,
          },
          {
            icon: "🏆", step: 4, title: "Play & Win",
            desc: "Results are fetched and winners are announced. Win every day",
            cta: null,
          },
        ].map((s) => (
          <div
            key={s.step}
            style={{
              background: "#F8F7F4",
              borderRadius: 12,
              padding: "18px 20px",
              border: "1px solid #E5E3DF",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#F05A28", background: "#FEE9E0", borderRadius: 20, padding: "2px 8px", letterSpacing: "0.05em" }}>
                STEP {s.step}
              </span>
              <span style={{ fontSize: 20 }}>{s.icon}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{s.title}</div>
            <div style={{ fontSize: 12, color: "#777", lineHeight: 1.6 }}>{s.desc}</div>
            {s.cta && <div style={{ marginTop: 4 }}>{s.cta}</div>}
          </div>
        ))}
      </div>

      {/* Queue reminder */}
      <div style={{
        marginTop: 18, padding: "12px 18px",
        background: "#FEF9F7", border: "1px solid #FDDDD3",
        borderRadius: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 18 }}>⏰</span>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#F05A28" }}>
            Queue opens every day 
          </span>
          <span style={{ fontSize: 12, color: "#999", marginLeft: 8 }}>
            First 10 players in → lobby created → Dota2 lobby invite sent. Be on time.
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DailyMatches() {
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dota2/daily-matches")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setLobbies(data.matches);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 30px 60px" }}>

      {/* Always visible — even when matches exist */}
      <HowItWorks />

      {/* Match History */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#F05A28", textTransform: "uppercase", marginBottom: 2 }}>
            Match History
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#111", letterSpacing: "-0.02em" }}>
            Recent Daily Games
          </div>
        </div>
        {!loading && !error && lobbies.length > 0 && (
          <span style={{ fontSize: 12, color: "#aaa" }}>
            {lobbies.length} match{lobbies.length !== 1 ? "es" : ""} recorded
          </span>
        )}
      </div>

      {loading && (
        <div style={{ background: "#fff", border: "1px solid #E5E3DF", borderRadius: 12, padding: "48px 0", textAlign: "center", color: "#bbb", fontSize: 14 }}>
          Loading matches...
        </div>
      )}

      {error && (
        <div style={{ background: "#fff", border: "1px solid #FECACA", borderRadius: 12, padding: "24px", color: "#EF4444", fontSize: 13 }}>
          Failed to load match history: {error}
        </div>
      )}

      {!loading && !error && lobbies.length === 0 && (
        <div style={{ background: "#fff", border: "1px dashed #E5E3DF", borderRadius: 12, padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎮</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#333" }}>No matches played yet</div>
          <div style={{ fontSize: 13, color: "#aaa", marginTop: 6 }}>
            First match appears here after tonight's queue at 9 PM IST.
          </div>
        </div>
      )}

      {!loading && !error && lobbies.length > 0 && (
        <div>
          {Object.entries(groupByDate(lobbies)).map(([date, matches]) => (
            <div key={date} style={{ marginBottom: 36 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span style={{ color: "#555", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                  {date}
                </span>
                <div style={{ flex: 1, height: 1, background: "#E5E3DF" }} />
                <span style={{ fontSize: 11, color: "#bbb", whiteSpace: "nowrap" }}>
                  {matches.length} match{matches.length !== 1 ? "es" : ""}
                </span>
              </div>
              {matches.map((lobby) => (
                <MatchCard key={lobby.id} lobby={lobby} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Match Card ────────────────────────────────────────────────────────────────
function MatchCard({ lobby }: { lobby: Lobby }) {
  const [expanded, setExpanded] = useState(false);
  const hasMatchId = !!lobby.dotaMatchId;
  const winnerColor = lobby.winner === "radiant" ? "#22c55e" : lobby.winner === "dire" ? "#ef4444" : "#E5E3DF";
  const duration = formatDuration(lobby.duration);

  return (
    <div
      style={{ background: "#fff", border: "1px solid #E5E3DF", borderRadius: 12, marginBottom: 10, overflow: "hidden", transition: "box-shadow 0.15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      <div style={{ display: "flex" }}>
        {/* Winner accent bar */}
        <div style={{ width: 4, background: winnerColor, flexShrink: 0 }} />

        <div style={{ flex: 1 }}>
          {/* Main row */}
          <div
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: hasMatchId ? "pointer" : "default", gap: 16, flexWrap: "wrap" }}
            onClick={hasMatchId ? () => window.open(`https://www.opendota.com/matches/${lobby.dotaMatchId}`, "_blank") : undefined}
          >
            {/* Left */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 150 }}>
              <span style={{ color: "#111", fontWeight: 700, fontSize: 13, fontFamily: "monospace" }}>
                {hasMatchId ? `#${lobby.dotaMatchId}` : `Lobby ${lobby.id.slice(0, 8)}…`}
              </span>
              <span style={{ color: "#aaa", fontSize: 11 }}>
                {lobby.completedAt ? formatDate(lobby.completedAt) : "In progress"}
              </span>
            </div>

            {/* Center */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, justifyContent: "center", flexWrap: "wrap" }}>
              <TeamPills players={lobby.radiant} side="radiant" winner={lobby.winner} />
              <span style={{ color: "#ccc", fontSize: 11, fontWeight: 700, padding: "3px 10px", background: "#F8F7F4", borderRadius: 6, border: "1px solid #E5E3DF" }}>
                VS
              </span>
              <TeamPills players={lobby.dire} side="dire" winner={lobby.winner} />
            </div>

            {/* Right */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, minWidth: 110 }}>
              {lobby.winner && (
                <span style={{ fontSize: 11, fontWeight: 800, color: winnerColor, background: `${winnerColor}18`, padding: "3px 10px", borderRadius: 20, border: `1px solid ${winnerColor}33` }}>
                  {lobby.winner === "radiant" ? "Radiant Win" : "Dire Win"}
                </span>
              )}
              {duration && <span style={{ color: "#aaa", fontSize: 11 }}>⏱ {duration}</span>}
              {hasMatchId && <span style={{ fontSize: 11, color: "#6366f1", textDecoration: "underline", cursor: "pointer" }}>OpenDota ↗</span>}
            </div>
          </div>

          {/* Stats expander */}
          {lobby.playerStats && lobby.playerStats.length > 0 && (
            <>
              <div
                style={{ borderTop: "1px solid #F2F1EE", padding: "7px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#bbb", fontSize: 11, fontWeight: 600, userSelect: "none" }}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "▲ Hide player stats" : "▼ Show player stats"}
              </div>
              {expanded && <PlayerStatsTable stats={lobby.playerStats} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamPills({ players, side, winner }: { players: MatchPlayer[]; side: "radiant" | "dire"; winner: string | null }) {
  const isWinner = winner === side;
  const color = side === "radiant" ? "#22c55e" : "#ef4444";
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 220, justifyContent: side === "radiant" ? "flex-end" : "flex-start" }}>
      {players.length === 0
        ? <span style={{ color: "#ccc", fontSize: 11 }}>—</span>
        : players.map((p, i) => (
          <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, fontWeight: isWinner ? 700 : 500, background: isWinner ? `${color}15` : "#F8F7F4", color: isWinner ? color : "#666", border: `1px solid ${isWinner ? `${color}33` : "#E5E3DF"}` }}>
            {p.steamName || p.username}
          </span>
        ))
      }
    </div>
  );
}

function PlayerStatsTable({ stats }: { stats: PlayerStat[] }) {
  return (
    <div style={{ padding: "0 20px 16px", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ color: "#aaa", textAlign: "left", borderBottom: "1px solid #F2F1EE", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <th style={{ padding: "6px 8px" }}>Player</th>
            <th style={{ padding: "6px 8px" }}>Hero</th>
            <th style={{ padding: "6px 8px", textAlign: "center" }}>K</th>
            <th style={{ padding: "6px 8px", textAlign: "center" }}>D</th>
            <th style={{ padding: "6px 8px", textAlign: "center" }}>A</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #F8F7F4" }}>
              <td style={{ padding: "7px 8px", color: "#333", fontWeight: 600 }}>{s.steamName}</td>
              <td style={{ padding: "7px 8px", color: "#888" }}>{s.hero || "—"}</td>
              <td style={{ padding: "7px 8px", textAlign: "center", color: "#22c55e", fontWeight: 700 }}>{s.kills}</td>
              <td style={{ padding: "7px 8px", textAlign: "center", color: "#ef4444", fontWeight: 700 }}>{s.deaths}</td>
              <td style={{ padding: "7px 8px", textAlign: "center", color: "#f59e0b", fontWeight: 700 }}>{s.assists}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}