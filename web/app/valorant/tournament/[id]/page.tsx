"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { doc, onSnapshot, collection, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/app/context/AuthContext";
import Navbar from "@/app/components/Navbar";
import RegisterModal from "@/app/components/RegisterModal";
import DoubleBracket from "@/app/components/DoubleBracket";
import ShareVideoCarousel from "@/app/components/ShareVideoCarousel";
import Link from "next/link";
import {
  LayoutDashboard, Users, Shield, Trophy, Swords, GitBranch, BarChart3,
  Share2, Copy, CheckCheck, Calendar, Clock, ScrollText,
  MessageCircle,
  Coins, Target, Info, Zap, Camera, Link2, X,
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
  const games: any[] = [];
  for (let i = 1; i <= bestOf; i++) {
    games.push(m[`game${i}`] || m.games?.[`game${i}`] || null);
  }
  const hasGameData = games.some(g => g?.playerStats);
  const scheduledDate = m.scheduledTime ? new Date(m.scheduledTime) : null;
  const scheduledTime = scheduledDate ? scheduledDate.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }) : "";
  const scheduledDay = scheduledDate ? scheduledDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
  const bracketAccent = "#f59e0b";

  return (
    <div style={{ marginBottom: 8 }}>
      <div className="vtd-mc" style={{
        cursor: "pointer",
        ...(isBracket ? { borderColor: "rgba(245,158,11,0.2)" } : {}),
        ...(isLive ? { borderColor: "rgba(34,197,94,0.25)" } : {}),
        ...(isExpanded ? { borderColor: isBracket ? "rgba(245,158,11,0.5)" : "rgba(60,203,255,0.25)", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 } : {}),
      }} onClick={() => setExpandedMatch(isExpanded ? null : m.id)}>
        <div className="vtd-mc-index">
          <span className="vtd-mc-index-num" style={isBracket ? { color: bracketAccent, fontSize: "0.55rem" } : {}}>
            {isBracket ? (m.bracketLabel || "").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 4) : `M${m.matchIndex || ""}`}
          </span>
          <span className="vtd-mc-index-fmt" style={isBracket ? { background: "rgba(245,158,11,0.12)", color: bracketAccent } : {}}>BO{bestOf}</span>
        </div>
        <div className="vtd-mc-team">
          <div className="vtd-mc-team-logo" style={isBracket ? { background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" } : {}}>
            {teamLogoMap[m.team1Id] ? <img src={teamLogoMap[m.team1Id]} alt="" /> : getTeamInitials(m.team1Name)}
          </div>
          <div className="vtd-mc-team-info">
            <div className="vtd-mc-team-tag" style={isBracket ? { color: bracketAccent } : {}}>{isBracket ? m.bracketLabel : getTeamTag(m.team1Name)}</div>
            <div className="vtd-mc-team-name" style={t1Win ? { color: "#4ade80" } : t2Win ? { color: "#555550" } : {}}>{m.team1Name}</div>
            <div className="vtd-mc-avatars">
              {t1Members.map((p: any, i: number) => p.riotAvatar ? <img key={i} src={p.riotAvatar} alt="" /> : <div key={i} className="vtd-mc-av-init">{(p.riotGameName || "?")[0]}</div>)}
            </div>
          </div>
        </div>
        <div className="vtd-mc-center">
          {isComplete ? (
            <>
              <div className="vtd-mc-score-box">
                <span className={`s ${t1Win ? "win" : isDraw ? "draw" : "loss"}`}>{m.team1Score}</span>
                <span className="dash">-</span>
                <span className={`s ${t2Win ? "win" : isDraw ? "draw" : "loss"}`}>{m.team2Score}</span>
              </div>
              <span className="vtd-mc-status-badge" style={{ background: "rgba(22,163,74,0.12)", color: "#4ade80" }}>✓ Played</span>
            </>
          ) : isLive ? (
            <>
              <div className="vtd-mc-score-box">
                <span className="s">{m.team1Score || 0}</span><span className="dash">-</span><span className="s">{m.team2Score || 0}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                <div className="vtd-mc-live-dot" />
                <span className="vtd-mc-status-badge" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80", padding: "1px 6px" }}>LIVE</span>
              </div>
            </>
          ) : (
            <>
              {scheduledTime ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                  <div style={{ fontSize: "0.88rem", fontWeight: 800, color: isBracket ? bracketAccent : "#3CCBFF" }}>{scheduledTime}</div>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "rgba(255,255,255,0.35)" }}>{scheduledDay}</div>
                </div>
              ) : (
                <div className="vtd-mc-score-box">
                  <span className="s" style={{ color: "#555550" }}>–</span><span className="dash">:</span><span className="s" style={{ color: "#555550" }}>–</span>
                </div>
              )}
              <span className="vtd-mc-status-badge" style={{ background: "#1a1a1f", color: "#555550" }}>{isBracket ? "Pending" : "Upcoming"}</span>
            </>
          )}
          {(isComplete || isLive) && scheduledDay && <div style={{ fontSize: "0.6rem", color: "#555550", marginTop: 2 }}>{scheduledDay} · {scheduledTime}</div>}
        </div>
        <div className="vtd-mc-team right">
          <div className="vtd-mc-team-logo" style={isBracket ? { background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" } : {}}>
            {teamLogoMap[m.team2Id] ? <img src={teamLogoMap[m.team2Id]} alt="" /> : getTeamInitials(m.team2Name)}
          </div>
          <div className="vtd-mc-team-info" style={{ textAlign: "right" }}>
            <div className="vtd-mc-team-tag">{getTeamTag(m.team2Name)}</div>
            <div className="vtd-mc-team-name" style={t2Win ? { color: "#4ade80" } : t1Win ? { color: "#555550" } : {}}>{m.team2Name}</div>
            <div className="vtd-mc-avatars">{t2Members.map((p: any, i: number) => p.riotAvatar ? <img key={i} src={p.riotAvatar} alt="" /> : <div key={i} className="vtd-mc-av-init">{(p.riotGameName || "?")[0]}</div>)}</div>
          </div>
        </div>
        <div style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", color: isExpanded ? (isBracket ? bracketAccent : "#3CCBFF") : "#555550", fontSize: 12, transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>▼</div>
      </div>

      {isExpanded && (
        <div style={{ background: "#18181C", border: "1px solid #2A2A30", borderTop: "none", borderBottomLeftRadius: 10, borderBottomRightRadius: 10, padding: "14px 16px" }}>
          {!isComplete && !isLive && !hasGameData ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: "#555550", fontSize: "0.82rem" }}>Match hasn't been played yet. Game details will appear here after the match.</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(bestOf, 3)}, 1fr)`, gap: 12 }}>
                {games.map((g, i) => (
                  <GameDetailCard key={i} game={g} gameNum={i + 1} team1Name={m.team1Name} team2Name={m.team2Name} team1Id={m.team1Id} team2Id={m.team2Id} />
                ))}
              </div>
              <div style={{ marginTop: 10, textAlign: "center" }}>
                <Link href={`/valorant/match/${tournamentId}/${m.id}`} style={{ fontSize: "0.72rem", fontWeight: 700, color: "#3CCBFF", textDecoration: "none", padding: "6px 18px", border: "1px solid #3CCBFF", borderRadius: 100, display: "inline-block", transition: "all 0.15s" }}>View Full Match Details →</Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

async function captureTabImage(el: HTMLElement) {
  const prev = el.style.filter;
  el.style.filter = "contrast(1.25) brightness(1.15) saturate(1.15)";
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(el, { backgroundColor: "#080c14", scale: 2, useCORS: true, logging: false });
  el.style.filter = prev;
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
      <button className="vtd-tab-share" onClick={() => setOpen(v => !v)}>
        <Share2 size={12} /> Share
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 200, background: "rgba(10,15,42,0.97)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 8, minWidth: 188, boxShadow: "0 12px 40px rgba(0,0,0,0.6)", overflow: "hidden" }}>
          <button style={{ width: "100%", padding: "10px 14px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: "0.82rem", fontWeight: 600, color: "rgba(255,255,255,0.8)", fontFamily: "inherit", background: "transparent", border: "none", textAlign: "left" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(60,203,255,0.15)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/valorant/tournament/${id}?tab=${tabKey}`);
              setToastMsg?.("Link copied!"); setShowToast(true); setTimeout(() => setShowToast(false), 2000); setOpen(false);
            }}>
            <Link2 size={14} /> Copy Link
          </button>
          <button style={{ width: "100%", padding: "10px 14px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: "0.82rem", fontWeight: 600, color: "rgba(255,255,255,0.8)", fontFamily: "inherit", background: "transparent", border: "none", textAlign: "left" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(60,203,255,0.15)")}
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
                const url = `${window.location.origin}/valorant/tournament/${id}?tab=${tabKey}`;
                const text = `Check out ${tournamentName} — ${tabKey} on iEsports!\n${url}`;
                if (navigator.canShare?.({ files: [file] })) {
                  await navigator.share({ files: [file], text });
                } else {
                  const link = document.createElement("a"); link.download = file.name; link.href = URL.createObjectURL(blob); link.click(); URL.revokeObjectURL(link.href);
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
                }
              } catch {
                const url = `${window.location.origin}/valorant/tournament/${id}?tab=${tabKey}`;
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
                navigator.clipboard.writeText(`${window.location.origin}/valorant/tournament/${id}?tab=${tabKey}`);
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

function ValorantTournamentDetailInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const { user, loading: authLoading, riotData, userProfile } = useAuth();

  const [leaderboard, setLeaderboard] = useState<any[]>([]);
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
  const [showRegister, setShowRegister] = useState(false);
  const [countdown, setCountdown] = useState("");
  const [onWaitlist, setOnWaitlist] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [teamNameLoading, setTeamNameLoading] = useState(false);
  const [teamNameError, setTeamNameError] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const tabContentRef = useRef<HTMLDivElement>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => { if (!id) return; const unsub = onSnapshot(doc(db, "valorantTournaments", id), (snap) => { if (snap.exists()) setTournament({ id: snap.id, ...snap.data() }); setTLoading(false); }); return () => unsub(); }, [id]);
  useEffect(() => { if (!id) return; const unsub = onSnapshot(collection(db, "valorantTournaments", id, "leaderboard"), (snap) => { const list = snap.docs.map(d => ({ id: d.id, ...d.data() })); list.sort((a: any, b: any) => { const acsA = (a.totalScore || 0) / Math.max(1, a.totalRoundsPlayed || 1); const acsB = (b.totalScore || 0) / Math.max(1, b.totalRoundsPlayed || 1); if (Math.abs(acsB - acsA) > 1) return acsB - acsA; return (b.kd || 0) - (a.kd || 0); }); setLeaderboard(list); }); return () => unsub(); }, [id]);
  useEffect(() => { if (!id) return; const unsub = onSnapshot(collection(db, "valorantTournaments", id, "soloPlayers"), (snap) => { const list = snap.docs.map(d => ({ id: d.id, ...d.data() })); setPlayers(list); if (user) setIsRegistered(list.some((p: any) => p.uid === user.uid)); }); return () => unsub(); }, [id, user]);
  useEffect(() => {
    if (!user || !id) return;
    user.getIdToken().then(token =>
      fetch(`/api/waitlist?tournamentId=${id}&game=valorant`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setOnWaitlist(!!d.onWaitlist))
    ).catch(() => {});
  }, [user, id]);
  const toggleWaitlist = async () => {
    if (!user || !id) return;
    setWaitlistLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ tournamentId: id, game: "valorant" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setOnWaitlist(data.onWaitlist);
    } catch (e: any) { alert(e.message || "Could not update waitlist"); } finally { setWaitlistLoading(false); }
  };
  useEffect(() => { if (!id) return; const unsub = onSnapshot(query(collection(db, "valorantTournaments", id, "teams"), orderBy("teamIndex")), (snap) => setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })))); return () => unsub(); }, [id]);
  useEffect(() => { if (!id) return; const unsub = onSnapshot(collection(db, "valorantTournaments", id, "standings"), (snap) => { const list = snap.docs.map(d => ({ id: d.id, ...d.data() })); list.sort((a: any, b: any) => { if (b.points !== a.points) return b.points - a.points; if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz; return (b.mapsWon - b.mapsLost) - (a.mapsWon - a.mapsLost); }); setStandings(list); }); return () => unsub(); }, [id]);
  useEffect(() => { if (!id) return; const unsub = onSnapshot(collection(db, "valorantTournaments", id, "matches"), (snap) => { const list = snap.docs.map(d => ({ id: d.id, ...d.data() })); list.sort((a: any, b: any) => { if (!!a.isBracket !== !!b.isBracket) return a.isBracket ? 1 : -1; if (a.matchDay !== b.matchDay) return a.matchDay - b.matchDay; return (a.matchIndex || 0) - (b.matchIndex || 0); }); setMatches(list); }); return () => unsub(); }, [id]);
  useEffect(() => { if (!tournament) return; const tick = () => setCountdown(getTimeUntilDeadline(tournament.registrationDeadline)); tick(); const i = setInterval(tick, 60000); return () => clearInterval(i); }, [tournament]);

  const getUserTeam = () => { if (!user) return null; return teams.find((t: any) => (t.members || []).some((m: any) => m.uid === user.uid)); };

  const handleUnregister = async () => {
    if (!user || !id) return;
    if (!confirm("Are you sure you want to unregister from this tournament?")) return;
    setUnregLoading(true);
    try {
      const res = await fetch("/api/valorant/unregister", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: id, uid: user.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
    } catch (e: any) {
      alert(e.message || "Failed to unregister");
    } finally {
      setUnregLoading(false);
    }
  };

  const handleUpdateTeamName = async (teamId: string) => {
    if (!newTeamName.trim() || newTeamName.trim().length < 2) { setTeamNameError("Team name must be at least 2 characters"); return; }
    if (newTeamName.trim().length > 24) { setTeamNameError("Team name must be 24 characters or less"); return; }
    setTeamNameLoading(true); setTeamNameError("");
    try {
      const res = await fetch("/api/valorant/update-team-name", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tournamentId: id, teamId, uid: user?.uid, newTeamName: newTeamName.trim() }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setEditingTeamId(null); setNewTeamName("");
    } catch (e: any) { setTeamNameError(e.message || "Failed to update team name"); } finally { setTeamNameLoading(false); }
  };

  const handleLogoUpload = async (teamId: string, file: File) => {
    if (!user) return;
    if (file.size > 2 * 1024 * 1024) { setLogoError("Image must be under 2MB"); return; }
    if (!file.type.startsWith("image/")) { setLogoError("File must be an image"); return; }
    setLogoUploading(true);
    setLogoError("");
    try {
      const storage = getStorage();
      const ext = file.name.split(".").pop() || "png";
      const storageRef = ref(storage, `team-logos/${id}/${teamId}.${ext}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const res = await fetch("/api/valorant/update-team-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: id, teamId, uid: user.uid, logoUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
    } catch (e: any) {
      setLogoError(e.message || "Failed to upload logo");
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const downloadShareCard = async () => {
    if (!shareCardRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(shareCardRef.current, { useCORS: true, scale: 2, backgroundColor: "#0f1923", logging: false });
      const link = document.createElement("a");
      link.download = `${tournament?.name?.replace(/\s+/g, "_") || "tournament"}_card.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) { console.error("Download failed", e); }
  };

  if (authLoading || tLoading) return (
    <div style={{ minHeight: "100vh", background: "#0A0F2A", fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>
      <style>{`
        @keyframes vtd-sk-pulse { 0%,100% { background-position: -200% 0; } 50% { background-position: 200% 0; } }
        @keyframes vtspin { to { transform: rotate(360deg); } }
        .vtd-sk { background: linear-gradient(90deg, rgba(60,203,255,0.04) 0%, rgba(60,203,255,0.12) 40%, rgba(60,203,255,0.04) 80%); background-size: 200% 100%; animation: vtd-sk-pulse 2s ease-in-out infinite; border-radius: 10px; }
        .vtd-sk-dark { background: linear-gradient(90deg, #0d151e 0%, #162030 40%, #0d151e 80%); background-size: 200% 100%; animation: vtd-sk-pulse 2s ease-in-out infinite; border-radius: 10px; }
      `}</style>
      {/* Navbar placeholder */}
      <div style={{ height: 62, background: "rgba(10,10,12,0.97)", borderBottom: "1px solid rgba(60,203,255,0.12)" }} />
      {/* Hero skeleton */}
      <div style={{ height: 460, background: "linear-gradient(160deg, rgba(60,203,255,0.14) 0%, #0A0F2A 60%)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(60,203,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(60,203,255,0.04) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        <div style={{ position: "absolute", bottom: 40, left: 32, right: 32 }}>
          <div style={{ width: 90, height: 10, borderRadius: 100, background: "rgba(60,203,255,0.3)", marginBottom: 16 }} />
          <div className="vtd-sk" style={{ width: "62%", height: 46, marginBottom: 12, borderRadius: 12 }} />
          <div className="vtd-sk" style={{ width: "40%", height: 18, marginBottom: 20, borderRadius: 6 }} />
          <div style={{ display: "flex", gap: 10 }}>
            <div className="vtd-sk" style={{ width: 140, height: 44, borderRadius: 100 }} />
            <div className="vtd-sk" style={{ width: 44, height: 44, borderRadius: "50%" }} />
          </div>
        </div>
      </div>
      {/* Content skeleton */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 30px" }}>
        {/* Tab bar */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 6, margin: "20px 0 24px", display: "flex", gap: 6 }}>
          {[120, 100, 90, 110, 100, 105, 120].map((w, i) => (
            <div key={i} className="vtd-sk-dark" style={{ width: w, height: 46, borderRadius: 12, flexShrink: 0 }} />
          ))}
        </div>
        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="vtd-sk-dark" style={{ height: 100, borderRadius: 16 }} />
          ))}
        </div>
        {/* Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
          <div>
            <div className="vtd-sk-dark" style={{ height: 160, borderRadius: 18, marginBottom: 16 }} />
            <div className="vtd-sk-dark" style={{ height: 120, borderRadius: 18 }} />
          </div>
          <div>
            <div className="vtd-sk-dark" style={{ height: 280, borderRadius: 18 }} />
          </div>
        </div>
      </div>
    </div>
  );

  if (!tournament) return (
    <div style={{ minHeight: "100vh", background: "#0f1923", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#555550" }}>Tournament not found.</p>
    </div>
  );

  const regClosed = countdown === "Registration Closed";
  const slotsLeft = tournament.totalSlots - tournament.slotsBooked;
  const schedule = tournament.schedule || {};

  // Check if registration has opened
  const isRegOpen = (() => {
    if (schedule.registrationOpens) {
      return new Date() >= new Date(schedule.registrationOpens);
    }
    return true; // no explicit open date → assume open
  })();

  const canRegister = !regClosed && !isRegistered && slotsLeft > 0 && isRegOpen;
  const userTeam = getUserTeam();
  const teamMembers: Record<string, any[]> = {};
  const teamLogoMap: Record<string, string> = {};
  teams.forEach((t: any) => { teamMembers[t.id] = (t.members || []).slice(0, 5); if (t.teamLogo) teamLogoMap[t.id] = t.teamLogo; });
  const groupMatches = matches.filter((m: any) => !m.isBracket);
  const bracketMatches = matches.filter((m: any) => m.isBracket);

  // ── Detect tournament champion from grand final ──
  const grandFinal = bracketMatches.find((m: any) => m.bracketType === "grand_final" && m.status === "completed");
  const championTeamId = grandFinal ? (grandFinal.team1Score > grandFinal.team2Score ? grandFinal.team1Id : grandFinal.team2Id) : null;
  const championTeamName = grandFinal ? (grandFinal.team1Score > grandFinal.team2Score ? grandFinal.team1Name : grandFinal.team2Name) : null;
  const championMembers = championTeamId ? (teamMembers[championTeamId] || []) : [];

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        /* ── Animated background ── */
        .vtd-bg { position: fixed; inset: 0; z-index: 0; background: #0A0F2A; overflow: hidden; pointer-events: none; }
        .vtd-bg-gradient { position: absolute; inset: -60%; background: conic-gradient(from 0deg at 35% 45%, transparent 0deg, rgba(60,203,255,0.10) 60deg, transparent 120deg, rgba(60,203,255,0.07) 200deg, transparent 260deg, rgba(10,15,42,0.8) 360deg); animation: vtd-bg-rot 28s linear infinite; }
        .vtd-bg-glow1 { position: absolute; width: 800px; height: 800px; border-radius: 50%; background: radial-gradient(circle, rgba(60,203,255,0.14) 0%, rgba(60,203,255,0.04) 40%, transparent 70%); top: -200px; left: -150px; animation: vtd-bg-drift1 18s ease-in-out infinite; }
        .vtd-bg-glow2 { position: absolute; width: 600px; height: 600px; border-radius: 50%; background: radial-gradient(circle, rgba(60,203,255,0.10) 0%, rgba(60,203,255,0.03) 40%, transparent 70%); bottom: 0%; right: 0%; animation: vtd-bg-drift2 24s ease-in-out infinite; }
        .vtd-bg-glow3 { position: absolute; width: 400px; height: 400px; border-radius: 50%; background: radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%); bottom: 30%; left: 60%; animation: vtd-bg-drift2 30s ease-in-out infinite reverse; }
        .vtd-bg-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(60,203,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(60,203,255,0.06) 1px, transparent 1px); background-size: 60px 60px; }
        @keyframes vtd-bg-rot { to { transform: rotate(360deg); } }
        @keyframes vtd-bg-drift1 { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(80px,-60px) scale(1.15); } 66% { transform: translate(-40px,70px) scale(0.9); } }
        @keyframes vtd-bg-drift2 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-100px,-80px); } }

        /* ── Page ── */
        .vtd-page { min-height: 100vh; font-family: var(--font-geist-sans), system-ui, sans-serif; color: #E6E6E6; position: relative; z-index: 1; }

        /* ── Hero ── */
        .vtd-hero { position: relative; min-height: 460px; overflow: hidden; display: flex; align-items: flex-end; }
        .vtd-hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; filter: brightness(0.35) saturate(1.2); }
        .vtd-hero-overlay { position: absolute; inset: 0; z-index: 1; background: linear-gradient(160deg, rgba(60,203,255,0.25) 0%, transparent 40%), linear-gradient(to bottom, rgba(10,15,42,0.3) 0%, rgba(10,15,42,0.7) 60%, rgba(10,15,42,1) 100%); }
        .vtd-hero-agent { position: absolute; right: -20px; bottom: 0; height: 90%; z-index: 2; opacity: 0.15; pointer-events: none; animation: vtd-agent-float 4s ease-in-out infinite alternate; filter: saturate(0.5); }
        @keyframes vtd-agent-float { from { transform: translateY(0px); } to { transform: translateY(-14px); } }
        .vtd-hero-content { position: relative; z-index: 3; max-width: 1100px; margin: 0 auto; padding: 0 30px; width: 100%; min-height: 460px; display: flex; align-items: flex-end; padding-bottom: 36px; }
        .vtd-hero-inner { flex: 1; }
        .vtd-hero-game-tag { font-size: 0.62rem; font-weight: 900; letter-spacing: 0.2em; text-transform: uppercase; color: #3CCBFF; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .vtd-hero-game-tag::before { content: ""; display: block; width: 28px; height: 2px; background: #3CCBFF; }
        .vtd-hero-title { font-size: clamp(1.8rem, 4vw, 3rem); font-weight: 900; color: #E6E6E6; line-height: 1.05; animation: vtd-hero-in 0.7s cubic-bezier(0.16,1,0.3,1) both; letter-spacing: -0.03em; text-shadow: 0 2px 20px rgba(0,0,0,0.5); }
        .vtd-hero-desc { font-size: 1rem; color: rgba(230,230,230,0.65); margin-top: 10px; max-width: 560px; line-height: 1.6; animation: vtd-hero-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.08s both; }
        .vtd-hero-actions { display: flex; align-items: center; gap: 12px; margin-top: 22px; animation: vtd-hero-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.16s both; flex-wrap: wrap; }
        .vtd-hero-share-btn { width: 44px; height: 44px; border-radius: 50%; background: rgba(60,203,255,0.12); border: 1px solid rgba(60,203,255,0.3); color: #3CCBFF; display: flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(8px); transition: all 0.2s; flex-shrink: 0; }
        .vtd-hero-share-btn:hover { background: rgba(60,203,255,0.25); border-color: rgba(60,203,255,0.5); transform: scale(1.05); }
        @keyframes vtd-hero-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Content wrapper ── */
        .vtd-content { max-width: 1100px; margin: 0 auto; padding: 0 30px 80px; }

        /* ── Registration bar ── */
        .vtd-reg-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; padding: 18px 24px; background: rgba(18,18,21,0.85); border: 1px solid rgba(60,203,255,0.15); border-radius: 16px; flex-wrap: wrap; backdrop-filter: blur(12px); animation: vtd-slide-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.25s both; }
        .vtd-reg-info { display: flex; flex-direction: column; gap: 3px; }
        .vtd-reg-slots { font-size: 1.1rem; font-weight: 900; color: #E6E6E6; }
        .vtd-reg-countdown { font-size: 0.82rem; color: #8A8880; }
        .vtd-reg-btn { padding: 12px 32px; background: linear-gradient(135deg, #3CCBFF, #2A9FCC); color: #fff; border: none; border-radius: 100px; font-size: 0.92rem; font-weight: 800; cursor: pointer; font-family: inherit; transition: all 0.2s; box-shadow: 0 4px 20px rgba(60,203,255,0.35); }
        .vtd-reg-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 28px rgba(60,203,255,0.5); }
        .vtd-reg-done { padding: 12px 28px; background: rgba(22,163,74,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); border-radius: 100px; font-size: 0.9rem; font-weight: 700; }
        @keyframes vtd-slide-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Tab bar ── */
        .vtd-tabs-wrap { position: sticky; top: 62px; z-index: 20; margin-bottom: 24px; background: rgba(10,15,42,0.96); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom: 1px solid rgba(60,203,255,0.12); margin-left: -30px; margin-right: -30px; padding: 12px 30px; }
        .vtd-tabs { display: flex; gap: 4px; background: rgba(255,255,255,0.03); border-radius: 16px; padding: 6px; border: 1px solid rgba(255,255,255,0.06); }
        .vtd-tab { flex: 1; min-height: 48px; padding: 0 8px; border-radius: 12px; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 6px; font-size: 0.82rem; font-weight: 800; cursor: pointer; font-family: inherit; white-space: nowrap; border: 1px solid transparent; background: transparent; color: rgba(255,255,255,0.45); transition: all 0.2s ease; }
        .vtd-tab-label { display: inline; }
        .vtd-tab:hover { background: rgba(60,203,255,0.08); color: rgba(255,255,255,0.75); border-color: rgba(60,203,255,0.2); }
        .vtd-tab.active { background: #3CCBFF; color: #fff; border-color: #3CCBFF; box-shadow: 0 0 20px rgba(60,203,255,0.35), 0 4px 16px rgba(60,203,255,0.25); }
        .vtd-tab-count { font-size: 0.68rem; font-weight: 700; opacity: 0.75; background: rgba(0,0,0,0.2); padding: 1px 7px; border-radius: 100px; }

        /* ── Tab content animation ── */
        .vtd-tab-pane { animation: vtd-fade-up 0.35s ease-out both; }
        @keyframes vtd-fade-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Cards ── */
        .vtd-card { background: rgba(18,18,21,0.8); border: 1px solid rgba(255,255,255,0.06); border-radius: 18px; padding: 28px 32px; margin-bottom: 18px; backdrop-filter: blur(12px); transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .vtd-card:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
        .vtd-card-label { display: block; font-size: 0.65rem; font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase; color: #3CCBFF; margin-bottom: 18px; }

        /* ── Overview ── */
        .vtd-overview-grid { display: grid; grid-template-columns: 1fr 320px; gap: 16px; }
        .vtd-overview-grid > div { display: flex; flex-direction: column; gap: 16px; }
        .vtd-overview-grid > div > .vtd-card { margin-bottom: 0; }
        .vtd-stat-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; align-items: stretch; }
        .vtd-stat-tile { background: rgba(18,18,21,0.8); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 20px 18px; text-align: center; backdrop-filter: blur(10px); transition: transform 0.2s, box-shadow 0.2s; animation: vtd-fade-up 0.4s ease-out both; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .vtd-stat-tile:hover { transform: translateY(-3px); box-shadow: 0 8px 28px rgba(0,0,0,0.4); }
        .vtd-stat-tile-icon { display: flex; justify-content: center; margin-bottom: 10px; opacity: 0.7; }
        .vtd-stat-tile-val { font-size: 1.4rem; font-weight: 900; color: #E6E6E6; line-height: 1.1; }
        .vtd-stat-tile-lbl { font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #555550; margin-top: 5px; }
        .vtd-stat-tile.red { border-color: rgba(60,203,255,0.2); background: rgba(60,203,255,0.06); }
        .vtd-stat-tile.red .vtd-stat-tile-val { color: #3CCBFF; }
        .vtd-stat-tile.gold .vtd-stat-tile-val { color: #fbbf24; }
        .vtd-stat-tile.gold { border-color: rgba(251,191,36,0.2); background: rgba(251,191,36,0.05); }
        .vtd-stat-tile.blue .vtd-stat-tile-val { color: #60a5fa; }
        .vtd-stat-tile.blue { border-color: rgba(59,130,246,0.2); background: rgba(59,130,246,0.05); }
        .vtd-desc { font-size: 1rem; color: #8A8880; line-height: 1.8; margin: 0; }

        /* ── Timeline ── */
        .vtd-timeline { display: flex; flex-direction: column; gap: 0; }
        .vtd-tl-item { display: grid; grid-template-columns: 14px 1fr; gap: 12px; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.05); align-items: start; }
        .vtd-tl-item:last-child { border-bottom: none; padding-bottom: 0; }
        .vtd-tl-item:first-child { padding-top: 0; }
        .vtd-tl-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
        .vtd-tl-dot.past { background: #22c55e; }
        .vtd-tl-dot.active { background: #3b82f6; box-shadow: 0 0 0 4px rgba(59,130,246,0.2); }
        .vtd-tl-dot.future { background: #2A2A30; }
        .vtd-tl-label { font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #3CCBFF; }
        .vtd-tl-date { font-size: 0.82rem; color: #8A8880; margin-top: 3px; }
        .vtd-tl-badge { font-size: 0.58rem; font-weight: 800; padding: 2px 7px; border-radius: 100px; margin-left: 8px; }

        /* ── Rules ── */
        .vtd-rule { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); align-items: flex-start; }
        .vtd-rule:last-child { border-bottom: none; }
        .vtd-rule-num { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; min-width: 22px; border-radius: 50%; background: rgba(60,203,255,0.15); border: 1px solid rgba(60,203,255,0.4); font-size: 0.65rem; font-weight: 900; color: #3CCBFF; margin-top: 1px; }
        .vtd-rule-text { font-size: 0.88rem; color: #8A8880; line-height: 1.6; }
        .vtd-rules-scroll { max-height: 400px; overflow-y: auto; padding-right: 4px; }
        .vtd-rules-scroll::-webkit-scrollbar { width: 4px; }
        .vtd-rules-scroll::-webkit-scrollbar-track { background: transparent; }
        .vtd-rules-scroll::-webkit-scrollbar-thumb { background: rgba(60,203,255,0.35); border-radius: 4px; }
        .vtd-rules-scroll::-webkit-scrollbar-thumb:hover { background: rgba(60,203,255,0.6); }

        /* ── Empty states ── */
        .vtd-empty { text-align: center; padding: 70px 20px; }
        .vtd-empty-icon { font-size: 48px; margin-bottom: 10px; display: block; }
        .vtd-empty-title { font-size: 1rem; font-weight: 700; color: #8A8880; margin-bottom: 4px; display: block; }
        .vtd-empty-sub { font-size: 0.86rem; color: #555550; display: block; margin-top: 6px; }

        /* ── Players tier columns ── */
        .vtd-tier-columns { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; }
        .vtd-tier-columns::-webkit-scrollbar { height: 4px; }
        .vtd-tier-columns::-webkit-scrollbar-track { background: transparent; }
        .vtd-tier-columns::-webkit-scrollbar-thumb { background: rgba(60,203,255,0.35); border-radius: 4px; }
        .vtd-tier-col { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 10px; }
        .vtd-tier-header { padding: 10px 14px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; font-weight: 800; letter-spacing: 0.02em; }
        .vtd-tier-header-count { font-size: 0.72rem; font-weight: 600; opacity: 0.7; }
        .vtd-tier-player { background: rgba(18,18,21,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 12px 14px; display: flex; align-items: center; gap: 12px; transition: all 0.2s ease; }
        .vtd-tier-player:hover { transform: scale(1.02); border-color: rgba(60,203,255,0.35); box-shadow: 0 0 0 1px rgba(60,203,255,0.15), 0 8px 24px rgba(0,0,0,0.4); }
        .vtd-tier-player-avatar { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; flex-shrink: 0; border: 1.5px solid rgba(255,255,255,0.08); }
        .vtd-tier-player-avatar-init { width: 36px; height: 36px; border-radius: 8px; background: rgba(60,203,255,0.1); border: 1.5px solid rgba(60,203,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 900; color: #3CCBFF; flex-shrink: 0; }
        .vtd-tier-player-info { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; }
        .vtd-tier-player-name { font-size: 0.85rem; font-weight: 800; color: #E6E6E6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vtd-tier-player-name .tag { color: #555550; font-weight: 400; }
        .vtd-tier-player-rank { font-size: 0.72rem; color: #8A8880; white-space: nowrap; flex-shrink: 0; }

        /* ── Legacy players grid (keep for backward compat) ── */
        .vtd-players-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .vtd-player-box { background: rgba(18,18,21,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 22px; display: flex; align-items: center; gap: 16px; transition: all 0.2s ease; }
        .vtd-player-box:hover { transform: scale(1.02); border-color: rgba(60,203,255,0.35); box-shadow: 0 0 0 1px rgba(60,203,255,0.15), 0 8px 24px rgba(0,0,0,0.4); }
        .vtd-player-avatar-lg { width: 60px; height: 60px; border-radius: 12px; object-fit: cover; flex-shrink: 0; border: 2px solid rgba(255,255,255,0.08); }
        .vtd-player-avatar-init { width: 60px; height: 60px; border-radius: 12px; background: rgba(60,203,255,0.1); border: 2px solid rgba(60,203,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; color: #3CCBFF; flex-shrink: 0; }
        .vtd-player-info { flex: 1; min-width: 0; }
        .vtd-player-name-lg { font-size: 0.95rem; font-weight: 800; color: #E6E6E6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vtd-player-name-lg .tag { color: #555550; font-weight: 400; }
        .vtd-player-rank-lg { font-size: 0.76rem; color: #8A8880; margin-top: 3px; }
        .vtd-player-skill-lg { font-size: 0.65rem; font-weight: 800; padding: 3px 10px; border-radius: 100px; margin-top: 8px; display: inline-block; }

        /* ── Teams grid ── */
        .vtd-teams-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .vtd-team-box { background: rgba(18,18,21,0.8); border: 1px solid rgba(255,255,255,0.06); border-radius: 18px; padding: 26px; position: relative; transition: all 0.2s ease; }
        .vtd-team-box:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.5); border-color: rgba(60,203,255,0.2); }
        .vtd-team-box-num { position: absolute; top: 14px; right: 16px; font-size: 0.62rem; font-weight: 800; color: #3CCBFF; background: rgba(60,203,255,0.1); border: 1px solid rgba(60,203,255,0.25); padding: 3px 10px; border-radius: 100px; }
        .vtd-team-box-header { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
        .vtd-team-logo { width: 54px; height: 54px; border-radius: 12px; background: linear-gradient(135deg, #3CCBFF 0%, #2A9FCC 100%); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; color: #fff; letter-spacing: 0.05em; flex-shrink: 0; overflow: hidden; }
        .vtd-team-logo img { width: 100%; height: 100%; object-fit: cover; }
        .vtd-team-box-name { font-size: 1.05rem; font-weight: 900; color: #E6E6E6; }
        .vtd-team-box-avg { font-size: 0.7rem; color: #555550; margin-top: 2px; }
        .vtd-team-box-members { display: flex; flex-direction: column; gap: 10px; }
        .vtd-team-box-member { display: flex; align-items: center; gap: 10px; }
        .vtd-team-box-member-avatar { width: 34px; height: 34px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
        .vtd-team-box-member-init { width: 34px; height: 34px; border-radius: 8px; background: #1a1a1f; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #555550; flex-shrink: 0; }
        .vtd-team-box-member-name { font-size: 0.86rem; font-weight: 600; color: #e0e0da; }
        .vtd-team-box-member-rank { font-size: 0.72rem; color: #555550; }
        .vtd-team-box-member-skill { margin-left: auto; font-size: 0.62rem; color: #555550; font-weight: 600; }
        .vtd-team-box-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.74rem; color: #555550; }
        .vtd-team-edit-btn { padding: 5px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 100px; font-size: 0.72rem; font-weight: 700; cursor: pointer; color: #8A8880; font-family: inherit; transition: all 0.15s; }
        .vtd-team-edit-btn:hover { border-color: #3CCBFF; color: #3CCBFF; }
        .vtd-team-edit-input { width: 100%; padding: 8px 12px; border: 1.5px solid #3CCBFF; border-radius: 8px; font-size: 0.84rem; outline: none; font-family: inherit; background: rgba(10,10,12,0.8); color: #E6E6E6; }
        .vtd-team-edit-actions { display: flex; gap: 6px; margin-top: 6px; }
        .vtd-team-edit-save { padding: 6px 16px; background: #3CCBFF; color: #fff; border: none; border-radius: 100px; font-size: 0.72rem; font-weight: 700; cursor: pointer; font-family: inherit; }
        .vtd-team-edit-cancel { padding: 6px 16px; background: rgba(255,255,255,0.05); color: #8A8880; border: 1px solid rgba(255,255,255,0.08); border-radius: 100px; font-size: 0.72rem; font-weight: 700; cursor: pointer; font-family: inherit; }

        /* ── Tables ── */
        .vtd-standings-table { width: 100%; border-collapse: collapse; }
        .vtd-standings-table th { font-size: 0.64rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #555550; padding: 10px 14px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .vtd-standings-table td { font-size: 0.88rem; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); color: #e0e0da; }
        .vtd-standings-table tr:last-child td { border-bottom: none; }
        .vtd-standings-table tbody tr { transition: background 0.15s; }
        .vtd-standings-table tbody tr:hover { background: rgba(60,203,255,0.04); }

        /* ── Match headers ── */
        .vtd-section-header { font-size: 0.7rem; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid; }
        .vtd-section-header.group { color: #555550; border-color: rgba(255,255,255,0.06); }
        .vtd-section-header.bracket { color: #f59e0b; border-color: rgba(245,158,11,0.3); }
        .vtd-match-day-header { font-size: 0.76rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #555550; margin: 22px 0 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; gap: 8px; }
        .vtd-match-day-header:first-child { margin-top: 0; }
        .vtd-match-day-header .day-num { color: #3CCBFF; }
        .vtd-match-day-header.bracket-round .day-num { color: #f59e0b; }

        /* ── Match cards ── */
        .vtd-mc { display: flex; align-items: center; background: rgba(18,18,21,0.75); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; margin-bottom: 8px; overflow: hidden; transition: all 0.2s ease; min-height: 68px; backdrop-filter: blur(6px); }
        .vtd-mc:hover { border-color: rgba(60,203,255,0.25); box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
        .vtd-mc-index { width: 44px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; padding: 8px 0; border-right: 1px solid rgba(255,255,255,0.05); }
        .vtd-mc-index-num { font-size: 0.68rem; font-weight: 800; color: #555550; }
        .vtd-mc-index-fmt { font-size: 0.54rem; font-weight: 800; color: #3CCBFF; background: rgba(60,203,255,0.1); padding: 2px 5px; border-radius: 4px; }
        .vtd-mc-team { flex: 1; display: flex; align-items: center; gap: 10px; padding: 10px 14px; min-width: 0; }
        .vtd-mc-team.right { flex-direction: row-reverse; text-align: right; }
        .vtd-mc-team-logo { width: 38px; height: 38px; border-radius: 9px; background: linear-gradient(135deg, #3CCBFF 0%, #2A9FCC 100%); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; color: #fff; flex-shrink: 0; overflow: hidden; }
        .vtd-mc-team-logo img { width: 100%; height: 100%; object-fit: cover; }
        .vtd-mc-team-info { flex: 1; min-width: 0; }
        .vtd-mc-team-tag { font-size: 0.64rem; font-weight: 800; color: #3CCBFF; text-transform: uppercase; }
        .vtd-mc-team-name { font-size: 0.85rem; font-weight: 700; color: #E6E6E6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vtd-mc-avatars { display: flex; gap: 0; margin-top: 4px; }
        .vtd-mc-avatars img, .vtd-mc-avatars .vtd-mc-av-init { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid rgba(18,18,21,0.9); margin-left: -4px; object-fit: cover; }
        .vtd-mc-avatars img:first-child, .vtd-mc-avatars .vtd-mc-av-init:first-child { margin-left: 0; }
        .vtd-mc-av-init { background: #1a1a1f; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 700; color: #555550; }
        .vtd-mc-team.right .vtd-mc-avatars { justify-content: flex-end; }
        .vtd-mc-center { min-width: 90px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 4px; flex-shrink: 0; }
        .vtd-mc-score-box { display: flex; align-items: center; gap: 6px; font-size: 1.15rem; font-weight: 900; }
        .vtd-mc-score-box .s { min-width: 22px; text-align: center; color: #E6E6E6; }
        .vtd-mc-score-box .s.win { color: #4ade80; }
        .vtd-mc-score-box .s.loss { color: #f87171; }
        .vtd-mc-score-box .s.draw { color: #f59e0b; }
        .vtd-mc-score-box .dash { color: #555550; font-weight: 400; }
        .vtd-mc-status-badge { font-size: 0.58rem; font-weight: 800; padding: 2px 8px; border-radius: 100px; margin-top: 3px; }
        .vtd-mc-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; animation: vtd-pulse 1.5s ease-in-out infinite; }

        /* ── Tab share button ── */
        .vtd-tab-share { display: flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 100px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.5); cursor: pointer; font-family: inherit; font-size: 0.75rem; font-weight: 700; transition: all 0.15s; }
        .vtd-tab-share:hover { background: rgba(60,203,255,0.12); color: #3CCBFF; border-color: rgba(60,203,255,0.3); }
        .vtd-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #22c55e; color: #fff; padding: 10px 22px; border-radius: 100px; font-size: 0.85rem; font-weight: 700; z-index: 2000; animation: vtd-toast-in 0.3s ease-out, vtd-toast-out 0.3s ease-in 1.7s both; pointer-events: none; display: flex; align-items: center; gap: 7px; }
        @keyframes vtd-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes vtd-toast-out { from { opacity: 1; } to { opacity: 0; } }

        /* ── Share modal ── */
        .vtd-share-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 20px; overflow-y: auto; }
        .vtd-share-modal { background: #0f1923; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 28px; max-width: 528px; width: 100%; }
        .vtd-share-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .vtd-share-modal-title { font-size: 1.1rem; font-weight: 900; color: #E6E6E6; display: flex; align-items: center; gap: 10px; }
        .vtd-share-close { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 100px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #8A8880; }
        .vtd-share-close:hover { background: rgba(60,203,255,0.12); color: #3CCBFF; }
        .vtd-share-carousel { position: relative; width: 100%; }
        .vtd-share-carousel-img { width: 100%; aspect-ratio: 1/1; background: #0A0F2A; display: block; border-radius: 14px; border: 1px solid rgba(255,255,255,0.07); }
        .vtd-share-carousel-nav { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
        .vtd-share-carousel-btn { width: 36px; height: 36px; border-radius: 100px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #8A8880; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; flex-shrink: 0; }
        .vtd-share-carousel-btn:hover { background: rgba(60,203,255,0.12); color: #3CCBFF; }
        .vtd-share-carousel-btn:disabled { opacity: 0.3; cursor: default; }
        .vtd-share-carousel-center { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .vtd-share-carousel-label { font-size: 0.78rem; font-weight: 800; color: #E6E6E6; }
        .vtd-share-carousel-dots { display: flex; gap: 5px; }
        .vtd-share-carousel-dot { width: 6px; height: 6px; border-radius: 100px; background: rgba(255,255,255,0.15); transition: all 0.2s; }
        .vtd-share-carousel-dot.active { background: #3CCBFF; width: 16px; }
        .vtd-share-carousel-actions { display: flex; gap: 8px; margin-top: 12px; }
        .vtd-share-img-btn { padding: 10px; border-radius: 100px; font-size: 0.8rem; font-weight: 700; cursor: pointer; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 6px; border: none; transition: all 0.15s; flex: 1; }
        .vtd-share-img-btn.dl { background: linear-gradient(135deg, #3CCBFF, #2A9FCC); color: #fff; }
        .vtd-share-img-btn.dl:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(60,203,255,0.35); }
        .vtd-share-img-btn.cp { background: rgba(255,255,255,0.05); color: #8A8880; border: 1px solid rgba(255,255,255,0.1); }
        .vtd-share-img-btn.cp:hover { background: rgba(60,203,255,0.10); color: #3CCBFF; }

        /* ── Animations ── */
        @keyframes vtd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes vtspin { to { transform: rotate(360deg); } }

        /* ── Responsive ── */
        @media (max-width: 1100px) { .vtd-stat-tiles { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 900px) { .vtd-players-grid { grid-template-columns: repeat(2, 1fr); } .vtd-teams-grid { grid-template-columns: repeat(2, 1fr); } .vtd-hero-agent { opacity: 0.08; } .vtd-tier-columns { flex-wrap: wrap; } .vtd-tier-col { min-width: calc(50% - 8px); flex: 0 0 calc(50% - 8px); } }
        @media (max-width: 800px) {
          .vtd-hero { min-height: 340px; }
          .vtd-hero-content { padding: 0 16px 24px; min-height: 340px; }
          .vtd-content { padding: 0 16px 40px; }
          .vtd-tabs-wrap { margin-left: -16px; margin-right: -16px; padding: 8px 16px; }
          .vtd-overview-grid { grid-template-columns: 1fr; }
          .vtd-mc-avatars { display: none; }
          .vtd-mc-team-name { font-size: 0.78rem; }
          .vtd-card { padding: 20px; }
          .vtd-hero-agent { display: none; }
        }
        @media (max-width: 600px) {
          .vtd-stat-tiles { grid-template-columns: repeat(2, 1fr); }
          .vtd-players-grid { grid-template-columns: 1fr; }
          .vtd-teams-grid { grid-template-columns: 1fr; }
          .vtd-tier-columns { flex-wrap: wrap; }
          .vtd-tier-col { min-width: 100%; flex: 0 0 100%; }
          .vtd-mc-team { padding: 8px 10px; gap: 8px; }
          .vtd-mc-team-logo { width: 32px; height: 32px; font-size: 9px; }
          .vtd-tab { min-height: 42px; padding: 0 6px; font-size: 0.74rem; gap: 4px; }
          .vtd-tab-label { display: none; }
          .vtd-tab-count { display: none; }
          .vtd-hero-title { font-size: 1.6rem; }
          .vtd-hero-desc { font-size: 0.88rem; }
          .vtd-hero-actions { gap: 8px; }
          .vtd-reg-bar { padding: 14px 16px; gap: 12px; }
          .vtd-reg-btn, .vtd-reg-done { width: 100%; text-align: center; }
          .vtd-mc-center { min-width: 70px; }
          .vtd-mc-index { width: 36px; }
          .vtd-mc-score-box { font-size: 1rem; }
          .vtd-standings-table th, .vtd-standings-table td { padding: 10px 8px; font-size: 0.76rem; }
          .vtd-share-modal { padding: 20px; border-radius: 16px; }
          .vtd-card { padding: 16px; border-radius: 14px; }
          .vtd-stat-tile { padding: 14px 10px; border-radius: 12px; }
          .vtd-stat-tile-val { font-size: 1.15rem; }
        }
        @media (max-width: 400px) {
          .vtd-hero-content { padding: 0 12px 20px; min-height: 300px; }
          .vtd-content { padding: 0 12px 32px; }
          .vtd-tabs-wrap { margin-left: -12px; margin-right: -12px; padding: 6px 12px; }
          .vtd-tab { min-height: 38px; padding: 0 4px; font-size: 0.7rem; }
          .vtd-hero-title { font-size: 1.4rem; }
          .vtd-stat-tiles { gap: 8px; }
        }
      `}</style>

      {/* Animated background */}
      <div className="vtd-bg">
        <div className="vtd-bg-gradient" />
        <div className="vtd-bg-grid" />
        <div className="vtd-bg-glow1" />
        <div className="vtd-bg-glow2" />
        <div className="vtd-bg-glow3" />
      </div>

      <div className="vtd-page">
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
        <div className="vtd-hero">
          <img className="vtd-hero-bg" src={tournament.bannerImage || "/valorantimg3.jpg"} alt="" aria-hidden="true" />
          <img className="vtd-hero-agent" src="/valorant-agents.jpg" alt="" aria-hidden="true" />
          <div className="vtd-hero-overlay" />
          <div className="vtd-hero-content">
            <div className="vtd-hero-inner">
              <div className="vtd-hero-game-tag">Valorant Tournament</div>
              <div className="vtd-hero-title">{tournament.name}</div>
              {(tournament.description || tournament.desc) && (
                <div className="vtd-hero-desc">{tournament.description || tournament.desc}</div>
              )}
              <div className="vtd-hero-actions">
                {canRegister && <button className="vtd-reg-btn" onClick={() => setShowRegister(true)}>Register Now →</button>}
                {!regClosed && !isRegistered && slotsLeft <= 0 && isRegOpen && (
                  <>
                    <button className="vtd-reg-btn" disabled style={{ background: "#555", cursor: "default", opacity: 0.7 }}>Slots Full</button>
                    {user && (
                      <button
                        onClick={toggleWaitlist}
                        disabled={waitlistLoading}
                        style={{ padding: "10px 22px", background: onWaitlist ? "rgba(34,197,94,0.12)" : "rgba(251,191,36,0.1)", color: onWaitlist ? "#4ade80" : "#fbbf24", border: `1px solid ${onWaitlist ? "rgba(34,197,94,0.3)" : "rgba(251,191,36,0.3)"}`, borderRadius: 100, fontSize: "0.82rem", fontWeight: 700, cursor: waitlistLoading ? "default" : "pointer", fontFamily: "inherit", transition: "all 0.2s", opacity: waitlistLoading ? 0.6 : 1 }}
                      >{waitlistLoading ? "..." : onWaitlist ? "On Waitlist ✓" : "Notify Me"}</button>
                    )}
                  </>
                )}
                {isRegistered && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="vtd-reg-done">✓ Registered</div>
                    {!regClosed && !tournament?.bracketsComputed && tournament?.status === "upcoming" && (
                      <button
                        onClick={handleUnregister}
                        disabled={unregLoading}
                        style={{
                          padding: "10px 20px", background: "rgba(239,68,68,0.1)", color: "#f87171",
                          border: "1px solid rgba(239,68,68,0.3)", borderRadius: 100, fontSize: "0.82rem",
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
                    onClick={() => setActiveTab("leaderboard")}
                    style={{
                      padding: "10px 24px", background: "rgba(96,165,250,0.12)", color: "#60A5FA",
                      border: "1px solid rgba(96,165,250,0.3)", borderRadius: 100, fontSize: "0.86rem",
                      fontWeight: 800, cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(96,165,250,0.2)"; e.currentTarget.style.boxShadow = "0 0 16px rgba(96,165,250,0.25)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(96,165,250,0.12)"; e.currentTarget.style.boxShadow = "none"; }}
                  >Leaderboard</button>
                )}
                <button className="vtd-hero-share-btn" onClick={() => setShowShareCard(true)} title="Share tournament">
                  <Share2 size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="vtd-content">

          {/* ═══ CHAMPION BANNER ═══ */}
          {championTeamName && (
            <div style={{
              background: "linear-gradient(135deg, rgba(255,215,0,0.08) 0%, rgba(60,203,255,0.06) 50%, rgba(255,215,0,0.08) 100%)",
              border: "1px solid rgba(255,215,0,0.25)",
              borderRadius: 14,
              padding: "20px 24px",
              marginBottom: 20,
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 0%, rgba(255,215,0,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
              <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#ffd700", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Tournament Champion</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#E6E6E6", lineHeight: 1.2 }}>{championTeamName}</div>
              {championMembers.length > 0 && (
                <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                  {championMembers.map((p: any, i: number) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 100, padding: "4px 12px 4px 4px" }}>
                      {p.riotAvatar ? (
                        <img src={p.riotAvatar} alt="" style={{ width: 24, height: 24, borderRadius: "50%", border: "1px solid rgba(255,215,0,0.3)" }} />
                      ) : (
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(255,215,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, color: "#ffd700" }}>{(p.riotGameName || "?")[0]}</div>
                      )}
                      <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "#E6E6E6" }}>{p.riotGameName || "Player"}</span>
                      {p.riotTagLine && <span style={{ fontSize: "0.66rem", color: "#8A8880" }}>#{p.riotTagLine}</span>}
                    </div>
                  ))}
                </div>
              )}
              {grandFinal && (
                <div style={{ fontSize: "0.72rem", color: "#8A8880", marginTop: 10, fontWeight: 600 }}>
                  Grand Final: {grandFinal.team1Name} {grandFinal.team1Score} - {grandFinal.team2Score} {grandFinal.team2Name}
                </div>
              )}
            </div>
          )}

          {/* ═══ TAB BAR ═══ */}
          <div className="vtd-tabs-wrap">
            <div className="vtd-tabs">
              {TABS.map(t => (
                <button key={t.key} className={`vtd-tab${activeTab === t.key ? " active" : ""}`} onClick={() => { setActiveTab(t.key); router.replace(`?tab=${t.key}`, { scroll: false }); }} title={t.label}>
                  <t.Icon size={16} strokeWidth={activeTab === t.key ? 2.5 : 2} />
                  <span className="vtd-tab-label">{t.label}</span>
                  {t.key === "players" && <span className="vtd-tab-count">{players.length}</span>}
                  {t.key === "teams" && teams.length > 0 && <span className="vtd-tab-count">{teams.length}</span>}
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
            <div className="vtd-tab-pane" ref={tabContentRef}>
              {/* Stat tiles */}
              <div className="vtd-stat-tiles">
                <div className="vtd-stat-tile red" style={{ animationDelay: "0s" }}>
                  <div className="vtd-stat-tile-icon"><Zap size={24} color="#3CCBFF" /></div>
                  <div className="vtd-stat-tile-val">{tournament.format === "shuffle" ? "Shuffle" : tournament.format === "auction" ? "Auction" : "Standard"}</div>
                  <div className="vtd-stat-tile-lbl">Format</div>
                </div>
                <div className="vtd-stat-tile" style={{ animationDelay: "0.05s" }}>
                  <div className="vtd-stat-tile-icon"><Coins size={24} color="#8A8880" /></div>
                  <div className="vtd-stat-tile-val">{tournament.entryFee === 0 ? "Free" : `₹${tournament.entryFee}`}</div>
                  <div className="vtd-stat-tile-lbl">Entry Fee</div>
                </div>
                {tournament.prizePool && tournament.prizePool !== "0" && (
                  <div className="vtd-stat-tile gold" style={{ animationDelay: "0.1s" }}>
                    <div className="vtd-stat-tile-icon"><Trophy size={24} color="#fbbf24" /></div>
                    <div className="vtd-stat-tile-val">{tournament.prizePool.startsWith("₹") ? tournament.prizePool : `₹${tournament.prizePool}`}</div>
                    <div className="vtd-stat-tile-lbl">Prize Pool</div>
                  </div>
                )}
                <div className="vtd-stat-tile blue" style={{ animationDelay: "0.15s" }}>
                  <div className="vtd-stat-tile-icon"><Calendar size={24} color="#60a5fa" /></div>
                  <div className="vtd-stat-tile-val">{formatDate(tournament.startDate)}</div>
                  <div className="vtd-stat-tile-lbl">Start Date</div>
                </div>
                <div className="vtd-stat-tile" style={{ animationDelay: "0.2s" }}>
                  <div className="vtd-stat-tile-icon"><Users size={24} color="#8A8880" /></div>
                  <div className="vtd-stat-tile-val">{tournament.slotsBooked}/{tournament.totalSlots}</div>
                  <div className="vtd-stat-tile-lbl">Players Registered</div>
                </div>
                <div className="vtd-stat-tile" style={{ animationDelay: "0.25s" }}>
                  <div className="vtd-stat-tile-icon"><Target size={24} color="#8A8880" /></div>
                  <div className="vtd-stat-tile-val">BO{tournament.matchesPerRound || 2}</div>
                  <div className="vtd-stat-tile-lbl">Match Format</div>
                </div>
                <div className="vtd-stat-tile" style={{ animationDelay: "0.3s" }}>
                  <div className="vtd-stat-tile-icon"><Shield size={24} color="#8A8880" /></div>
                  <div className="vtd-stat-tile-val">{tournament.groupStageRounds || 3}</div>
                  <div className="vtd-stat-tile-lbl">Group Rounds</div>
                </div>
                <div className="vtd-stat-tile" style={{ animationDelay: "0.35s" }}>
                  <div className="vtd-stat-tile-icon"><GitBranch size={24} color="#8A8880" /></div>
                  <div className="vtd-stat-tile-val">{tournament.bracketFormat === "single_elimination" ? "Single Elim" : "Double Elim"}</div>
                  <div className="vtd-stat-tile-lbl">Play-off Type</div>
                </div>
              </div>

              <div className="vtd-overview-grid">
                <div>
                  {(tournament.description || tournament.desc) && (
                    <div className="vtd-card">
                      <span className="vtd-card-label"><Info size={12} style={{ display: "inline", marginRight: 6 }} />About this Tournament</span>
                      <p className="vtd-desc">{tournament.description || tournament.desc}</p>
                    </div>
                  )}
                  {(tournament.rules || []).length > 0 && (
                    <div className="vtd-card">
                      <span className="vtd-card-label"><ScrollText size={12} style={{ display: "inline", marginRight: 6 }} />Rules</span>
                      <div className="vtd-rules-scroll">
                        {(tournament.rules || []).map((rule: string, i: number) => (
                          <div key={i} className="vtd-rule">
                            <span className="vtd-rule-num">{i + 1}</span>
                            <span className="vtd-rule-text">{rule}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  {Object.keys(schedule).length > 0 && (
                    <div className="vtd-card">
                      <span className="vtd-card-label"><Calendar size={12} style={{ display: "inline", marginRight: 6 }} />Schedule</span>
                      <div className="vtd-timeline">
                        {schedule.registrationOpens && <TimelineItem label="Registration Opens" date={schedule.registrationOpens} status={new Date(schedule.registrationOpens) <= new Date() ? "past" : "future"} />}
                        {schedule.registrationCloses && <TimelineItem label="Registration Closes" date={schedule.registrationCloses} status={new Date(schedule.registrationCloses) <= new Date() ? "past" : new Date(schedule.registrationOpens) <= new Date() ? "active" : "future"} />}
                        {schedule.squadCreation && <TimelineItem label="Team Formation" date={schedule.squadCreation} status={new Date(schedule.squadCreation) <= new Date() ? "past" : "future"} />}
                        {schedule.groupStageStart && <TimelineItem label="Group Stage Starts" date={schedule.groupStageStart} status={tournament.status === "active" ? "active" : new Date(schedule.groupStageStart) <= new Date() ? "past" : "future"} badge={tournament.status === "active" ? "ACTIVE" : undefined} />}
                        {schedule.groupStageEnd && <TimelineItem label="Group Stage Ends" date={schedule.groupStageEnd} status={new Date(schedule.groupStageEnd) <= new Date() ? "past" : "future"} />}
                        {schedule.tourneyStageStart && <TimelineItem label="Play-off Stage" date={schedule.tourneyStageStart} status="future" />}
                      </div>
                    </div>
                  )}
                  {/* Tournament flow diagram */}
                  <div className="vtd-card">
                    <span className="vtd-card-label"><GitBranch size={12} style={{ display: "inline", marginRight: 6 }} />Tournament Flow</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {[
                        { label: "Group Stage", sub: `${tournament.groupStageRounds || 3} rounds · BO${tournament.matchesPerRound || 2}`, color: "#3b82f6" },
                        { label: "→", sub: `Top ${tournament.bracketTeamCount || "50%"}`, color: "#555550", isArrow: true },
                        { label: "Play-offs", sub: `${tournament.bracketFormat === "single_elimination" ? "Single" : "Double"} Elim · BO${tournament.bracketBestOf || 2}`, color: "#f59e0b" },
                        { label: "→", sub: "", color: "#555550", isArrow: true },
                        { label: "Grand Final", sub: `BO${tournament.grandFinalBestOf || 3}`, color: "#3CCBFF" },
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
                </div>
              </div>
            </div>
          )}

          {/* ═══ PLAYERS ═══ */}
          {activeTab === "players" && (
            <div className="vtd-tab-pane" ref={tabContentRef}>
              <div className="vtd-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <span className="vtd-card-label" style={{ marginBottom: 0 }}>Registered Players ({players.length})</span>
                  <TabSharePopover tabKey="players" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} />
                </div>
                {players.length === 0 ? (
                  <div className="vtd-empty"><Users size={48} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block", color: "#555550" }} /><span className="vtd-empty-title">No players registered yet</span><span className="vtd-empty-sub">Be the first to register!</span></div>
                ) : (() => {
                  const rankOrder = ["Radiant", "Immortal", "Ascendant", "Diamond", "Platinum", "Gold", "Silver", "Bronze", "Iron", "Unranked"];
                  const rankColors: Record<string, { bg: string; border: string; text: string }> = {
                    Radiant:   { bg: "rgba(255,255,170,0.08)", border: "rgba(255,255,170,0.25)", text: "#FFFFAA" },
                    Immortal:  { bg: "rgba(191,64,83,0.10)",   border: "rgba(191,64,83,0.30)",   text: "#BF4053" },
                    Ascendant: { bg: "rgba(27,123,73,0.10)",   border: "rgba(27,123,73,0.30)",   text: "#1B9B59" },
                    Diamond:   { bg: "rgba(180,137,198,0.10)", border: "rgba(180,137,198,0.30)", text: "#B489C6" },
                    Platinum:  { bg: "rgba(73,180,180,0.10)",  border: "rgba(73,180,180,0.30)",  text: "#49B4B4" },
                    Gold:      { bg: "rgba(236,183,66,0.10)",  border: "rgba(236,183,66,0.30)",  text: "#ECB742" },
                    Silver:    { bg: "rgba(180,185,191,0.08)", border: "rgba(180,185,191,0.25)", text: "#B4B9BF" },
                    Bronze:    { bg: "rgba(165,120,93,0.10)",  border: "rgba(165,120,93,0.30)",  text: "#A5785D" },
                    Iron:      { bg: "rgba(110,110,110,0.10)", border: "rgba(110,110,110,0.30)", text: "#8A8A8A" },
                    Unranked:  { bg: "rgba(85,85,85,0.10)",    border: "rgba(85,85,85,0.30)",    text: "#777" },
                  };
                  const grouped: Record<string, any[]> = {};
                  players.forEach((p: any) => {
                    const baseRank = (p.riotRank || "").split(" ")[0];
                    const key = rankOrder.includes(baseRank) ? baseRank : "Unranked";
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(p);
                  });
                  const sortedRanks = rankOrder.filter(r => grouped[r]?.length);
                  return (
                    <div className="vtd-tier-columns">
                      {sortedRanks.map((rank) => {
                        const colors = rankColors[rank];
                        const rankPlayers = grouped[rank].sort((a: any, b: any) => (b.riotTier || 0) - (a.riotTier || 0));
                        return (
                          <div key={rank} className="vtd-tier-col">
                            <div className="vtd-tier-header" style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}>
                              <span>{rank}</span>
                              <span className="vtd-tier-header-count">{rankPlayers.length}</span>
                            </div>
                            {rankPlayers.map((p: any) => (
                              <Link key={p.uid} href={`/player/${p.uid}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                                <div className="vtd-tier-player">
                                  {p.riotAvatar ? <img className="vtd-tier-player-avatar" src={p.riotAvatar} alt={p.riotGameName} /> : <div className="vtd-tier-player-avatar-init">{(p.riotGameName || "?")[0].toUpperCase()}</div>}
                                  <div className="vtd-tier-player-info">
                                    <span className="vtd-tier-player-name">{p.riotGameName}<span className="tag">#{p.riotTagLine}</span></span>
                                    <span className="vtd-tier-player-rank">{p.riotRank || "Unranked"}{p.riotTier ? ` (${p.riotTier})` : ""}</span>
                                  </div>
                                </div>
                              </Link>
                            ))}
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
            <div className="vtd-tab-pane" ref={tabContentRef}>
              {teams.length === 0 ? (
                <div className="vtd-card"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><span className="vtd-card-label" style={{ marginBottom: 0 }}>Teams</span><TabSharePopover tabKey="teams" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} /></div><div className="vtd-empty"><Shield size={48} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block", color: "#555550" }} /><span className="vtd-empty-title">Teams not generated yet</span><span className="vtd-empty-sub">Teams will be shuffled after registration closes.</span></div></div>
              ) : (
                <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span className="vtd-card-label" style={{ marginBottom: 0 }}>Teams ({teams.length})</span>
                  <TabSharePopover tabKey="teams" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} />
                </div>
                <div className="vtd-teams-grid">
                  {teams.map((team: any) => { const isMyTeam = userTeam?.id === team.id; const canEdit = isMyTeam && !team.teamNameSet; const isEditing = editingTeamId === team.id; return (
                    <div key={team.id} className="vtd-team-box">
                      <span className="vtd-team-box-num">#{team.teamIndex}</span>
                      <div className="vtd-team-box-header">
                        <div className="vtd-team-logo" style={{ position: "relative", cursor: (isMyTeam && !team.teamLogoSet && !logoUploading) ? "pointer" : "default" }} onClick={() => { if (isMyTeam && !team.teamLogoSet && !logoUploading) logoInputRef.current?.click(); }}>
                          {team.teamLogo ? <img src={team.teamLogo} alt={team.teamName} /> : getTeamInitials(team.teamName)}
                          {isMyTeam && !team.teamLogoSet && !logoUploading && (<div style={{ position: "absolute", inset: 0, borderRadius: 12, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.15s" }} onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0")}><span style={{ color: "#fff", fontSize: 18 }}>📷</span></div>)}
                          {logoUploading && (<div style={{ position: "absolute", inset: 0, borderRadius: 12, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 18, height: 18, border: "2px solid #555", borderTopColor: "#3CCBFF", borderRadius: "50%", animation: "vtspin 0.8s linear infinite" }} /></div>)}
                        </div>
                        <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(team.id, f); }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {isEditing ? (
                            <div>
                              <input className="vtd-team-edit-input" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="Enter team name" maxLength={24} autoFocus onKeyDown={e => { if (e.key === "Enter") handleUpdateTeamName(team.id); }} />
                              {teamNameError && <div style={{ fontSize: "0.68rem", color: "#f87171", marginTop: 4 }}>{teamNameError}</div>}
                              <div className="vtd-team-edit-actions"><button className="vtd-team-edit-save" onClick={() => handleUpdateTeamName(team.id)} disabled={teamNameLoading}>{teamNameLoading ? "Saving..." : "Save"}</button><button className="vtd-team-edit-cancel" onClick={() => { setEditingTeamId(null); setTeamNameError(""); }}>Cancel</button></div>
                            </div>
                          ) : (
                            <><div className="vtd-team-box-name">{team.teamName}</div><div className="vtd-team-box-avg">Avg Tier: {team.members?.length ? Math.round((team.members.reduce((s: number, m: any) => s + (m.riotTier || 0), 0) / team.members.length) * 10) / 10 : team.avgSkillLevel}</div>{logoError && isMyTeam && <div style={{ fontSize: "0.62rem", color: "#f87171", marginTop: 4 }}>{logoError}</div>}</>
                          )}
                        </div>
                      </div>
                      <div className="vtd-team-box-members">
                        {(team.members || []).map((m: any, i: number) => (
                          <div key={m.uid || i} className="vtd-team-box-member">
                            {m.riotAvatar ? <img src={m.riotAvatar} alt={m.riotGameName} className="vtd-team-box-member-avatar" /> : <div className="vtd-team-box-member-init">{(m.riotGameName || "?")[0]}</div>}
                            <div style={{ flex: 1, minWidth: 0 }}><div className="vtd-team-box-member-name">{m.riotGameName}</div><div className="vtd-team-box-member-rank">{m.riotRank}{m.riotTier ? ` (${m.riotTier})` : ""}</div></div>
                          </div>
                        ))}
                      </div>
                      <div className="vtd-team-box-footer">
                        <span>{team.members?.length || 0} players</span>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {canEdit && !isEditing && <button className="vtd-team-edit-btn" onClick={() => { setEditingTeamId(team.id); setNewTeamName(team.teamName); setTeamNameError(""); }}>✏️ Set Name</button>}
                          {isMyTeam && !team.teamLogoSet && !logoUploading && <button className="vtd-team-edit-btn" onClick={() => logoInputRef.current?.click()}>📷 Logo</button>}
                          {team.teamNameSet && <span style={{ fontSize: "0.62rem", color: "#4ade80" }}>✓ Name</span>}
                          {team.teamLogoSet && <span style={{ fontSize: "0.62rem", color: "#4ade80" }}>✓ Logo</span>}
                        </div>
                      </div>
                    </div>
                  ); })}
                </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ STANDINGS ═══ */}
          {activeTab === "standings" && (
            <div className="vtd-tab-pane" ref={tabContentRef}>
              <div className="vtd-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <span className="vtd-card-label" style={{ marginBottom: 0 }}>Group Stage Standings</span>
                  <TabSharePopover tabKey="standings" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} />
                </div>
                {standings.length === 0 ? (
                  <div className="vtd-empty"><Trophy size={48} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block", color: "#555550" }} /><span className="vtd-empty-title">No standings yet</span><span className="vtd-empty-sub">Standings will appear once matches are played.</span></div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="vtd-standings-table">
                      <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th style={{ color: "#4ade80" }}>MW</th><th style={{ color: "#f87171" }}>ML</th><th style={{ color: "#3CCBFF" }}>Pts</th><th>BH</th></tr></thead>
                      <tbody>{standings.map((s: any, i: number) => (<tr key={s.id}><td style={{ fontWeight: 800, color: i < 6 ? "#3CCBFF" : "#555550" }}>{i + 1}</td><td style={{ fontWeight: 700 }}>{s.teamName}</td><td>{s.played || 0}</td><td>{s.wins || 0}</td><td>{s.draws || 0}</td><td>{s.losses || 0}</td><td style={{ color: "#4ade80" }}>{s.mapsWon || 0}</td><td style={{ color: "#f87171" }}>{s.mapsLost || 0}</td><td style={{ fontWeight: 800, color: "#3CCBFF" }}>{s.points || 0}</td><td style={{ color: "#555550" }}>{s.buchholz || 0}</td></tr>))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ MATCHES ═══ */}
          {activeTab === "matches" && (
            <div className="vtd-tab-pane" ref={tabContentRef}>
              {matches.length === 0 ? (
                <div className="vtd-card"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><span className="vtd-card-label" style={{ marginBottom: 0 }}>Matches</span><TabSharePopover tabKey="matches" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} /></div><div className="vtd-empty"><Swords size={48} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block", color: "#555550" }} /><span className="vtd-empty-title">No matches scheduled</span><span className="vtd-empty-sub">Matches will appear once pairings are generated.</span></div></div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span className="vtd-card-label" style={{ marginBottom: 0 }}>Matches</span>
                    <TabSharePopover tabKey="matches" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} />
                  </div>
                  {groupMatches.length > 0 && (
                    <div>
                      <div className="vtd-section-header group">Group Stage Fixtures</div>
                      {(() => { const days = [...new Set(groupMatches.map((m: any) => m.matchDay))].sort((a: number, b: number) => a - b); return days.map((day: number) => (<div key={day}><div className="vtd-match-day-header"><span className="day-num">Round {day}</span><span>· {groupMatches.filter((m: any) => m.matchDay === day).length} matches</span></div>{groupMatches.filter((m: any) => m.matchDay === day).map((m: any) => (<MatchCard key={m.id} m={m} teamMembers={teamMembers} teamLogoMap={teamLogoMap} expandedMatch={expandedMatch} setExpandedMatch={setExpandedMatch} tournamentId={id} isBracket={false} bestOf={tournament?.matchesPerRound || 2} />))}</div>)); })()}
                    </div>
                  )}
                  {bracketMatches.length > 0 && (
                    <div style={{ marginTop: groupMatches.length > 0 ? 32 : 0 }}>
                      <div className="vtd-section-header bracket">Play-off Fixtures</div>
                      {(() => { const days = [...new Set(bracketMatches.map((m: any) => m.matchDay))].sort((a: number, b: number) => a - b); let bracketRoundNum = 0; return days.map((day: number) => { bracketRoundNum++; const dayMatches = bracketMatches.filter((m: any) => m.matchDay === day); return (<div key={day}><div className="vtd-match-day-header bracket-round"><span className="day-num">Bracket Round {bracketRoundNum}</span><span>· {dayMatches.length} matches</span></div>{dayMatches.map((m: any) => (<MatchCard key={m.id} m={m} teamMembers={teamMembers} teamLogoMap={teamLogoMap} expandedMatch={expandedMatch} setExpandedMatch={setExpandedMatch} tournamentId={id} isBracket={true} bestOf={m.bracketType === "grand_final" ? (tournament?.grandFinalBestOf || 3) : (tournament?.bracketBestOf || 2)} />))}</div>); }); })()}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ═══ BRACKETS ═══ */}
          {activeTab === "brackets" && (
            <div className="vtd-tab-pane" ref={tabContentRef} style={{ animation: "vtd-fadein 0.3s ease" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 900, color: "#E6E6E6" }}>Elimination Play-offs</h3>
                  <span style={{
                    fontSize: "0.6rem", fontWeight: 900, letterSpacing: "0.1em",
                    padding: "3px 10px", borderRadius: 100,
                    background: tournament.bracketFormat === "single_elimination" ? "rgba(245,158,11,0.12)" : "rgba(60,203,255,0.12)",
                    border: `1px solid ${tournament.bracketFormat === "single_elimination" ? "rgba(245,158,11,0.35)" : "rgba(60,203,255,0.35)"}`,
                    color: tournament.bracketFormat === "single_elimination" ? "#f59e0b" : "#3CCBFF",
                  }}>
                    {tournament.bracketFormat === "single_elimination" ? "SINGLE ELIMINATION" : "DOUBLE ELIMINATION"}
                  </span>
                </div>
                <TabSharePopover tabKey="brackets" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} />
              </div>
              {tournament.bracketFormat === "single_elimination" ? (
                <DoubleBracket
                  matches={bracketMatches.filter((m: any) => m.bracketType !== "lower")}
                  bracketSize={tournament.bracketTeamCount || tournament.bracketSize || 4}
                  standings={standings}
                  bracketBestOf={tournament.bracketBestOf || 2}
                  grandFinalBestOf={tournament.grandFinalBestOf || 3}
                />
              ) : (
                <DoubleBracket
                  matches={bracketMatches}
                  bracketSize={tournament.bracketTeamCount || tournament.bracketSize || 4}
                  standings={standings}
                  bracketBestOf={tournament.bracketBestOf || 2}
                  grandFinalBestOf={tournament.grandFinalBestOf || 3}
                />
              )}
            </div>
          )}

          {/* ═══ LEADERBOARD ═══ */}
          {activeTab === "leaderboard" && (
            <div className="vtd-tab-pane" ref={tabContentRef}>
              <div className="vtd-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <span className="vtd-card-label" style={{ marginBottom: 0 }}>Player Leaderboard — MVP Tracker</span>
                  <TabSharePopover tabKey="leaderboard" id={id} tournamentName={tournament?.name || ""} tabContentRef={tabContentRef} setShowToast={setShowToast} setToastMsg={setToastMsg} />
                </div>
                {leaderboard.length === 0 ? (
                  <div className="vtd-empty"><BarChart3 size={48} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block", color: "#555550" }} /><span className="vtd-empty-title">No stats yet</span><span className="vtd-empty-sub">Player stats will appear once match data is fetched.</span></div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="vtd-standings-table">
                      <thead><tr><th>#</th><th>Player</th><th>Agent(s)</th><th>Maps</th><th style={{ color: "#4ade80" }}>K</th><th style={{ color: "#f87171" }}>D</th><th>A</th><th style={{ color: "#3CCBFF" }}>K/D</th><th>ACS</th><th>HS%</th><th>DMG</th></tr></thead>
                      <tbody>{leaderboard.map((p: any, i: number) => { const acs = Math.round((p.totalScore || 0) / Math.max(1, p.totalRoundsPlayed || 1)); return (<tr key={p.id} style={i === 0 ? { background: "rgba(245,158,11,0.08)" } : {}}><td style={{ fontWeight: 800, color: i === 0 ? "#f59e0b" : i < 3 ? "#3CCBFF" : "#555550" }}>{i === 0 ? "👑" : i + 1}</td><td>{p.uid ? (<Link href={`/player/${p.uid}`} style={{ textDecoration: "none", color: "inherit" }}><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: "0.68rem", color: "#555550" }}>#{p.tag}</div></Link>) : (<><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: "0.68rem", color: "#555550" }}>#{p.tag}</div></>)}</td><td style={{ fontSize: "0.78rem", color: "#8A8880" }}>{(p.agents || []).join(", ")}</td><td>{p.matchesPlayed || 0}</td><td style={{ fontWeight: 700, color: "#4ade80" }}>{p.totalKills || 0}</td><td style={{ color: "#f87171" }}>{p.totalDeaths || 0}</td><td>{p.totalAssists || 0}</td><td style={{ fontWeight: 800, color: (p.kd || 0) >= 1.0 ? "#4ade80" : "#f87171" }}>{p.kd || 0}</td><td style={{ fontWeight: 700 }}>{acs}</td><td>{p.hsPercent || 0}%</td><td style={{ fontSize: "0.82rem", color: "#8A8880" }}>{p.totalDamageDealt || 0}</td></tr>); })}</tbody>
                    </table>
                    <div style={{ marginTop: 14, padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 10, fontSize: "0.78rem", color: "#555550", lineHeight: 1.6, border: "1px solid rgba(255,255,255,0.05)" }}>
                      <strong style={{ color: "#8A8880" }}>How MVP is determined:</strong> Players ranked by Average Combat Score (ACS = total score / rounds played), then K/D ratio as tiebreaker.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {showRegister && user && <RegisterModal tournament={tournament} user={user} dotaProfile={null} game="valorant" onClose={() => setShowRegister(false)} onSuccess={() => setIsRegistered(true)} />}

      {/* Toast notification */}
      {showToast && (
        <div className="vtd-toast"><CheckCheck size={16} /> {toastMsg}</div>
      )}

      {/* ═══ SHARE CARD MODAL ═══ */}
      {showShareCard && (
        <div className="vtd-share-overlay" onClick={e => { if (e.target === e.currentTarget) setShowShareCard(false); }}>
          <div className="vtd-share-modal">
            <div className="vtd-share-modal-head">
              <div className="vtd-share-modal-title"><Share2 size={18} /> Share Tournament</div>
              <button className="vtd-share-close" onClick={() => setShowShareCard(false)}><X size={16} /></button>
            </div>
            <p style={{ fontSize: "0.75rem", color: "#555550", marginBottom: 16, marginTop: -8 }}>
              6 animated share slides for Instagram, Stories & WhatsApp. Download as image or record as video!
            </p>

            {/* Animated Remotion Carousel */}
            <ShareVideoCarousel
              tournament={tournament}
              tournamentId={id as string}
              onToast={() => { setShowToast(true); setTimeout(() => setShowToast(false), 2000); }}
            />

            {/* Social links + bottom */}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <a href={`https://wa.me/?text=${encodeURIComponent(`🎮 ${tournament.name} — Valorant Tournament\n📅 ${formatDate(tournament.startDate)} · ${tournament.entryFee === 0 ? "Free Entry" : "₹"+tournament.entryFee+" Entry"}\n\nRegister: ${window.location.href}`)}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "10px", borderRadius: 100, background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.3)", color: "#25d366", fontSize: "0.82rem", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <MessageCircle size={15} /> WhatsApp
              </a>
              <a href="https://www.instagram.com/iesports.in/" target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "10px", borderRadius: 100, background: "rgba(225,48,108,0.1)", border: "1px solid rgba(225,48,108,0.3)", color: "#E1306C", fontSize: "0.82rem", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Camera size={15} /> Instagram
              </a>
              <button style={{ flex: 1, padding: "10px", borderRadius: 100, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#8A8880", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                onClick={() => { navigator.clipboard.writeText(window.location.href); setShowToast(true); setTimeout(() => setShowToast(false), 2000); }}>
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

export default function ValorantTournamentDetail() {
  return (
    <Suspense>
      <ValorantTournamentDetailInner />
    </Suspense>
  );
}

function GameDetailCard({ game, gameNum, team1Name, team2Name, team1Id, team2Id }: { game: any; gameNum: number; team1Name: string; team2Name: string; team1Id: string; team2Id: string; }) {
  if (!game) return (
    <div style={{ background: "#121215", border: "1px solid #2A2A30", borderRadius: 10, padding: "12px 14px", opacity: 0.5 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: gameNum === 1 ? "#3CCBFF" : "#3b82f6" }}>Game {gameNum}</span>
      </div>
      <div style={{ textAlign: "center", padding: "12px 0", color: "#555550", fontSize: "0.78rem" }}>No data</div>
    </div>
  );

  const isPlayed = game.status === "completed" || game.winner;
  const mapName = game.mapName || "Unknown Map";
  const t1Won = game.winner === team1Id || game.winner === "team1";
  const t2Won = game.winner === team2Id || game.winner === "team2";
  const stats: any[] = game.playerStats || [];
  const t1Stats = stats.filter((s: any) => s.teamId === team1Id || s.team === "team1");
  const t2Stats = stats.filter((s: any) => s.teamId === team2Id || s.team === "team2");
  const t1Rounds = game.team1RoundsWon ?? game.team1Rounds ?? "–";
  const t2Rounds = game.team2RoundsWon ?? game.team2Rounds ?? "–";

  return (
    <div style={{ background: "#121215", border: "1px solid #2A2A30", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: gameNum === 1 ? "#3CCBFF" : "#3b82f6" }}>Game {gameNum}</span>
        <span style={{ fontSize: "0.72rem", color: "#8A8880", fontWeight: 600 }}>{mapName}</span>
        {isPlayed ? <span style={{ fontSize: "0.58rem", fontWeight: 800, padding: "2px 8px", borderRadius: 100, background: "rgba(22,163,74,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }}>✓</span> : <span style={{ fontSize: "0.58rem", fontWeight: 800, padding: "2px 8px", borderRadius: 100, background: "#1a1a1f", color: "#555550" }}>Pending</span>}
      </div>
      {isPlayed && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: t1Won ? "#4ade80" : "#555550", marginBottom: 2 }}>{team1Name.length > 14 ? team1Name.slice(0, 12) + "…" : team1Name}</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 900, color: t1Won ? "#4ade80" : "#f87171" }}>{t1Rounds}</div>
          </div>
          <div style={{ fontSize: "0.72rem", color: "#555550", fontWeight: 700 }}>vs</div>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: t2Won ? "#4ade80" : "#555550", marginBottom: 2 }}>{team2Name.length > 14 ? team2Name.slice(0, 12) + "…" : team2Name}</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 900, color: t2Won ? "#4ade80" : "#f87171" }}>{t2Rounds}</div>
          </div>
        </div>
      )}
      {stats.length > 0 && (
        <div style={{ borderTop: "1px solid #1e1e22", paddingTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: "0.58rem", fontWeight: 800, color: "#555550", letterSpacing: "0.1em" }}>PLAYER</span>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ fontSize: "0.58rem", fontWeight: 800, color: "#555550", letterSpacing: "0.1em", minWidth: 60, textAlign: "right" as const }}>K/D/A</span>
              <span style={{ fontSize: "0.58rem", fontWeight: 800, color: "#555550", letterSpacing: "0.1em", minWidth: 30, textAlign: "right" as const }}>ACS</span>
            </div>
          </div>
          {t1Stats.map((s: any, i: number) => (
            <div key={`t1-${i}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: "0.68rem" }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: "#1a1a1f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#555550", flexShrink: 0, overflow: "hidden" }}>{s.agentIcon ? <img src={s.agentIcon} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (s.agent || "?")[0]}</div>
              <span style={{ flex: 1, fontWeight: 600, color: t1Won ? "#4ade80" : "#e0e0da", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name || s.riotGameName || "Player"}</span>
              <span style={{ fontWeight: 700, color: "#8A8880", minWidth: 60, textAlign: "right" as const }}>{s.kills ?? 0}/{s.deaths ?? 0}/{s.assists ?? 0}</span>
              <span style={{ fontWeight: 700, color: "#3CCBFF", minWidth: 30, textAlign: "right" as const }}>{s.acs ?? Math.round((s.score || 0) / Math.max(1, s.rounds || 1))}</span>
            </div>
          ))}
          {t1Stats.length > 0 && t2Stats.length > 0 && <div style={{ height: 1, background: "#2A2A30", margin: "6px 0" }} />}
          {t2Stats.map((s: any, i: number) => (
            <div key={`t2-${i}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: "0.68rem" }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: "#1a1a1f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#555550", flexShrink: 0, overflow: "hidden" }}>{s.agentIcon ? <img src={s.agentIcon} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (s.agent || "?")[0]}</div>
              <span style={{ flex: 1, fontWeight: 600, color: t2Won ? "#4ade80" : "#e0e0da", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name || s.riotGameName || "Player"}</span>
              <span style={{ fontWeight: 700, color: "#8A8880", minWidth: 60, textAlign: "right" as const }}>{s.kills ?? 0}/{s.deaths ?? 0}/{s.assists ?? 0}</span>
              <span style={{ fontWeight: 700, color: "#3CCBFF", minWidth: 30, textAlign: "right" as const }}>{s.acs ?? Math.round((s.score || 0) / Math.max(1, s.rounds || 1))}</span>
            </div>
          ))}
        </div>
      )}
      {isPlayed && stats.length === 0 && (
        <div style={{ textAlign: "center", padding: "8px 0", color: "#555550", fontSize: "0.72rem" }}>
          {t1Won ? `${team1Name} won` : t2Won ? `${team2Name} won` : "Result recorded"}
          {game.reason && <span style={{ display: "block", fontSize: "0.64rem", color: "#555550", marginTop: 2 }}>({game.reason})</span>}
        </div>
      )}
      {!isPlayed && stats.length === 0 && <div style={{ textAlign: "center", padding: "12px 0", color: "#555550", fontSize: "0.78rem" }}>Waiting to be played</div>}
    </div>
  );
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  } catch { return iso; }
}

function TimelineItem({ label, date, status, badge }: { label: string; date: string; status: "past" | "active" | "future"; badge?: string }) {
  return (
    <div className="vtd-tl-item">
      <div className={`vtd-tl-dot ${status}`} />
      <div>
        <div className="vtd-tl-label">
          {label}
          {badge && <span className="vtd-tl-badge" style={{ background: status === "active" ? "rgba(59,130,246,0.15)" : "rgba(245,158,11,0.12)", color: status === "active" ? "#60A5FA" : "#fbbf24" }}>{badge}</span>}
        </div>
        <div className="vtd-tl-date">{formatDateTime(date)}</div>
      </div>
    </div>
  );
}
