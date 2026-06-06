"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { LiveMatch, LivePlayer } from "@/lib/dotaLive";

// OBS browser-source overlay: in-game scoreboard + live minimap.
// Transparent — add as a Browser Source at 1920x1080.
// URL: /overlay/scoreboard?tournamentId=..&matchId=..   (or ?dotaMatchId=..)
export default function ScoreboardOverlayPage() {
  return (
    <Suspense fallback={null}>
      <style>{`html,body{background:transparent !important;margin:0;}`}</style>
      <ScoreboardOverlay />
    </Suspense>
  );
}

const MAP_MIN = -8000, MAP_SPAN = 16000;
const projX = (x: number) => Math.max(0, Math.min(100, ((x - MAP_MIN) / MAP_SPAN) * 100));
const projY = (y: number) => Math.max(0, Math.min(100, (1 - (y - MAP_MIN) / MAP_SPAN) * 100));

function ScoreboardOverlay() {
  const sp = useSearchParams();
  const tournamentId = sp.get("tournamentId") || "";
  const matchId = sp.get("matchId") || "";
  const dotaMatchId = sp.get("dotaMatchId") || "";
  const showMap = sp.get("map") !== "0";

  const [data, setData] = useState<(LiveMatch & { meta?: any }) | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const query = tournamentId && matchId
    ? `tournamentId=${encodeURIComponent(tournamentId)}&matchId=${encodeURIComponent(matchId)}`
    : `dotaMatchId=${encodeURIComponent(dotaMatchId)}`;

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/dota/live?${query}`, { cache: "no-store" });
        const j = (await r.json()) as LiveMatch & { meta?: any };
        if (alive) setData(j);
      } catch { /* keep last */ }
    };
    poll();
    timer.current = setInterval(poll, 8000);
    return () => { alive = false; if (timer.current) clearInterval(timer.current); };
  }, [query]);

  if (!data?.found) return <div style={{ position: "fixed", inset: 0 }} />;

  const meta = data.meta;
  const rName = meta?.radiantName || "Radiant";
  const dName = meta?.direName || "Dire";
  const rPlayers = data.radiant?.players || [];
  const dPlayers = data.dire?.players || [];
  const rKills = data.radiant?.score || 0;
  const dKills = data.dire?.score || 0;
  const mins = Math.floor((data.durationSec || 0) / 60);
  const secs = (data.durationSec || 0) % 60;
  const clock = `${mins}:${String(secs).padStart(2, "0")}`;
  const rNW = rPlayers.reduce((s, p) => s + p.netWorth, 0);
  const dNW = dPlayers.reduce((s, p) => s + p.netWorth, 0);
  const lead = rNW - dNW;
  const allDots = [
    ...rPlayers.filter((p) => p.x != null && p.y != null).map((p) => ({ p, c: "#34d399" })),
    ...dPlayers.filter((p) => p.x != null && p.y != null).map((p) => ({ p, c: "#f87171" })),
  ];

  return (
    <div style={{ position: "fixed", inset: 0, fontFamily: "'Inter',system-ui,sans-serif", color: "#fff", pointerEvents: "none" }}>
      {/* top score banner */}
      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "stretch", background: "rgba(10,10,12,0.92)", borderRadius: "0 0 12px 12px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", borderTop: "none" }}>
        <TeamTag name={rName} kills={rKills} accent="#34d399" align="right" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "6px 18px", minWidth: 90, background: "rgba(0,0,0,0.35)" }}>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 1 }}>{clock}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: lead >= 0 ? "#34d399" : "#f87171" }}>
            {lead >= 0 ? rName : dName} +{(Math.abs(lead) / 1000).toFixed(1)}k
          </div>
        </div>
        <TeamTag name={dName} kills={dKills} accent="#f87171" align="left" />
      </div>

      {/* side player panels */}
      <SidePanel players={rPlayers} accent="#34d399" align="left" />
      <SidePanel players={dPlayers} accent="#f87171" align="right" />

      {/* minimap bottom-left */}
      {showMap && (
        <div style={{ position: "absolute", left: 16, bottom: 16, width: 200, height: 200, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)",
          background: "linear-gradient(135deg, rgba(52,211,153,0.14) 0%, rgba(52,211,153,0.04) 22%, rgba(12,12,14,0.95) 45%, rgba(12,12,14,0.95) 55%, rgba(248,113,113,0.04) 78%, rgba(248,113,113,0.14) 100%)" }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(45deg, transparent 47%, rgba(56,140,160,0.25) 49.5%, rgba(56,140,160,0.25) 50.5%, transparent 53%)" }} />
          {allDots.map(({ p, c }, i) => (
            <div key={p.accountId ?? i} title={`${p.name} · ${p.heroName}`} style={{ position: "absolute", left: `${projX(p.x as number)}%`, top: `${projY(p.y as number)}%`, transform: "translate(-50%,-50%)", width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${c}`, background: "#111", overflow: "hidden", boxShadow: `0 0 4px ${c}` }}>
              {p.heroIcon ? <img src={p.heroIcon} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ display: "block", width: "100%", height: "100%", background: c }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamTag({ name, kills, accent, align }: { name: string; kills: number; accent: string; align: "left" | "right" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "6px 16px", textAlign: align, minWidth: 150, borderBottom: `3px solid ${accent}` }}>
      <div style={{ fontSize: 15, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{name}</div>
      <div style={{ fontSize: 11, color: accent, fontWeight: 700 }}>{kills} kills</div>
    </div>
  );
}

function SidePanel({ players, accent, align }: { players: LivePlayer[]; accent: string; align: "left" | "right" }) {
  return (
    <div style={{ position: "absolute", top: 90, [align]: 12, width: 250, display: "flex", flexDirection: "column", gap: 4 } as React.CSSProperties}>
      {players.map((p, i) => (
        <div key={p.accountId ?? i} style={{ display: "flex", flexDirection: align === "right" ? "row-reverse" : "row", alignItems: "center", gap: 8, background: "rgba(10,10,12,0.82)", borderRadius: 6, padding: "4px 8px", borderLeft: align === "left" ? `3px solid ${accent}` : undefined, borderRight: align === "right" ? `3px solid ${accent}` : undefined }}>
          {p.heroIcon ? <img src={p.heroIcon} alt={p.heroName} width={34} height={19} style={{ borderRadius: 3, flexShrink: 0 }} /> : <span style={{ width: 34 }} />}
          <div style={{ flex: 1, minWidth: 0, textAlign: align === "right" ? "right" : "left" }}>
            <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name} <span style={{ color: "#888", fontWeight: 500 }}>L{p.level}</span></div>
            <div style={{ fontSize: 10, color: "#aaa" }}>{p.kills}/{p.deaths}/{p.assists} · {(p.netWorth / 1000).toFixed(1)}k</div>
          </div>
        </div>
      ))}
    </div>
  );
}
