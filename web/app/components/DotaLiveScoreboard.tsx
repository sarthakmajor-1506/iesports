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

      <Side label={team1Name ? `${team1Name} · Radiant` : "Radiant"} score={data.radiant?.score || 0} players={data.radiant?.players || []} accent="#4ade80" />
      <div style={{ height: 8 }} />
      <Side label={team2Name ? `${team2Name} · Dire` : "Dire"} score={data.dire?.score || 0} players={data.dire?.players || []} accent="#f87171" />

      <div style={{ textAlign: "right", fontSize: "0.58rem", color: "#56544e", marginTop: 6 }}>
        league {data.leagueId} · updates every 60s
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
