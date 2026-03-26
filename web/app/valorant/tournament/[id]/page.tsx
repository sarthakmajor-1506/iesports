"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot, collection, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
  try {
    return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch { return ""; }
}

function getTimeUntilDeadline(deadline: string): string {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return "Registration Closed";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function getTeamInitials(name: string): string {
  if (!name || name === "TBD") return "?";
  const words = name.replace(/\[.*?\]\s*/, "").split(/\s+/);
  return words.map(w => w[0]).join("").toUpperCase().slice(0, 3);
}

function getTeamTag(name: string): string {
  const m = name.match(/\[([^\]]+)\]/);
  return m ? m[1] : getTeamInitials(name);
}

export default function ValorantTournamentDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user, loading: authLoading, riotData } = useAuth();

  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [tournament, setTournament] = useState<any>(null);
  const [tLoading, setTLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [isRegistered, setIsRegistered] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [countdown, setCountdown] = useState("");
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [teamNameLoading, setTeamNameLoading] = useState(false);
  const [teamNameError, setTeamNameError] = useState("");

  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "valorantTournaments", id), (snap) => {
      if (snap.exists()) setTournament({ id: snap.id, ...snap.data() });
      setTLoading(false);
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      collection(db, "valorantTournaments", id, "leaderboard"),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => {
          const acsA = (a.totalScore || 0) / Math.max(1, a.totalRoundsPlayed || 1);
          const acsB = (b.totalScore || 0) / Math.max(1, b.totalRoundsPlayed || 1);
          if (Math.abs(acsB - acsA) > 1) return acsB - acsA;
          return (b.kd || 0) - (a.kd || 0);
        });
        setLeaderboard(list);
      }
    );
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      collection(db, "valorantTournaments", id, "soloPlayers"),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPlayers(list);
        if (user) setIsRegistered(list.some((p: any) => p.uid === user.uid));
      }
    );
    return () => unsub();
  }, [id, user]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      query(collection(db, "valorantTournaments", id, "teams"), orderBy("teamIndex")),
      (snap) => setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      collection(db, "valorantTournaments", id, "standings"),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
          return (b.mapsWon - b.mapsLost) - (a.mapsWon - a.mapsLost);
        });
        setStandings(list);
      }
    );
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      collection(db, "valorantTournaments", id, "matches"),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => {
          if (a.matchDay !== b.matchDay) return a.matchDay - b.matchDay;
          return (a.matchIndex || 0) - (b.matchIndex || 0);
        });
        setMatches(list);
      }
    );
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!tournament) return;
    const tick = () => setCountdown(getTimeUntilDeadline(tournament.registrationDeadline));
    tick();
    const i = setInterval(tick, 60000);
    return () => clearInterval(i);
  }, [tournament]);

  const getUserTeam = () => {
    if (!user) return null;
    return teams.find((t: any) => (t.members || []).some((m: any) => m.uid === user.uid));
  };

  const handleUpdateTeamName = async (teamId: string) => {
    if (!newTeamName.trim() || newTeamName.trim().length < 2) {
      setTeamNameError("Team name must be at least 2 characters");
      return;
    }
    if (newTeamName.trim().length > 24) {
      setTeamNameError("Team name must be 24 characters or less");
      return;
    }
    setTeamNameLoading(true);
    setTeamNameError("");
    try {
      const res = await fetch("/api/valorant/update-team-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: id, teamId, uid: user?.uid, newTeamName: newTeamName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditingTeamId(null);
      setNewTeamName("");
    } catch (e: any) {
      setTeamNameError(e.message || "Failed to update team name");
    } finally {
      setTeamNameLoading(false);
    }
  };

  if (authLoading || tLoading) return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, border: "3px solid #E5E3DF", borderTopColor: "#ff4655", borderRadius: "50%", animation: "vtspin 0.8s linear infinite" }} />
        <span style={{ color: "#bbb", fontSize: "0.84rem" }}>Loading...</span>
      </div>
      <style>{`@keyframes vtspin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );

  if (!tournament) return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#bbb" }}>Tournament not found.</p>
    </div>
  );

  const regClosed = countdown === "Registration Closed";
  const slotsLeft = tournament.totalSlots - tournament.slotsBooked;
  const canRegister = !regClosed && !isRegistered && slotsLeft > 0;
  const schedule = tournament.schedule || {};
  const userTeam = getUserTeam();

  // Build team member lookup for matches
  const teamMembers: Record<string, any[]> = {};
  const teamLogoMap: Record<string, string> = {};
  teams.forEach((t: any) => {
    teamMembers[t.id] = (t.members || []).slice(0, 5);
    if (t.teamLogo) teamLogoMap[t.id] = t.teamLogo;
  });

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .vtd-page { min-height: 100vh; background: #F8F7F4; font-family: var(--font-geist-sans), system-ui, sans-serif; }
        .vtd-hero { position: relative; height: 200px; background: linear-gradient(135deg, #ff4655 0%, #1a0008 100%); overflow: hidden; }
        .vtd-hero-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(248,247,244,0.6) 70%, rgba(248,247,244,1) 100%); }
        .vtd-hero-content { position: relative; z-index: 2; max-width: 1100px; margin: 0 auto; padding: 0 30px; height: 100%; display: flex; align-items: flex-end; padding-bottom: 20px; }
        .vtd-hero-title { font-size: 1.6rem; font-weight: 900; color: #111; }
        .vtd-hero-meta { display: flex; gap: 14px; margin-top: 6px; flex-wrap: wrap; }
        .vtd-hero-chip { font-size: 0.72rem; font-weight: 700; padding: 3px 10px; border-radius: 100px; background: rgba(255,255,255,0.9); border: 1px solid #E5E3DF; color: #555; white-space: nowrap; }
        .vtd-hero-chip.accent { color: #ff4655; border-color: #fecdd3; background: #fff0f1; }
        .vtd-content { max-width: 1100px; margin: 0 auto; padding: 0 30px 60px; }
        .vtd-tabs { display: flex; gap: 0; border-bottom: 1px solid #E5E3DF; margin-bottom: 24px; overflow-x: auto; }
        .vtd-tab { padding: 10px 18px; font-size: 0.84rem; font-weight: 600; color: #888; background: none; border: none; cursor: pointer; font-family: inherit; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.15s; white-space: nowrap; display: flex; align-items: center; gap: 6px; }
        .vtd-tab:hover { color: #555; }
        .vtd-tab.active { color: #ff4655; border-bottom-color: #ff4655; font-weight: 800; }
        .vtd-card { background: #fff; border: 1px solid #E5E3DF; border-radius: 14px; padding: 20px 24px; margin-bottom: 16px; }
        .vtd-card-label { display: block; font-size: 0.62rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #bbb; margin-bottom: 14px; }
        .vtd-stat-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
        .vtd-stat { flex: 1; min-width: 120px; background: #F8F7F4; border: 1px solid #E5E3DF; border-radius: 10px; padding: 12px 16px; text-align: center; }
        .vtd-stat-val { font-size: 1.1rem; font-weight: 800; color: #111; }
        .vtd-stat-val.accent { color: #ff4655; }
        .vtd-stat-lbl { font-size: 0.62rem; color: #999; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }
        .vtd-reg-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; padding: 14px 20px; background: #fff; border: 1px solid #E5E3DF; border-radius: 14px; flex-wrap: wrap; }
        .vtd-reg-info { display: flex; flex-direction: column; gap: 2px; }
        .vtd-reg-slots { font-size: 1rem; font-weight: 800; color: #111; }
        .vtd-reg-countdown { font-size: 0.78rem; color: #888; }
        .vtd-reg-btn { padding: 10px 28px; background: #ff4655; color: #fff; border: none; border-radius: 100px; font-size: 0.88rem; font-weight: 800; cursor: pointer; font-family: inherit; transition: background 0.15s; }
        .vtd-reg-btn:hover { background: #e63e4d; }
        .vtd-reg-done { padding: 10px 24px; background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; border-radius: 100px; font-size: 0.86rem; font-weight: 700; }
        .vtd-timeline { display: flex; flex-direction: column; gap: 0; }
        .vtd-tl-item { display: flex; gap: 14px; padding: 10px 0; }
        .vtd-tl-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
        .vtd-tl-dot.past { background: #22c55e; }
        .vtd-tl-dot.active { background: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.2); }
        .vtd-tl-dot.future { background: #E5E3DF; }
        .vtd-tl-label { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #ff4655; }
        .vtd-tl-date { font-size: 0.82rem; color: #555; }
        .vtd-tl-badge { font-size: 0.58rem; font-weight: 800; padding: 2px 7px; border-radius: 100px; margin-left: 8px; }
        .vtd-rule { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid #F2F1EE; }
        .vtd-rule:last-child { border-bottom: none; }
        .vtd-rule-num { font-size: 0.78rem; font-weight: 800; color: #ff4655; min-width: 22px; }
        .vtd-rule-text { font-size: 0.84rem; color: #555; line-height: 1.5; }
        .vtd-empty { text-align: center; padding: 60px 20px; }
        .vtd-empty-icon { font-size: 42px; margin-bottom: 8px; display: block; }
        .vtd-empty-title { font-size: 0.95rem; font-weight: 700; color: #888; margin-bottom: 4px; display: block; }
        .vtd-empty-sub { font-size: 0.82rem; color: #bbb; display: block; margin-top: 4px; }

        .vtd-players-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .vtd-player-box { background: #fff; border: 1px solid #E5E3DF; border-radius: 14px; padding: 20px; display: flex; align-items: center; gap: 16px; transition: box-shadow 0.15s; }
        .vtd-player-box:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
        .vtd-player-avatar-lg { width: 56px; height: 56px; border-radius: 10px; object-fit: cover; background: #F2F1EE; flex-shrink: 0; }
        .vtd-player-avatar-init { width: 56px; height: 56px; border-radius: 10px; background: #F2F1EE; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; color: #bbb; flex-shrink: 0; }
        .vtd-player-info { flex: 1; min-width: 0; }
        .vtd-player-name-lg { font-size: 0.95rem; font-weight: 800; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vtd-player-name-lg .tag { color: #bbb; font-weight: 400; }
        .vtd-player-rank-lg { font-size: 0.74rem; color: #888; margin-top: 2px; }
        .vtd-player-skill-lg { font-size: 0.64rem; font-weight: 800; padding: 3px 10px; border-radius: 100px; margin-top: 6px; display: inline-block; }

        .vtd-teams-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .vtd-team-box { background: #fff; border: 1px solid #E5E3DF; border-radius: 16px; padding: 24px; position: relative; transition: box-shadow 0.15s; }
        .vtd-team-box:hover { box-shadow: 0 2px 16px rgba(0,0,0,0.06); }
        .vtd-team-box-num { position: absolute; top: 12px; right: 14px; font-size: 0.62rem; font-weight: 800; color: #ff4655; background: #fff0f1; border: 1px solid #fecdd3; padding: 2px 8px; border-radius: 100px; }
        .vtd-team-box-header { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
        .vtd-team-logo { width: 52px; height: 52px; border-radius: 12px; background: linear-gradient(135deg, #ff4655 0%, #c62c3a 100%); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; color: #fff; letter-spacing: 0.05em; flex-shrink: 0; overflow: hidden; }
        .vtd-team-logo img { width: 100%; height: 100%; object-fit: cover; }
        .vtd-team-box-name { font-size: 1.05rem; font-weight: 900; color: #111; }
        .vtd-team-box-avg { font-size: 0.68rem; color: #999; margin-top: 2px; }
        .vtd-team-box-members { display: flex; flex-direction: column; gap: 8px; }
        .vtd-team-box-member { display: flex; align-items: center; gap: 10px; }
        .vtd-team-box-member-avatar { width: 34px; height: 34px; border-radius: 8px; object-fit: cover; background: #F2F1EE; flex-shrink: 0; }
        .vtd-team-box-member-init { width: 34px; height: 34px; border-radius: 8px; background: #F2F1EE; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #999; flex-shrink: 0; }
        .vtd-team-box-member-name { font-size: 0.84rem; font-weight: 600; color: #222; }
        .vtd-team-box-member-rank { font-size: 0.72rem; color: #999; }
        .vtd-team-box-member-skill { margin-left: auto; font-size: 0.62rem; color: #999; font-weight: 600; }
        .vtd-team-box-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 12px; border-top: 1px solid #F2F1EE; font-size: 0.72rem; color: #999; }
        .vtd-team-edit-btn { padding: 5px 14px; background: #F8F7F4; border: 1px solid #E5E3DF; border-radius: 100px; font-size: 0.72rem; font-weight: 700; cursor: pointer; color: #666; font-family: inherit; transition: all 0.15s; }
        .vtd-team-edit-btn:hover { border-color: #ff4655; color: #ff4655; }
        .vtd-team-edit-input { width: 100%; padding: 8px 12px; border: 1.5px solid #ff4655; border-radius: 8px; font-size: 0.84rem; outline: none; font-family: inherit; }
        .vtd-team-edit-actions { display: flex; gap: 6px; margin-top: 6px; }
        .vtd-team-edit-save { padding: 6px 16px; background: #ff4655; color: #fff; border: none; border-radius: 100px; font-size: 0.72rem; font-weight: 700; cursor: pointer; font-family: inherit; }
        .vtd-team-edit-cancel { padding: 6px 16px; background: #F8F7F4; color: #666; border: 1px solid #E5E3DF; border-radius: 100px; font-size: 0.72rem; font-weight: 700; cursor: pointer; font-family: inherit; }

        .vtd-standings-table { width: 100%; border-collapse: collapse; }
        .vtd-standings-table th { font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #999; padding: 8px 12px; text-align: left; border-bottom: 1px solid #E5E3DF; }
        .vtd-standings-table td { font-size: 0.84rem; padding: 10px 12px; border-bottom: 1px solid #F2F1EE; color: #333; }
        .vtd-standings-table tr:last-child td { border-bottom: none; }

        .vtd-overview-grid { display: grid; grid-template-columns: 1fr 320px; gap: 20px; }

        /* ═══ NEW COMPACT MATCH CARDS (IDPL-style) ═══ */
        .vtd-match-day-header { font-size: 0.74rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin: 24px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #E5E3DF; display: flex; align-items: center; gap: 8px; }
        .vtd-match-day-header:first-child { margin-top: 0; }
        .vtd-match-day-header .day-num { color: #ff4655; }

        .vtd-mc { display: flex; align-items: center; background: #fff; border: 1px solid #E5E3DF; border-radius: 10px; margin-bottom: 8px; overflow: hidden; transition: box-shadow 0.15s; min-height: 64px; }
        .vtd-mc:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.05); }
        .vtd-mc-index { width: 40px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 8px 0; border-right: 1px solid #F2F1EE; }
        .vtd-mc-index-num { font-size: 0.68rem; font-weight: 800; color: #bbb; }
        .vtd-mc-index-fmt { font-size: 0.54rem; font-weight: 800; color: #ff4655; background: #fff0f1; padding: 1px 5px; border-radius: 4px; }

        .vtd-mc-team { flex: 1; display: flex; align-items: center; gap: 10px; padding: 10px 14px; min-width: 0; }
        .vtd-mc-team.right { flex-direction: row-reverse; text-align: right; }
        .vtd-mc-team-logo { width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(135deg, #ff4655 0%, #c62c3a 100%); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; color: #fff; flex-shrink: 0; overflow: hidden; }
        .vtd-mc-team-logo img { width: 100%; height: 100%; object-fit: cover; }
        .vtd-mc-team-info { flex: 1; min-width: 0; }
        .vtd-mc-team-tag { font-size: 0.64rem; font-weight: 800; color: #ff4655; text-transform: uppercase; }
        .vtd-mc-team-name { font-size: 0.82rem; font-weight: 700; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vtd-mc-avatars { display: flex; gap: 0; margin-top: 3px; }
        .vtd-mc-avatars img, .vtd-mc-avatars .vtd-mc-av-init { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid #fff; margin-left: -4px; object-fit: cover; }
        .vtd-mc-avatars img:first-child, .vtd-mc-avatars .vtd-mc-av-init:first-child { margin-left: 0; }
        .vtd-mc-av-init { background: #F2F1EE; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 700; color: #999; }
        .vtd-mc-team.right .vtd-mc-avatars { justify-content: flex-end; }

        .vtd-mc-center { min-width: 80px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 4px; flex-shrink: 0; }
        .vtd-mc-score-box { display: flex; align-items: center; gap: 6px; font-size: 1.05rem; font-weight: 900; }
        .vtd-mc-score-box .s { min-width: 20px; text-align: center; }
        .vtd-mc-score-box .s.win { color: #22c55e; }
        .vtd-mc-score-box .s.loss { color: #dc2626; }
        .vtd-mc-score-box .s.draw { color: #f59e0b; }
        .vtd-mc-score-box .dash { color: #ccc; font-weight: 400; }
        .vtd-mc-status-badge { font-size: 0.58rem; font-weight: 800; padding: 2px 8px; border-radius: 100px; margin-top: 2px; }

        .vtd-mc-result { display: flex; align-items: center; gap: 4px; margin-top: 2px; }
        .vtd-mc-result-icon { font-size: 10px; }
        .vtd-mc-result-text { font-size: 0.58rem; font-weight: 700; color: #999; }

        /* ═══ MATCH STATUS INDICATORS ═══ */
        .vtd-mc-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; animation: vtd-pulse 1.5s ease-in-out infinite; }
        @keyframes vtd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

        @media (max-width: 900px) {
          .vtd-players-grid { grid-template-columns: repeat(2, 1fr); }
          .vtd-teams-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 800px) {
          .vtd-hero-content { padding: 0 16px; padding-bottom: 16px; }
          .vtd-hero-title { font-size: 1.2rem; }
          .vtd-content { padding: 0 16px 40px; }
          .vtd-overview-grid { grid-template-columns: 1fr; }
          .vtd-stat-row { gap: 8px; }
          .vtd-stat { min-width: 80px; padding: 10px; }
          .vtd-mc-avatars { display: none; }
          .vtd-mc-team-name { font-size: 0.76rem; }
        }
        @media (max-width: 600px) {
          .vtd-players-grid { grid-template-columns: 1fr; }
          .vtd-teams-grid { grid-template-columns: 1fr; }
          .vtd-mc-team { padding: 8px 10px; gap: 8px; }
          .vtd-mc-team-logo { width: 30px; height: 30px; font-size: 9px; }
        }
      `}</style>

      <div className="vtd-page">
        <Navbar />

        <div className="vtd-hero">
          <div className="vtd-hero-overlay" />
          <div className="vtd-hero-content">
            <div>
              <div className="vtd-hero-title">{tournament.name}</div>
              <div className="vtd-hero-meta">
                <span className="vtd-hero-chip accent">{tournament.format === "shuffle" ? "Shuffle" : tournament.format === "auction" ? "Auction" : "Standard"}</span>
                <span className="vtd-hero-chip">{tournament.slotsBooked}/{tournament.totalSlots} players</span>
                <span className="vtd-hero-chip">{tournament.entryFee === 0 ? "Free" : `₹${tournament.entryFee}`}</span>
                <span className="vtd-hero-chip">{formatDate(tournament.startDate)}</span>
                {tournament.prizePool && tournament.prizePool !== "0" && (
                  <span className="vtd-hero-chip accent">{tournament.prizePool.startsWith("₹") ? tournament.prizePool : `₹${tournament.prizePool}`}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="vtd-content">
          <div className="vtd-reg-bar">
            <div className="vtd-reg-info">
              <div className="vtd-reg-slots">{slotsLeft} slots left</div>
              <div className="vtd-reg-countdown">{countdown}</div>
            </div>
            {canRegister && <button className="vtd-reg-btn" onClick={() => setShowRegister(true)}>Register →</button>}
            {isRegistered && <div className="vtd-reg-done">✓ Registered</div>}
            {regClosed && !isRegistered && <span style={{ fontSize: "0.82rem", color: "#999" }}>Registration closed</span>}
          </div>

          <div className="vtd-tabs">
            {TABS.map(t => (
              <button key={t.key} className={`vtd-tab${activeTab === t.key ? " active" : ""}`} onClick={() => setActiveTab(t.key)}>
                <span style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
                {t.key === "players" && <span style={{ fontSize: "0.68rem", color: "#999", fontWeight: 600 }}>({players.length})</span>}
                {t.key === "teams" && teams.length > 0 && <span style={{ fontSize: "0.68rem", color: "#999", fontWeight: 600 }}>({teams.length})</span>}
              </button>
            ))}
          </div>

          {/* ═══════ OVERVIEW TAB ═══════ */}
          {activeTab === "overview" && (
            <div className="vtd-overview-grid">
              <div>
                <div className="vtd-stat-row">
                  <div className="vtd-stat">
                    <div className="vtd-stat-val">{tournament.format === "shuffle" ? "SHUFFLE" : tournament.format?.toUpperCase()}</div>
                    <div className="vtd-stat-lbl">Format</div>
                  </div>
                  <div className="vtd-stat">
                    <div className="vtd-stat-val">BO2</div>
                    <div className="vtd-stat-lbl">Match Format</div>
                  </div>
                  <div className="vtd-stat">
                    <div className="vtd-stat-val">5</div>
                    <div className="vtd-stat-lbl">Team Size</div>
                  </div>
                  <div className="vtd-stat">
                    <div className="vtd-stat-val accent">{tournament.prizePool || "TBD"}</div>
                    <div className="vtd-stat-lbl">Prize Pool</div>
                  </div>
                </div>
                <div className="vtd-card">
                  <span className="vtd-card-label">About</span>
                  <p style={{ fontSize: "0.88rem", color: "#444", lineHeight: 1.7 }}>{tournament.desc}</p>
                </div>
                <div className="vtd-card">
                  <span className="vtd-card-label">Rules</span>
                  {(tournament.rules || []).map((rule: string, i: number) => (
                    <div key={i} className="vtd-rule">
                      <span className="vtd-rule-num">{i + 1}.</span>
                      <span className="vtd-rule-text">{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="vtd-card">
                  <span className="vtd-card-label">Schedule</span>
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

          {/* ═══════ PLAYERS TAB ═══════ */}
          {activeTab === "players" && (
            <div>
              <div className="vtd-card">
                <span className="vtd-card-label">Registered Players ({players.length})</span>
                {players.length === 0 ? (
                  <div className="vtd-empty">
                    <span className="vtd-empty-icon">👤</span>
                    <span className="vtd-empty-title">No players registered yet</span>
                    <span className="vtd-empty-sub">Be the first to register!</span>
                  </div>
                ) : (
                  <div className="vtd-players-grid">
                    {players.map((p: any) => (
                      <Link key={p.uid} href={`/player/${p.uid}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                      <div className="vtd-player-box">
                        {p.riotAvatar ? (
                          <img className="vtd-player-avatar-lg" src={p.riotAvatar} alt={p.riotGameName} />
                        ) : (
                          <div className="vtd-player-avatar-init">{(p.riotGameName || "?")[0].toUpperCase()}</div>
                        )}
                        <div className="vtd-player-info">
                          <div className="vtd-player-name-lg">{p.riotGameName}<span className="tag">#{p.riotTagLine}</span></div>
                          <div className="vtd-player-rank-lg">{p.riotRank || "Unranked"}</div>
                          <span className="vtd-player-skill-lg" style={{
                            background: p.skillLevel >= 4 ? "#fef3c7" : p.skillLevel >= 3 ? "#e0e4ff" : "#F2F1EE",
                            color: p.skillLevel >= 4 ? "#92400e" : p.skillLevel >= 3 ? "#4f5fc0" : "#888",
                            border: `1px solid ${p.skillLevel >= 4 ? "#fde68a" : p.skillLevel >= 3 ? "#c7d0ff" : "#E5E3DF"}`,
                          }}>Skill {p.skillLevel || 1}</span>
                        </div>
                       </div> 
                      
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════ TEAMS TAB ═══════ */}
          {activeTab === "teams" && (
            <div>
              {teams.length === 0 ? (
                <div className="vtd-empty">
                  <span className="vtd-empty-icon">👥</span>
                  <span className="vtd-empty-title">Teams not generated yet</span>
                  <span className="vtd-empty-sub">Teams will be shuffled after registration closes.</span>
                </div>
              ) : (
                <div className="vtd-teams-grid">
                  {teams.map((team: any) => {
                    const isMyTeam = userTeam?.id === team.id;
                    const canEdit = isMyTeam && !team.teamNameSet;
                    const isEditing = editingTeamId === team.id;
                    return (
                      <div key={team.id} className="vtd-team-box">
                        <span className="vtd-team-box-num">#{team.teamIndex}</span>
                        <div className="vtd-team-box-header">
                          <div className="vtd-team-logo">
                            {team.teamLogo ? <img src={team.teamLogo} alt={team.teamName} /> : getTeamInitials(team.teamName)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {isEditing ? (
                              <div>
                                <input className="vtd-team-edit-input" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="Enter team name" maxLength={24} autoFocus onKeyDown={e => { if (e.key === "Enter") handleUpdateTeamName(team.id); }} />
                                {teamNameError && <div style={{ fontSize: "0.68rem", color: "#dc2626", marginTop: 4 }}>{teamNameError}</div>}
                                <div className="vtd-team-edit-actions">
                                  <button className="vtd-team-edit-save" onClick={() => handleUpdateTeamName(team.id)} disabled={teamNameLoading}>{teamNameLoading ? "Saving..." : "Save"}</button>
                                  <button className="vtd-team-edit-cancel" onClick={() => { setEditingTeamId(null); setTeamNameError(""); }}>Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="vtd-team-box-name">{team.teamName}</div>
                                <div className="vtd-team-box-avg">Avg Skill: {team.avgSkillLevel}</div>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="vtd-team-box-members">
                          {(team.members || []).map((m: any, i: number) => (
                            <div key={m.uid || i} className="vtd-team-box-member">
                              {m.riotAvatar ? <img src={m.riotAvatar} alt={m.riotGameName} className="vtd-team-box-member-avatar" /> : <div className="vtd-team-box-member-init">{(m.riotGameName || "?")[0]}</div>}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="vtd-team-box-member-name">{m.riotGameName}</div>
                                <div className="vtd-team-box-member-rank">{m.riotRank}</div>
                              </div>
                              <span className="vtd-team-box-member-skill">Skill {m.skillLevel}</span>
                            </div>
                          ))}
                        </div>
                        <div className="vtd-team-box-footer">
                          <span>{team.members?.length || 0} players</span>
                          {canEdit && !isEditing && (
                            <button className="vtd-team-edit-btn" onClick={() => { setEditingTeamId(team.id); setNewTeamName(team.teamName); setTeamNameError(""); }}>✏️ Set Team Name</button>
                          )}
                          {team.teamNameSet && <span style={{ fontSize: "0.62rem", color: "#16a34a" }}>✓ Name set</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══════ STANDINGS TAB ═══════ */}
          {activeTab === "standings" && (
            <div className="vtd-card">
              <span className="vtd-card-label">Group Stage Standings</span>
              {standings.length === 0 ? (
                <div className="vtd-empty">
                  <span className="vtd-empty-icon">🏆</span>
                  <span className="vtd-empty-title">No standings yet</span>
                  <span className="vtd-empty-sub">Standings will appear once matches are played.</span>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="vtd-standings-table">
                    <thead>
                      <tr>
                        <th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th>
                        <th style={{ color: "#16a34a" }}>MW</th><th style={{ color: "#dc2626" }}>ML</th>
                        <th style={{ color: "#ff4655" }}>Pts</th><th>BH</th>
                        <th style={{ color: "#ff4655" }}>Pts</th><th>BH</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((s: any, i: number) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 800, color: i < 6 ? "#ff4655" : "#bbb" }}>{i + 1}</td>
                          <td style={{ fontWeight: 700 }}>{s.teamName}</td>
                          <td>{s.played || 0}</td><td>{s.wins || 0}</td><td>{s.draws || 0}</td><td>{s.losses || 0}</td>
                          <td style={{ color: "#16a34a" }}>{s.mapsWon || 0}</td>
                          <td style={{ color: "#dc2626" }}>{s.mapsLost || 0}</td>
                          <td style={{ fontWeight: 800, color: "#ff4655" }}>{s.points || 0}</td>
                          <td style={{ color: "#999" }}>{s.buchholz || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ═══════ MATCHES TAB (Expandable cards with game details) ═══════ */}
          {activeTab === "matches" && (
            <div>
              {matches.filter((m: any) => !m.isBracket).length === 0 ? (
                <div className="vtd-empty">
                  <span className="vtd-empty-icon">⚔️</span>
                  <span className="vtd-empty-title">No matches scheduled</span>
                  <span className="vtd-empty-sub">Matches will appear once pairings are generated.</span>
                </div>
              ) : (
                <>
                  {(() => {
                    const groupMatches = matches.filter((m: any) => !m.isBracket);
                    const days = [...new Set(groupMatches.map((m: any) => m.matchDay))].sort((a: number, b: number) => a - b);

                    return days.map((day: number) => (
                      <div key={day}>
                        <div className="vtd-match-day-header">
                          <span className="day-num">Round {day}</span>
                          <span>· {groupMatches.filter((m: any) => m.matchDay === day).length} matches</span>
                        </div>
                        {groupMatches.filter((m: any) => m.matchDay === day).map((m: any) => {
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
          
                          const scheduledStr = m.scheduledTime
                            ? new Date(m.scheduledTime).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
                            : "";

                          return (
                            <div key={m.id} style={{ marginBottom: 8 }}>
                              <div
                                className="vtd-mc"
                                style={{
                                  cursor: "pointer",
                                  ...(isLive ? { borderColor: "#22c55e44" } : {}),
                                  ...(isExpanded ? { borderColor: "#ff465544", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 } : {}),
                                }}
                                onClick={() => setExpandedMatch(isExpanded ? null : m.id)}
                              >
                                <div className="vtd-mc-index">
                                  <span className="vtd-mc-index-num">M{m.matchIndex || ""}</span>
                                  <span className="vtd-mc-index-fmt">BO2</span>
                                </div>

                                <div className="vtd-mc-team">
                                  <div className="vtd-mc-team-logo">
                                    {teamLogoMap[m.team1Id] ? <img src={teamLogoMap[m.team1Id]} alt="" /> : getTeamInitials(m.team1Name)}
                                  </div>
                                  <div className="vtd-mc-team-info">
                                    <div className="vtd-mc-team-tag">{getTeamTag(m.team1Name)}</div>
                                    <div className="vtd-mc-team-name" style={t1Win ? { color: "#22c55e" } : t2Win ? { color: "#999" } : {}}>{m.team1Name}</div>
                                    <div className="vtd-mc-avatars">
                                      {t1Members.map((p: any, i: number) => (
                                        p.riotAvatar ? <img key={i} src={p.riotAvatar} alt="" /> : <div key={i} className="vtd-mc-av-init">{(p.riotGameName || "?")[0]}</div>
                                      ))}
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
                                      <span className="vtd-mc-status-badge" style={{ background: "#f0fdf4", color: "#16a34a" }}>✓ Played</span>
                                    </>
                                  ) : isLive ? (
                                    <>
                                      <div className="vtd-mc-score-box">
                                        <span className="s">{m.team1Score || 0}</span>
                                        <span className="dash">-</span>
                                        <span className="s">{m.team2Score || 0}</span>
                                      </div>
                                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                                        <div className="vtd-mc-live-dot" />
                                        <span className="vtd-mc-status-badge" style={{ background: "#dcfce7", color: "#16a34a", padding: "1px 6px" }}>LIVE</span>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="vtd-mc-score-box">
                                        <span className="s" style={{ color: "#ccc" }}>–</span>
                                        <span className="dash">:</span>
                                        <span className="s" style={{ color: "#ccc" }}>–</span>
                                      </div>
                                      <span className="vtd-mc-status-badge" style={{ background: "#F2F1EE", color: "#999" }}>Upcoming</span>
                                    </>
                                  )}
                                  {scheduledStr && <div style={{ fontSize: "0.62rem", color: "#bbb", marginTop: 2 }}>{scheduledStr}</div>}
                                </div>

                                <div className="vtd-mc-team right">
                                  <div className="vtd-mc-team-logo">
                                    {teamLogoMap[m.team2Id] ? <img src={teamLogoMap[m.team2Id]} alt="" /> : getTeamInitials(m.team2Name)}
                                  </div>
                                  <div className="vtd-mc-team-info" style={{ textAlign: "right" }}>
                                    <div className="vtd-mc-team-tag">{getTeamTag(m.team2Name)}</div>
                                    <div className="vtd-mc-team-name" style={t2Win ? { color: "#22c55e" } : t1Win ? { color: "#999" } : {}}>{m.team2Name}</div>
                                    <div className="vtd-mc-avatars">
                                      {t2Members.map((p: any, i: number) => (
                                        p.riotAvatar ? <img key={i} src={p.riotAvatar} alt="" /> : <div key={i} className="vtd-mc-av-init">{(p.riotGameName || "?")[0]}</div>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div style={{
                                  width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                                  color: isExpanded ? "#ff4655" : "#ccc", fontSize: 12, transition: "transform 0.2s",
                                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0,
                                }}>▼</div>
                              </div>

                              {/* ═══ EXPANDABLE GAME DETAILS ═══ */}
                              {isExpanded && (
                                <div style={{
                                  background: "#FAFAF8", border: "1px solid #E5E3DF", borderTop: "none",
                                  borderBottomLeftRadius: 10, borderBottomRightRadius: 10, padding: "14px 16px",
                                }}>
                                  {!isComplete && !isLive && !hasGameData ? (
                                    <div style={{ textAlign: "center", padding: "16px 0", color: "#bbb", fontSize: "0.82rem" }}>
                                      Match hasn't been played yet. Game details will appear here after the match.
                                    </div>


                                ) : (
                                    <>
                                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                        <GameDetailCard game={g1} gameNum={1} team1Name={m.team1Name} team2Name={m.team2Name} team1Id={m.team1Id} team2Id={m.team2Id} />
                                        <GameDetailCard game={g2} gameNum={2} team1Name={m.team1Name} team2Name={m.team2Name} team1Id={m.team1Id} team2Id={m.team2Id} />
                                      </div>
                                      <div style={{ marginTop: 10, textAlign: "center" }}>
                                        <Link
                                          href={`/valorant/match/${id}/${m.id}`}
                                          style={{
                                            fontSize: "0.72rem", fontWeight: 700, color: "#ff4655",
                                            textDecoration: "none", padding: "6px 18px",
                                            border: "1px solid #ff4655", borderRadius: 100,
                                            display: "inline-block", transition: "all 0.15s",
                                          }}
                                        >
                                          View Full Match Details →
                                        </Link>
                                      </div>
                                    </>
                                  )}             
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </>
              )}
            </div>
          )}

          {/* ═══════ BRACKETS TAB ═══════ */}
          {activeTab === "brackets" && (
            <div>
              <DoubleBracket
                matches={matches.filter((m: any) => m.isBracket)}
                bracketSize={tournament.bracketSize || 4}
                standings={standings}
              />
            </div>
          )}

          {/* ═══════ LEADERBOARD TAB ═══════ */}
          {activeTab === "leaderboard" && (
            <div className="vtd-card">
              <span className="vtd-card-label">Player Leaderboard — MVP Tracker</span>
              {leaderboard.length === 0 ? (
                <div className="vtd-empty">
                  <span className="vtd-empty-icon">📊</span>
                  <span className="vtd-empty-title">No stats yet</span>
                  <span className="vtd-empty-sub">Player stats will appear once match data is fetched.</span>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="vtd-standings-table">
                    <thead>
                      <tr>
                        <th>#</th><th>Player</th><th>Agent(s)</th><th>Maps</th>
                        <th style={{ color: "#16a34a" }}>K</th><th style={{ color: "#dc2626" }}>D</th><th>A</th>
                        <th style={{ color: "#ff4655" }}>K/D</th><th>ACS</th><th>HS%</th><th>DMG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((p: any, i: number) => {
                        const acs = Math.round((p.totalScore || 0) / Math.max(1, p.totalRoundsPlayed || 1));
                        return (
                          <tr key={p.id} style={i === 0 ? { background: "#FFFBEB" } : {}}>
                            <td style={{ fontWeight: 800, color: i === 0 ? "#f59e0b" : i < 3 ? "#ff4655" : "#bbb" }}>{i === 0 ? "👑" : i + 1}</td>
                            <td>
                              {p.uid ? (
                                <Link href={`/player/${p.uid}`} style={{ textDecoration: "none", color: "inherit" }}>
                                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                                  <div style={{ fontSize: "0.68rem", color: "#999" }}>#{p.tag}</div>
                                </Link>
                              ) : (
                                <>
                                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                                  <div style={{ fontSize: "0.68rem", color: "#999" }}>#{p.tag}</div>
                                </>
                              )}
                            </td>
                            <td style={{ fontSize: "0.72rem", color: "#888" }}>{(p.agents || []).join(", ")}</td>
                            <td>{p.matchesPlayed || 0}</td>
                            <td style={{ fontWeight: 700, color: "#16a34a" }}>{p.totalKills || 0}</td>
                            <td style={{ color: "#dc2626" }}>{p.totalDeaths || 0}</td>
                            <td>{p.totalAssists || 0}</td>
                            <td style={{ fontWeight: 800, color: (p.kd || 0) >= 1.0 ? "#16a34a" : "#dc2626" }}>{p.kd || 0}</td>
                            <td style={{ fontWeight: 700 }}>{acs}</td>
                            <td>{p.hsPercent || 0}%</td>
                            <td style={{ fontSize: "0.78rem", color: "#888" }}>{p.totalDamageDealt || 0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 12, padding: "10px 14px", background: "#F8F7F4", borderRadius: 8, fontSize: "0.72rem", color: "#999", lineHeight: 1.6 }}>
                    <strong style={{ color: "#666" }}>How MVP is determined:</strong> Players ranked by Average Combat Score (ACS = total score / rounds played), then K/D ratio as tiebreaker.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showRegister && user && (
        <RegisterModal tournament={tournament} user={user} dotaProfile={null} game="valorant" onClose={() => setShowRegister(false)} onSuccess={() => setIsRegistered(true)} />
      )}
    </>
  );
}

function GameDetailCard({ game, gameNum, team1Name, team2Name, team1Id, team2Id }: {
  game: any; gameNum: number; team1Name: string; team2Name: string; team1Id: string; team2Id: string;
}) {
  if (!game) {
    return (
      <div style={{ background: "#fff", border: "1px solid #E5E3DF", borderRadius: 10, padding: "12px 14px", opacity: 0.5 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: gameNum === 1 ? "#ff4655" : "#3b82f6" }}>Game {gameNum}</span>
        </div>
        <div style={{ textAlign: "center", padding: "12px 0", color: "#ccc", fontSize: "0.78rem" }}>No data</div>
      </div>
    );
  }

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
    <div style={{ background: "#fff", border: "1px solid #E5E3DF", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: gameNum === 1 ? "#ff4655" : "#3b82f6" }}>Game {gameNum}</span>
        <span style={{ fontSize: "0.72rem", color: "#888", fontWeight: 600 }}>{mapName}</span>
        {isPlayed && (
          <span style={{ fontSize: "0.58rem", fontWeight: 800, padding: "2px 8px", borderRadius: 100, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}>✓</span>
        )}
        {!isPlayed && <span style={{ fontSize: "0.58rem", fontWeight: 800, padding: "2px 8px", borderRadius: 100, background: "#F2F1EE", color: "#999" }}>Pending</span>}
      </div>

      {isPlayed && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: t1Won ? "#16a34a" : "#999", marginBottom: 2 }}>
              {team1Name.length > 14 ? team1Name.slice(0, 12) + "…" : team1Name}
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 900, color: t1Won ? "#16a34a" : "#dc2626" }}>{t1Rounds}</div>
          </div>
          <div style={{ fontSize: "0.72rem", color: "#ccc", fontWeight: 700 }}>vs</div>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: t2Won ? "#16a34a" : "#999", marginBottom: 2 }}>
              {team2Name.length > 14 ? team2Name.slice(0, 12) + "…" : team2Name}
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 900, color: t2Won ? "#16a34a" : "#dc2626" }}>{t2Rounds}</div>
          </div>
        </div>
      )}

      {stats.length > 0 && (
        <div style={{ borderTop: "1px solid #F2F1EE", paddingTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: "0.58rem", fontWeight: 800, color: "#bbb", letterSpacing: "0.1em" }}>PLAYER</span>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ fontSize: "0.58rem", fontWeight: 800, color: "#bbb", letterSpacing: "0.1em", minWidth: 60, textAlign: "right" as const }}>K/D/A</span>
              <span style={{ fontSize: "0.58rem", fontWeight: 800, color: "#bbb", letterSpacing: "0.1em", minWidth: 30, textAlign: "right" as const }}>ACS</span>
            </div>
          </div>
          {t1Stats.map((s: any, i: number) => (
            <div key={`t1-${i}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: "0.68rem" }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: "#F2F1EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#999", flexShrink: 0, overflow: "hidden" }}>
                {s.agentIcon ? <img src={s.agentIcon} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (s.agent || "?")[0]}
              </div>
              <span style={{ flex: 1, fontWeight: 600, color: t1Won ? "#16a34a" : "#333", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name || s.riotGameName || "Player"}</span>
              <span style={{ fontWeight: 700, color: "#555", minWidth: 60, textAlign: "right" as const }}>{s.kills ?? 0}/{s.deaths ?? 0}/{s.assists ?? 0}</span>
              <span style={{ fontWeight: 700, color: "#ff4655", minWidth: 30, textAlign: "right" as const }}>{s.acs ?? Math.round((s.score || 0) / Math.max(1, s.rounds || 1))}</span>
            </div>
          ))}
          {t1Stats.length > 0 && t2Stats.length > 0 && <div style={{ height: 1, background: "#E5E3DF", margin: "6px 0" }} />}
          {t2Stats.map((s: any, i: number) => (
            <div key={`t2-${i}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: "0.68rem" }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: "#F2F1EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#999", flexShrink: 0, overflow: "hidden" }}>
                {s.agentIcon ? <img src={s.agentIcon} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (s.agent || "?")[0]}
              </div>
              <span style={{ flex: 1, fontWeight: 600, color: t2Won ? "#16a34a" : "#333", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name || s.riotGameName || "Player"}</span>
              <span style={{ fontWeight: 700, color: "#555", minWidth: 60, textAlign: "right" as const }}>{s.kills ?? 0}/{s.deaths ?? 0}/{s.assists ?? 0}</span>
              <span style={{ fontWeight: 700, color: "#ff4655", minWidth: 30, textAlign: "right" as const }}>{s.acs ?? Math.round((s.score || 0) / Math.max(1, s.rounds || 1))}</span>
            </div>
          ))}
        </div>
      )}

      {isPlayed && stats.length === 0 && (
        <div style={{ textAlign: "center", padding: "8px 0", color: "#bbb", fontSize: "0.72rem" }}>
          {t1Won ? `${team1Name} won` : t2Won ? `${team2Name} won` : "Result recorded"}
          {game.reason && <span style={{ display: "block", fontSize: "0.64rem", color: "#999", marginTop: 2 }}>({game.reason})</span>}
        </div>
      )}

      {!isPlayed && stats.length === 0 && (
        <div style={{ textAlign: "center", padding: "12px 0", color: "#ccc", fontSize: "0.78rem" }}>Waiting to be played</div>
      )}
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
          {badge && (
            <span className="vtd-tl-badge" style={{ background: status === "active" ? "#dbeafe" : "#fef3c7", color: status === "active" ? "#1d4ed8" : "#92400e" }}>{badge}</span>
          )}
        </div>
        <div className="vtd-tl-date">{formatDate(date)} · {formatTime(date)}</div>
      </div>
    </div>
  );
}