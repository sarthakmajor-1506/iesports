"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import {
  ArrowLeft, Trophy, Flame, TrendingUp, TrendingDown, Target, Crosshair,
  Shield, Swords, Zap, Brain, Map as MapIcon, Calendar, Users,
  CircleDot, Sparkles, BarChart3, AlertTriangle, ThumbsUp, Activity,
} from "lucide-react";

type AnalyticsResponse = {
  tournament: { id: string; name: string; format?: string; currentMatchDay?: number };
  analytics: any;
  teamLogos?: Record<string, string>;
};

const C = {
  bg: "#0A0F2A",
  card: "rgba(18,18,21,0.78)",
  border: "rgba(255,255,255,0.07)",
  borderHi: "rgba(60,203,255,0.35)",
  accent: "#3CCBFF",
  accentSoft: "rgba(60,203,255,0.12)",
  win: "#6fcf8a",
  winSoft: "rgba(111,207,138,0.14)",
  loss: "#d07070",
  lossSoft: "rgba(208,112,112,0.14)",
  draw: "#c2a85e",
  drawSoft: "rgba(194,168,94,0.14)",
  amber: "#f59e0b",
  amberSoft: "rgba(245,158,11,0.14)",
  text: "#E6E6E6",
  text2: "#9a9a9f",
  text3: "#5a5a60",
};

const AGENT_UUIDS: Record<string, string> = {
  "Jett": "add6443a-41bd-e414-f6ad-e58d267f4e95", "Reyna": "a3bfb853-43b2-7238-a4f1-ad90e9e46bcc",
  "Omen": "8e253930-4c05-31dd-1b6c-968525494517", "Sage": "569fdd95-4d10-43ab-ca70-79becc718b46",
  "Sova": "320b2a48-4d9b-a075-30f1-1f93a9b638fa", "Killjoy": "1e58de9c-4950-5125-93e9-a0aee9f98746",
  "Cypher": "117ed9e3-49f3-6571-8249-2e838fd94a9b", "Raze": "f94c3b30-42be-e959-889c-5aa313dba261",
  "Breach": "5f8d3a7f-467b-97f3-062c-13acf203c006", "Viper": "707eab51-4836-f488-046a-cda6bf494859",
  "Phoenix": "eb93336a-449b-9c1b-0a54-a891f7921d69", "Brimstone": "9f0d8ba9-4140-b941-57d3-a7ad57c6b417",
  "Astra": "41fb69c1-4189-7b37-f117-bcaf1e96f1bf", "Chamber": "22697a3d-45bf-8dd7-4fec-84a9e28c69d7",
  "Fade": "dede67cb-4b97-53ac-b619-36b312847d61", "Gekko": "e370fa57-4757-3604-3648-499e1f642d3f",
  "Neon": "bb2a4828-46eb-8cd1-e765-15848195d751", "Skye": "6f2a04ca-43e0-be17-7f36-b3908627744d",
  "Yoru": "7f94d92c-4234-0a36-9646-3a87eb8b5c89", "Harbor": "95b78ed7-4637-86d9-7e41-71ba8c293152",
  "Deadlock": "cc8b64c8-4b25-4ff3-6e48-d3b4a90eb341", "Iso": "0e38b510-41a8-5780-5e8f-568b2a4f2d6c",
  "Clove": "1dbf2edd-4729-0984-3115-daa5eed44993", "Vyse": "efba5359-4016-a1e5-7626-b1ae76895940",
  "Tejo": "d3ae4f48-4e4b-c72d-3f41-049c3c411b5f", "Waylay": "a929af56-4e36-258a-6da0-049ade310e1b",
  "KAY/O": "601dbbe7-43ce-be57-2a40-4abd24953621", "KAYO": "601dbbe7-43ce-be57-2a40-4abd24953621",
};
const agentIcon = (n?: string) => {
  if (!n) return null;
  const uuid = AGENT_UUIDS[n] || AGENT_UUIDS[n.replace("/", "")];
  return uuid ? `https://media.valorant-api.com/agents/${uuid}/displayicon.png` : null;
};

function getInitials(name: string): string {
  if (!name || name === "TBD") return "?";
  const cleaned = name
    .replace(/\[.*?\]\s*/, "")
    .replace(/^[^A-Za-z0-9]+/, "")
    .split(/\s+/)
    .map(w => w.replace(/^[^A-Za-z0-9]+/, "")[0])
    .filter(Boolean)
    .join("");
  return (cleaned || name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3) || "?").toUpperCase().slice(0, 3);
}

function fmtDateTime(iso?: string): string {
  if (!iso) return "TBD";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" }) + ", " +
      d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch { return iso; }
}

function ResultPill({ r, size = 22 }: { r: "W" | "L" | "D"; size?: number }) {
  const bg = r === "W" ? C.winSoft : r === "L" ? C.lossSoft : C.drawSoft;
  const col = r === "W" ? C.win : r === "L" ? C.loss : C.draw;
  const label = r === "W" ? "Win" : r === "L" ? "Loss" : "Draw";
  return (
    <div role="img" aria-label={label} style={{
      width: size, height: size, borderRadius: 6, background: bg, color: col,
      fontWeight: 900, fontSize: size * 0.5, display: "flex", alignItems: "center", justifyContent: "center",
      border: `1px solid ${col}55`,
    }}>{r}</div>
  );
}

function TeamLogo({ src, name, size = 64 }: { src?: string; name: string; size?: number }) {
  if (src) return (
    <div style={{ width: size, height: size, borderRadius: 14, overflow: "hidden", background: "#1a1a22", border: `1px solid ${C.border}`, flexShrink: 0 }}>
      <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
  return (
    <div style={{
      width: size, height: size, borderRadius: 14, background: `linear-gradient(135deg, ${C.accentSoft} 0%, rgba(20,20,32,0.9) 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center", color: C.accent, fontWeight: 900, fontSize: size * 0.32,
      border: `1px solid ${C.borderHi}`, flexShrink: 0,
    }}>{getInitials(name)}</div>
  );
}

function StatCard({ label, value, sub, accent = C.accent, icon }: { label: string; value: string | number; sub?: string; accent?: string; icon?: React.ReactNode }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "18px 20px",
      display: "flex", flexDirection: "column", gap: 6, position: "relative", overflow: "hidden",
      backdropFilter: "blur(10px)",
    }}>
      <div style={{ position: "absolute", top: 14, right: 14, color: accent, opacity: 0.6 }}>{icon}</div>
      <div style={{ fontSize: "0.66rem", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: C.text3 }}>{label}</div>
      <div style={{ fontSize: "1.7rem", fontWeight: 900, color: C.text, lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontSize: "0.78rem", color: C.text2 }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9, background: C.accentSoft, color: C.accent,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{icon}</div>
      <h2 style={{ fontSize: "1.35rem", fontWeight: 900, margin: 0, color: C.text, letterSpacing: "-0.01em" }}>{title}</h2>
      {subtitle && <span style={{ fontSize: "0.85rem", color: C.text2, marginLeft: "auto" }}>{subtitle}</span>}
    </div>
  );
}

function MiniBar({ value, max, color, height = 6 }: { value: number; max: number; color: string; height?: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div style={{ height, width: "100%", background: "rgba(255,255,255,0.04)", borderRadius: height, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: height, transition: "width 0.6s ease-out" }} />
    </div>
  );
}

function RoundDiffBar({ won, lost }: { won: number; lost: number }) {
  const total = Math.max(won + lost, 1);
  const wPct = (won / total) * 100;
  return (
    <div style={{ display: "flex", height: 8, borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,0.05)" }}>
      <div style={{ width: `${wPct}%`, background: C.win }} />
      <div style={{ width: `${100 - wPct}%`, background: C.loss }} />
    </div>
  );
}

function Sparkline({ values, color = C.accent, height = 32 }: { values: number[]; color?: string; height?: number }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const W = 100;
  const points = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * W;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => {
        const x = (i / Math.max(values.length - 1, 1)) * W;
        const y = height - ((v - min) / range) * (height - 4) - 2;
        return <circle key={i} cx={x} cy={y} r={1.6} fill={color} />;
      })}
    </svg>
  );
}

function InsightCard({ insight, index }: { insight: any; index: number }) {
  const colorMap: Record<string, { bg: string; border: string; icon: string; iconBg: string; ele: React.ReactNode }> = {
    strength: { bg: C.winSoft, border: C.win, icon: C.win, iconBg: "rgba(111,207,138,0.16)", ele: <ThumbsUp size={16} /> },
    weakness: { bg: C.lossSoft, border: C.loss, icon: C.loss, iconBg: "rgba(208,112,112,0.16)", ele: <AlertTriangle size={16} /> },
    trend: { bg: C.amberSoft, border: C.amber, icon: C.amber, iconBg: "rgba(245,158,11,0.16)", ele: <TrendingUp size={16} /> },
    neutral: { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.18)", icon: C.text2, iconBg: "rgba(255,255,255,0.08)", ele: <CircleDot size={16} /> },
  };
  const m = colorMap[insight.kind] || colorMap.neutral;
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${m.border}`,
      borderRadius: 14, padding: "16px 18px", display: "flex", gap: 12,
      animation: `vtdFadeUp 0.4s ease-out ${index * 0.05}s both`, backdropFilter: "blur(10px)",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: m.iconBg, color: m.icon,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2,
      }}>{m.ele}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.95rem", fontWeight: 800, color: C.text, marginBottom: 4, lineHeight: 1.3 }}>{insight.headline}</div>
        <div style={{ fontSize: "0.82rem", color: C.text2, lineHeight: 1.5 }}>{insight.detail}</div>
      </div>
    </div>
  );
}

function PlayerCard({ p, index }: { p: any; index: number }) {
  const acsColor = p.acs >= 220 ? C.win : p.acs >= 170 ? C.amber : C.text2;
  const kdColor = p.kd >= 1.2 ? C.win : p.kd >= 0.9 ? C.text : C.loss;
  const isSub = p.isCoreSquad === false;
  return (
    <div style={{
      background: C.card, border: `1px solid ${isSub ? "rgba(255,255,255,0.04)" : C.border}`, borderRadius: 16, padding: 18,
      display: "flex", flexDirection: "column", gap: 14, animation: `vtdFadeUp 0.4s ease-out ${index * 0.06}s both`,
      backdropFilter: "blur(10px)", opacity: isSub ? 0.78 : 1, position: "relative",
    }}>
      {isSub && (
        <span style={{
          position: "absolute", top: 12, right: 12,
          fontSize: "0.56rem", fontWeight: 900, letterSpacing: "0.12em", padding: "2px 7px", borderRadius: 5,
          background: "rgba(255,255,255,0.06)", color: C.text3, border: `1px solid ${C.border}`,
        }}>SUB</span>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {p.riotAvatar ? (
          <img src={p.riotAvatar} alt={p.name} style={{ width: 54, height: 54, borderRadius: 12, border: `1px solid ${C.border}`, objectFit: "cover" }} />
        ) : (
          <div style={{ width: 54, height: 54, borderRadius: 12, background: C.accentSoft, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>
            {(p.name || "?").slice(0, 2).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: "1.05rem", fontWeight: 800, color: C.text }}>{p.name}</span>
            <span style={{ fontSize: "0.75rem", color: C.text3 }}>#{p.tag}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            {p.riotRank && <span style={{ fontSize: "0.72rem", color: C.text2 }}>{p.riotRank}</span>}
            {p.topAgent && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.72rem", color: C.text2 }}>
                {agentIcon(p.topAgent) && <img src={agentIcon(p.topAgent)!} alt={p.topAgent} style={{ width: 16, height: 16, borderRadius: 3 }} />}
                {p.topAgent}
              </span>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <div>
          <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.text3 }}>ACS</div>
          <div style={{ fontSize: "1.05rem", fontWeight: 900, color: acsColor }}>{p.acs}</div>
        </div>
        <div>
          <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.text3 }}>K/D</div>
          <div style={{ fontSize: "1.05rem", fontWeight: 900, color: kdColor }}>{p.kd}</div>
        </div>
        <div>
          <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.text3 }}>HS%</div>
          <div style={{ fontSize: "1.05rem", fontWeight: 900, color: C.text }}>{p.headshotPct}%</div>
        </div>
        <div>
          <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.text3 }}>1st-K</div>
          <div style={{ fontSize: "1.05rem", fontWeight: 900, color: C.text }}>{p.firstKillRate}%</div>
        </div>
      </div>
      <div style={{ fontSize: "0.7rem", color: C.text3, display: "flex", justifyContent: "space-between" }}>
        <span>{p.kdaSum} K/D/A</span>
        <span>{p.gamesPlayed} maps</span>
        <span>{p.damagePerRound} DMG/rnd</span>
      </div>
      {p.acsByGame?.length >= 3 && (
        <div>
          <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.text3, marginBottom: 4 }}>ACS BY MAP</div>
          <Sparkline values={p.acsByGame} color={acsColor} height={26} />
        </div>
      )}
    </div>
  );
}

function MapPerformanceCard({ m, isBest, isWorst }: { m: any; isBest: boolean; isWorst: boolean }) {
  const accent = isBest ? C.win : isWorst ? C.loss : C.text2;
  const winPct = m.played > 0 ? Math.round((m.wins / m.played) * 100) : 0;
  return (
    <div style={{
      background: C.card, border: `1px solid ${isBest ? C.win + "55" : isWorst ? C.loss + "55" : C.border}`, borderRadius: 14, padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 12, position: "relative",
    }}>
      {isBest && <div style={{ position: "absolute", top: -10, right: 14, background: C.win, color: "#082014", fontSize: "0.62rem", fontWeight: 900, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.06em" }}>BEST</div>}
      {isWorst && <div style={{ position: "absolute", top: -10, right: 14, background: C.loss, color: "#220a0a", fontSize: "0.62rem", fontWeight: 900, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.06em" }}>FOCUS</div>}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: "1.05rem", fontWeight: 900, color: C.text }}>{m.map}</div>
        <div style={{ fontSize: "0.78rem", color: C.text2 }}>{m.wins}W {m.losses}L</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: "1.4rem", fontWeight: 900, color: accent }}>{winPct}%</div>
        <div style={{ flex: 1 }}>
          <RoundDiffBar won={m.roundsWon} lost={m.roundsLost} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: C.text3, marginTop: 4 }}>
            <span>{m.roundsWon} won</span>
            <span style={{ color: m.roundDiff > 0 ? C.win : m.roundDiff < 0 ? C.loss : C.text2 }}>
              {m.roundDiff > 0 ? "+" : ""}{m.roundDiff} diff
            </span>
            <span>{m.roundsLost} lost</span>
          </div>
        </div>
      </div>
      {(m.attackRoundsWon + m.attackRoundsLost > 0 || m.defenseRoundsWon + m.defenseRoundsLost > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
          <div>
            <div style={{ fontSize: "0.6rem", fontWeight: 800, color: C.text3, letterSpacing: "0.1em", textTransform: "uppercase" }}>1st Half</div>
            <div style={{ fontSize: "0.9rem", color: C.text }}>
              {m.attackRoundsWon}-{m.attackRoundsLost}
              {(m.attackRoundsWon + m.attackRoundsLost) > 0 && (
                <span style={{ marginLeft: 6, fontSize: "0.72rem", color: m.attackRoundsWon > m.attackRoundsLost ? C.win : C.loss }}>
                  ({Math.round((m.attackRoundsWon / (m.attackRoundsWon + m.attackRoundsLost)) * 100)}%)
                </span>
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.6rem", fontWeight: 800, color: C.text3, letterSpacing: "0.1em", textTransform: "uppercase" }}>2nd Half</div>
            <div style={{ fontSize: "0.9rem", color: C.text }}>
              {m.defenseRoundsWon}-{m.defenseRoundsLost}
              {(m.defenseRoundsWon + m.defenseRoundsLost) > 0 && (
                <span style={{ marginLeft: 6, fontSize: "0.72rem", color: m.defenseRoundsWon > m.defenseRoundsLost ? C.win : C.loss }}>
                  ({Math.round((m.defenseRoundsWon / (m.defenseRoundsWon + m.defenseRoundsLost)) * 100)}%)
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UpcomingMatchPanel({ upcoming, myTeam, myForm, oppForm }: any) {
  if (!upcoming) return null;
  return (
    <div style={{
      background: `linear-gradient(135deg, rgba(60,203,255,0.10) 0%, rgba(20,20,40,0.9) 60%, rgba(245,158,11,0.06) 100%)`,
      border: `1px solid ${C.borderHi}`, borderRadius: 22, padding: "26px 28px", marginBottom: 28,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at top left, rgba(60,203,255,0.18), transparent 60%), radial-gradient(circle at bottom right, rgba(245,158,11,0.10), transparent 50%)", pointerEvents: "none" }} />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <Calendar size={18} color={C.accent} />
          <span style={{ fontSize: "0.72rem", fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", color: C.accent }}>Upcoming Match</span>
          {upcoming.scheduledTime && <span style={{ fontSize: "0.82rem", color: C.text2, marginLeft: "auto" }}>{fmtDateTime(upcoming.scheduledTime)}</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 24, alignItems: "center", marginBottom: 24 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14 }}>
              <div>
                <div style={{ fontSize: "1.2rem", fontWeight: 900, color: C.text }}>{myTeam.name}</div>
                <div style={{ fontSize: "0.7rem", color: C.text2, marginTop: 2 }}>Your team</div>
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 6 }}>
                  {myForm.slice(0, 5).reverse().map((r: any, i: number) => <ResultPill key={i} r={r} size={18} />)}
                </div>
              </div>
              <TeamLogo src={myTeam.logo} name={myTeam.name} size={70} />
            </div>
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 900, color: C.text3, letterSpacing: "0.2em" }}>VS</div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <TeamLogo src={upcoming.opponent.logo} name={upcoming.opponent.teamName} size={70} />
              <div>
                <div style={{ fontSize: "1.2rem", fontWeight: 900, color: C.text }}>{upcoming.opponent.teamName}</div>
                <div style={{ fontSize: "0.7rem", color: C.text2, marginTop: 2 }}>Opponent</div>
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  {oppForm.slice(0, 5).reverse().map((r: any, i: number) => <ResultPill key={i} r={r} size={18} />)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {(upcoming.tactical?.length > 0 || upcoming.mapPicks?.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {upcoming.tactical?.length > 0 && (
              <div style={{ background: "rgba(0,0,0,0.28)", border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: C.accent, marginBottom: 10 }}>Tactical Briefing</div>
                {upcoming.tactical.map((t: any, i: number) => (
                  <div key={i} style={{ marginBottom: i < upcoming.tactical.length - 1 ? 12 : 0 }}>
                    <div style={{ fontSize: "0.86rem", fontWeight: 800, color: C.text, marginBottom: 3 }}>{t.headline}</div>
                    <div style={{ fontSize: "0.76rem", color: C.text2, lineHeight: 1.45 }}>{t.detail}</div>
                  </div>
                ))}
              </div>
            )}
            {upcoming.mapPicks?.length > 0 && (
              <div style={{ background: "rgba(0,0,0,0.28)", border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: C.accent, marginBottom: 10 }}>Map Veto Plan</div>
                {upcoming.mapPicks.map((mp: any, i: number) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < upcoming.mapPicks.length - 1 ? 10 : 0, alignItems: "flex-start" }}>
                    <span style={{
                      flexShrink: 0, fontSize: "0.62rem", fontWeight: 900, padding: "3px 8px", borderRadius: 5, letterSpacing: "0.08em",
                      background: mp.recommendation === "pick" ? C.winSoft : mp.recommendation === "ban" ? C.lossSoft : "rgba(255,255,255,0.06)",
                      color: mp.recommendation === "pick" ? C.win : mp.recommendation === "ban" ? C.loss : C.text2,
                      border: `1px solid ${mp.recommendation === "pick" ? C.win + "55" : mp.recommendation === "ban" ? C.loss + "55" : C.border}`,
                      textTransform: "uppercase", minWidth: 36, textAlign: "center",
                    }}>{mp.recommendation}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.84rem", fontWeight: 800, color: C.text }}>{mp.map}</div>
                      <div style={{ fontSize: "0.74rem", color: C.text2 }}>{mp.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(upcoming.keyMatchups?.length > 0 || upcoming.oppStrengths?.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 14 }}>
            {upcoming.keyMatchups?.length > 0 && (
              <div style={{ background: "rgba(0,0,0,0.28)", border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: C.accent, marginBottom: 10 }}>Key Match-ups</div>
                {upcoming.keyMatchups.map((k: any, i: number) => (
                  <div key={i} style={{ marginBottom: i < upcoming.keyMatchups.length - 1 ? 10 : 0 }}>
                    <div style={{ fontSize: "0.83rem", fontWeight: 800, color: C.text, marginBottom: 2 }}>{k.description}</div>
                    <div style={{ fontSize: "0.74rem", color: C.text2, lineHeight: 1.4 }}>{k.data}</div>
                  </div>
                ))}
              </div>
            )}
            {(upcoming.oppStrengths?.length > 0 || upcoming.oppWeaknesses?.length > 0) && (
              <div style={{ background: "rgba(0,0,0,0.28)", border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: C.accent, marginBottom: 10 }}>Opponent Scout</div>
                {upcoming.oppStrengths?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: "0.68rem", color: C.loss, marginBottom: 4, fontWeight: 800 }}>WATCH FOR</div>
                    {upcoming.oppStrengths.map((s: string, i: number) => (
                      <div key={i} style={{ fontSize: "0.78rem", color: C.text, marginBottom: 3, display: "flex", alignItems: "flex-start", gap: 6 }}>
                        <span style={{ color: C.loss, marginTop: 2, flexShrink: 0 }}>▸</span><span>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
                {upcoming.oppWeaknesses?.length > 0 && (
                  <div>
                    <div style={{ fontSize: "0.68rem", color: C.win, marginBottom: 4, fontWeight: 800 }}>EXPLOIT</div>
                    {upcoming.oppWeaknesses.map((s: string, i: number) => (
                      <div key={i} style={{ fontSize: "0.78rem", color: C.text, marginBottom: 3, display: "flex", alignItems: "flex-start", gap: 6 }}>
                        <span style={{ color: C.win, marginTop: 2, flexShrink: 0 }}>▸</span><span>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchHistoryRow({ h, teamLogos }: { h: any; teamLogos: Record<string, string> }) {
  const color = h.result === "W" ? C.win : h.result === "L" ? C.loss : C.draw;
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderLeft: `4px solid ${color}`,
      borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 14,
    }}>
      <ResultPill r={h.result} size={26} />
      <TeamLogo src={teamLogos[h.opponentId]} name={h.opponentName} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.92rem", fontWeight: 800, color: C.text }}>{h.opponentName}</div>
        <div style={{ fontSize: "0.72rem", color: C.text2 }}>
          {h.completedAt ? fmtDateTime(h.completedAt) : h.scheduledTime ? fmtDateTime(h.scheduledTime) : "Day " + (h.matchDay || "?")}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: "1.15rem", fontWeight: 900, color, fontFamily: "monospace" }}>{h.myScore}<span style={{ color: C.text3, margin: "0 4px" }}>:</span>{h.oppScore}</div>
        <div style={{ fontSize: "0.7rem", color: C.text3, display: "flex", gap: 6, justifyContent: "flex-end" }}>
          {h.games.filter((g: any) => g.map).map((g: any, i: number) => (
            <span key={i} style={{ color: g.result === "W" ? C.win : g.result === "L" ? C.loss : C.text2 }}>
              {g.map} {g.roundsWon}-{g.roundsLost}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TeamDetailPage() {
  const params = useParams() as { id: string; teamId: string };
  const router = useRouter();
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/valorant/team-analytics?tournamentId=${encodeURIComponent(params.id)}&teamId=${encodeURIComponent(params.teamId)}`)
      .then(r => r.json())
      .then(j => { if (!cancel) { if (j.error) setErr(j.error); else setData(j); } })
      .catch(e => { if (!cancel) setErr(String(e?.message || e)); });
    return () => { cancel = true; };
  }, [params.id, params.teamId]);

  const teamLogoMap = useMemo(() => {
    const m: Record<string, string> = { ...(data?.teamLogos || {}) };
    if (!data) return m;
    if (data.analytics.team.logo) m[data.analytics.team.id] = data.analytics.team.logo;
    if (data.analytics.upcomingMatch?.opponent?.logo) m[data.analytics.upcomingMatch.opponent.teamId] = data.analytics.upcomingMatch.opponent.logo;
    return m;
  }, [data]);

  if (err) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
        <Navbar />
        <div style={{ maxWidth: 720, margin: "120px auto", padding: 28, textAlign: "center" }}>
          <div style={{ fontSize: "1.3rem", fontWeight: 900, marginBottom: 8 }}>Could not load team</div>
          <div style={{ color: C.text2 }}>{err}</div>
          <Link href={`/valorant/tournament/${params.id}`} style={{ color: C.accent, marginTop: 18, display: "inline-block" }}>Back to tournament</Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
        <Navbar />
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ height: 220, background: C.card, borderRadius: 22, marginBottom: 28, animation: "vtdPulse 1.4s ease-in-out infinite" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            {[1,2,3,4,5,6].map(i => <div key={i} style={{ height: 110, background: C.card, borderRadius: 16, animation: "vtdPulse 1.4s ease-in-out infinite" }} />)}
          </div>
        </div>
        <style>{`@keyframes vtdPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 0.85; } }`}</style>
      </div>
    );
  }

  const a = data.analytics;
  const t = a.team;
  const s = a.standing || {};
  const formRecent = a.form.recent || [];
  const streak = a.form.streak;
  const insights = a.insights || [];
  const players = a.players || [];
  const mapStats = a.mapStats || [];
  const sideStats = a.sideStats || { attack: {}, defense: {} };
  const rounds = a.rounds || { pistol: {}, halves: { firstHalf: {}, secondHalf: {} } };
  const od = a.openingDuels || {};
  const history = a.matchHistory || [];
  const upcoming = a.upcomingMatch;

  const ranked = a.rank ? `Rank #${a.rank} of ${a.totalTeams || ""}`.trim() : null;
  const matchWinPct = s.played ? Math.round(((s.wins + 0.5 * (s.draws || 0)) / s.played) * 100) : 0;
  const roundDiff = (s.roundsWon || 0) - (s.roundsLost || 0);
  const mapsWithData = mapStats.filter((mm: any) => mm.played >= 1);
  const bestMap = mapsWithData.length
    ? [...mapsWithData].sort((x, y) => (y.wins - y.losses) - (x.wins - x.losses) || y.roundDiff - x.roundDiff)[0]
    : null;
  const worstMap = mapsWithData.length
    ? [...mapsWithData].sort((x, y) => (x.wins - x.losses) - (y.wins - y.losses) || x.roundDiff - y.roundDiff)[0]
    : null;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <Navbar />
      <style>{`
        @keyframes vtdFadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes vtdPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 0.85; } }
        @media (max-width: 880px) {
          .vtd-team-hero-roster { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 680px) {
          .vtd-team-hero-grid { grid-template-columns: 1fr !important; text-align: center; }
          .vtd-team-hero-meta { justify-content: center !important; }
          .vtd-team-hero-roster { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .vtd-team-upcoming-vs { grid-template-columns: 1fr !important; gap: 14px !important; }
          .vtd-team-upcoming-vs > div { text-align: center !important; }
          .vtd-team-upcoming-vs > div:nth-child(1) > div { justify-content: center !important; }
        }
        @media (max-width: 420px) {
          .vtd-team-hero-roster { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 22px 80px" }}>
        <button
          onClick={() => router.push(`/valorant/tournament/${params.id}`)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", marginBottom: 18,
            background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 10,
            color: C.text2, fontSize: "0.82rem", fontWeight: 700, cursor: "pointer",
          }}>
          <ArrowLeft size={14} /> Back to tournament
        </button>

        <section style={{
          background: `radial-gradient(circle at 20% 0%, rgba(60,203,255,0.16), transparent 55%), linear-gradient(to bottom, rgba(60,203,255,0.05), rgba(10,15,42,0.6))`,
          border: `1px solid ${C.borderHi}`, borderRadius: 22, padding: "32px 28px", marginBottom: 28,
          display: "flex", flexDirection: "column", gap: 22,
          animation: "vtdFadeUp 0.5s ease-out both",
        }}>
        <div className="vtd-team-hero-grid" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 26, alignItems: "center" }}>
          <TeamLogo src={t.logo} name={t.name} size={120} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              {ranked && <span style={{
                fontSize: "0.7rem", fontWeight: 900, letterSpacing: "0.14em", padding: "4px 10px",
                background: C.accentSoft, color: C.accent, borderRadius: 999, border: `1px solid ${C.borderHi}`,
              }}>{ranked}</span>}
              <span style={{ fontSize: "0.7rem", color: C.text3 }}>{data.tournament.name}</span>
            </div>
            <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", fontWeight: 900, margin: 0, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.05 }}>{t.name}</h1>
            <div className="vtd-team-hero-meta" style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.14em", color: C.text3, textTransform: "uppercase" }}>Record</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 900, color: C.text }}>{s.wins || 0}<span style={{ color: C.text3, margin: "0 4px", fontWeight: 700 }}>W</span>{s.draws || 0}<span style={{ color: C.text3, margin: "0 4px", fontWeight: 700 }}>D</span>{s.losses || 0}<span style={{ color: C.text3, marginLeft: 4, fontWeight: 700 }}>L</span></div>
              </div>
              <div>
                <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.14em", color: C.text3, textTransform: "uppercase" }}>Points</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 900, color: C.text }}>{s.points || 0}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.14em", color: C.text3, textTransform: "uppercase" }}>Recent Form</div>
                <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                  {formRecent.length === 0 && <span style={{ fontSize: "0.78rem", color: C.text3 }}>No matches yet</span>}
                  {formRecent.slice(0, 5).reverse().map((r: any, i: number) => <ResultPill key={i} r={r} size={22} />)}
                </div>
              </div>
              {streak && streak.count >= 2 && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
                  background: streak.type === "W" ? C.winSoft : streak.type === "L" ? C.lossSoft : C.drawSoft,
                  color: streak.type === "W" ? C.win : streak.type === "L" ? C.loss : C.draw,
                  borderRadius: 999, fontSize: "0.74rem", fontWeight: 800,
                  border: `1px solid ${(streak.type === "W" ? C.win : streak.type === "L" ? C.loss : C.draw)}55`,
                }}>
                  <Flame size={12} /> {streak.count}-game {streak.type === "W" ? "win" : streak.type === "L" ? "loss" : "draw"} streak
                </div>
              )}
            </div>
          </div>
        </div>
        {(t.members || []).length > 0 && (
          <div style={{ paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.14em", color: C.text3, textTransform: "uppercase", marginBottom: 10 }}>Roster</div>
            <div className="vtd-team-hero-roster" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
              {(t.members || []).slice(0, 5).map((m: any) => (
                <Link key={m.uid || m.riotPuuid || m.riotGameName} href={`/player/${m.uid}?tab=valorant`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{
                    background: "rgba(0,0,0,0.22)", border: `1px solid ${C.border}`, borderRadius: 12,
                    padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, minWidth: 0,
                    transition: "border-color 0.15s, background 0.15s",
                  }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.borderHi; e.currentTarget.style.background = "rgba(60,203,255,0.06)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = "rgba(0,0,0,0.22)"; }}>
                    {m.riotAvatar ? (
                      <img src={m.riotAvatar} alt={m.riotGameName} style={{ width: 38, height: 38, borderRadius: 9, objectFit: "cover", border: `1px solid ${C.border}`, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 38, height: 38, borderRadius: 9, background: C.accentSoft, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "0.8rem", flexShrink: 0 }}>
                        {(m.riotGameName || "?")[0]?.toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: "0.84rem", fontWeight: 800, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.riotGameName}</div>
                      <div style={{ fontSize: "0.66rem", color: C.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.riotRank || "Unranked"}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
        </section>

        {upcoming && (
          <UpcomingMatchPanel
            upcoming={upcoming}
            myTeam={t}
            myForm={upcoming.myForm}
            oppForm={upcoming.oppForm}
          />
        )}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(176px, 1fr))", gap: 14, marginBottom: 32 }}>
          <StatCard label="Match Win %" value={`${matchWinPct}%`} sub={`${s.wins || 0}W ${s.draws || 0}D ${s.losses || 0}L in ${s.played || 0}`} accent={matchWinPct >= 60 ? C.win : matchWinPct >= 40 ? C.amber : C.loss} icon={<Trophy size={16} />} />
          <StatCard label="Maps Won" value={`${s.mapsWon || 0}–${s.mapsLost || 0}`} sub={`${(s.mapsWon || 0) - (s.mapsLost || 0) >= 0 ? "+" : ""}${(s.mapsWon || 0) - (s.mapsLost || 0)} map diff`} icon={<MapIcon size={16} />} />
          <StatCard label="Round Diff" value={`${roundDiff >= 0 ? "+" : ""}${roundDiff}`} sub={`${s.roundsWon || 0} won / ${s.roundsLost || 0} lost`} accent={roundDiff >= 0 ? C.win : C.loss} icon={<BarChart3 size={16} />} />
          {(rounds.pistol?.played || 0) > 0 ? (
            <StatCard label="Pistol Win %" value={`${rounds.pistol.winRate}%`} sub={`${rounds.pistol.won} of ${rounds.pistol.played}`} accent={rounds.pistol.winRate >= 50 ? C.win : C.loss} icon={<Target size={16} />} />
          ) : (
            <StatCard label="Pistol Win %" value="—" sub="No round-level data" accent={C.text3} icon={<Target size={16} />} />
          )}
          <StatCard label="1st Half %" value={`${sideStats.attack?.winRate || 0}%`} sub={`2nd Half ${sideStats.defense?.winRate || 0}%`} icon={<Swords size={16} />} />
          <StatCard label="Opening Duels" value={`${od.openingWinRate || 0}%`} sub={`${od.firstKills || 0} FK / ${od.firstDeaths || 0} FD`} accent={(od.openingWinRate || 0) >= 50 ? C.win : C.loss} icon={<Crosshair size={16} />} />
        </section>

        {insights.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <SectionHeader icon={<Brain size={16} />} title="Coach's Notebook" subtitle="Auto-generated from your match data" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
              {insights.map((i: any, idx: number) => <InsightCard key={i.id} insight={i} index={idx} />)}
            </div>
          </section>
        )}

        {players.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <SectionHeader icon={<Users size={16} />} title="Roster" subtitle={`${players.length} players, sorted by ACS`} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {players.map((p: any, i: number) => <PlayerCard key={p.puuid} p={p} index={i} />)}
            </div>
          </section>
        )}

        {mapStats.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <SectionHeader icon={<MapIcon size={16} />} title="Map Performance" subtitle="Per-map record + attack/defense split" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {mapStats.map((m: any) => (
                <MapPerformanceCard
                  key={m.map}
                  m={m}
                  isBest={bestMap !== null && m.map === bestMap.map && (m.wins - m.losses) > 0}
                  isWorst={worstMap !== null && m.map === worstMap.map && bestMap !== null && m.map !== bestMap.map && (m.wins - m.losses) < 0}
                />
              ))}
            </div>
          </section>
        )}

        <section style={{ marginBottom: 32 }}>
          <SectionHeader icon={<Activity size={16} />} title="Round Dynamics" subtitle="Side splits, pistol rounds, opening duels" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px 22px" }}>
              <div style={{ fontSize: "0.66rem", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: C.text3, marginBottom: 10 }}>Halves</div>
              {(sideStats.attack?.roundsPlayed || 0) === 0 && (sideStats.defense?.roundsPlayed || 0) === 0 ? (
                <div style={{ fontSize: "0.78rem", color: C.text3, padding: "4px 0" }}>No round-level data recorded.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <div style={{ fontSize: "0.74rem", color: C.text2 }}>1st Half</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 900, color: (sideStats.attack?.winRate || 0) >= 50 ? C.win : C.loss }}>{sideStats.attack?.winRate || 0}%</div>
                    <div style={{ fontSize: "0.7rem", color: C.text3 }}>{sideStats.attack?.roundsWon || 0}–{(sideStats.attack?.roundsPlayed || 0) - (sideStats.attack?.roundsWon || 0)} ({sideStats.attack?.roundsPlayed || 0} rounds)</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.74rem", color: C.text2 }}>2nd Half</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 900, color: (sideStats.defense?.winRate || 0) >= 50 ? C.win : C.loss }}>{sideStats.defense?.winRate || 0}%</div>
                    <div style={{ fontSize: "0.7rem", color: C.text3 }}>{sideStats.defense?.roundsWon || 0}–{(sideStats.defense?.roundsPlayed || 0) - (sideStats.defense?.roundsWon || 0)} ({sideStats.defense?.roundsPlayed || 0} rounds)</div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px 22px" }}>
              <div style={{ fontSize: "0.66rem", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: C.text3, marginBottom: 10 }}>Opening Duels</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <div style={{ fontSize: "0.74rem", color: C.text2 }}>First Kills</div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 900, color: C.win }}>{od.firstKills || 0}</div>
                  <div style={{ fontSize: "0.7rem", color: C.text3 }}>{od.firstKillRate || 0}% of rounds</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.74rem", color: C.text2 }}>First Deaths</div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 900, color: C.loss }}>{od.firstDeaths || 0}</div>
                  <div style={{ fontSize: "0.7rem", color: C.text3 }}>{od.firstDeathRate || 0}% of rounds</div>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: C.text3, marginBottom: 4 }}>
                  <span>Opening win rate</span>
                  <span style={{ color: (od.openingWinRate || 0) >= 50 ? C.win : C.loss, fontWeight: 800 }}>{od.openingWinRate || 0}%</span>
                </div>
                <MiniBar value={od.openingWinRate || 0} max={100} color={(od.openingWinRate || 0) >= 50 ? C.win : C.loss} />
              </div>
            </div>
          </div>
        </section>

        {history.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <SectionHeader icon={<Sparkles size={16} />} title="Match History" subtitle={`${history.length} completed matches`} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {history.map((h: any) => <MatchHistoryRow key={h.matchId} h={h} teamLogos={teamLogoMap} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

