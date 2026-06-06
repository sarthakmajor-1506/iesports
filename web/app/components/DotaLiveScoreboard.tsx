"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveMatch, LivePlayer } from "@/lib/dotaLive";

// Live scoreboard for a league-tagged Dota match. Polls /api/dota/live every
// 60s while the match is live and renders the per-side scoreboard. Shows nothing
// until the match appears in the live league feed (i.e. the game has started).
export default function DotaLiveScoreboard({
  dotaMatchId, team1Name, team2Name,
}: { dotaMatchId: string; team1Name?: string; team2Name?: string }) {
  const [data, setData] = useState<LiveMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/dota/live?dotaMatchId=${dotaMatchId}`, { cache: "no-store" });
        const j = (await r.json()) as LiveMatch;
        if (alive) setData(j);
      } catch { /* keep last */ }
      finally { if (alive) setLoading(false); }
    };
    poll();
    timer.current = setInterval(poll, 60_000);
    return () => { alive = false; if (timer.current) clearInterval(timer.current); };
  }, [dotaMatchId]);

  if (loading && !data) return <div style={wrap}><div style={head}>⏳ Loading live match…</div></div>;
  if (!data?.found) {
    return (
      <div style={wrap}>
        <div style={head}>🔴 LIVE</div>
        <div style={{ color: "#8A8880", fontSize: "0.72rem", padding: "8px 2px" }}>
          Waiting for the game to start in the live feed… (league matches appear ~1–2 min after the horn, with a {Math.round((data?.streamDelaySec || 120) / 60)}-min broadcast delay)
        </div>
      </div>
    );
  }

  const mins = Math.floor((data.durationSec || 0) / 60);
  const secs = (data.durationSec || 0) % 60;
  const clock = `${mins}:${String(secs).padStart(2, "0")}`;
  const radNW = (data.radiant?.players || []).reduce((s, p) => s + p.netWorth, 0);
  const dirNW = (data.dire?.players || []).reduce((s, p) => s + p.netWorth, 0);
  const lead = radNW - dirNW;

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={head}>🔴 LIVE · {clock}</span>
        <span style={{ fontSize: "0.66rem", color: lead >= 0 ? "#4ade80" : "#f87171" }}>
          {lead >= 0 ? "Radiant" : "Dire"} +{Math.abs(lead).toLocaleString()} net worth
        </span>
      </div>

      <LiveMinimap
        radiant={data.radiant?.players || []}
        dire={data.dire?.players || []}
        roshanSec={data.roshanRespawnSec || 0}
      />

      <Side label={team1Name ? `${team1Name} · Radiant` : "Radiant"} score={data.radiant?.score || 0} players={data.radiant?.players || []} accent="#4ade80" />
      <div style={{ height: 8 }} />
      <Side label={team2Name ? `${team2Name} · Dire` : "Dire"} score={data.dire?.score || 0} players={data.dire?.players || []} accent="#f87171" />

      <div style={{ textAlign: "right", fontSize: "0.58rem", color: "#56544e", marginTop: 6 }}>
        league {data.leagueId} · updates every 60s
      </div>
    </div>
  );
}

// Project Dota world coords (~ -8000..8000, Radiant bottom-left, Dire top-right)
// onto a 0..100% minimap. y is inverted for screen space (top = 0).
const MAP_MIN = -8000, MAP_SPAN = 16000;
const projX = (x: number) => Math.max(0, Math.min(100, ((x - MAP_MIN) / MAP_SPAN) * 100));
const projY = (y: number) => Math.max(0, Math.min(100, (1 - (y - MAP_MIN) / MAP_SPAN) * 100));

function LiveMinimap({ radiant, dire, roshanSec }: { radiant: LivePlayer[]; dire: LivePlayer[]; roshanSec: number }) {
  const dots: { p: LivePlayer; color: string }[] = [
    ...radiant.filter((p) => p.x != null && p.y != null).map((p) => ({ p, color: "#4ade80" })),
    ...dire.filter((p) => p.x != null && p.y != null).map((p) => ({ p, color: "#f87171" })),
  ];
  return (
    <div style={{ margin: "2px 0 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: "0.58rem", color: "#56544e", textTransform: "uppercase", letterSpacing: 0.5 }}>Live map</span>
        {roshanSec > 0 && <span style={{ fontSize: "0.6rem", color: "#fbbf24" }}>🛡 Roshan {Math.floor(roshanSec / 60)}:{String(roshanSec % 60).padStart(2, "0")}</span>}
      </div>
      <div style={{
        position: "relative", width: "100%", maxWidth: 240, aspectRatio: "1 / 1", margin: "0 auto",
        borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)",
        // stylized Dota board: Radiant base bottom-left (green), Dire top-right (red), river diagonal
        background:
          "linear-gradient(135deg, rgba(74,222,128,0.14) 0%, rgba(74,222,128,0.04) 22%, rgba(20,20,18,1) 45%, rgba(20,20,18,1) 55%, rgba(248,113,113,0.04) 78%, rgba(248,113,113,0.14) 100%)",
      }}>
        {/* river diagonal hint */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(45deg, transparent 47%, rgba(56,140,160,0.25) 49.5%, rgba(56,140,160,0.25) 50.5%, transparent 53%)" }} />
        {/* base markers */}
        <span style={{ position: "absolute", left: "8%", bottom: "8%", fontSize: 9, color: "#4ade80" }}>◆</span>
        <span style={{ position: "absolute", right: "8%", top: "8%", fontSize: 9, color: "#f87171" }}>◆</span>
        {dots.map(({ p, color }, i) => (
          <div key={p.accountId ?? i} title={`${p.name} · ${p.heroName}`} style={{
            position: "absolute", left: `${projX(p.x as number)}%`, top: `${projY(p.y as number)}%`,
            transform: "translate(-50%, -50%)", width: 16, height: 16, borderRadius: "50%",
            border: `1.5px solid ${color}`, background: "#111", overflow: "hidden", boxShadow: `0 0 4px ${color}`,
          }}>
            {p.heroIcon
              ? <img src={p.heroIcon} alt={p.heroName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ display: "block", width: "100%", height: "100%", background: color }} />}
          </div>
        ))}
        {dots.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", color: "#56544e" }}>
            heroes not on map yet
          </div>
        )}
      </div>
    </div>
  );
}

function Side({ label, score, players, accent }: { label: string; score: number; players: LivePlayer[]; accent: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", fontWeight: 700, color: accent, marginBottom: 4 }}>
        <span>{label}</span><span>{score} kills</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "2px 10px", fontSize: "0.68rem" }}>
        <div style={th}>Player</div><div style={th}>K/D/A</div><div style={th}>LH</div><div style={th}>Net</div>
        {players.map((p, i) => (
          <PlayerRow key={p.accountId ?? i} p={p} />
        ))}
      </div>
    </div>
  );
}

function PlayerRow({ p }: { p: LivePlayer }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {p.heroIcon ? <img src={p.heroIcon} alt={p.heroName} width={22} height={12} style={{ borderRadius: 2, flexShrink: 0 }} /> : <span style={{ width: 22 }} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#E8E6E0" }}>
          {p.name} <span style={{ color: "#8A8880" }}>· {p.heroName} · L{p.level}</span>
        </span>
      </div>
      <div style={{ color: "#E8E6E0" }}>{p.kills}/{p.deaths}/{p.assists}</div>
      <div style={{ color: "#8A8880" }}>{p.lastHits}</div>
      <div style={{ color: "#fbbf24" }}>{(p.netWorth / 1000).toFixed(1)}k</div>
    </>
  );
}

const wrap: React.CSSProperties = { background: "rgba(20,20,18,0.6)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, padding: "12px 14px", margin: "10px 0" };
const head: React.CSSProperties = { fontSize: "0.74rem", fontWeight: 800, color: "#f87171", letterSpacing: 0.4 };
const th: React.CSSProperties = { fontSize: "0.58rem", color: "#56544e", textTransform: "uppercase", letterSpacing: 0.5 };
