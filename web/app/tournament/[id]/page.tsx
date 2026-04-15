"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/app/context/AuthContext";
import { Navbar } from "@/app/components/Navbar";
import { PlayerAvatarBadge } from "@/app/components/PlayerAvatarBadge";
import RegisterModal from "@/app/components/RegisterModal";
import DoubleBracket from "@/app/components/DoubleBracket";
import CommentSection from "@/app/components/CommentSection";
import RankReportBadge from "@/app/components/RankReportBadge";
import ShareVideoCarousel from "@/app/components/ShareVideoCarousel";
import { TournamentDetailLoader } from "@/app/components/TournamentLoader";
import { navigateWithAppPriority } from "@/app/lib/mobileAuth";
import Link from "next/link";
import {
  LayoutDashboard, Users, Shield, Trophy, Swords, GitBranch, BarChart3,
  Share2, Copy, CheckCheck, Calendar, Clock, ScrollText,
  MessageCircle, Camera,
  Coins, Target, Info, Zap, X,
} from "lucide-react";

type Tab = "overview" | "players" | "teams" | "standings" | "matches" | "brackets" | "leaderboard";

const TABS: { key: Tab; label: string; Icon: React.FC<{ size?: number; strokeWidth?: number }> }[] = [
  { key: "overview",    label: "Overview",     Icon: LayoutDashboard },
  { key: "players",     label: "Players",      Icon: Users },
  { key: "teams",       label: "Teams",        Icon: Shield },
  { key: "standings",   label: "Standings",    Icon: Trophy },
  { key: "matches",     label: "Matches",      Icon: Swords },
  { key: "brackets",    label: "Play-offs",    Icon: GitBranch },
  { key: "leaderboard", label: "Leaderboard",  Icon: BarChart3 },
];

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }); } catch { return iso; }
}
function formatTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }); } catch { return ""; }
}
function formatDateTime(iso: string) {
  try { return new Date(iso).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }); } catch { return iso; }
}
function getTimeUntilDeadline(deadline: string): string {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return "Registration Closed";
  const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000), m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}
function getTeamInitials(name: string): string {
  if (!name || name === "TBD") return "?";
  return name.replace(/\[.*?\]\s*/, "").split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 3);
}
function getTeamTag(name: string): string {
  const m = name.match(/\[([^\]]+)\]/);
  return m ? m[1] : getTeamInitials(name);
}

function MatchCard({ m, teamMembers, teamLogoMap, expandedMatch, setExpandedMatch, tournamentId, isBracket = false, bestOf = 2 }: {
  m: any; teamMembers: Record<string, any[]>; teamLogoMap: Record<string, string>;
  expandedMatch: string | null; setExpandedMatch: (id: string | null) => void;
  tournamentId: string; isBracket?: boolean; bestOf?: number;
}) {
  const isComplete = m.status === "completed";
  const isLive = m.status === "live";
  const isDraw = isComplete && m.team1Score === m.team2Score;
  const t1Win = isComplete && m.team1Score > m.team2Score;
  const t2Win = isComplete && m.team2Score > m.team1Score;
  const t1Members = teamMembers[m.team1Id] || [];
  const t2Members = teamMembers[m.team2Id] || [];
  const isExpanded = expandedMatch === m.id;
  const scheduledDate = m.scheduledTime ? new Date(m.scheduledTime) : null;
  const scheduledTime = scheduledDate ? scheduledDate.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }) : "";
  const scheduledDay = scheduledDate ? scheduledDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
  const bracketAccent = "#f59e0b";

  return (
    <div style={{ marginBottom: 8 }}>
      <div className="dtd-mc" style={{
        cursor: "pointer",
        ...(isBracket ? { borderColor: "rgba(245,158,11,0.2)" } : {}),
        ...(isLive ? { borderColor: "rgba(34,197,94,0.25)" } : {}),
        ...(isExpanded ? { borderColor: isBracket ? "rgba(245,158,11,0.5)" : "rgba(161,43,31,0.25)", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 } : {}),
      }} onClick={() => setExpandedMatch(isExpanded ? null : m.id)}>
        <div className="dtd-mc-index">
          <span className="dtd-mc-index-num" style={isBracket ? { color: bracketAccent, fontSize: "0.55rem" } : {}}>
            {isBracket ? (m.bracketLabel || "").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 4) : `M${m.matchIndex || ""}`}
          </span>
          <span className="dtd-mc-index-fmt" style={isBracket ? { background: "rgba(245,158,11,0.12)", color: bracketAccent } : {}}>BO{bestOf}</span>
        </div>
        <div className="dtd-mc-team">
          <div className="dtd-mc-team-logo" style={isBracket ? { background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" } : {}}>
            {teamLogoMap[m.team1Id] ? <img src={teamLogoMap[m.team1Id]} alt="" /> : getTeamInitials(m.team1Name)}
          </div>
          <div className="dtd-mc-team-info">
            <div className="dtd-mc-team-tag" style={isBracket ? { color: bracketAccent } : {}}>{isBracket ? m.bracketLabel : getTeamTag(m.team1Name)}</div>
            <div className="dtd-mc-team-name" style={t1Win ? { color: "#4ade80" } : t2Win ? { color: "#555550" } : {}}>{m.team1Name}</div>
            <div className="dtd-mc-avatars">
              {t1Members.map((p: any, i: number) => p.steamAvatar ? <img key={i} src={p.steamAvatar} alt="" /> : <div key={i} className="dtd-mc-av-init">{(p.steamName || "?")[0]}</div>)}
            </div>
          </div>
        </div>
        <div className="dtd-mc-center">
          {isComplete ? (
            <>
              <div className="dtd-mc-score-box">
                <span className={`s ${t1Win ? "win" : isDraw ? "draw" : "loss"}`}>{m.team1Score}</span>
                <span className="dash">-</span>
                <span className={`s ${t2Win ? "win" : isDraw ? "draw" : "loss"}`}>{m.team2Score}</span>
              </div>
              <span className="dtd-mc-status-badge" style={{ background: "rgba(22,163,74,0.12)", color: "#4ade80" }}>✓ Played</span>
            </>
          ) : isLive ? (
            <>
              <div className="dtd-mc-score-box">
                <span className="s">{m.team1Score || 0}</span><span className="dash">-</span><span className="s">{m.team2Score || 0}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                <div className="dtd-mc-live-dot" />
                <span className="dtd-mc-status-badge" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80", padding: "1px 6px" }}>LIVE</span>
              </div>
            </>
          ) : (
            <>
              {scheduledTime ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                  <div style={{ fontSize: "0.88rem", fontWeight: 800, color: isBracket ? bracketAccent : "#A12B1F" }}>{scheduledTime}</div>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "rgba(255,255,255,0.35)" }}>{scheduledDay}</div>
                </div>
              ) : (
                <div className="dtd-mc-score-box">
                  <span className="s" style={{ color: "#555550" }}>–</span><span className="dash">:</span><span className="s" style={{ color: "#555550" }}>–</span>
                </div>
              )}
              <span className="dtd-mc-status-badge" style={{ background: "#1a1a1f", color: "#555550" }}>{isBracket ? "Pending" : "Upcoming"}</span>
            </>
          )}
          {(isComplete || isLive) && scheduledDay && <div style={{ fontSize: "0.6rem", color: "#555550", marginTop: 2 }}>{scheduledDay} · {scheduledTime}</div>}
        </div>
        <div className="dtd-mc-team right">
          <div className="dtd-mc-team-logo" style={isBracket ? { background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" } : {}}>
            {teamLogoMap[m.team2Id] ? <img src={teamLogoMap[m.team2Id]} alt="" /> : getTeamInitials(m.team2Name)}
          </div>
          <div className="dtd-mc-team-info" style={{ textAlign: "right" }}>
            <div className="dtd-mc-team-tag">{getTeamTag(m.team2Name)}</div>
            <div className="dtd-mc-team-name" style={t2Win ? { color: "#4ade80" } : t1Win ? { color: "#555550" } : {}}>{m.team2Name}</div>
            <div className="dtd-mc-avatars">{t2Members.map((p: any, i: number) => p.steamAvatar ? <img key={i} src={p.steamAvatar} alt="" /> : <div key={i} className="dtd-mc-av-init">{(p.steamName || "?")[0]}</div>)}</div>
          </div>
        </div>
        <div style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", color: isExpanded ? (isBracket ? bracketAccent : "#A12B1F") : "#555550", fontSize: 12, transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>▼</div>
      </div>

      {isExpanded && (() => {
        const t1Sorted = [...(t1Members.length > 0 ? t1Members : Array.from({ length: 5 }, (_, i) => ({ steamName: `Player ${i + 1}`, steamAvatar: "", dotaMMR: 0 })))].sort((a: any, b: any) => (b.dotaMMR || 0) - (a.dotaMMR || 0));
        const t2Sorted = [...(t2Members.length > 0 ? t2Members : Array.from({ length: 5 }, (_, i) => ({ steamName: `Player ${i + 1}`, steamAvatar: "", dotaMMR: 0 })))].sort((a: any, b: any) => (b.dotaMMR || 0) - (a.dotaMMR || 0));
        return (
        <div className="dtd-mc-expanded" style={{ background: "linear-gradient(180deg, #0A0A10 0%, #14141A 30%, #14141A 70%, #0A0A10 100%)", border: "1px solid #2A2A30", borderTop: "none", borderBottomLeftRadius: 10, borderBottomRightRadius: 10, padding: "22px 14px 18px", overflow: "hidden", position: "relative" }}>
          {/* Background diagonal streaks */}
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
            <div style={{ position: "absolute", top: "50%", left: "50%", width: 1.5, height: "160%", background: "linear-gradient(180deg, transparent, rgba(161,43,31,0.07), transparent)", transform: "translate(-50%, -50%) rotate(30deg)" }} />
            <div style={{ position: "absolute", top: "50%", left: "50%", width: 1.5, height: "160%", background: "linear-gradient(180deg, transparent, rgba(161,43,31,0.05), transparent)", transform: "translate(-50%, -50%) rotate(-30deg)" }} />
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent 10%, rgba(161,43,31,0.15) 50%, transparent 90%)" }} />
          </div>
          {/* Floating 2-2-1 Player Lineup */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative" }}>
            {/* Team 1 Players */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, animation: "dtd-streak-left 0.5s cubic-bezier(0.16,1,0.3,1) both" }}>
              {[t1Sorted.slice(0, 2), t1Sorted.slice(2, 4), t1Sorted.slice(4, 5)].map((row, ri) => (
                <div key={ri} className="dtd-mc-player-row" style={{ display: "flex", justifyContent: "center", gap: 14, width: "100%" }}>
                  {row.map((p: any, pi: number) => {
                    const idx = ri === 0 ? pi : ri === 1 ? 2 + pi : 4;
                    return (
                      <div key={pi} className="dtd-fighter-card" style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        animation: `dtd-player-reveal 0.5s cubic-bezier(0.16,1,0.3,1) ${idx * 0.09}s both`,
                      }}>
                        {p.steamAvatar ? (
                          <img src={p.steamAvatar} alt="" style={{
                            width: 46, height: 46, borderRadius: "50%", objectFit: "cover",
                            border: "2px solid rgba(161,43,31,0.3)",
                            boxShadow: "0 0 10px rgba(161,43,31,0.15), 0 3px 10px rgba(0,0,0,0.35)",
                          }} />
                        ) : (
                          <div style={{
                            width: 46, height: 46, borderRadius: "50%",
                            background: "linear-gradient(135deg, #A12B1F, #7A1F15)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "0.95rem", fontWeight: 800, color: "#fff",
                            border: "2px solid rgba(161,43,31,0.3)",
                            boxShadow: "0 0 10px rgba(161,43,31,0.15)",
                          }}>{(p.steamName || "?")[0]}</div>
                        )}
                        <div style={{ textAlign: "center", maxWidth: 56 }}>
                          <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "#E6E6E6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.steamName || "TBD"}</div>
                          {p.dotaMMR ? <div style={{ fontSize: "0.5rem", fontWeight: 600, color: "#8A8880", marginTop: 1 }}>{p.dotaMMR} MMR</div> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {/* VS Center Column with Team Names */}
            <div className="dtd-mc-vs-col" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, flexShrink: 0, animation: "dtd-vs-pop 0.6s cubic-bezier(0.16,1,0.3,1) 0.35s both", zIndex: 3, padding: "0 6px" }}>
              {/* Team 1 Logo + Name */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 10, animation: "dtd-team-name-in 0.6s cubic-bezier(0.16,1,0.3,1) 0.2s both" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", overflow: "hidden", border: "1.5px solid rgba(161,43,31,0.3)", background: "linear-gradient(135deg, #A12B1F22, #7A1F1522)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {teamLogoMap[m.team1Id] ? <img src={teamLogoMap[m.team1Id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "0.6rem", fontWeight: 800, color: "#A12B1F" }}>{(m.team1Name || "?")[0]}</span>}
                </div>
                <div style={{
                  fontSize: "0.78rem", fontWeight: 900, color: "#A12B1F", textAlign: "center",
                  textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: 1.2,
                  textShadow: "0 0 12px rgba(161,43,31,0.4), 0 0 24px rgba(161,43,31,0.15)",
                  wordBreak: "break-word" as any,
                }}>{m.team1Name}</div>
              </div>
              {/* VS Badge */}
              <div className="dtd-mc-vs" style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "linear-gradient(135deg, #A12B1F, #BE3A25, #7A1F15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.95rem", fontWeight: 900, color: "#fff", letterSpacing: "0.05em",
                animation: "dtd-glow-pulse 2.5s ease-in-out infinite",
                boxShadow: "0 0 28px rgba(161,43,31,0.3), inset 0 0 10px rgba(255,255,255,0.1)",
              }}>VS</div>
              {isComplete && <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#4ade80", textShadow: "0 0 8px rgba(74,222,128,0.4)", marginTop: 4 }}>{m.team1Score} - {m.team2Score}</div>}
              {/* Team 2 Logo + Name */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 10, animation: "dtd-team-name-in 0.6s cubic-bezier(0.16,1,0.3,1) 0.25s both" }}>
                <div style={{
                  fontSize: "0.78rem", fontWeight: 900, color: "#ef4444", textAlign: "center",
                  textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: 1.2,
                  textShadow: "0 0 12px rgba(239,68,68,0.4), 0 0 24px rgba(239,68,68,0.15)",
                  wordBreak: "break-word" as any,
                }}>{m.team2Name}</div>
                <div style={{ width: 30, height: 30, borderRadius: "50%", overflow: "hidden", border: "1.5px solid rgba(239,68,68,0.3)", background: "linear-gradient(135deg, #ef444422, #dc262622)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {teamLogoMap[m.team2Id] ? <img src={teamLogoMap[m.team2Id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "0.6rem", fontWeight: 800, color: "#ef4444" }}>{(m.team2Name || "?")[0]}</span>}
                </div>
              </div>
            </div>
            {/* Team 2 Players */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, animation: "dtd-streak-right 0.5s cubic-bezier(0.16,1,0.3,1) both" }}>
              {[t2Sorted.slice(0, 2), t2Sorted.slice(2, 4), t2Sorted.slice(4, 5)].map((row, ri) => (
                <div key={ri} className="dtd-mc-player-row" style={{ display: "flex", justifyContent: "center", gap: 14, width: "100%" }}>
                  {row.map((p: any, pi: number) => {
                    const idx = ri === 0 ? pi : ri === 1 ? 2 + pi : 4;
                    return (
                      <div key={pi} className="dtd-fighter-card" style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        animation: `dtd-player-reveal-right 0.5s cubic-bezier(0.16,1,0.3,1) ${idx * 0.09}s both`,
                      }}>
                        {p.steamAvatar ? (
                          <img src={p.steamAvatar} alt="" style={{
                            width: 46, height: 46, borderRadius: "50%", objectFit: "cover",
                            border: "2px solid rgba(239,68,68,0.3)",
                            boxShadow: "0 0 10px rgba(239,68,68,0.15), 0 3px 10px rgba(0,0,0,0.35)",
                          }} />
                        ) : (
                          <div style={{
                            width: 46, height: 46, borderRadius: "50%",
                            background: "linear-gradient(135deg, #ef4444, #dc2626)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "0.95rem", fontWeight: 800, color: "#fff",
                            border: "2px solid rgba(239,68,68,0.3)",
                            boxShadow: "0 0 10px rgba(239,68,68,0.15)",
                          }}>{(p.steamName || "?")[0]}</div>
                        )}
                        <div style={{ textAlign: "center", maxWidth: 56 }}>
                          <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "#E6E6E6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.steamName || "TBD"}</div>
                          {p.dotaMMR ? <div style={{ fontSize: "0.5rem", fontWeight: 600, color: "#8A8880", marginTop: 1 }}>{p.dotaMMR} MMR</div> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {/* Match result or pending message */}
          {isComplete ? (
            <div style={{ textAlign: "center", padding: "10px 0 0", color: "#4ade80", fontSize: "0.75rem", fontWeight: 700 }}>
              {t1Win ? m.team1Name : t2Win ? m.team2Name : "Draw"} {t1Win || t2Win ? "wins" : ""} {m.team1Score} - {m.team2Score}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "10px 0 0", color: "#555550", fontSize: "0.72rem" }}>Match hasn&apos;t been played yet</div>
          )}
        </div>
        );
      })()}
    </div>
  );
}

async function captureTabImage(el: HTMLElement) {
  const prevFilter = el.style.filter;
  const prevPad = el.style.padding;
  const prevBorder = el.style.border;
  const prevBg = el.style.background;
  el.style.filter = "contrast(1.3) brightness(1.25) saturate(1.2)";
  el.style.padding = "24px";
  el.style.border = "3px solid rgba(161,43,31,0.35)";
  el.style.background = "#080c14";
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(el, { backgroundColor: "#050810", scale: 2, useCORS: true, logging: false });
  el.style.filter = prevFilter;
  el.style.padding = prevPad;
  el.style.border = prevBorder;
  el.style.background = prevBg;
  return canvas;
}

function TabSharePopover({ tabKey, id, tournamentName, tabContentRef, setShowToast, setToastMsg }: {
  tabKey: string; id: string; tournamentName: string;
  tabContentRef: React.RefObject<HTMLDivElement | null>;
  setShowToast: (v: boolean) => void;
  setToastMsg?: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button className="dtd-tab-share" onClick={() => setOpen(v => !v)}>
        <Share2 size={12} /> Share
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 200, background: "rgba(10,14,24,0.97)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 8, minWidth: 188, boxShadow: "0 12px 40px rgba(0,0,0,0.6)", overflow: "hidden" }}>
          <button style={{ width: "100%", padding: "10px 14px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: "0.82rem", fontWeight: 600, color: "rgba(255,255,255,0.8)", fontFamily: "inherit", background: "transparent", border: "none", textAlign: "left" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(161,43,31,0.15)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/tournament/${id}?tab=${tabKey}`);
              setToastMsg?.("Link copied!"); setShowToast(true); setTimeout(() => setShowToast(false), 2000); setOpen(false);
            }}>
            <Copy size={14} /> Copy Link
          </button>
          <button style={{ width: "100%", padding: "10px 14px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: "0.82rem", fontWeight: 600, color: "rgba(255,255,255,0.8)", fontFamily: "inherit", background: "transparent", border: "none", textAlign: "left" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(161,43,31,0.15)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={async () => {
              if (!tabContentRef.current) return;
              setOpen(false);
              try {
                const canvas = await captureTabImage(tabContentRef.current);
                const link = document.createElement("a");
                link.download = `${tournamentName.replace(/\s+/g, "_")}_${tabKey}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
              } catch {}
            }}>
            <Camera size={14} /> Save as Image
          </button>
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
          <button style={{ width: "100%", padding: "10px 14px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: "0.82rem", fontWeight: 600, color: "#25D366", fontFamily: "inherit", background: "transparent", border: "none", textAlign: "left" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(37,211,102,0.12)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={async () => {
              if (!tabContentRef.current) return;
              setOpen(false);
              try {
                const canvas = await captureTabImage(tabContentRef.current);
                const blob = await new Promise<Blob>((res) => canvas.toBlob(b => res(b!), "image/png"));
                const file = new File([blob], `${tournamentName.replace(/\s+/g, "_")}_${tabKey}.png`, { type: "image/png" });
                const url = `${window.location.origin}/tournament/${id}?tab=${tabKey}`;
                const text = `Check out ${tournamentName} — ${tabKey} on iEsports!\n${url}`;
                if (navigator.canShare?.({ files: [file] })) {
                  await navigator.share({ files: [file], text });
                } else {
                  const link = document.createElement("a"); link.download = file.name; link.href = URL.createObjectURL(blob); link.click(); URL.revokeObjectURL(link.href);
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
                }
              } catch {
                const url = `${window.location.origin}/tournament/${id}?tab=${tabKey}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(`Check out ${tournamentName} — ${tabKey} on iEsports!\n${url}`)}`, "_blank");
              }
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp
          </button>
          <button style={{ width: "100%", padding: "10px 14px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: "0.82rem", fontWeight: 600, color: "#E1306C", fontFamily: "inherit", background: "transparent", border: "none", textAlign: "left" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(225,48,108,0.12)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={async () => {
              if (!tabContentRef.current) return;
              setOpen(false);
              try {
                const canvas = await captureTabImage(tabContentRef.current);
                const blob = await new Promise<Blob>((res) => canvas.toBlob(b => res(b!), "image/png"));
                await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
                setToastMsg?.("Image copied — paste in Instagram Story!"); setShowToast(true); setTimeout(() => setShowToast(false), 2500);
              } catch {
                navigator.clipboard.writeText(`${window.location.origin}/tournament/${id}?tab=${tabKey}`);
                setToastMsg?.("Link copied!"); setShowToast(true); setTimeout(() => setShowToast(false), 2000);
              }
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            Instagram Story
          </button>
        </div>
      )}
    </div>
  );
}

function TimelineItem({ label, date, status, badge }: { label: string; date: string; status: "past" | "active" | "future"; badge?: string }) {
  return (
    <div className="dtd-tl-item">
      <div className={`dtd-tl-dot ${status}`} />
      <div>
        <div className="dtd-tl-label">
          {label}
          {badge && <span className="dtd-tl-badge" style={{ background: status === "active" ? "rgba(161,43,31,0.15)" : "rgba(245,158,11,0.12)", color: status === "active" ? "#BE3A25" : "#fbbf24" }}>{badge}</span>}
        </div>
        <div className="dtd-tl-date">{formatDateTime(date)}</div>
      </div>
    </div>
  );
}

function DotaTournamentDetailInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const { user, loading: authLoading, steamLinked, dotaProfile, userProfile } = useAuth();

  const [tournament, setTournament] = useState<any>(null);
  const [tLoading, setTLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = searchParams.get("tab") as Tab;
    return TABS.some(tab => tab.key === t) ? t : "overview";
  });
  const [showShareCard, setShowShareCard] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState("Link copied!");
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [unregLoading, setUnregLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(() => {
    if (typeof window !== "undefined" && searchParams.get("register") === "true") {
      try { localStorage.removeItem("pendingRegistration"); } catch {}
      return true;
    }
    return false;
  });
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [countdown, setCountdown] = useState("");
  const [onWaitlist, setOnWaitlist] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const tabContentRef = useRef<HTMLDivElement>(null);
  const tabsWrapRef = useRef<HTMLDivElement>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [rankReports, setRankReports] = useState<any[]>([]);

  const fetchRankReports = () => {
    if (!id) return;
    fetch(`/api/rank-reports?tournamentId=${id}&game=dota2`)
      .then(r => r.json())
      .then(data => { if (data.reports) setRankReports(data.reports); })
      .catch(() => {});
  };

  const refetchData = (refreshRank = false) => {
    if (!id) return;
    const qs = refreshRank ? `&refreshRank=1` : "";
    fetch(`/api/tournaments/detail?id=${id}&game=dota2${qs}`)
      .then(r => r.json())
      .then(data => {
        if (data.tournament) setTournament(data.tournament);
        if (data.players) setPlayers(data.players);
        if (data.teams) setTeams(data.teams);
        if (data.standings) {
          const sorted = [...data.standings].sort((a: any, b: any) => { if (b.points !== a.points) return b.points - a.points; if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz; return (b.mapsWon - b.mapsLost) - (a.mapsWon - a.mapsLost); });
          setStandings(sorted);
        }
        if (data.matches) {
          const sorted = [...data.matches].sort((a: any, b: any) => { if (!!a.isBracket !== !!b.isBracket) return a.isBracket ? 1 : -1; const tA = a.scheduledTime ? new Date(a.scheduledTime).getTime() : 0; const tB = b.scheduledTime ? new Date(b.scheduledTime).getTime() : 0; if (tA !== tB) return tA - tB; if (a.matchDay !== b.matchDay) return a.matchDay - b.matchDay; return (a.matchIndex || 0) - (b.matchIndex || 0); });
          setMatches(sorted);
        }
        if (data.leaderboard) {
          const sorted = [...data.leaderboard].sort((a: any, b: any) => (b.totalScore || 0) - (a.totalScore || 0));
          setLeaderboard(sorted);
        }
        setTLoading(false);
      })
      .catch(() => setTLoading(false));
  };

  // Initial data load + 60s polling, paused when tab is hidden. Refetches
  // immediately on visibility change so the view is current when the user
  // returns. This replaces the old 30s always-on polling that was burning
  // Firestore reads when users left tabs open in the background.
  useEffect(() => {
    refetchData(true); fetchRankReports(); // initial fetch refreshes rank from user docs
    const tick = () => { if (!document.hidden) refetchData(false); };
    const interval = setInterval(tick, 60_000);
    const onVis = () => { if (!document.hidden) refetchData(false); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVis); };
  }, [id]);

  // Registration check for logged-in users (debounced on focus)
  const lastRegCheckRef = useRef(0);
  useEffect(() => {
    if (!user || !id) return;
    const checkReg = async () => {
      const now = Date.now();
      if (now - lastRegCheckRef.current < 30_000) return;
      lastRegCheckRef.current = now;
      const snap = await getDoc(doc(db, "users", user.uid));
      const data = snap.data();
      setIsRegistered((data?.registeredTournaments || []).includes(id));
    };
    lastRegCheckRef.current = 0; // reset on user/id change
    checkReg();
    window.addEventListener("focus", checkReg);
    return () => window.removeEventListener("focus", checkReg);
  }, [user, id]);
  useEffect(() => {
    if (!user || !id) return;
    user.getIdToken().then(token =>
      fetch(`/api/waitlist?tournamentId=${id}&game=dota`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setOnWaitlist(!!d.onWaitlist))
    ).catch(() => {});
  }, [user, id]);
  const toggleWaitlist = async () => {
    if (!user || !id) return;
    setWaitlistLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ tournamentId: id, game: "dota" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setOnWaitlist(data.onWaitlist);
    } catch (e: any) { alert(e.message || "Could not update waitlist"); } finally { setWaitlistLoading(false); }
  };
  useEffect(() => { if (!tournament) return; const tick = () => setCountdown(getTimeUntilDeadline(tournament.registrationDeadline)); tick(); const i = setInterval(tick, 60000); return () => clearInterval(i); }, [tournament]);

  if (tLoading) return <TournamentDetailLoader game="dota" />;

  if (!tournament) return (
    <div style={{ minHeight: "100vh", background: "#0a0e18", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, fontFamily: "system-ui, sans-serif" }}>
      <span style={{ fontSize: 40 }}>🎮</span>
      <p style={{ color: "#8A8880", fontSize: "1rem", fontWeight: 600 }}>Tournament not found.</p>
      <button onClick={() => router.push("/dota2")} style={{ background: "#A12B1F", color: "#fff", border: "none", borderRadius: 100, padding: "10px 24px", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}>
        ← Back to Tournaments
      </button>
    </div>
  );

  const regClosed = countdown === "Registration Closed";
  const slotsLeft = tournament.totalSlots - tournament.slotsBooked;
  const schedule = tournament.schedule || {};
  const isRegOpen = (() => {
    if (schedule.registrationOpens) return new Date() >= new Date(schedule.registrationOpens);
    return true;
  })();
  const canRegister = !regClosed && !isRegistered && slotsLeft > 0 && isRegOpen;

  const handleUnregister = async () => {
    if (!user || !id) return;
    if (!confirm("Are you sure you want to unregister from this tournament?")) return;
    setUnregLoading(true);
    try {
      const res = await fetch("/api/dota/unregister", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: id, uid: user.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIsRegistered(false);
      refetchData();
    } catch (e: any) {
      alert(e.message || "Failed to unregister");
    } finally {
      setUnregLoading(false);
    }
  };
  const teamMembers: Record<string, any[]> = {};
  const teamLogoMap: Record<string, string> = {};
  teams.forEach((t: any) => { teamMembers[t.id] = (t.members || []).slice(0, 5); if (t.teamLogo) teamLogoMap[t.id] = t.teamLogo; });
  const groupMatches = matches.filter((m: any) => !m.isBracket);
  const bracketMatches = matches.filter((m: any) => m.isBracket);

  const grandFinal = bracketMatches.find((m: any) => m.bracketType === "grand_final" && m.status === "completed");
  const championTeamName = grandFinal ? (grandFinal.team1Score > grandFinal.team2Score ? grandFinal.team1Name : grandFinal.team2Name) : null;
  const championTeamId = grandFinal ? (grandFinal.team1Score > grandFinal.team2Score ? grandFinal.team1Id : grandFinal.team2Id) : null;
  const championMembers = championTeamId ? (teamMembers[championTeamId] || []) : [];

  // Rank bracket data from tournament doc (old Dota structure)
  const rankBrackets = tournament.brackets || {};

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        /* ── Animated background ── */
        .dtd-bg { position: fixed; inset: 0; z-index: 0; background: #0a0e18; overflow: hidden; pointer-events: none; }
        .dtd-bg-gradient { position: absolute; inset: -60%; background: conic-gradient(from 0deg at 35% 45%, transparent 0deg, rgba(161,43,31,0.10) 60deg, transparent 120deg, rgba(161,43,31,0.07) 200deg, transparent 260deg, rgba(10,14,24,0.8) 360deg); animation: dtd-bg-rot 28s linear infinite; }
        .dtd-bg-glow1 { position: absolute; width: 800px; height: 800px; border-radius: 50%; background: radial-gradient(circle, rgba(161,43,31,0.14) 0%, rgba(161,43,31,0.04) 40%, transparent 70%); top: -200px; left: -150px; animation: dtd-bg-drift1 22s ease-in-out infinite; }
        .dtd-bg-glow2 { position: absolute; width: 600px; height: 600px; border-radius: 50%; background: radial-gradient(circle, rgba(161,43,31,0.10) 0%, rgba(161,43,31,0.03) 40%, transparent 70%); bottom: 0%; right: 0%; animation: dtd-bg-drift2 28s ease-in-out infinite; }
        .dtd-bg-glow3 { position: absolute; width: 400px; height: 400px; border-radius: 50%; background: radial-gradient(circle, rgba(190,58,37,0.08) 0%, transparent 70%); bottom: 30%; left: 60%; animation: dtd-bg-drift3 34s ease-in-out infinite; }
        .dtd-bg-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(161,43,31,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(161,43,31,0.06) 1px, transparent 1px); background-size: 60px 60px; animation: dtd-grid-shimmer 8s ease-in-out infinite; }
        @keyframes dtd-bg-rot { to { transform: rotate(360deg); } }
        @keyframes dtd-bg-drift1 { 0% { transform: translate(0,0) scale(1); opacity: 0.7; } 25% { transform: translate(80px,-60px) scale(1.15); opacity: 1; } 50% { transform: translate(120px,40px) scale(0.95); opacity: 0.8; } 75% { transform: translate(-40px,70px) scale(1.08); opacity: 0.9; } 100% { transform: translate(0,0) scale(1); opacity: 0.7; } }
        @keyframes dtd-bg-drift2 { 0% { transform: translate(0,0) scale(1); opacity: 0.6; } 33% { transform: translate(-100px,-80px) scale(1.12); opacity: 1; } 66% { transform: translate(-60px,60px) scale(0.92); opacity: 0.75; } 100% { transform: translate(0,0) scale(1); opacity: 0.6; } }
        @keyframes dtd-bg-drift3 { 0% { transform: translate(0,0) scale(1); opacity: 0.5; } 20% { transform: translate(60px,-90px) scale(1.2); opacity: 0.9; } 40% { transform: translate(-80px,-40px) scale(0.85); opacity: 0.6; } 60% { transform: translate(-40px,80px) scale(1.1); opacity: 1; } 80% { transform: translate(70px,30px) scale(0.95); opacity: 0.7; } 100% { transform: translate(0,0) scale(1); opacity: 0.5; } }
        @keyframes dtd-grid-shimmer { 0%,100% { opacity: 0.4; } 50% { opacity: 0.7; } }

        .dtd-page { min-height: 100vh; font-family: var(--font-geist-sans), system-ui, sans-serif; color: #E6E6E6; position: relative; z-index: 1; }

        /* ── Hero ── */
        .dtd-hero { position: relative; min-height: 460px; overflow: hidden; display: flex; align-items: flex-end; }
        .dtd-hero-bg { position: absolute; inset: -6%; width: 112%; height: 112%; object-fit: cover; object-position: center 20%; z-index: 0; filter: brightness(0.35) saturate(1.2); animation: dtd-hero-kb 16s ease-in-out infinite alternate; will-change: transform; }
        @keyframes dtd-hero-kb { 0% { transform: scale(1) translate(0, 0); } 50% { transform: scale(1.04) translate(-1%, -0.8%); } 100% { transform: scale(1.02) translate(0.8%, -0.4%); } }
        .dtd-hero-overlay { position: absolute; inset: 0; z-index: 1; background: linear-gradient(160deg, rgba(161,43,31,0.25) 0%, transparent 40%), linear-gradient(to bottom, rgba(10,14,24,0.3) 0%, rgba(10,14,24,0.7) 60%, rgba(10,14,24,1) 100%); }
        .dtd-hero-content { position: relative; z-index: 3; max-width: 1100px; margin: 0 auto; padding: 0 30px; width: 100%; min-height: 460px; display: flex; align-items: flex-end; padding-bottom: 36px; }
        .dtd-hero-inner { flex: 1; }
        .dtd-hero-game-tag { font-size: 0.62rem; font-weight: 900; letter-spacing: 0.2em; text-transform: uppercase; color: #A12B1F; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .dtd-hero-game-tag::before { content: ""; display: block; width: 28px; height: 2px; background: #A12B1F; }
        .dtd-hero-title { font-size: clamp(1.8rem, 4vw, 3rem); font-weight: 900; color: #E6E6E6; line-height: 1.05; animation: dtd-hero-in 0.7s cubic-bezier(0.16,1,0.3,1) both; letter-spacing: -0.03em; text-shadow: 0 2px 20px rgba(0,0,0,0.5); }
        .dtd-hero-desc { font-size: 1rem; color: rgba(230,230,230,0.65); margin-top: 10px; max-width: 560px; line-height: 1.6; animation: dtd-hero-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.08s both; }
        .dtd-hero-actions { display: flex; align-items: center; gap: 12px; margin-top: 22px; animation: dtd-hero-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.16s both; flex-wrap: wrap; }
        .dtd-hero-share-btn { width: 44px; height: 44px; border-radius: 50%; background: rgba(161,43,31,0.12); border: 1px solid rgba(161,43,31,0.3); color: #A12B1F; display: flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(8px); transition: all 0.2s; flex-shrink: 0; }
        .dtd-hero-share-btn:hover { background: rgba(161,43,31,0.25); border-color: rgba(161,43,31,0.5); transform: scale(1.05); }
        @keyframes dtd-hero-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        .dtd-content { max-width: 1100px; margin: 0 auto; padding: 0 30px 80px; }

        /* ── Tab bar ── */
        .dtd-tabs-wrap { position: sticky; top: 68px; z-index: 20; margin-bottom: 24px; background: rgba(10,14,24,0.96); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom: 1px solid rgba(161,43,31,0.12); margin-left: -30px; margin-right: -30px; padding: 12px 30px; }
        @media (max-width: 900px) { .dtd-tabs-wrap { top: 56px; } }
        .dtd-tab-pane { scroll-margin-top: 140px; }
        @media (max-width: 900px) { .dtd-tab-pane { scroll-margin-top: 120px; } }
        .dtd-tabs { display: flex; gap: 4px; background: rgba(255,255,255,0.03); border-radius: 16px; padding: 6px; border: 1px solid rgba(255,255,255,0.06); }
        .dtd-tab { flex: 1; min-height: 48px; padding: 0 8px; border-radius: 12px; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 6px; font-size: 0.82rem; font-weight: 800; cursor: pointer; font-family: inherit; white-space: nowrap; border: 1px solid transparent; background: transparent; color: rgba(255,255,255,0.45); transition: all 0.2s ease; }
        .dtd-tab-label { display: inline; }
        .dtd-tab:hover { background: rgba(161,43,31,0.08); color: rgba(255,255,255,0.75); border-color: rgba(161,43,31,0.2); }
        .dtd-tab.active { background: #A12B1F; color: #fff; border-color: #A12B1F; box-shadow: 0 0 20px rgba(161,43,31,0.35), 0 4px 16px rgba(161,43,31,0.25); }
        .dtd-tab-count { font-size: 0.68rem; font-weight: 700; opacity: 0.75; background: rgba(0,0,0,0.2); padding: 1px 7px; border-radius: 100px; }

        .dtd-tab-pane { animation: dtd-fade-up 0.35s ease-out both; }
        @keyframes dtd-fade-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Cards ── */
        .dtd-card { background: rgba(18,18,21,0.8); border: 1px solid rgba(255,255,255,0.06); border-radius: 18px; padding: 28px 32px; margin-bottom: 18px; backdrop-filter: blur(12px); transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .dtd-card:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
        .dtd-card-label { display: block; font-size: 0.65rem; font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase; color: #A12B1F; margin-bottom: 18px; }

        /* ── Overview ── */
        .dtd-overview-grid { display: grid; grid-template-columns: 1fr 320px; gap: 16px; }
        .dtd-overview-grid > div { display: flex; flex-direction: column; gap: 16px; }
        .dtd-overview-grid > div > .dtd-card { margin-bottom: 0; }
        .dtd-stat-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; align-items: stretch; }
        .dtd-stat-tile { background: rgba(18,18,21,0.8); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 20px 18px; text-align: center; backdrop-filter: blur(10px); transition: transform 0.2s, box-shadow 0.2s; animation: dtd-fade-up 0.4s ease-out both; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .dtd-stat-tile:hover { transform: translateY(-3px); box-shadow: 0 8px 28px rgba(0,0,0,0.4); }
        .dtd-stat-tile-icon { display: flex; justify-content: center; margin-bottom: 10px; opacity: 0.7; }
        .dtd-stat-tile-val { font-size: 1.4rem; font-weight: 900; color: #E6E6E6; line-height: 1.1; }
        .dtd-stat-tile-lbl { font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #555550; margin-top: 5px; }
        .dtd-stat-tile.blue { border-color: rgba(161,43,31,0.2); background: rgba(161,43,31,0.06); }
        .dtd-stat-tile.blue .dtd-stat-tile-val { color: #A12B1F; }
        .dtd-stat-tile.gold .dtd-stat-tile-val { color: #fbbf24; }
        .dtd-stat-tile.gold { border-color: rgba(251,191,36,0.2); background: rgba(251,191,36,0.05); }
        .dtd-stat-tile.light-blue .dtd-stat-tile-val { color: #BE3A25; }
        .dtd-stat-tile.light-blue { border-color: rgba(161,43,31,0.2); background: rgba(161,43,31,0.05); }
        .dtd-desc { font-size: 1rem; color: #8A8880; line-height: 1.8; margin: 0; }

        /* ── Timeline ── */
        .dtd-timeline { display: flex; flex-direction: column; gap: 0; }
        .dtd-tl-item { display: grid; grid-template-columns: 14px 1fr; gap: 12px; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.05); align-items: start; }
        .dtd-tl-item:last-child { border-bottom: none; padding-bottom: 0; }
        .dtd-tl-item:first-child { padding-top: 0; }
        .dtd-tl-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
        .dtd-tl-dot.past { background: #22c55e; }
        .dtd-tl-dot.active { background: #A12B1F; box-shadow: 0 0 0 4px rgba(161,43,31,0.2); }
        .dtd-tl-dot.future { background: #2A2A30; }
        .dtd-tl-label { font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #A12B1F; }
        .dtd-tl-date { font-size: 0.82rem; color: #8A8880; margin-top: 3px; }
        .dtd-tl-badge { font-size: 0.58rem; font-weight: 800; padding: 2px 7px; border-radius: 100px; margin-left: 8px; }

        /* ── Rules ── */
        .dtd-rule { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); align-items: flex-start; }
        .dtd-rule:last-child { border-bottom: none; }
        .dtd-rule-num { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; min-width: 22px; border-radius: 50%; background: rgba(161,43,31,0.15); border: 1px solid rgba(161,43,31,0.4); font-size: 0.65rem; font-weight: 900; color: #A12B1F; margin-top: 1px; }
        .dtd-rule-text { font-size: 0.88rem; color: #8A8880; line-height: 1.6; }
        .dtd-rules-scroll { max-height: 400px; overflow-y: auto; padding-right: 4px; }
        .dtd-rules-scroll::-webkit-scrollbar { width: 4px; }
        .dtd-rules-scroll::-webkit-scrollbar-track { background: transparent; }
        .dtd-rules-scroll::-webkit-scrollbar-thumb { background: rgba(161,43,31,0.35); border-radius: 4px; }

        /* ── Empty states ── */
        .dtd-empty { text-align: center; padding: 70px 20px; }
        .dtd-empty-icon { font-size: 48px; margin-bottom: 10px; display: block; }
        .dtd-empty-title { font-size: 1rem; font-weight: 700; color: #8A8880; margin-bottom: 4px; display: block; }
        .dtd-empty-sub { font-size: 0.86rem; color: #555550; display: block; margin-top: 6px; }

        @keyframes dtd-fadeSlideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Players tier columns ── */
        .dtd-tier-columns { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; }
        .dtd-tier-col { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 8px; }
        .dtd-tier-header { padding: 10px 14px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; font-weight: 800; letter-spacing: 0.02em; }
        .dtd-tier-header-count { font-size: 0.72rem; font-weight: 600; opacity: 0.7; }
        .dtd-tier-player { background: rgba(18,18,21,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 10px 14px; display: flex; align-items: center; gap: 12px; transition: all 0.2s ease; animation: dtd-fadeSlideIn 0.35s ease both; }
        .dtd-tier-player:hover { transform: translateY(-2px) scale(1.01); border-color: rgba(161,43,31,0.35); box-shadow: 0 0 0 1px rgba(161,43,31,0.15), 0 8px 24px rgba(0,0,0,0.4); background: rgba(25,25,30,0.9); }
        .dtd-tier-player-avatar { width: 38px; height: 38px; border-radius: 10px; object-fit: cover; flex-shrink: 0; border: 1.5px solid rgba(255,255,255,0.1); }
        .dtd-tier-player-avatar-init { width: 38px; height: 38px; border-radius: 10px; background: rgba(161,43,31,0.1); border: 1.5px solid rgba(161,43,31,0.2); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 900; color: #A12B1F; flex-shrink: 0; }
        .dtd-tier-player-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .dtd-tier-player-name { font-size: 0.85rem; font-weight: 800; color: #E6E6E6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dtd-tier-player-rank { font-size: 0.72rem; color: #8A8880; white-space: nowrap; }

        /* ── Teams grid ── */
        .dtd-teams-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .dtd-team-box { background: rgba(18,18,21,0.8); border: 1px solid rgba(255,255,255,0.06); border-radius: 18px; padding: 26px; position: relative; transition: all 0.25s ease; animation: dtd-fadeSlideIn 0.4s ease both; }
        .dtd-team-box:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.5); border-color: rgba(161,43,31,0.2); }
        .dtd-team-box-num { position: absolute; top: 14px; right: 16px; font-size: 0.62rem; font-weight: 800; color: #A12B1F; background: rgba(161,43,31,0.1); border: 1px solid rgba(161,43,31,0.25); padding: 3px 10px; border-radius: 100px; }
        .dtd-team-box-header { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
        .dtd-team-logo { width: 54px; height: 54px; border-radius: 12px; background: linear-gradient(135deg, #A12B1F 0%, #7A1F15 100%); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; color: #fff; letter-spacing: 0.05em; flex-shrink: 0; overflow: hidden; }
        .dtd-team-logo img { width: 100%; height: 100%; object-fit: cover; }
        .dtd-team-box-name { font-size: 1.05rem; font-weight: 900; color: #E6E6E6; }
        .dtd-team-box-avg { font-size: 0.7rem; color: #555550; margin-top: 2px; }
        .dtd-team-box-members { display: flex; flex-direction: column; gap: 10px; }
        .dtd-team-box-member { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 10px; transition: all 0.15s ease; cursor: pointer; }
        .dtd-team-box-member:hover { background: rgba(161,43,31,0.06); transform: translateX(2px); }
        .dtd-team-box-member-avatar { width: 34px; height: 34px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
        .dtd-team-box-member-init { width: 34px; height: 34px; border-radius: 8px; background: #1a1a1f; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #555550; flex-shrink: 0; }
        .dtd-team-box-member-name { font-size: 0.86rem; font-weight: 600; color: #e0e0da; }
        .dtd-team-box-member-rank { font-size: 0.72rem; color: #8A8880; }
        .dtd-team-box-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.74rem; color: #555550; }

        /* ── Tables ── */
        .dtd-standings-table { width: 100%; border-collapse: collapse; }
        .dtd-standings-table th { font-size: 0.64rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #555550; padding: 10px 14px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .dtd-standings-table td { font-size: 0.88rem; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); color: #e0e0da; }
        .dtd-standings-table tr:last-child td { border-bottom: none; }
        .dtd-standings-table tbody tr { transition: background 0.15s; }
        .dtd-standings-table tbody tr:hover { background: rgba(161,43,31,0.04); }

        /* ── Match headers ── */
        .dtd-section-header { font-size: 0.7rem; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid; }
        .dtd-section-header.group { color: #555550; border-color: rgba(255,255,255,0.06); }
        .dtd-section-header.bracket { color: #f59e0b; border-color: rgba(245,158,11,0.3); }
        .dtd-match-day-header { font-size: 0.76rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #555550; margin: 22px 0 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; gap: 8px; }
        .dtd-match-day-header:first-child { margin-top: 0; }
        .dtd-match-day-header .day-num { color: #A12B1F; }
        .dtd-match-day-header.bracket-round .day-num { color: #f59e0b; }

        /* ── Match cards ── */
        .dtd-mc { display: flex; align-items: center; background: rgba(18,18,21,0.75); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; margin-bottom: 8px; overflow: hidden; transition: all 0.2s ease; min-height: 68px; backdrop-filter: blur(6px); }
        .dtd-mc:hover { border-color: rgba(161,43,31,0.25); box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
        .dtd-mc-index { width: 44px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; padding: 8px 0; border-right: 1px solid rgba(255,255,255,0.05); }
        .dtd-mc-index-num { font-size: 0.68rem; font-weight: 800; color: #555550; }
        .dtd-mc-index-fmt { font-size: 0.54rem; font-weight: 800; color: #A12B1F; background: rgba(161,43,31,0.1); padding: 2px 5px; border-radius: 4px; }
        .dtd-mc-team { flex: 1; display: flex; align-items: center; gap: 10px; padding: 10px 14px; min-width: 0; }
        .dtd-mc-team.right { flex-direction: row-reverse; text-align: right; }
        .dtd-mc-team-logo { width: 38px; height: 38px; border-radius: 9px; background: linear-gradient(135deg, #A12B1F 0%, #7A1F15 100%); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; color: #fff; flex-shrink: 0; overflow: hidden; }
        .dtd-mc-team-logo img { width: 100%; height: 100%; object-fit: cover; }
        .dtd-mc-team-info { flex: 1; min-width: 0; }
        .dtd-mc-team-tag { font-size: 0.64rem; font-weight: 800; color: #A12B1F; text-transform: uppercase; }
        .dtd-mc-team-name { font-size: 0.85rem; font-weight: 700; color: #E6E6E6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dtd-mc-avatars { display: flex; gap: 0; margin-top: 4px; }
        .dtd-mc-avatars img, .dtd-mc-avatars .dtd-mc-av-init { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid rgba(18,18,21,0.9); margin-left: -4px; object-fit: cover; }
        .dtd-mc-avatars img:first-child, .dtd-mc-avatars .dtd-mc-av-init:first-child { margin-left: 0; }
        .dtd-mc-av-init { background: #1a1a1f; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 700; color: #555550; }
        .dtd-mc-team.right .dtd-mc-avatars { justify-content: flex-end; }
        .dtd-mc-center { min-width: 90px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 4px; flex-shrink: 0; }
        .dtd-mc-score-box { display: flex; align-items: center; gap: 6px; font-size: 1.15rem; font-weight: 900; }
        .dtd-mc-score-box .s { min-width: 22px; text-align: center; color: #E6E6E6; }
        .dtd-mc-score-box .s.win { color: #4ade80; }
        .dtd-mc-score-box .s.loss { color: #f87171; }
        .dtd-mc-score-box .s.draw { color: #f59e0b; }
        .dtd-mc-score-box .dash { color: #555550; font-weight: 400; }
        .dtd-mc-status-badge { font-size: 0.58rem; font-weight: 800; padding: 2px 8px; border-radius: 100px; margin-top: 3px; }
        .dtd-mc-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; animation: dtd-pulse 1.5s ease-in-out infinite; }

        /* ── Tab share button ── */
        .dtd-tab-share { display: flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 100px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.5); cursor: pointer; font-family: inherit; font-size: 0.75rem; font-weight: 700; transition: all 0.15s; }
        .dtd-tab-share:hover { background: rgba(161,43,31,0.12); color: #A12B1F; border-color: rgba(161,43,31,0.3); }
        .dtd-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #22c55e; color: #fff; padding: 10px 22px; border-radius: 100px; font-size: 0.85rem; font-weight: 700; z-index: 2000; animation: dtd-toast-in 0.3s ease-out, dtd-toast-out 0.3s ease-in 1.7s both; pointer-events: none; display: flex; align-items: center; gap: 7px; }
        @keyframes dtd-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes dtd-toast-out { from { opacity: 1; } to { opacity: 0; } }

        @keyframes dtd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes dtspin { to { transform: rotate(360deg); } }
        @keyframes dtd-player-reveal { from { opacity: 0; transform: translateY(24px) scale(0.7) rotate(-2deg); filter: blur(4px); } to { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); filter: blur(0); } }
        @keyframes dtd-player-reveal-right { from { opacity: 0; transform: translateY(24px) scale(0.7) rotate(2deg); filter: blur(4px); } to { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); filter: blur(0); } }
        @keyframes dtd-vs-pop { 0% { opacity: 0; transform: scale(0.2) rotate(-180deg); filter: blur(8px); } 50% { opacity: 1; transform: scale(1.25) rotate(10deg); filter: blur(0); } 100% { opacity: 1; transform: scale(1) rotate(0deg); } }
        @keyframes dtd-glow-pulse { 0%,100% { box-shadow: 0 0 12px rgba(161,43,31,0.4), 0 0 40px rgba(161,43,31,0.15); } 50% { box-shadow: 0 0 24px rgba(161,43,31,0.7), 0 0 60px rgba(161,43,31,0.25); } }
        @keyframes dtd-streak-left { 0% { opacity: 0; transform: translateX(60px); } 100% { opacity: 1; transform: translateX(0); } }
        @keyframes dtd-streak-right { 0% { opacity: 0; transform: translateX(-60px); } 100% { opacity: 1; transform: translateX(0); } }
        @keyframes dtd-border-glow { 0%,100% { border-color: rgba(161,43,31,0.2); } 50% { border-color: rgba(161,43,31,0.5); } }
        @keyframes dtd-team-name-in { from { opacity: 0; transform: scale(0.6); filter: blur(6px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }
        .dtd-fighter-card { position: relative; transition: transform 0.2s; }
        .dtd-fighter-card:hover { transform: translateY(-2px) scale(1.06); z-index: 2; }
        .dtd-page { overflow-x: clip; }

        /* ── Share modal ── */
        .dtd-share-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 20px; overflow-y: auto; }
        .dtd-share-modal { background: #0a0e18; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 28px; max-width: 528px; width: 100%; }
        .dtd-share-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .dtd-share-modal-title { font-size: 1.1rem; font-weight: 900; color: #E6E6E6; display: flex; align-items: center; gap: 10px; }
        .dtd-share-close { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 100px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #8A8880; }
        .dtd-share-close:hover { background: rgba(161,43,31,0.12); color: #A12B1F; }
        .vtd-share-carousel { position: relative; width: 100%; }
        .vtd-share-carousel-nav { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
        .vtd-share-carousel-btn { width: 36px; height: 36px; border-radius: 100px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #8A8880; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; flex-shrink: 0; }
        .vtd-share-carousel-btn:hover { background: rgba(161,43,31,0.12); color: #A12B1F; }
        .vtd-share-carousel-btn:disabled { opacity: 0.3; cursor: default; }
        .vtd-share-carousel-center { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .vtd-share-carousel-label { font-size: 0.78rem; font-weight: 800; color: #E6E6E6; }
        .vtd-share-carousel-dots { display: flex; gap: 5px; }
        .vtd-share-carousel-dot { width: 6px; height: 6px; border-radius: 100px; background: rgba(255,255,255,0.15); transition: all 0.2s; }
        .vtd-share-carousel-dot.active { background: #A12B1F; width: 16px; }
        .vtd-share-carousel-actions { display: flex; gap: 8px; margin-top: 12px; }
        .vtd-share-img-btn { padding: 10px; border-radius: 100px; font-size: 0.8rem; font-weight: 700; cursor: pointer; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 6px; border: none; transition: all 0.15s; flex: 1; }
        .vtd-share-img-btn.dl { background: linear-gradient(135deg, #A12B1F, #7A1F15); color: #fff; }
        .vtd-share-img-btn.dl:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(161,43,31,0.35); }
        .vtd-share-img-btn.cp { background: rgba(255,255,255,0.05); color: #8A8880; border: 1px solid rgba(255,255,255,0.1); }
        .vtd-share-img-btn.cp:hover { background: rgba(161,43,31,0.10); color: #A12B1F; }

        /* ── Responsive ── */
        @media (max-width: 1100px) { .dtd-stat-tiles { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 900px) { .dtd-teams-grid { grid-template-columns: repeat(2, 1fr); } .dtd-tier-columns { flex-wrap: wrap; } .dtd-tier-col { min-width: calc(50% - 8px); flex: 0 0 calc(50% - 8px); } }
        @media (max-width: 800px) {
          .dtd-hero { min-height: 340px; }
          .dtd-hero-content { padding: 0 16px 24px; min-height: 340px; }
          .dtd-content { padding: 0 16px 40px; }
          .dtd-tabs-wrap { margin-left: -16px; margin-right: -16px; padding: 8px 16px; }
          .dtd-overview-grid { grid-template-columns: 1fr; }
          .dtd-mc-avatars { display: none; }
          .dtd-mc-team-name { font-size: 0.78rem; }
          .dtd-card { padding: 20px; }
        }
        @media (max-width: 600px) {
          .dtd-stat-tiles { grid-template-columns: repeat(2, 1fr); }
          .dtd-teams-grid { grid-template-columns: 1fr; }
          .dtd-tier-columns { flex-wrap: wrap; }
          .dtd-tier-col { min-width: 100%; flex: 0 0 100%; }
          .dtd-mc-team { padding: 8px 10px; gap: 8px; }
          .dtd-mc-team-logo { width: 32px; height: 32px; font-size: 9px; }
          .dtd-tab { min-height: 42px; padding: 0 6px; font-size: 0.74rem; gap: 4px; }
          .dtd-tab-label { display: none; }
          .dtd-tab-count { display: none; }
          .dtd-hero-title { font-size: 1.6rem; }
          .dtd-hero-desc { font-size: 0.88rem; }
          .dtd-hero-actions { gap: 8px; }
          .dtd-mc-center { min-width: 70px; }
          .dtd-mc-index { width: 36px; }
          .dtd-mc-score-box { font-size: 1rem; }
          .dtd-standings-table th, .dtd-standings-table td { padding: 10px 8px; font-size: 0.76rem; }
          .dtd-card { padding: 16px; border-radius: 14px; }
          .dtd-stat-tile { padding: 14px 10px; border-radius: 12px; }
          .dtd-stat-tile-val { font-size: 1.15rem; }
          .dtd-share-modal { padding: 20px; border-radius: 16px; }
          /* Expanded match section */
          .dtd-mc-expanded { padding: 14px 8px 12px !important; }
          .dtd-mc-player-row { gap: 6px !important; }
          .dtd-fighter-card { gap: 2px !important; }
          .dtd-fighter-card > img { width: 32px !important; height: 32px !important; }
          .dtd-fighter-card > div:first-child { width: 32px !important; height: 32px !important; font-size: 0.75rem !important; }
          .dtd-fighter-card > div:last-child { max-width: 40px !important; }
          .dtd-fighter-card > div:last-child > div:first-child { font-size: 0.52rem !important; }
          .dtd-mc-vs-col { padding: 0 2px !important; }
          .dtd-mc-vs { width: 34px !important; height: 34px !important; font-size: 0.75rem !important; }
        }
        @media (max-width: 400px) {
          .dtd-hero-content { padding: 0 12px 20px; min-height: 300px; }
          .dtd-content { padding: 0 12px 32px; }
          .dtd-tabs-wrap { margin-left: -12px; margin-right: -12px; padding: 6px 12px; }
          .dtd-tab { min-height: 38px; padding: 0 4px; font-size: 0.7rem; }
          .dtd-hero-title { font-size: 1.4rem; }
          .dtd-stat-tiles { gap: 8px; }
          /* Match cards at tiny screens */
          .dtd-mc-team { padding: 6px 6px !important; gap: 6px !important; }
          .dtd-mc-team-logo { width: 26px !important; height: 26px !important; font-size: 8px !important; border-radius: 7px !important; }
          .dtd-mc-center { min-width: 54px !important; }
          .dtd-mc-index { width: 28px !important; }
          .dtd-mc-score-box { font-size: 0.85rem !important; gap: 3px !important; }
          .dtd-mc-team-name { font-size: 0.7rem !important; }
          .dtd-mc-team-tag { font-size: 0.56rem !important; }
          /* Expanded match section */
          .dtd-mc-expanded { padding: 10px 4px 8px !important; }
          .dtd-mc-player-row { gap: 3px !important; }
          .dtd-fighter-card > img { width: 26px !important; height: 26px !important; }
          .dtd-fighter-card > div:first-child { width: 26px !important; height: 26px !important; font-size: 0.65rem !important; }
          .dtd-fighter-card > div:last-child { max-width: 32px !important; }
          .dtd-mc-vs-col { padding: 0 !important; }
          .dtd-mc-vs { width: 28px !important; height: 28px !important; font-size: 0.6rem !important; }
        }
      `}</style>

      {/* Animated background */}
      <div className="dtd-bg">
        <div className="dtd-bg-gradient" />
        <div className="dtd-bg-grid" />
        <div className="dtd-bg-glow1" />
        <div className="dtd-bg-glow2" />
        <div className="dtd-bg-glow3" />
      </div>

      <div className="dtd-page">
        <Navbar />

        {/* Back button */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 30px 0" }}>
          <button onClick={() => router.back()} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 100, padding: "6px 16px", fontSize: "0.78rem", fontWeight: 700,
            color: "#8A8880", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#F0EEEA"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#8A8880"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            Back
          </button>
        </div>

        {/* ═══ HERO ═══ */}
        <div className="dtd-hero">
          <img className="dtd-hero-bg" src={tournament.bannerImage || "/dota2poster3.jpg"} alt="" aria-hidden="true" />
          <div className="dtd-hero-overlay" />
          <div className="dtd-hero-content">
            <div className="dtd-hero-inner">
              <div className="dtd-hero-game-tag">Dota 2 Tournament</div>
              <div className="dtd-hero-title">{tournament.name}</div>
              {(tournament.description || tournament.desc) && (
                <div className="dtd-hero-desc">{tournament.description || tournament.desc}</div>
              )}
              <div className="dtd-hero-actions">
                {canRegister && (
                  <button
                    style={{ padding: "12px 32px", background: "linear-gradient(135deg, #A12B1F, #7A1F15)", color: "#fff", border: "none", borderRadius: 100, fontSize: "0.92rem", fontWeight: 800, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", boxShadow: "0 4px 20px rgba(161,43,31,0.35)" }}
                    onClick={() => {
                      if (!user) { setShowLoginPrompt(true); return; }
                      setShowRegister(true);
                    }}
                  >Register Now →</button>
                )}
                {!regClosed && !isRegistered && slotsLeft <= 0 && isRegOpen && (
                  <>
                    <button disabled style={{ padding: "12px 32px", background: "#555", color: "#aaa", border: "none", borderRadius: 100, fontSize: "0.92rem", fontWeight: 800, cursor: "default", fontFamily: "inherit", opacity: 0.7 }}>Slots Full</button>
                    <button
                      onClick={() => {
                        if (!user) {
                          try { sessionStorage.setItem("redirectAfterLogin", window.location.pathname + window.location.search); } catch {}
                          window.location.href = "/api/auth/discord-login";
                          return;
                        }
                        toggleWaitlist();
                      }}
                      disabled={waitlistLoading}
                      style={{ padding: "10px 22px", background: onWaitlist ? "rgba(34,197,94,0.12)" : "rgba(251,191,36,0.1)", color: onWaitlist ? "#4ade80" : "#fbbf24", border: `1px solid ${onWaitlist ? "rgba(34,197,94,0.3)" : "rgba(251,191,36,0.3)"}`, borderRadius: 100, fontSize: "0.82rem", fontWeight: 700, cursor: waitlistLoading ? "default" : "pointer", fontFamily: "inherit", transition: "all 0.2s", opacity: waitlistLoading ? 0.6 : 1 }}
                    >{waitlistLoading ? "..." : onWaitlist ? "On Waitlist ✓" : "Join Waitlist"}</button>
                  </>
                )}
                {isRegistered && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ padding: "12px 28px", background: "rgba(22,163,74,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 100, fontSize: "0.9rem", fontWeight: 700 }}>✓ Registered</div>
                    {tournament.status === "upcoming" && !tournament.bracketsComputed && (
                      <button
                        onClick={handleUnregister}
                        disabled={unregLoading}
                        style={{
                          padding: "10px 20px", background: "rgba(239,68,68,0.08)", color: "#ef4444",
                          border: "1px solid rgba(239,68,68,0.25)", borderRadius: 100, fontSize: "0.78rem",
                          fontWeight: 700, cursor: unregLoading ? "default" : "pointer", fontFamily: "inherit",
                          transition: "all 0.15s", opacity: unregLoading ? 0.6 : 1,
                        }}
                      >{unregLoading ? "Withdrawing..." : "Withdraw"}</button>
                    )}
                  </div>
                )}
                {!isRegOpen && !isRegistered && (
                  <div style={{ padding: "10px 22px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 100, fontSize: "0.86rem", fontWeight: 800, color: "#8A8880" }}>
                    Opens {formatDate(schedule.registrationOpens)} · {formatTime(schedule.registrationOpens)}
                  </div>
                )}
                {regClosed && !isRegistered && isRegOpen && (
                  <button
                    onClick={() => { setActiveTab("leaderboard"); setTimeout(() => { const el = tabsWrapRef.current; if (el) { const y = el.getBoundingClientRect().top + window.scrollY - 70; window.scrollTo({ top: y, behavior: "smooth" }); } }, 50); }}
                    style={{ padding: "10px 24px", background: "rgba(190,58,37,0.12)", color: "#BE3A25", border: "1px solid rgba(190,58,37,0.3)", borderRadius: 100, fontSize: "0.86rem", fontWeight: 800, cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit" }}
                  >Leaderboard</button>
                )}
                <button className="dtd-hero-share-btn" onClick={() => setShowShareCard(true)} title="Share tournament">
                  <Share2 size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="dtd-content">

          {/* ═══ CHAMPION BANNER ═══ */}
          {championTeamName && (
            <div style={{
              background: "linear-gradient(135deg, rgba(255,215,0,0.08) 0%, rgba(161,43,31,0.06) 50%, rgba(255,215,0,0.08) 100%)",
              border: "1px solid rgba(255,215,0,0.25)", borderRadius: 14, padding: "20px 24px", marginBottom: 20, textAlign: "center", position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 0%, rgba(255,215,0,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
              <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#ffd700", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Tournament Champion</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#E6E6E6", lineHeight: 1.2 }}>{championTeamName}</div>
              {championMembers.length > 0 && (
                <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                  {championMembers.map((p: any, i: number) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 100, padding: "4px 12px 4px 4px" }}>
                      {p.steamAvatar ? (
                        <img src={p.steamAvatar} alt="" style={{ width: 24, height: 24, borderRadius: "50%", border: "1px solid rgba(255,215,0,0.3)" }} />
                      ) : (
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(255,215,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, color: "#ffd700" }}>{(p.steamName || "?")[0]}</div>
                      )}
                      <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "#E6E6E6" }}>{p.steamName || "Player"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ TAB BAR ═══ */}
          <div className="dtd-tabs-wrap" ref={tabsWrapRef}>
            <div className="dtd-tabs">
              {TABS.map(t => (
                <button key={t.key} className={`dtd-tab${activeTab === t.key ? " active" : ""}`} onClick={() => { setActiveTab(t.key); router.replace(`?tab=${t.key}`, { scroll: false }); setTimeout(() => { const el = tabsWrapRef.current; if (el) { const y = el.getBoundingClientRect().top + window.scrollY - 70; window.scrollTo({ top: y, behavior: "smooth" }); } }, 50); }} title={t.label}>
                  <t.Icon size={16} strokeWidth={activeTab === t.key ? 2.5 : 2} />
                  <span className="dtd-tab-label">{t.label}</span>
                  {t.key === "players" && players.length > 0 && <span className="dtd-tab-count">{players.length}</span>}
                  {t.key === "teams" && teams.length > 0 && <span className="dtd-tab-count">{teams.length}</span>}
                </button>
              ))}
            </div>
          </div>
          {/* Slots info strip */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, padding: "10px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, fontSize: "0.82rem", color: "#8A8880", flexWrap: "wrap", gap: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Users size={14} strokeWidth={2} /> <strong style={{ color: "#E6E6E6" }}>{tournament.slotsBooked}</strong> / {tournament.totalSlots} filled</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Clock size={14} strokeWidth={2} /> {isRegOpen ? countdown : `Opens ${formatDate(schedule.registrationOpens)}`}</span>
          </div>

          {/* ═══ OVERVIEW ═══ */}
          {activeTab === "overview" && (
            <div className="dtd-tab-pane" ref={tabContentRef}>
              <div className="dtd-stat-tiles">
                <div className="dtd-stat-tile blue" style={{ animationDelay: "0s" }}>
                  <div className="dtd-stat-tile-icon"><Zap size={24} color="#A12B1F" /></div>
                  <div className="dtd-stat-tile-val">{tournament.format === "shuffle" ? "Shuffle" : tournament.format === "auction" ? "Auction" : "Standard"}</div>
                  <div className="dtd-stat-tile-lbl">Format</div>
                </div>
                <div className="dtd-stat-tile" style={{ animationDelay: "0.05s" }}>
                  <div className="dtd-stat-tile-icon"><Coins size={24} color="#8A8880" /></div>
                  <div className="dtd-stat-tile-val">{tournament.entryFee === 0 ? "Free" : tournament.entry || `₹${tournament.entryFee}`}</div>
                  <div className="dtd-stat-tile-lbl">Entry Fee</div>
                </div>
                {tournament.prizePool && tournament.prizePool !== "0" && (
                  <div className="dtd-stat-tile gold" style={{ animationDelay: "0.1s" }}>
                    <div className="dtd-stat-tile-icon"><Trophy size={24} color="#fbbf24" /></div>
                    <div className="dtd-stat-tile-val">{tournament.prizePool.startsWith("₹") ? tournament.prizePool : `₹${tournament.prizePool}`}</div>
                    <div className="dtd-stat-tile-lbl">Prize Pool</div>
                  </div>
                )}
                <div className="dtd-stat-tile light-blue" style={{ animationDelay: "0.15s" }}>
                  <div className="dtd-stat-tile-icon"><Calendar size={24} color="#BE3A25" /></div>
                  <div className="dtd-stat-tile-val">{formatDate(tournament.startDate)}</div>
                  <div className="dtd-stat-tile-lbl">Start Date</div>
                </div>
                <div className="dtd-stat-tile" style={{ animationDelay: "0.2s" }}>
                  <div className="dtd-stat-tile-icon"><Users size={24} color="#8A8880" /></div>
                  <div className="dtd-stat-tile-val">{tournament.slotsBooked}/{tournament.totalSlots}</div>
                  <div className="dtd-stat-tile-lbl">Players Registered</div>
                </div>
                <div className="dtd-stat-tile" style={{ animationDelay: "0.25s" }}>
                  <div className="dtd-stat-tile-icon"><Target size={24} color="#8A8880" /></div>
                  <div className="dtd-stat-tile-val">BO{tournament.matchesPerRound || 2}</div>
                  <div className="dtd-stat-tile-lbl">Match Format</div>
                </div>
                <div className="dtd-stat-tile" style={{ animationDelay: "0.3s" }}>
                  <div className="dtd-stat-tile-icon"><Shield size={24} color="#8A8880" /></div>
                  <div className="dtd-stat-tile-val">Swiss</div>
                  <div className="dtd-stat-tile-lbl">Group Stage Format</div>
                </div>
                <div className="dtd-stat-tile" style={{ animationDelay: "0.35s" }}>
                  <div className="dtd-stat-tile-icon"><GitBranch size={24} color="#8A8880" /></div>
                  <div className="dtd-stat-tile-val">{tournament.bracketFormat === "single_elimination" ? "Single Elim" : "Double Elim"}</div>
                  <div className="dtd-stat-tile-lbl">Play-Off Format</div>
                </div>
              </div>

              <div className="dtd-overview-grid">
                <div>
                  {(tournament.description || tournament.desc) && (
                    <div className="dtd-card">
                      <span className="dtd-card-label"><Info size={12} style={{ display: "inline", marginRight: 6 }} />About this Tournament</span>
                      <p className="dtd-desc">{tournament.description || tournament.desc}</p>
                    </div>
                  )}
                  {(tournament.rules || []).length > 0 && (
                    <div className="dtd-card">
                      <span className="dtd-card-label"><ScrollText size={12} style={{ display: "inline", marginRight: 6 }} />Rules</span>
                      <div className="dtd-rules-scroll">
                        {(tournament.rules || []).map((rule: string, i: number) => (
                          <div key={i} className="dtd-rule">
                            <span className="dtd-rule-num">{i + 1}</span>
                            <span className="dtd-rule-text">{rule}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <div className="dtd-card">
                    <span className="dtd-card-label"><GitBranch size={12} style={{ display: "inline", marginRight: 6 }} />Tournament Flow</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {[
                        { label: "Group Stage", sub: `${tournament.groupStageRounds || 3} rounds · BO${tournament.matchesPerRound || 2}`, color: "#A12B1F" },
                        { label: "→", sub: `Top ${tournament.bracketTeamCount || "50%"}`, color: "#555550", isArrow: true },
                        { label: "Play-offs", sub: `${tournament.bracketFormat === "single_elimination" ? "Single" : "Double"} Elim · BO${tournament.bracketBestOf || 2}`, color: "#f59e0b" },
                        { label: "→", sub: `LB Final BO${tournament.lbFinalBestOf || tournament.bracketBestOf || 2}`, color: "#555550", isArrow: true },
                        { label: "Grand Final", sub: `BO${tournament.grandFinalBestOf || 3}`, color: "#A12B1F" },
                      ].map((s, i) => s.isArrow ? (
                        <div key={i} style={{ color: "#555550", fontSize: "1.2rem", flexShrink: 0 }}>{s.label}</div>
                      ) : (
                        <div key={i} style={{ flex: 1, minWidth: 100, background: `${s.color}10`, border: `1px solid ${s.color}30`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                          <div style={{ fontSize: "0.82rem", fontWeight: 800, color: s.color }}>{s.label}</div>
                          <div style={{ fontSize: "0.65rem", color: "#8A8880", marginTop: 3 }}>{s.sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {Object.keys(schedule).length > 0 && (
                    <div className="dtd-card">
                      <span className="dtd-card-label"><Calendar size={12} style={{ display: "inline", marginRight: 6 }} />Schedule</span>
                      <div className="dtd-timeline">
                        {schedule.registrationOpens && <TimelineItem label="Registration Opens" date={schedule.registrationOpens} status={new Date(schedule.registrationOpens) <= new Date() ? "past" : "future"} />}
                        {schedule.registrationCloses && <TimelineItem label="Registration Closes" date={schedule.registrationCloses} status={new Date(schedule.registrationCloses) <= new Date() ? "past" : new Date(schedule.registrationOpens) <= new Date() ? "active" : "future"} />}
                        {schedule.squadCreation && <TimelineItem label="Team Formation" date={schedule.squadCreation} status={new Date(schedule.squadCreation) <= new Date() ? "past" : "future"} />}
                        {schedule.groupStageStart && <TimelineItem label="Group Stage Starts" date={schedule.groupStageStart} status={tournament.status === "ongoing" ? "active" : new Date(schedule.groupStageStart) <= new Date() ? "past" : "future"} badge={tournament.status === "ongoing" ? "ACTIVE" : undefined} />}
                        {schedule.tourneyStageStart && <TimelineItem label="Play-off Stage" date={schedule.tourneyStageStart} status="future" />}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ PLAYERS ═══ */}
          {activeTab === "players" && (
            <div className="dtd-tab-pane" ref={tabContentRef}>
              <div className="dtd-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <span className="dtd-card-label" style={{ marginBottom: 0 }}>Registered Players ({players.length})</span>
                  <TabSharePopover tabKey="players" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} />
                </div>
                {players.length === 0 ? (
                  <div className="dtd-empty"><Users size={48} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block", color: "#555550" }} /><span className="dtd-empty-title">No players registered yet</span><span className="dtd-empty-sub">Be the first to register!</span></div>
                ) : (() => {
                  const bracketColors: Record<string, { bg: string; border: string; text: string; label: string }> = {
                    divine_immortal:  { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)", text: "#f59e0b", label: "Divine – Immortal" },
                    legend_ancient:   { bg: "rgba(168,85,247,0.10)", border: "rgba(168,85,247,0.30)", text: "#a855f7", label: "Legend – Ancient" },
                    crusader_archon:  { bg: "rgba(161,43,31,0.10)", border: "rgba(161,43,31,0.30)", text: "#A12B1F", label: "Crusader – Archon" },
                    herald_guardian:  { bg: "rgba(107,114,128,0.10)", border: "rgba(107,114,128,0.30)", text: "#6b7280", label: "Herald – Guardian" },
                  };
                  const computeBracket = (rankTier: number) => {
                    if (!rankTier || rankTier <= 25) return "herald_guardian";
                    if (rankTier <= 45) return "crusader_archon";
                    if (rankTier <= 65) return "legend_ancient";
                    return "divine_immortal";
                  };
                  const grouped: Record<string, any[]> = {};
                  players.forEach((p: any) => {
                    const bracket = p.dotaRankTier ? computeBracket(p.dotaRankTier) : (p.dotaBracket || "herald_guardian");
                    if (!grouped[bracket]) grouped[bracket] = [];
                    grouped[bracket].push(p);
                  });
                  const sortedBrackets = Object.keys(grouped).sort((a, b) => {
                    const order = ["herald_guardian", "crusader_archon", "legend_ancient", "divine_immortal"];
                    return order.indexOf(b) - order.indexOf(a);
                  });
                  return (
                    <div className="dtd-tier-columns">
                      {sortedBrackets.map((bracket) => {
                        const colors = bracketColors[bracket] || bracketColors.herald_guardian;
                        const bracketPlayers = grouped[bracket].sort((a: any, b: any) => (b.dotaRankTier || 0) - (a.dotaRankTier || 0));
                        return (
                          <div key={bracket} className="dtd-tier-col">
                            <div className="dtd-tier-header" style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}>
                              <span>{colors.label}</span>
                              <span className="dtd-tier-header-count">{bracketPlayers.length}</span>
                            </div>
                            {bracketPlayers.map((p: any) => {
                              const displayName = p.steamName || p.fullName || "Player";
                              const dotaRanks = ["", "Herald", "Guardian", "Crusader", "Archon", "Legend", "Ancient", "Divine", "Immortal"];
                              const tier = p.dotaRankTier || 0;
                              const medal = Math.floor(tier / 10);
                              const stars = tier % 10;
                              const rankName = tier > 0 && medal >= 1 && medal <= 8 ? `${dotaRanks[medal]}${stars > 0 ? ` ${stars}` : ""}` : "";
                              const rankLabel = p.dotaMMR ? `${rankName ? rankName + " · " : ""}${p.dotaMMR} MMR` : rankName || colors.label;
                              const isMe = user?.uid === (p.uid || p.id);
                              return (
                              <Link key={p.uid || p.id} href={`/player/${p.uid || p.id}?tab=dota`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                                <div className="dtd-tier-player" style={isMe ? { background: "rgba(60,203,255,0.10)", boxShadow: "inset 2px 0 0 #3CCBFF", borderRadius: 10 } : {}}>
                                  {p.steamAvatar ? <img className="dtd-tier-player-avatar" src={p.steamAvatar} alt={displayName} /> : <div className="dtd-tier-player-avatar-init">{displayName[0].toUpperCase()}</div>}
                                  <div className="dtd-tier-player-info">
                                    <span className="dtd-tier-player-name">{displayName}{isMe && <span style={{ marginLeft: 6, fontSize: "0.55rem", fontWeight: 800, padding: "1px 6px", borderRadius: 100, background: "rgba(60,203,255,0.15)", color: "#3CCBFF", border: "1px solid rgba(60,203,255,0.3)" }}>YOU</span>}</span>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <span className="dtd-tier-player-rank">{rankLabel}</span>
                                      <RankReportBadge playerUid={p.uid || p.id} playerName={displayName} tournamentId={id} game="dota2" user={user} userName={userProfile?.steamName || userProfile?.discordUsername || userProfile?.fullName || "Anonymous"} reports={rankReports} onReportSubmitted={fetchRankReports} nameMap={Object.fromEntries(players.map((pl: any) => [pl.uid || pl.id, pl.steamName || pl.fullName || "Player"]))} />
                                    </div>
                                  </div>
                                </div>
                              </Link>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ═══ TEAMS ═══ */}
          {activeTab === "teams" && (
            <div className="dtd-tab-pane" ref={tabContentRef}>
              {teams.length === 0 ? (
                <div className="dtd-card"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><span className="dtd-card-label" style={{ marginBottom: 0 }}>Teams</span><TabSharePopover tabKey="teams" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} /></div><div className="dtd-empty"><Shield size={48} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block", color: "#555550" }} /><span className="dtd-empty-title">Teams not generated yet</span><span className="dtd-empty-sub">Teams will be shuffled after registration closes.</span></div></div>
              ) : (
                <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span className="dtd-card-label" style={{ marginBottom: 0 }}>Teams ({teams.length})</span>
                  <TabSharePopover tabKey="teams" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} />
                </div>
                <div className="dtd-teams-grid">
                  {teams.map((team: any) => (
                    <div key={team.id} className="dtd-team-box">
                      <span className="dtd-team-box-num">#{team.teamIndex}</span>
                      <div className="dtd-team-box-header">
                        <div className="dtd-team-logo">
                          {team.teamLogo ? <img src={team.teamLogo} alt={team.teamName} /> : getTeamInitials(team.teamName)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="dtd-team-box-name">{team.teamName}</div>
                          {team.avgSkillLevel && <div className="dtd-team-box-avg">Avg MMR: {team.avgSkillLevel}</div>}
                        </div>
                      </div>
                      <div className="dtd-team-box-members">
                        {[...(team.members || [])]
                          .sort((a: any, b: any) => (b.dotaMMR || 0) - (a.dotaMMR || 0))
                          .map((m: any, i: number) => {
                          const isMeMember = user?.uid === m.uid;
                          return (
                          <Link key={m.uid || i} href={`/player/${m.uid}?tab=dota`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                            <div className="dtd-team-box-member" style={isMeMember ? { background: "rgba(60,203,255,0.10)", boxShadow: "inset 2px 0 0 #3CCBFF", borderRadius: 8 } : {}}>
                              <PlayerAvatarBadge mvpBracket={m.mvpBracket} isChampion={m.isChampion} size={36} inset>
                                {m.steamAvatar ? <img src={m.steamAvatar} alt={m.steamName} className="dtd-team-box-member-avatar" /> : <div className="dtd-team-box-member-init">{(m.steamName || "?")[0]}</div>}
                              </PlayerAvatarBadge>
                              <div style={{ flex: 1, minWidth: 0 }}><div className="dtd-team-box-member-name">{m.steamName || "Player"}{isMeMember && <span style={{ marginLeft: 6, fontSize: "0.55rem", fontWeight: 800, padding: "1px 5px", borderRadius: 100, background: "rgba(60,203,255,0.15)", color: "#3CCBFF", border: "1px solid rgba(60,203,255,0.3)" }}>YOU</span>}</div><div className="dtd-team-box-member-rank">{m.dotaMMR ? `${m.dotaMMR} MMR` : ""}</div></div>
                            </div>
                          </Link>
                        );})}
                      </div>
                      <div className="dtd-team-box-footer">
                        <span>{team.members?.length || 0} players</span>
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ STANDINGS ═══ */}
          {activeTab === "standings" && (
            <div className="dtd-tab-pane" ref={tabContentRef}>
              <div className="dtd-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <span className="dtd-card-label" style={{ marginBottom: 0 }}>Group Stage Standings</span>
                  <TabSharePopover tabKey="standings" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} />
                </div>
                {standings.length === 0 ? (
                  <div className="dtd-empty"><Trophy size={48} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block", color: "#555550" }} /><span className="dtd-empty-title">No standings yet</span><span className="dtd-empty-sub">Standings will appear once matches are played.</span></div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="dtd-standings-table">
                      <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th style={{ color: "#4ade80" }}>MW</th><th style={{ color: "#f87171" }}>ML</th><th style={{ color: "#A12B1F" }}>Pts</th><th>BH</th></tr></thead>
                      <tbody>{standings.map((s: any, i: number) => (<tr key={s.id}><td style={{ fontWeight: 800, color: i < 6 ? "#A12B1F" : "#555550" }}>{i + 1}</td><td style={{ fontWeight: 700 }}>{s.teamName}</td><td>{s.played || 0}</td><td>{s.wins || 0}</td><td>{s.draws || 0}</td><td>{s.losses || 0}</td><td style={{ color: "#4ade80" }}>{s.mapsWon || 0}</td><td style={{ color: "#f87171" }}>{s.mapsLost || 0}</td><td style={{ fontWeight: 800, color: "#A12B1F" }}>{s.points || 0}</td><td style={{ color: "#555550" }}>{s.buchholz || 0}</td></tr>))}</tbody>
                    </table>
                  </div>
                )}
              </div>
              <CommentSection tournamentId={id} section="standings" game="dota2" user={user} userProfile={userProfile} />
            </div>
          )}

          {/* ═══ MATCHES ═══ */}
          {activeTab === "matches" && (
            <div className="dtd-tab-pane" ref={tabContentRef}>
              {matches.length === 0 ? (
                <div className="dtd-card"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><span className="dtd-card-label" style={{ marginBottom: 0 }}>Matches</span><TabSharePopover tabKey="matches" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} /></div><div className="dtd-empty"><Swords size={48} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block", color: "#555550" }} /><span className="dtd-empty-title">No matches scheduled</span><span className="dtd-empty-sub">Matches will appear once pairings are generated.</span></div></div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span className="dtd-card-label" style={{ marginBottom: 0 }}>Matches</span>
                    <TabSharePopover tabKey="matches" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} />
                  </div>
                  {groupMatches.length > 0 && (
                    <div>
                      <div className="dtd-section-header group">Group Stage Fixtures</div>
                      {(() => { const days = [...new Set(groupMatches.map((m: any) => m.matchDay))].sort((a: number, b: number) => a - b); return days.map((day: number) => (<div key={day}><div className="dtd-match-day-header"><span className="day-num">Round {day}</span><span>· {groupMatches.filter((m: any) => m.matchDay === day).length} matches</span></div>{groupMatches.filter((m: any) => m.matchDay === day).map((m: any) => (<MatchCard key={m.id} m={m} teamMembers={teamMembers} teamLogoMap={teamLogoMap} expandedMatch={expandedMatch} setExpandedMatch={setExpandedMatch} tournamentId={id} isBracket={false} bestOf={tournament?.matchesPerRound || 2} />))}</div>)); })()}
                    </div>
                  )}
                  {bracketMatches.length > 0 && (
                    <div style={{ marginTop: groupMatches.length > 0 ? 32 : 0 }}>
                      <div className="dtd-section-header bracket">Play-off Fixtures</div>
                      {(() => { const days = [...new Set(bracketMatches.map((m: any) => m.matchDay))].sort((a: number, b: number) => a - b); let bracketRoundNum = 0; return days.map((day: number) => { bracketRoundNum++; const dayMatches = bracketMatches.filter((m: any) => m.matchDay === day); return (<div key={day}><div className="dtd-match-day-header bracket-round"><span className="day-num">Bracket Round {bracketRoundNum}</span><span>· {dayMatches.length} matches</span></div>{dayMatches.map((m: any) => (<MatchCard key={m.id} m={m} teamMembers={teamMembers} teamLogoMap={teamLogoMap} expandedMatch={expandedMatch} setExpandedMatch={setExpandedMatch} tournamentId={id} isBracket={true} bestOf={m.bracketType === "grand_final" ? (tournament?.grandFinalBestOf || 3) : m.id === "lb-final" && tournament?.lbFinalBestOf ? tournament.lbFinalBestOf : (tournament?.bracketBestOf || 2)} />))}</div>); }); })()}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ═══ BRACKETS ═══ */}
          {activeTab === "brackets" && (
            <div className="dtd-tab-pane" ref={tabContentRef}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 900, color: "#E6E6E6" }}>Elimination Play-offs</h3>
                  <span style={{
                    fontSize: "0.6rem", fontWeight: 900, letterSpacing: "0.1em", padding: "3px 10px", borderRadius: 100,
                    background: tournament.bracketFormat === "single_elimination" ? "rgba(245,158,11,0.12)" : "rgba(161,43,31,0.12)",
                    border: `1px solid ${tournament.bracketFormat === "single_elimination" ? "rgba(245,158,11,0.35)" : "rgba(161,43,31,0.35)"}`,
                    color: tournament.bracketFormat === "single_elimination" ? "#f59e0b" : "#A12B1F",
                  }}>
                    {tournament.bracketFormat === "single_elimination" ? "SINGLE ELIMINATION" : "DOUBLE ELIMINATION"}
                  </span>
                </div>
                <TabSharePopover tabKey="brackets" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} />
              </div>
              {bracketMatches.length === 0 ? (
                <div className="dtd-card"><div className="dtd-empty"><GitBranch size={48} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block", color: "#555550" }} /><span className="dtd-empty-title">No bracket matches yet</span><span className="dtd-empty-sub">Play-off bracket will be generated after the group stage.</span></div></div>
              ) : (
                <DoubleBracket
                  matches={bracketMatches}
                  bracketSize={tournament.bracketTeamCount || tournament.bracketSize || 4}
                  standings={standings}
                  bracketBestOf={tournament.bracketBestOf || 2}
                  lbFinalBestOf={tournament.lbFinalBestOf}
                  grandFinalBestOf={tournament.grandFinalBestOf || 3}
                />
              )}
            </div>
          )}

          {/* ═══ LEADERBOARD ═══ */}
          {activeTab === "leaderboard" && (
            <div className="dtd-tab-pane" ref={tabContentRef}>
              <div className="dtd-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <span className="dtd-card-label" style={{ marginBottom: 0 }}>Player Leaderboard</span>
                  <TabSharePopover tabKey="leaderboard" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} />
                </div>
                {leaderboard.length === 0 ? (
                  <div className="dtd-empty"><BarChart3 size={48} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block", color: "#555550" }} /><span className="dtd-empty-title">No stats yet</span><span className="dtd-empty-sub">Player stats will appear once match data is available.</span></div>
                ) : (() => {
                  const bracketColors: Record<string, { bg: string; border: string; text: string; label: string }> = {
                    divine_immortal:  { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)", text: "#f59e0b", label: "Divine – Immortal" },
                    legend_ancient:   { bg: "rgba(168,85,247,0.10)", border: "rgba(168,85,247,0.30)", text: "#a855f7", label: "Legend – Ancient" },
                    crusader_archon:  { bg: "rgba(161,43,31,0.10)", border: "rgba(161,43,31,0.30)", text: "#A12B1F", label: "Crusader – Archon" },
                    herald_guardian:  { bg: "rgba(107,114,128,0.10)", border: "rgba(107,114,128,0.30)", text: "#6b7280", label: "Herald – Guardian" },
                  };
                  const computeBracketLb = (rankTier: number) => {
                    if (!rankTier || rankTier <= 25) return "herald_guardian";
                    if (rankTier <= 45) return "crusader_archon";
                    if (rankTier <= 65) return "legend_ancient";
                    return "divine_immortal";
                  };
                  const playerBracketMap: Record<string, string> = {};
                  const playerAvatarMap: Record<string, string> = {};
                  players.forEach((p: any) => {
                    if (p.uid) playerBracketMap[p.uid] = p.dotaRankTier ? computeBracketLb(p.dotaRankTier) : (p.dotaBracket || "herald_guardian");
                    if (p.uid && p.steamAvatar) playerAvatarMap[p.uid] = p.steamAvatar;
                  });
                  const kdaScore = (p: any) => ((p.totalKills || 0) + 0.5 * (p.totalAssists || 0)) / Math.max(1, p.totalDeaths || 1);
                  const grouped: Record<string, any[]> = {};
                  leaderboard.forEach((p: any) => {
                    const bracket = playerBracketMap[p.uid || p.id] || "herald_guardian";
                    if (!grouped[bracket]) grouped[bracket] = [];
                    grouped[bracket].push(p);
                  });
                  Object.values(grouped).forEach(arr => arr.sort((a: any, b: any) => (b.totalScore || 0) - (a.totalScore || 0)));
                  const sortedBrackets = Object.keys(grouped).sort((a, b) => {
                    const order = ["herald_guardian", "crusader_archon", "legend_ancient", "divine_immortal"];
                    return order.indexOf(b) - order.indexOf(a);
                  });
                  // Per-bracket MVP: highest KDA in each bracket
                  const bracketMvpMap: Record<string, string> = {};
                  const bracketMvpData: { bracket: string; player: any }[] = [];
                  for (const bracket of sortedBrackets) {
                    const kdaSorted = [...grouped[bracket]].sort((a: any, b: any) => {
                      const diff = kdaScore(b) - kdaScore(a);
                      if (Math.abs(diff) > 0.01) return diff;
                      return (b.totalKills || 0) - (a.totalKills || 0);
                    });
                    if (kdaSorted.length > 0) {
                      bracketMvpMap[kdaSorted[0].id] = bracket;
                      bracketMvpData.push({ bracket, player: kdaSorted[0] });
                    }
                  }
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                      {/* ── MVP Banner ── */}
                      <div style={{ padding: "16px 0" }}>
                        <div style={{ textAlign: "center", marginBottom: 16 }}>
                          <div style={{ fontSize: "1.4rem", marginBottom: 4 }}>{"\u{1F451}"}</div>
                          <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: "#8A8880" }}>Bracket MVPs</span>
                          <div style={{ fontSize: "0.6rem", color: "#555550", marginTop: 2 }}>KDA = (K + 0.5 &times; A) / D</div>
                        </div>
                        <div className="dtd-tier-columns" style={{ justifyContent: "center" }}>
                          {bracketMvpData.map(({ bracket: bk, player: pl }) => {
                            const bColors = bracketColors[bk] || bracketColors.herald_guardian;
                            const avatar = playerAvatarMap[pl.uid] || "";
                            const kda = kdaScore(pl);
                            return (
                              <div key={bk} className="dtd-tier-col" style={{ minWidth: 130, maxWidth: 180 }}>
                                <div className="dtd-tier-header" style={{ background: bColors.bg, border: `1px solid ${bColors.border}`, color: bColors.text, justifyContent: "center" }}>
                                  <span>{bColors.label}</span>
                                </div>
                                <div onClick={() => pl.uid && router.push(`/player/${pl.uid}?tab=dota`)} style={{ cursor: pl.uid ? "pointer" : "default", padding: "12px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                  {avatar ? (
                                    <img src={avatar} alt={pl.steamName || pl.name} style={{ width: 48, height: 48, borderRadius: "50%", border: `2px solid ${bColors.border}` }} />
                                  ) : (
                                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: bColors.bg, border: `2px solid ${bColors.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, color: bColors.text }}>{((pl.steamName || pl.name || "?")[0]).toUpperCase()}</div>
                                  )}
                                  <div style={{ textAlign: "center" }}>
                                    <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{pl.steamName || pl.name}</div>
                                  </div>
                                  <div style={{ fontWeight: 800, fontSize: "0.9rem", color: bColors.text }}>{Math.round(kda * 100) / 100} KDA</div>
                                  <div style={{ fontSize: "0.65rem", color: "#555550" }}>{pl.totalKills || 0}K / {pl.totalDeaths || 0}D / {pl.totalAssists || 0}A</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {sortedBrackets.map((bracket) => {
                        const colors = bracketColors[bracket] || bracketColors.herald_guardian;
                        const entries = grouped[bracket];
                        return (
                          <div key={bracket}>
                            <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text, fontWeight: 800, fontSize: "0.95rem", padding: "8px 14px", borderRadius: 8, marginBottom: 10, textAlign: "center" }}>
                              <span>{colors.label}</span>
                              <span style={{ fontSize: "0.8rem", opacity: 0.7, marginLeft: 8 }}>({entries.length})</span>
                            </div>
                            <div style={{ overflowX: "auto" }}>
                              <table className="dtd-standings-table">
                                <thead><tr><th>Player</th><th style={{ color: "#4ade80" }}>K</th><th style={{ color: "#f87171" }}>D</th><th>A</th><th>GPM</th><th>XPM</th><th style={{ color: colors.text }}>Score</th></tr></thead>
                                <tbody>{entries.map((p: any, i: number) => {
                                  const isMvp = bracketMvpMap[p.id] === bracket;
                                  const isMeRow = user?.uid === p.uid;
                                  let rowBg: React.CSSProperties = {};
                                  if (isMeRow) rowBg = { background: "rgba(60,203,255,0.08)", boxShadow: "inset 2px 0 0 #3CCBFF" };
                                  else if (isMvp) rowBg = { background: colors.bg };

                                  const playerCell = (<>
                                    <div style={{ fontWeight: 700 }}>{p.steamName || p.name}{isMvp && <span style={{ marginLeft: 6, fontSize: "0.6rem", fontWeight: 800, padding: "1px 6px", borderRadius: 100, background: colors.border, color: colors.text, border: `1px solid ${colors.border}` }}>MVP</span>}{isMeRow && <span style={{ marginLeft: 6, fontSize: "0.55rem", fontWeight: 800, padding: "1px 6px", borderRadius: 100, background: "rgba(60,203,255,0.15)", color: "#3CCBFF", border: "1px solid rgba(60,203,255,0.3)" }}>YOU</span>}</div>
                                    <div style={{ textAlign: "center" }}><span style={{ fontSize: "0.62rem", fontWeight: 700, color: colors.text, padding: "1px 5px", borderRadius: 4, background: colors.bg, whiteSpace: "nowrap" }}>{colors.label}</span></div>
                                  </>);

                                  return (
                                  <tr key={p.id} style={rowBg}>
                                    <td>{p.uid ? (<Link href={`/player/${p.uid}?tab=dota`} style={{ textDecoration: "none", color: "inherit" }}>{playerCell}</Link>) : playerCell}</td>
                                    <td style={{ fontWeight: 700, color: "#4ade80" }}>{p.totalKills || 0}</td>
                                    <td style={{ color: "#f87171" }}>{p.totalDeaths || 0}</td>
                                    <td>{p.totalAssists || 0}</td>
                                    <td>{p.avgGPM || 0}</td>
                                    <td>{p.avgXPM || 0}</td>
                                    <td style={{ fontWeight: 800, color: colors.text }}>{p.totalScore || 0}</td>
                                  </tr>);
                                })}</tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 10, fontSize: "0.78rem", color: "#555550", lineHeight: 1.6, border: "1px solid rgba(255,255,255,0.05)" }}>
                        <strong style={{ color: "#8A8880" }}>How MVP is determined:</strong> Each rank bracket has its own {"\u{1F451}"} MVP — the player with the highest KDA score: (K + 0.5 &times; A) / D.
                      </div>
                    </div>
                  );
                })()}
              </div>
              <CommentSection tournamentId={id} section="leaderboard" game="dota2" user={user} userProfile={userProfile} />
            </div>
          )}

          <div style={{ height: 80 }} />
        </div>
      </div>

      {showRegister && user && (
        <RegisterModal
          tournament={tournament}
          user={user}
          dotaProfile={dotaProfile}
          onClose={() => setShowRegister(false)}
          onSuccess={() => { setIsRegistered(true); refetchData(); }}
        />
      )}

      {/* ═══ LOGIN PROMPT ═══ */}
      {showLoginPrompt && !user && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={(e) => { if (e.target === e.currentTarget) setShowLoginPrompt(false); }}>
          <div style={{ background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 16, padding: 28, width: "100%", maxWidth: 380, position: "relative", textAlign: "center" as const }}>
            <button onClick={() => setShowLoginPrompt(false)} style={{ position: "absolute", top: 14, right: 14, background: "transparent", border: "none", color: "#444", fontSize: 18, cursor: "pointer" }}>✕</button>
            <div style={{ fontSize: 36, marginBottom: 10 }}>⚔️</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Sign in to register</h3>
            <p style={{ fontSize: 12, color: "#666", marginBottom: 20, lineHeight: 1.5 }}>Create an account or sign in to register for this tournament.</p>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
              <button onClick={() => { try { localStorage.setItem("pendingRegistration", window.location.pathname); } catch {} window.location.href = "/api/auth/discord-login"; setShowLoginPrompt(false); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "13px 20px", background: "rgba(88,101,242,0.15)", color: "#818cf8", border: "1px solid rgba(88,101,242,0.35)", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#818cf8"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.12-.098.246-.198.373-.292a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419s.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419s.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                Sign in with Discord
              </button>
            </div>
          </div>
        </div>
      )}

      {showToast && (
        <div className="dtd-toast"><CheckCheck size={16} /> {toastMsg}</div>
      )}

      {/* ═══ SHARE CARD MODAL ═══ */}
      {showShareCard && (
        <div className="dtd-share-overlay" onClick={e => { if (e.target === e.currentTarget) setShowShareCard(false); }}>
          <div className="dtd-share-modal">
            <div className="dtd-share-modal-head">
              <div className="dtd-share-modal-title"><Share2 size={18} /> Share Tournament</div>
              <button className="dtd-share-close" onClick={() => setShowShareCard(false)}><X size={16} /></button>
            </div>
            <p style={{ fontSize: "0.75rem", color: "#555550", marginBottom: 16, marginTop: -8 }}>
              6 animated share slides for Instagram, Stories & WhatsApp. Download as image or record as video!
            </p>

            {/* Animated Remotion Carousel */}
            <ShareVideoCarousel
              tournament={tournament}
              tournamentId={id as string}
              game="dota2"
              onToast={() => { setToastMsg("Copied!"); setShowToast(true); setTimeout(() => setShowToast(false), 2000); }}
            />

            {/* Social links + bottom */}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <a href={`https://wa.me/?text=${encodeURIComponent(`🎮 ${tournament.name} — Dota 2 Tournament\n📅 ${formatDate(tournament.startDate)} · ${tournament.entryFee === 0 ? "Free Entry" : "₹"+tournament.entryFee+" Entry"}\n\nRegister: ${window.location.href}`)}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "10px", borderRadius: 100, background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.3)", color: "#25d366", fontSize: "0.82rem", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <MessageCircle size={15} /> WhatsApp
              </a>
              <a href="https://www.instagram.com/iesports.in/" target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "10px", borderRadius: 100, background: "rgba(225,48,108,0.1)", border: "1px solid rgba(225,48,108,0.3)", color: "#E1306C", fontSize: "0.82rem", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Camera size={15} /> Instagram
              </a>
              <button style={{ flex: 1, padding: "10px", borderRadius: 100, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#8A8880", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                onClick={() => { navigator.clipboard.writeText(window.location.href); setToastMsg("Link copied!"); setShowToast(true); setTimeout(() => setShowToast(false), 2000); }}>
                <Copy size={15} /> Copy Link
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: "0.65rem", color: "#555550", textAlign: "center" }}>1080x1080px animated slides — optimised for Instagram posts, Stories, and WhatsApp status</div>

            {/* Hidden ref for legacy html2canvas compat */}
            <div ref={shareCardRef} style={{ display: "none" }} />
          </div>
        </div>
      )}
    </>
  );
}

export default function DotaTournamentDetail() {
  return (
    <Suspense>
      <DotaTournamentDetailInner />
    </Suspense>
  );
}
