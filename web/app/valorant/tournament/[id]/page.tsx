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
import Link from "next/link";

type Tab = "overview" | "players" | "teams" | "standings" | "matches" | "brackets" | "leaderboard";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "overview",    label: "Overview",     icon: "📋" },
  { key: "players",     label: "Players",      icon: "👤" },
  { key: "teams",       label: "Teams",        icon: "👥" },
  { key: "standings",   label: "Standings",    icon: "🏆" },
  { key: "matches",     label: "Matches",      icon: "⚔️" },
  { key: "brackets",    label: "Brackets",     icon: "🏅" },
  { key: "leaderboard", label: "Leaderboard",  icon: "📊" },
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

function MatchCard({ m, teamMembers, teamLogoMap, expandedMatch, setExpandedMatch, tournamentId, isBracket = false }: {
  m: any; teamMembers: Record<string, any[]>; teamLogoMap: Record<string, string>;
  expandedMatch: string | null; setExpandedMatch: (id: string | null) => void;
  tournamentId: string; isBracket?: boolean;
}) {
  const isComplete = m.status === "completed";
  const isLive = m.status === "live";
  const isDraw = isComplete && m.team1Score === m.team2Score;
  const t1Win = isComplete && m.team1Score > m.team2Score;
  const t2Win = isComplete && m.team2Score > m.team1Score;
  const t1Members = teamMembers[m.team1Id] || [];
  const t2Members = teamMembers[m.team2Id] || [];
  const isExpanded = expandedMatch === m.id;
  const g1 = m.game1 || m.games?.game1;
  const g2 = m.game2 || m.games?.game2;
  const hasGameData = g1?.playerStats || g2?.playerStats;
  const scheduledStr = m.scheduledTime ? new Date(m.scheduledTime).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }) : "";
  const bracketAccent = "#f59e0b";

  return (
    <div style={{ marginBottom: 8 }}>
      <div className="vtd-mc" style={{
        cursor: "pointer",
        ...(isBracket ? { borderColor: "rgba(245,158,11,0.2)" } : {}),
        ...(isLive ? { borderColor: "rgba(34,197,94,0.25)" } : {}),
        ...(isExpanded ? { borderColor: isBracket ? "rgba(245,158,11,0.5)" : "rgba(255,70,85,0.25)", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 } : {}),
      }} onClick={() => setExpandedMatch(isExpanded ? null : m.id)}>
        <div className="vtd-mc-index">
          <span className="vtd-mc-index-num" style={isBracket ? { color: bracketAccent, fontSize: "0.55rem" } : {}}>
            {isBracket ? (m.bracketLabel || "").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 4) : `M${m.matchIndex || ""}`}
          </span>
          <span className="vtd-mc-index-fmt" style={isBracket ? { background: "rgba(245,158,11,0.12)", color: bracketAccent } : {}}>BO2</span>
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
              <div className="vtd-mc-score-box">
                <span className="s" style={{ color: "#555550" }}>–</span><span className="dash">:</span><span className="s" style={{ color: "#555550" }}>–</span>
              </div>
              <span className="vtd-mc-status-badge" style={{ background: "#1a1a1f", color: "#555550" }}>{isBracket ? "Pending" : "Upcoming"}</span>
            </>
          )}
          {scheduledStr && <div style={{ fontSize: "0.62rem", color: "#555550", marginTop: 2 }}>{scheduledStr}</div>}
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
        <div style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", color: isExpanded ? (isBracket ? bracketAccent : "#ff4655") : "#555550", fontSize: 12, transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>▼</div>
      </div>

      {isExpanded && (
        <div style={{ background: "#18181C", border: "1px solid #2A2A30", borderTop: "none", borderBottomLeftRadius: 10, borderBottomRightRadius: 10, padding: "14px 16px" }}>
          {!isComplete && !isLive && !hasGameData ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: "#555550", fontSize: "0.82rem" }}>Match hasn't been played yet. Game details will appear here after the match.</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <GameDetailCard game={g1} gameNum={1} team1Name={m.team1Name} team2Name={m.team2Name} team1Id={m.team1Id} team2Id={m.team2Id} />
                <GameDetailCard game={g2} gameNum={2} team1Name={m.team1Name} team2Name={m.team2Name} team1Id={m.team1Id} team2Id={m.team2Id} />
              </div>
              <div style={{ marginTop: 10, textAlign: "center" }}>
                <Link href={`/valorant/match/${tournamentId}/${m.id}`} style={{ fontSize: "0.72rem", fontWeight: 700, color: "#ff4655", textDecoration: "none", padding: "6px 18px", border: "1px solid #ff4655", borderRadius: 100, display: "inline-block", transition: "all 0.15s" }}>View Full Match Details →</Link>
              </div>
            </>
          )}
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
  const { user, loading: authLoading, riotData } = useAuth();

  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [tournament, setTournament] = useState<any>(null);
  const [tLoading, setTLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = searchParams.get("tab") as Tab;
    return TABS.some(tab => tab.key === t) ? t : "overview";
  });
  const [showShareCard, setShowShareCard] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [countdown, setCountdown] = useState("");
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [teamNameLoading, setTeamNameLoading] = useState(false);
  const [teamNameError, setTeamNameError] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => { if (!id) return; const unsub = onSnapshot(doc(db, "valorantTournaments", id), (snap) => { if (snap.exists()) setTournament({ id: snap.id, ...snap.data() }); setTLoading(false); }); return () => unsub(); }, [id]);
  useEffect(() => { if (!id) return; const unsub = onSnapshot(collection(db, "valorantTournaments", id, "leaderboard"), (snap) => { const list = snap.docs.map(d => ({ id: d.id, ...d.data() })); list.sort((a: any, b: any) => { const acsA = (a.totalScore || 0) / Math.max(1, a.totalRoundsPlayed || 1); const acsB = (b.totalScore || 0) / Math.max(1, b.totalRoundsPlayed || 1); if (Math.abs(acsB - acsA) > 1) return acsB - acsA; return (b.kd || 0) - (a.kd || 0); }); setLeaderboard(list); }); return () => unsub(); }, [id]);
  useEffect(() => { if (!id) return; const unsub = onSnapshot(collection(db, "valorantTournaments", id, "soloPlayers"), (snap) => { const list = snap.docs.map(d => ({ id: d.id, ...d.data() })); setPlayers(list); if (user) setIsRegistered(list.some((p: any) => p.uid === user.uid)); }); return () => unsub(); }, [id, user]);
  useEffect(() => { if (!id) return; const unsub = onSnapshot(query(collection(db, "valorantTournaments", id, "teams"), orderBy("teamIndex")), (snap) => setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })))); return () => unsub(); }, [id]);
  useEffect(() => { if (!id) return; const unsub = onSnapshot(collection(db, "valorantTournaments", id, "standings"), (snap) => { const list = snap.docs.map(d => ({ id: d.id, ...d.data() })); list.sort((a: any, b: any) => { if (b.points !== a.points) return b.points - a.points; if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz; return (b.mapsWon - b.mapsLost) - (a.mapsWon - a.mapsLost); }); setStandings(list); }); return () => unsub(); }, [id]);
  useEffect(() => { if (!id) return; const unsub = onSnapshot(collection(db, "valorantTournaments", id, "matches"), (snap) => { const list = snap.docs.map(d => ({ id: d.id, ...d.data() })); list.sort((a: any, b: any) => { if (!!a.isBracket !== !!b.isBracket) return a.isBracket ? 1 : -1; if (a.matchDay !== b.matchDay) return a.matchDay - b.matchDay; return (a.matchIndex || 0) - (b.matchIndex || 0); }); setMatches(list); }); return () => unsub(); }, [id]);
  useEffect(() => { if (!tournament) return; const tick = () => setCountdown(getTimeUntilDeadline(tournament.registrationDeadline)); tick(); const i = setInterval(tick, 60000); return () => clearInterval(i); }, [tournament]);

  const getUserTeam = () => { if (!user) return null; return teams.find((t: any) => (t.members || []).some((m: any) => m.uid === user.uid)); };

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
    <div style={{ minHeight: "100vh", background: "#0f1923", fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>
      <style>{`
        @keyframes vtd-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes vtspin { to { transform: rotate(360deg); } }
        .vtd-sk { background: linear-gradient(90deg, #121a22 25%, #1c2a35 50%, #121a22 75%); background-size: 200% 100%; animation: vtd-shimmer 1.6s ease-in-out infinite; border-radius: 10px; }
      `}</style>
      <div style={{ height: 62, background: "rgba(10,10,12,0.97)", borderBottom: "1px solid #2A2A30" }} />
      <div style={{ height: 280, background: "linear-gradient(160deg, rgba(255,70,85,0.12) 0%, #0f1923 60%)", position: "relative" }}>
        <div style={{ position: "absolute", bottom: 32, left: 32, right: 32 }}>
          <div className="vtd-sk" style={{ width: "55%", height: 36, marginBottom: 14 }} />
          <div style={{ display: "flex", gap: 10 }}>
            {[80, 60, 70, 90].map((w, i) => <div key={i} className="vtd-sk" style={{ width: w, height: 26, borderRadius: 100 }} />)}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 30px" }}>
        <div className="vtd-sk" style={{ height: 64, borderRadius: 14, margin: "20px 0" }} />
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {[1,2,3,4,5,6,7].map(i => <div key={i} className="vtd-sk" style={{ width: 100, height: 56, borderRadius: 12, flexShrink: 0 }} />)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
          <div>
            <div className="vtd-sk" style={{ height: 180, borderRadius: 18, marginBottom: 16 }} />
            <div className="vtd-sk" style={{ height: 120, borderRadius: 18 }} />
          </div>
          <div className="vtd-sk" style={{ height: 240, borderRadius: 18 }} />
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

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        /* ── Animated background ── */
        .vtd-bg { position: fixed; inset: 0; z-index: 0; background: #0f1923; overflow: hidden; pointer-events: none; }
        .vtd-bg-gradient { position: absolute; inset: -60%; background: conic-gradient(from 0deg at 35% 45%, transparent 0deg, rgba(255,70,85,0.04) 60deg, transparent 120deg, rgba(255,70,85,0.03) 200deg, transparent 260deg, rgba(26,10,15,0.6) 360deg); animation: vtd-bg-rot 28s linear infinite; }
        .vtd-bg-glow1 { position: absolute; width: 600px; height: 600px; border-radius: 50%; background: radial-gradient(circle, rgba(255,70,85,0.07) 0%, transparent 70%); top: -100px; left: -100px; animation: vtd-bg-drift1 18s ease-in-out infinite; }
        .vtd-bg-glow2 { position: absolute; width: 400px; height: 400px; border-radius: 50%; background: radial-gradient(circle, rgba(255,70,85,0.04) 0%, transparent 70%); bottom: 10%; right: 5%; animation: vtd-bg-drift2 24s ease-in-out infinite; }
        .vtd-bg-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,70,85,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,70,85,0.03) 1px, transparent 1px); background-size: 60px 60px; }
        @keyframes vtd-bg-rot { to { transform: rotate(360deg); } }
        @keyframes vtd-bg-drift1 { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(60px,-40px) scale(1.1); } 66% { transform: translate(-30px,50px) scale(0.95); } }
        @keyframes vtd-bg-drift2 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-80px,-60px); } }

        /* ── Page ── */
        .vtd-page { min-height: 100vh; font-family: var(--font-geist-sans), system-ui, sans-serif; color: #F0EEEA; position: relative; z-index: 1; }

        /* ── Hero ── */
        .vtd-hero { position: relative; min-height: 300px; background: linear-gradient(160deg, rgba(255,70,85,0.18) 0%, rgba(15,25,35,0) 55%); overflow: hidden; }
        .vtd-hero-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 0%, rgba(15,25,35,0.5) 60%, rgba(15,25,35,1) 100%); }
        .vtd-hero-content { position: relative; z-index: 2; max-width: 1100px; margin: 0 auto; padding: 0 30px; min-height: 300px; display: flex; align-items: flex-end; padding-bottom: 28px; }
        .vtd-hero-game-tag { font-size: 0.62rem; font-weight: 900; letter-spacing: 0.2em; text-transform: uppercase; color: #ff4655; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
        .vtd-hero-game-tag::before { content: ""; display: block; width: 24px; height: 2px; background: #ff4655; }
        .vtd-hero-title { font-size: 2.2rem; font-weight: 900; color: #F0EEEA; line-height: 1.1; animation: vtd-hero-in 0.7s cubic-bezier(0.16,1,0.3,1) both; letter-spacing: -0.02em; }
        .vtd-hero-meta { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; animation: vtd-hero-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s both; }
        .vtd-hero-chip { font-size: 0.8rem; font-weight: 700; padding: 6px 14px; border-radius: 100px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #ccc; white-space: nowrap; backdrop-filter: blur(8px); }
        .vtd-hero-chip.accent { color: #ff4655; border-color: rgba(255,70,85,0.4); background: rgba(255,70,85,0.12); }
        .vtd-hero-chip.prize { color: #fbbf24; border-color: rgba(251,191,36,0.35); background: rgba(251,191,36,0.1); }
        @keyframes vtd-hero-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Content wrapper ── */
        .vtd-content { max-width: 1100px; margin: 0 auto; padding: 0 30px 80px; }

        /* ── Registration bar ── */
        .vtd-reg-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; padding: 18px 24px; background: rgba(18,18,21,0.85); border: 1px solid rgba(255,70,85,0.15); border-radius: 16px; flex-wrap: wrap; backdrop-filter: blur(12px); animation: vtd-slide-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.25s both; }
        .vtd-reg-info { display: flex; flex-direction: column; gap: 3px; }
        .vtd-reg-slots { font-size: 1.1rem; font-weight: 900; color: #F0EEEA; }
        .vtd-reg-countdown { font-size: 0.82rem; color: #8A8880; }
        .vtd-reg-btn { padding: 12px 32px; background: linear-gradient(135deg, #ff4655, #c62c3a); color: #fff; border: none; border-radius: 100px; font-size: 0.92rem; font-weight: 800; cursor: pointer; font-family: inherit; transition: all 0.2s; box-shadow: 0 4px 20px rgba(255,70,85,0.35); }
        .vtd-reg-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 28px rgba(255,70,85,0.5); }
        .vtd-reg-done { padding: 12px 28px; background: rgba(22,163,74,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); border-radius: 100px; font-size: 0.9rem; font-weight: 700; }
        @keyframes vtd-slide-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Tab bar ── */
        .vtd-tabs-wrap { position: sticky; top: 62px; z-index: 20; margin-bottom: 24px; padding: 10px 0; background: rgba(15,25,35,0.88); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,70,85,0.1); margin-left: -30px; margin-right: -30px; padding-left: 30px; padding-right: 30px; }
        .vtd-tabs { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
        .vtd-tabs::-webkit-scrollbar { display: none; }
        .vtd-tab { min-height: 52px; padding: 0 18px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-size: 0.88rem; font-weight: 800; cursor: pointer; font-family: inherit; white-space: nowrap; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); color: #555550; transition: all 0.2s ease; flex-shrink: 0; }
        .vtd-tab:hover { background: rgba(255,70,85,0.07); color: #ccc; border-color: rgba(255,70,85,0.2); transform: translateY(-1px); }
        .vtd-tab.active { background: #ff4655; color: #fff; border-color: #ff4655; box-shadow: 0 4px 24px rgba(255,70,85,0.4); }
        .vtd-tab-icon { font-size: 18px; line-height: 1; }
        .vtd-tab-count { font-size: 0.62rem; font-weight: 700; opacity: 0.7; }

        /* ── Tab content animation ── */
        .vtd-tab-pane { animation: vtd-fade-up 0.35s ease-out both; }
        @keyframes vtd-fade-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Cards ── */
        .vtd-card { background: rgba(18,18,21,0.8); border: 1px solid rgba(255,255,255,0.06); border-radius: 18px; padding: 28px 32px; margin-bottom: 18px; backdrop-filter: blur(12px); transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .vtd-card:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
        .vtd-card-label { display: block; font-size: 0.65rem; font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase; color: #ff4655; margin-bottom: 18px; }

        /* ── Overview ── */
        .vtd-overview-grid { display: grid; grid-template-columns: 1fr 320px; gap: 20px; }
        .vtd-about-chips { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
        .vtd-about-chip { font-size: 0.88rem; font-weight: 700; padding: 10px 20px; border-radius: 12px; backdrop-filter: blur(8px); }
        .vtd-about-chip.fmt { background: rgba(255,70,85,0.1); border: 1px solid rgba(255,70,85,0.3); color: #ff4655; }
        .vtd-about-chip.fee { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #ccc; }
        .vtd-about-chip.date { background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.25); color: #60a5fa; }
        .vtd-about-chip.prize { background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.25); color: #fbbf24; }
        .vtd-desc { font-size: 1rem; color: #8A8880; line-height: 1.8; margin: 0; }

        /* ── Timeline ── */
        .vtd-timeline { display: flex; flex-direction: column; gap: 0; }
        .vtd-tl-item { display: flex; gap: 14px; padding: 12px 0; }
        .vtd-tl-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
        .vtd-tl-dot.past { background: #22c55e; }
        .vtd-tl-dot.active { background: #3b82f6; box-shadow: 0 0 0 4px rgba(59,130,246,0.2); }
        .vtd-tl-dot.future { background: #2A2A30; }
        .vtd-tl-label { font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #ff4655; }
        .vtd-tl-date { font-size: 0.85rem; color: #8A8880; margin-top: 2px; }
        .vtd-tl-badge { font-size: 0.58rem; font-weight: 800; padding: 2px 7px; border-radius: 100px; margin-left: 8px; }

        /* ── Rules ── */
        .vtd-rule { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .vtd-rule:last-child { border-bottom: none; }
        .vtd-rule-num { font-size: 0.82rem; font-weight: 900; color: #ff4655; min-width: 24px; }
        .vtd-rule-text { font-size: 0.9rem; color: #8A8880; line-height: 1.6; }

        /* ── Empty states ── */
        .vtd-empty { text-align: center; padding: 70px 20px; }
        .vtd-empty-icon { font-size: 48px; margin-bottom: 10px; display: block; }
        .vtd-empty-title { font-size: 1rem; font-weight: 700; color: #8A8880; margin-bottom: 4px; display: block; }
        .vtd-empty-sub { font-size: 0.86rem; color: #555550; display: block; margin-top: 6px; }

        /* ── Players grid ── */
        .vtd-players-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .vtd-player-box { background: rgba(18,18,21,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 22px; display: flex; align-items: center; gap: 16px; transition: all 0.2s ease; }
        .vtd-player-box:hover { transform: scale(1.02); border-color: rgba(255,70,85,0.35); box-shadow: 0 0 0 1px rgba(255,70,85,0.15), 0 8px 24px rgba(0,0,0,0.4); }
        .vtd-player-avatar-lg { width: 60px; height: 60px; border-radius: 12px; object-fit: cover; flex-shrink: 0; border: 2px solid rgba(255,255,255,0.08); }
        .vtd-player-avatar-init { width: 60px; height: 60px; border-radius: 12px; background: rgba(255,70,85,0.1); border: 2px solid rgba(255,70,85,0.2); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; color: #ff4655; flex-shrink: 0; }
        .vtd-player-info { flex: 1; min-width: 0; }
        .vtd-player-name-lg { font-size: 0.95rem; font-weight: 800; color: #F0EEEA; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vtd-player-name-lg .tag { color: #555550; font-weight: 400; }
        .vtd-player-rank-lg { font-size: 0.76rem; color: #8A8880; margin-top: 3px; }
        .vtd-player-skill-lg { font-size: 0.65rem; font-weight: 800; padding: 3px 10px; border-radius: 100px; margin-top: 8px; display: inline-block; }

        /* ── Teams grid ── */
        .vtd-teams-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .vtd-team-box { background: rgba(18,18,21,0.8); border: 1px solid rgba(255,255,255,0.06); border-radius: 18px; padding: 26px; position: relative; transition: all 0.2s ease; }
        .vtd-team-box:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.5); border-color: rgba(255,70,85,0.2); }
        .vtd-team-box-num { position: absolute; top: 14px; right: 16px; font-size: 0.62rem; font-weight: 800; color: #ff4655; background: rgba(255,70,85,0.1); border: 1px solid rgba(255,70,85,0.25); padding: 3px 10px; border-radius: 100px; }
        .vtd-team-box-header { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
        .vtd-team-logo { width: 54px; height: 54px; border-radius: 12px; background: linear-gradient(135deg, #ff4655 0%, #c62c3a 100%); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; color: #fff; letter-spacing: 0.05em; flex-shrink: 0; overflow: hidden; }
        .vtd-team-logo img { width: 100%; height: 100%; object-fit: cover; }
        .vtd-team-box-name { font-size: 1.05rem; font-weight: 900; color: #F0EEEA; }
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
        .vtd-team-edit-btn:hover { border-color: #ff4655; color: #ff4655; }
        .vtd-team-edit-input { width: 100%; padding: 8px 12px; border: 1.5px solid #ff4655; border-radius: 8px; font-size: 0.84rem; outline: none; font-family: inherit; background: rgba(10,10,12,0.8); color: #F0EEEA; }
        .vtd-team-edit-actions { display: flex; gap: 6px; margin-top: 6px; }
        .vtd-team-edit-save { padding: 6px 16px; background: #ff4655; color: #fff; border: none; border-radius: 100px; font-size: 0.72rem; font-weight: 700; cursor: pointer; font-family: inherit; }
        .vtd-team-edit-cancel { padding: 6px 16px; background: rgba(255,255,255,0.05); color: #8A8880; border: 1px solid rgba(255,255,255,0.08); border-radius: 100px; font-size: 0.72rem; font-weight: 700; cursor: pointer; font-family: inherit; }

        /* ── Tables ── */
        .vtd-standings-table { width: 100%; border-collapse: collapse; }
        .vtd-standings-table th { font-size: 0.64rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #555550; padding: 10px 14px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .vtd-standings-table td { font-size: 0.88rem; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); color: #e0e0da; }
        .vtd-standings-table tr:last-child td { border-bottom: none; }
        .vtd-standings-table tbody tr { transition: background 0.15s; }
        .vtd-standings-table tbody tr:hover { background: rgba(255,70,85,0.04); }

        /* ── Match headers ── */
        .vtd-section-header { font-size: 0.7rem; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid; }
        .vtd-section-header.group { color: #555550; border-color: rgba(255,255,255,0.06); }
        .vtd-section-header.bracket { color: #f59e0b; border-color: rgba(245,158,11,0.3); }
        .vtd-match-day-header { font-size: 0.76rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #555550; margin: 22px 0 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; gap: 8px; }
        .vtd-match-day-header:first-child { margin-top: 0; }
        .vtd-match-day-header .day-num { color: #ff4655; }
        .vtd-match-day-header.bracket-round .day-num { color: #f59e0b; }

        /* ── Match cards ── */
        .vtd-mc { display: flex; align-items: center; background: rgba(18,18,21,0.75); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; margin-bottom: 8px; overflow: hidden; transition: all 0.2s ease; min-height: 68px; backdrop-filter: blur(6px); }
        .vtd-mc:hover { border-color: rgba(255,70,85,0.25); box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
        .vtd-mc-index { width: 44px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; padding: 8px 0; border-right: 1px solid rgba(255,255,255,0.05); }
        .vtd-mc-index-num { font-size: 0.68rem; font-weight: 800; color: #555550; }
        .vtd-mc-index-fmt { font-size: 0.54rem; font-weight: 800; color: #ff4655; background: rgba(255,70,85,0.1); padding: 2px 5px; border-radius: 4px; }
        .vtd-mc-team { flex: 1; display: flex; align-items: center; gap: 10px; padding: 10px 14px; min-width: 0; }
        .vtd-mc-team.right { flex-direction: row-reverse; text-align: right; }
        .vtd-mc-team-logo { width: 38px; height: 38px; border-radius: 9px; background: linear-gradient(135deg, #ff4655 0%, #c62c3a 100%); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; color: #fff; flex-shrink: 0; overflow: hidden; }
        .vtd-mc-team-logo img { width: 100%; height: 100%; object-fit: cover; }
        .vtd-mc-team-info { flex: 1; min-width: 0; }
        .vtd-mc-team-tag { font-size: 0.64rem; font-weight: 800; color: #ff4655; text-transform: uppercase; }
        .vtd-mc-team-name { font-size: 0.85rem; font-weight: 700; color: #F0EEEA; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vtd-mc-avatars { display: flex; gap: 0; margin-top: 4px; }
        .vtd-mc-avatars img, .vtd-mc-avatars .vtd-mc-av-init { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid rgba(18,18,21,0.9); margin-left: -4px; object-fit: cover; }
        .vtd-mc-avatars img:first-child, .vtd-mc-avatars .vtd-mc-av-init:first-child { margin-left: 0; }
        .vtd-mc-av-init { background: #1a1a1f; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 700; color: #555550; }
        .vtd-mc-team.right .vtd-mc-avatars { justify-content: flex-end; }
        .vtd-mc-center { min-width: 90px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 4px; flex-shrink: 0; }
        .vtd-mc-score-box { display: flex; align-items: center; gap: 6px; font-size: 1.15rem; font-weight: 900; }
        .vtd-mc-score-box .s { min-width: 22px; text-align: center; color: #F0EEEA; }
        .vtd-mc-score-box .s.win { color: #4ade80; }
        .vtd-mc-score-box .s.loss { color: #f87171; }
        .vtd-mc-score-box .s.draw { color: #f59e0b; }
        .vtd-mc-score-box .dash { color: #555550; font-weight: 400; }
        .vtd-mc-status-badge { font-size: 0.58rem; font-weight: 800; padding: 2px 8px; border-radius: 100px; margin-top: 3px; }
        .vtd-mc-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; animation: vtd-pulse 1.5s ease-in-out infinite; }

        /* ── Share button ── */
        .vtd-share-btn { font-size: 0.8rem; font-weight: 700; padding: 6px 14px; border-radius: 100px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #ccc; white-space: nowrap; backdrop-filter: blur(8px); cursor: pointer; font-family: inherit; transition: all 0.2s; }
        .vtd-share-btn:hover { background: rgba(255,255,255,0.12); color: #fff; border-color: rgba(255,255,255,0.25); }

        /* ── Share modal ── */
        .vtd-share-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 20px; overflow-y: auto; }
        .vtd-share-modal { background: #0f1923; border: 1px solid rgba(255,70,85,0.2); border-radius: 20px; padding: 24px; max-width: 520px; width: 100%; }
        .vtd-share-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .vtd-share-modal-title { font-size: 1rem; font-weight: 900; color: #F0EEEA; }
        .vtd-share-close { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 100px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px; color: #8A8880; }
        .vtd-share-card { width: 100%; aspect-ratio: 1/1; background: #0f1923; border-radius: 16px; overflow: hidden; position: relative; }
        .vtd-share-actions { display: flex; gap: 10px; margin-top: 16px; }
        .vtd-share-dl-btn { flex: 1; padding: 12px; background: linear-gradient(135deg, #ff4655, #c62c3a); color: #fff; border: none; border-radius: 100px; font-size: 0.9rem; font-weight: 800; cursor: pointer; font-family: inherit; transition: all 0.2s; }
        .vtd-share-dl-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(255,70,85,0.4); }
        .vtd-share-copy-btn { padding: 12px 20px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #ccc; border-radius: 100px; font-size: 0.9rem; font-weight: 700; cursor: pointer; font-family: inherit; transition: all 0.15s; }
        .vtd-share-copy-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }

        /* ── Animations ── */
        @keyframes vtd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes vtspin { to { transform: rotate(360deg); } }

        /* ── Responsive ── */
        @media (max-width: 900px) { .vtd-players-grid { grid-template-columns: repeat(2, 1fr); } .vtd-teams-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 800px) {
          .vtd-hero-content { padding: 0 16px 22px; min-height: 240px; }
          .vtd-hero-title { font-size: 1.6rem; }
          .vtd-content { padding: 0 16px 40px; }
          .vtd-tabs-wrap { margin-left: -16px; margin-right: -16px; padding-left: 16px; padding-right: 16px; }
          .vtd-overview-grid { grid-template-columns: 1fr; }
          .vtd-mc-avatars { display: none; }
          .vtd-mc-team-name { font-size: 0.78rem; }
          .vtd-card { padding: 20px; }
        }
        @media (max-width: 600px) {
          .vtd-players-grid { grid-template-columns: 1fr; }
          .vtd-teams-grid { grid-template-columns: 1fr; }
          .vtd-mc-team { padding: 8px 10px; gap: 8px; }
          .vtd-mc-team-logo { width: 32px; height: 32px; font-size: 9px; }
          .vtd-tab { min-height: 46px; padding: 0 14px; font-size: 0.8rem; }
        }
      `}</style>

      {/* Animated background */}
      <div className="vtd-bg">
        <div className="vtd-bg-gradient" />
        <div className="vtd-bg-grid" />
        <div className="vtd-bg-glow1" />
        <div className="vtd-bg-glow2" />
      </div>

      <div className="vtd-page">
        <Navbar />

        {/* ═══ HERO ═══ */}
        <div className="vtd-hero">
          <div className="vtd-hero-overlay" />
          <div className="vtd-hero-content">
            <div>
              <div className="vtd-hero-game-tag">Valorant Tournament</div>
              <div className="vtd-hero-title">{tournament.name}</div>
              <div className="vtd-hero-meta">
                <span className="vtd-hero-chip accent">{tournament.format === "shuffle" ? "⚡ Shuffle" : tournament.format === "auction" ? "🎯 Auction" : "🏆 Standard"}</span>
                <span className="vtd-hero-chip">{tournament.slotsBooked}/{tournament.totalSlots} players</span>
                <span className="vtd-hero-chip">{tournament.entryFee === 0 ? "Free Entry" : `₹${tournament.entryFee} Entry`}</span>
                <span className="vtd-hero-chip" style={{ color: "#60a5fa", borderColor: "rgba(96,165,250,0.3)", background: "rgba(59,130,246,0.08)" }}>{formatDate(tournament.startDate)}</span>
                {tournament.prizePool && tournament.prizePool !== "0" && (
                  <span className="vtd-hero-chip prize">🏅 {tournament.prizePool.startsWith("₹") ? tournament.prizePool : `₹${tournament.prizePool}`}</span>
                )}
                <button className="vtd-share-btn" onClick={() => setShowShareCard(true)}>📤 Share</button>
              </div>
            </div>
          </div>
        </div>

        <div className="vtd-content">

          {/* ═══ REGISTRATION BAR ═══ */}
          <div className="vtd-reg-bar">
            <div className="vtd-reg-info">
              <div className="vtd-reg-slots">{slotsLeft > 0 ? `${slotsLeft} slots remaining` : "Full"}</div>
              <div className="vtd-reg-countdown">
                {!isRegOpen ? `Registration opens ${formatDate(schedule.registrationOpens)}` : countdown}
              </div>
            </div>
            {canRegister && <button className="vtd-reg-btn" onClick={() => setShowRegister(true)}>Register Now →</button>}
            {isRegistered && <div className="vtd-reg-done">✓ You're Registered</div>}
            {!isRegOpen && !isRegistered && (
              <div style={{ padding: "10px 22px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 100, textAlign: "center" }}>
                <div style={{ fontSize: "0.86rem", fontWeight: 800, color: "#8A8880" }}>Coming Soon</div>
                {schedule.registrationOpens && <div style={{ fontSize: "0.72rem", color: "#555550", marginTop: 2 }}>Opens {formatDate(schedule.registrationOpens)} · {formatTime(schedule.registrationOpens)}</div>}
              </div>
            )}
            {regClosed && !isRegistered && isRegOpen && <span style={{ fontSize: "0.86rem", color: "#555550", fontWeight: 600 }}>Registration Closed</span>}
          </div>

          {/* ═══ TAB BAR ═══ */}
          <div className="vtd-tabs-wrap">
            <div className="vtd-tabs">
              {TABS.map(t => (
                <button key={t.key} className={`vtd-tab${activeTab === t.key ? " active" : ""}`} onClick={() => { setActiveTab(t.key); router.replace(`?tab=${t.key}`, { scroll: false }); }}>
                  <span className="vtd-tab-icon">{t.icon}</span>
                  <span>{t.label}</span>
                  {t.key === "players" && <span className="vtd-tab-count">({players.length})</span>}
                  {t.key === "teams" && teams.length > 0 && <span className="vtd-tab-count">({teams.length})</span>}
                </button>
              ))}
            </div>
          </div>

          {/* ═══ OVERVIEW ═══ */}
          {activeTab === "overview" && (
            <div className="vtd-tab-pane vtd-overview-grid">
              <div>
                <div className="vtd-about-chips">
                  <span className="vtd-about-chip fmt">{tournament.format === "shuffle" ? "⚡ Shuffle Format" : tournament.format === "auction" ? "🎯 Auction Format" : "🏆 Standard Format"}</span>
                  <span className="vtd-about-chip fee">{tournament.entryFee === 0 ? "🆓 Free Entry" : `💰 ₹${tournament.entryFee} Entry`}</span>
                  <span className="vtd-about-chip date">📅 {formatDate(tournament.startDate)}</span>
                  {tournament.prizePool && tournament.prizePool !== "0" && <span className="vtd-about-chip prize">🏅 {tournament.prizePool.startsWith("₹") ? tournament.prizePool : `₹${tournament.prizePool}`} Prize</span>}
                </div>
                <div className="vtd-card">
                  <span className="vtd-card-label">About this Tournament</span>
                  <p className="vtd-desc">{tournament.desc || "No description available."}</p>
                </div>
                {(tournament.rules || []).length > 0 && (
                  <div className="vtd-card">
                    <span className="vtd-card-label">Rules</span>
                    {(tournament.rules || []).map((rule: string, i: number) => (
                      <div key={i} className="vtd-rule"><span className="vtd-rule-num">{i + 1}.</span><span className="vtd-rule-text">{rule}</span></div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="vtd-card">
                  <span className="vtd-card-label">Tournament Info</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                    {[
                      { val: tournament.format === "shuffle" ? "SHUFFLE" : tournament.format?.toUpperCase(), lbl: "Format" },
                      { val: "BO2", lbl: "Match Format" },
                      { val: "5", lbl: "Team Size" },
                      { val: tournament.prizePool || "TBD", lbl: "Prize Pool", accent: true },
                    ].map((s, i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: "1.2rem", fontWeight: 900, color: s.accent ? "#fbbf24" : "#F0EEEA" }}>{s.val}</div>
                        <div style={{ fontSize: "0.62rem", color: "#555550", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>{s.lbl}</div>
                      </div>
                    ))}
                  </div>
                  <span className="vtd-card-label" style={{ marginBottom: 12 }}>Schedule</span>
                  <div className="vtd-timeline">
                    {schedule.registrationOpens && <TimelineItem label="Registration Opens" date={schedule.registrationOpens} status={new Date(schedule.registrationOpens) <= new Date() ? "past" : "future"} />}
                    {schedule.registrationCloses && <TimelineItem label="Registration Closes" date={schedule.registrationCloses} status={new Date(schedule.registrationCloses) <= new Date() ? "past" : new Date(schedule.registrationOpens) <= new Date() ? "active" : "future"} />}
                    {schedule.squadCreation && <TimelineItem label="Squad Creation" date={schedule.squadCreation} status={new Date(schedule.squadCreation) <= new Date() ? "past" : "future"} />}
                    {schedule.groupStageStart && <TimelineItem label="Group Stage Starts" date={schedule.groupStageStart} status={tournament.status === "active" ? "active" : new Date(schedule.groupStageStart) <= new Date() ? "past" : "future"} badge={tournament.status === "active" ? "ACTIVE" : undefined} />}
                    {schedule.groupStageEnd && <TimelineItem label="Group Stage Ends" date={schedule.groupStageEnd} status={new Date(schedule.groupStageEnd) <= new Date() ? "past" : "future"} />}
                    {schedule.tourneyStageStart && <TimelineItem label="Tournament Stage" date={schedule.tourneyStageStart} status="future" />}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ PLAYERS ═══ */}
          {activeTab === "players" && (
            <div className="vtd-tab-pane">
              <div className="vtd-card">
                <span className="vtd-card-label">Registered Players ({players.length})</span>
                {players.length === 0 ? (
                  <div className="vtd-empty"><span className="vtd-empty-icon">👤</span><span className="vtd-empty-title">No players registered yet</span><span className="vtd-empty-sub">Be the first to register!</span></div>
                ) : (
                  <div className="vtd-players-grid">
                    {players.map((p: any) => (
                      <Link key={p.uid} href={`/player/${p.uid}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                        <div className="vtd-player-box">
                          {p.riotAvatar ? <img className="vtd-player-avatar-lg" src={p.riotAvatar} alt={p.riotGameName} /> : <div className="vtd-player-avatar-init">{(p.riotGameName || "?")[0].toUpperCase()}</div>}
                          <div className="vtd-player-info">
                            <div className="vtd-player-name-lg">{p.riotGameName}<span className="tag">#{p.riotTagLine}</span></div>
                            <div className="vtd-player-rank-lg">{p.riotRank || "Unranked"}</div>
                            <span className="vtd-player-skill-lg" style={{ background: p.skillLevel >= 4 ? "rgba(146,64,14,0.15)" : p.skillLevel >= 3 ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.04)", color: p.skillLevel >= 4 ? "#fbbf24" : p.skillLevel >= 3 ? "#818cf8" : "#8A8880", border: `1px solid ${p.skillLevel >= 4 ? "rgba(251,191,36,0.3)" : p.skillLevel >= 3 ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.08)"}` }}>Skill {p.skillLevel || 1}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ TEAMS ═══ */}
          {activeTab === "teams" && (
            <div className="vtd-tab-pane">
              {teams.length === 0 ? (
                <div className="vtd-card"><div className="vtd-empty"><span className="vtd-empty-icon">👥</span><span className="vtd-empty-title">Teams not generated yet</span><span className="vtd-empty-sub">Teams will be shuffled after registration closes.</span></div></div>
              ) : (
                <div className="vtd-teams-grid">
                  {teams.map((team: any) => { const isMyTeam = userTeam?.id === team.id; const canEdit = isMyTeam && !team.teamNameSet; const isEditing = editingTeamId === team.id; return (
                    <div key={team.id} className="vtd-team-box">
                      <span className="vtd-team-box-num">#{team.teamIndex}</span>
                      <div className="vtd-team-box-header">
                        <div className="vtd-team-logo" style={{ position: "relative", cursor: (isMyTeam && !team.teamLogoSet && !logoUploading) ? "pointer" : "default" }} onClick={() => { if (isMyTeam && !team.teamLogoSet && !logoUploading) logoInputRef.current?.click(); }}>
                          {team.teamLogo ? <img src={team.teamLogo} alt={team.teamName} /> : getTeamInitials(team.teamName)}
                          {isMyTeam && !team.teamLogoSet && !logoUploading && (<div style={{ position: "absolute", inset: 0, borderRadius: 12, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.15s" }} onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0")}><span style={{ color: "#fff", fontSize: 18 }}>📷</span></div>)}
                          {logoUploading && (<div style={{ position: "absolute", inset: 0, borderRadius: 12, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 18, height: 18, border: "2px solid #555", borderTopColor: "#ff4655", borderRadius: "50%", animation: "vtspin 0.8s linear infinite" }} /></div>)}
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
                            <><div className="vtd-team-box-name">{team.teamName}</div><div className="vtd-team-box-avg">Avg Skill: {team.avgSkillLevel}</div>{logoError && isMyTeam && <div style={{ fontSize: "0.62rem", color: "#f87171", marginTop: 4 }}>{logoError}</div>}</>
                          )}
                        </div>
                      </div>
                      <div className="vtd-team-box-members">
                        {(team.members || []).map((m: any, i: number) => (
                          <div key={m.uid || i} className="vtd-team-box-member">
                            {m.riotAvatar ? <img src={m.riotAvatar} alt={m.riotGameName} className="vtd-team-box-member-avatar" /> : <div className="vtd-team-box-member-init">{(m.riotGameName || "?")[0]}</div>}
                            <div style={{ flex: 1, minWidth: 0 }}><div className="vtd-team-box-member-name">{m.riotGameName}</div><div className="vtd-team-box-member-rank">{m.riotRank}</div></div>
                            <span className="vtd-team-box-member-skill">Skill {m.skillLevel}</span>
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
              )}
            </div>
          )}

          {/* ═══ STANDINGS ═══ */}
          {activeTab === "standings" && (
            <div className="vtd-tab-pane">
              <div className="vtd-card">
                <span className="vtd-card-label">Group Stage Standings</span>
                {standings.length === 0 ? (
                  <div className="vtd-empty"><span className="vtd-empty-icon">🏆</span><span className="vtd-empty-title">No standings yet</span><span className="vtd-empty-sub">Standings will appear once matches are played.</span></div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="vtd-standings-table">
                      <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th style={{ color: "#4ade80" }}>MW</th><th style={{ color: "#f87171" }}>ML</th><th style={{ color: "#ff4655" }}>Pts</th><th>BH</th></tr></thead>
                      <tbody>{standings.map((s: any, i: number) => (<tr key={s.id}><td style={{ fontWeight: 800, color: i < 6 ? "#ff4655" : "#555550" }}>{i + 1}</td><td style={{ fontWeight: 700 }}>{s.teamName}</td><td>{s.played || 0}</td><td>{s.wins || 0}</td><td>{s.draws || 0}</td><td>{s.losses || 0}</td><td style={{ color: "#4ade80" }}>{s.mapsWon || 0}</td><td style={{ color: "#f87171" }}>{s.mapsLost || 0}</td><td style={{ fontWeight: 800, color: "#ff4655" }}>{s.points || 0}</td><td style={{ color: "#555550" }}>{s.buchholz || 0}</td></tr>))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ MATCHES ═══ */}
          {activeTab === "matches" && (
            <div className="vtd-tab-pane">
              {matches.length === 0 ? (
                <div className="vtd-card"><div className="vtd-empty"><span className="vtd-empty-icon">⚔️</span><span className="vtd-empty-title">No matches scheduled</span><span className="vtd-empty-sub">Matches will appear once pairings are generated.</span></div></div>
              ) : (
                <>
                  {groupMatches.length > 0 && (
                    <div>
                      <div className="vtd-section-header group">Group Stage Fixtures</div>
                      {(() => { const days = [...new Set(groupMatches.map((m: any) => m.matchDay))].sort((a: number, b: number) => a - b); return days.map((day: number) => (<div key={day}><div className="vtd-match-day-header"><span className="day-num">Round {day}</span><span>· {groupMatches.filter((m: any) => m.matchDay === day).length} matches</span></div>{groupMatches.filter((m: any) => m.matchDay === day).map((m: any) => (<MatchCard key={m.id} m={m} teamMembers={teamMembers} teamLogoMap={teamLogoMap} expandedMatch={expandedMatch} setExpandedMatch={setExpandedMatch} tournamentId={id} isBracket={false} />))}</div>)); })()}
                    </div>
                  )}
                  {bracketMatches.length > 0 && (
                    <div style={{ marginTop: groupMatches.length > 0 ? 32 : 0 }}>
                      <div className="vtd-section-header bracket">Bracket Fixtures</div>
                      {(() => { const days = [...new Set(bracketMatches.map((m: any) => m.matchDay))].sort((a: number, b: number) => a - b); let bracketRoundNum = 0; return days.map((day: number) => { bracketRoundNum++; const dayMatches = bracketMatches.filter((m: any) => m.matchDay === day); return (<div key={day}><div className="vtd-match-day-header bracket-round"><span className="day-num">Bracket Round {bracketRoundNum}</span><span>· {dayMatches.length} matches</span></div>{dayMatches.map((m: any) => (<MatchCard key={m.id} m={m} teamMembers={teamMembers} teamLogoMap={teamLogoMap} expandedMatch={expandedMatch} setExpandedMatch={setExpandedMatch} tournamentId={id} isBracket={true} />))}</div>); }); })()}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ═══ BRACKETS ═══ */}
          {activeTab === "brackets" && (
            <div className="vtd-tab-pane">
              <DoubleBracket matches={bracketMatches} bracketSize={tournament.bracketSize || 4} standings={standings} />
            </div>
          )}

          {/* ═══ LEADERBOARD ═══ */}
          {activeTab === "leaderboard" && (
            <div className="vtd-tab-pane">
              <div className="vtd-card">
                <span className="vtd-card-label">Player Leaderboard — MVP Tracker</span>
                {leaderboard.length === 0 ? (
                  <div className="vtd-empty"><span className="vtd-empty-icon">📊</span><span className="vtd-empty-title">No stats yet</span><span className="vtd-empty-sub">Player stats will appear once match data is fetched.</span></div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="vtd-standings-table">
                      <thead><tr><th>#</th><th>Player</th><th>Agent(s)</th><th>Maps</th><th style={{ color: "#4ade80" }}>K</th><th style={{ color: "#f87171" }}>D</th><th>A</th><th style={{ color: "#ff4655" }}>K/D</th><th>ACS</th><th>HS%</th><th>DMG</th></tr></thead>
                      <tbody>{leaderboard.map((p: any, i: number) => { const acs = Math.round((p.totalScore || 0) / Math.max(1, p.totalRoundsPlayed || 1)); return (<tr key={p.id} style={i === 0 ? { background: "rgba(245,158,11,0.08)" } : {}}><td style={{ fontWeight: 800, color: i === 0 ? "#f59e0b" : i < 3 ? "#ff4655" : "#555550" }}>{i === 0 ? "👑" : i + 1}</td><td>{p.uid ? (<Link href={`/player/${p.uid}`} style={{ textDecoration: "none", color: "inherit" }}><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: "0.68rem", color: "#555550" }}>#{p.tag}</div></Link>) : (<><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: "0.68rem", color: "#555550" }}>#{p.tag}</div></>)}</td><td style={{ fontSize: "0.78rem", color: "#8A8880" }}>{(p.agents || []).join(", ")}</td><td>{p.matchesPlayed || 0}</td><td style={{ fontWeight: 700, color: "#4ade80" }}>{p.totalKills || 0}</td><td style={{ color: "#f87171" }}>{p.totalDeaths || 0}</td><td>{p.totalAssists || 0}</td><td style={{ fontWeight: 800, color: (p.kd || 0) >= 1.0 ? "#4ade80" : "#f87171" }}>{p.kd || 0}</td><td style={{ fontWeight: 700 }}>{acs}</td><td>{p.hsPercent || 0}%</td><td style={{ fontSize: "0.82rem", color: "#8A8880" }}>{p.totalDamageDealt || 0}</td></tr>); })}</tbody>
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

      {/* ═══ SHARE CARD MODAL ═══ */}
      {showShareCard && (
        <div className="vtd-share-overlay" onClick={e => { if (e.target === e.currentTarget) setShowShareCard(false); }}>
          <div className="vtd-share-modal">
            <div className="vtd-share-modal-head">
              <div className="vtd-share-modal-title">Share Tournament</div>
              <button className="vtd-share-close" onClick={() => setShowShareCard(false)}>✕</button>
            </div>
            {/* Instagram-style card (1:1 ratio) */}
            <div ref={shareCardRef} className="vtd-share-card">
              {/* Background layers */}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(145deg, #1a0810 0%, #0f1923 40%, #0a0e15 100%)" }} />
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 20% 20%, rgba(255,70,85,0.18) 0%, transparent 55%)" }} />
              <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,70,85,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,70,85,0.04) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
              {/* Content */}
              <div style={{ position: "relative", zIndex: 1, padding: "8%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                {/* Top: branding */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "0.6rem", fontWeight: 900, letterSpacing: "0.25em", textTransform: "uppercase", color: "#ff4655" }}>IESPORTS.IN</div>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#555550" }}>VALORANT</div>
                </div>
                {/* Middle: tournament name */}
                <div>
                  <div style={{ fontSize: "0.55rem", fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: "#ff4655", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 16, height: 2, background: "#ff4655" }} />
                    TOURNAMENT
                  </div>
                  <div style={{ fontSize: "clamp(1.4rem, 5vw, 2rem)", fontWeight: 900, color: "#F0EEEA", lineHeight: 1.1, marginBottom: 16, letterSpacing: "-0.02em" }}>{tournament.name}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontSize: "0.62rem", fontWeight: 700, padding: "5px 12px", borderRadius: 100, background: "rgba(255,70,85,0.12)", border: "1px solid rgba(255,70,85,0.3)", color: "#ff4655" }}>
                      {tournament.format === "shuffle" ? "⚡ Shuffle" : tournament.format === "auction" ? "🎯 Auction" : "🏆 Standard"}
                    </div>
                    <div style={{ fontSize: "0.62rem", fontWeight: 700, padding: "5px 12px", borderRadius: 100, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#ccc" }}>
                      {tournament.entryFee === 0 ? "Free Entry" : `₹${tournament.entryFee} Entry`}
                    </div>
                    {tournament.prizePool && tournament.prizePool !== "0" && (
                      <div style={{ fontSize: "0.62rem", fontWeight: 700, padding: "5px 12px", borderRadius: 100, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24" }}>
                        🏅 {tournament.prizePool.startsWith("₹") ? tournament.prizePool : `₹${tournament.prizePool}`} Prize
                      </div>
                    )}
                  </div>
                </div>
                {/* Bottom: stats row */}
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { val: `${tournament.slotsBooked}/${tournament.totalSlots}`, lbl: "Players" },
                    { val: formatDate(tournament.startDate), lbl: "Date" },
                    { val: "5v5", lbl: "Format" },
                  ].map((s, i) => (
                    <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "0.8rem", fontWeight: 900, color: "#F0EEEA" }}>{s.val}</div>
                      <div style={{ fontSize: "0.5rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#555550", marginTop: 3 }}>{s.lbl}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="vtd-share-actions">
              <button className="vtd-share-dl-btn" onClick={downloadShareCard}>⬇ Download Image</button>
              <button className="vtd-share-copy-btn" onClick={() => { navigator.clipboard.writeText(window.location.href).then(() => { const btn = document.activeElement as HTMLButtonElement; if (btn) { const orig = btn.textContent; btn.textContent = "✓ Copied!"; setTimeout(() => { btn.textContent = orig; }, 2000); } }); }}>🔗 Copy Link</button>
            </div>
            <div style={{ marginTop: 10, fontSize: "0.72rem", color: "#555550", textAlign: "center" }}>Download the image and post it directly to Instagram</div>
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
        <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: gameNum === 1 ? "#ff4655" : "#3b82f6" }}>Game {gameNum}</span>
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
        <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: gameNum === 1 ? "#ff4655" : "#3b82f6" }}>Game {gameNum}</span>
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
              <span style={{ fontWeight: 700, color: "#ff4655", minWidth: 30, textAlign: "right" as const }}>{s.acs ?? Math.round((s.score || 0) / Math.max(1, s.rounds || 1))}</span>
            </div>
          ))}
          {t1Stats.length > 0 && t2Stats.length > 0 && <div style={{ height: 1, background: "#2A2A30", margin: "6px 0" }} />}
          {t2Stats.map((s: any, i: number) => (
            <div key={`t2-${i}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: "0.68rem" }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: "#1a1a1f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#555550", flexShrink: 0, overflow: "hidden" }}>{s.agentIcon ? <img src={s.agentIcon} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (s.agent || "?")[0]}</div>
              <span style={{ flex: 1, fontWeight: 600, color: t2Won ? "#4ade80" : "#e0e0da", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name || s.riotGameName || "Player"}</span>
              <span style={{ fontWeight: 700, color: "#8A8880", minWidth: 60, textAlign: "right" as const }}>{s.kills ?? 0}/{s.deaths ?? 0}/{s.assists ?? 0}</span>
              <span style={{ fontWeight: 700, color: "#ff4655", minWidth: 30, textAlign: "right" as const }}>{s.acs ?? Math.round((s.score || 0) / Math.max(1, s.rounds || 1))}</span>
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

function TimelineItem({ label, date, status, badge }: { label: string; date: string; status: "past" | "active" | "future"; badge?: string }) {
  return (
    <div className="vtd-tl-item">
      <div className={`vtd-tl-dot ${status}`} />
      <div>
        <div className="vtd-tl-label">
          {label}
          {badge && <span className="vtd-tl-badge" style={{ background: status === "active" ? "rgba(59,130,246,0.15)" : "rgba(245,158,11,0.12)", color: status === "active" ? "#60A5FA" : "#fbbf24" }}>{badge}</span>}
        </div>
        <div className="vtd-tl-date">{formatDate(date)} · {formatTime(date)}</div>
      </div>
    </div>
  );
}
