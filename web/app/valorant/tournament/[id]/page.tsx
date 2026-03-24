"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot, collection, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/app/context/AuthContext";
import Navbar from "@/app/components/Navbar";
import RegisterModal from "@/app/components/RegisterModal";

type Tab = "overview" | "players" | "teams" | "standings" | "matches" | "leaderboard";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "overview",  label: "Overview",  icon: "📋" },
  { key: "players",   label: "Players",   icon: "👤" },
  { key: "teams",     label: "Teams",     icon: "👥" },
  { key: "standings", label: "Standings", icon: "🏆" },
  { key: "matches",   label: "Matches",   icon: "⚔️" },
  { key: "leaderboard", label: "Leaderboard", icon: "🏅" },
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
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hrs}h left`;
  if (hrs > 0) return `${hrs}h ${mins}m left`;
  return `${mins}m left`;
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

  // Live data
  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);

  // Tournament doc listener
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "valorantTournaments", id), (snap) => {
      if (snap.exists()) {
        setTournament({ id: snap.id, ...snap.data() });
      }
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
  
  
  // Players listener
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      collection(db, "valorantTournaments", id, "soloPlayers"),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPlayers(list);
        if (user) {
          setIsRegistered(list.some((p: any) => p.uid === user.uid));
        }
      }
    );
    return () => unsub();
  }, [id, user]);

  // Teams listener
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      query(collection(db, "valorantTournaments", id, "teams"), orderBy("teamIndex")),
      (snap) => setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [id]);

  // Standings listener
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

  // Matches listener
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

  // Countdown timer
  useEffect(() => {
    if (!tournament) return;
    const tick = () => setCountdown(getTimeUntilDeadline(tournament.registrationDeadline));
    tick();
    const i = setInterval(tick, 60000);
    return () => clearInterval(i);
  }, [tournament]);

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
        .vtd-empty-title { font-size: 0.95rem; font-weight: 700; color: #888; margin-bottom: 4px; }
        .vtd-empty-sub { font-size: 0.82rem; color: #bbb; }
        .vtd-player-card { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #fff; border: 1px solid #E5E3DF; border-radius: 10px; margin-bottom: 6px; }
        .vtd-player-avatar { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; background: #F2F1EE; }
        .vtd-player-name { font-size: 0.88rem; font-weight: 700; color: #111; }
        .vtd-player-rank { font-size: 0.72rem; color: #888; }
        .vtd-player-skill { font-size: 0.62rem; font-weight: 800; padding: 2px 8px; border-radius: 100px; }
        .vtd-team-card { background: #fff; border: 1px solid #E5E3DF; border-radius: 14px; padding: 16px 20px; margin-bottom: 12px; }
        .vtd-team-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .vtd-team-name { font-size: 1rem; font-weight: 800; color: #111; }
        .vtd-team-avg { font-size: 0.72rem; color: #888; background: #F8F7F4; padding: 3px 10px; border-radius: 100px; border: 1px solid #E5E3DF; }
        .vtd-team-members { display: flex; flex-direction: column; gap: 4px; }
        .vtd-team-member { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
        .vtd-standings-table { width: 100%; border-collapse: collapse; }
        .vtd-standings-table th { font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #999; padding: 8px 12px; text-align: left; border-bottom: 1px solid #E5E3DF; }
        .vtd-standings-table td { font-size: 0.84rem; padding: 10px 12px; border-bottom: 1px solid #F2F1EE; color: #333; }
        .vtd-standings-table tr:last-child td { border-bottom: none; }
        .vtd-match-card { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #fff; border: 1px solid #E5E3DF; border-radius: 10px; margin-bottom: 6px; }
        .vtd-match-team { font-size: 0.88rem; font-weight: 700; color: #111; flex: 1; }
        .vtd-match-team.right { text-align: right; }
        .vtd-match-score { font-size: 1.1rem; font-weight: 900; color: #111; min-width: 60px; text-align: center; }
        .vtd-match-score .win { color: #16a34a; }
        .vtd-match-score .loss { color: #dc2626; }
        .vtd-match-status { font-size: 0.62rem; font-weight: 800; padding: 2px 8px; border-radius: 100px; text-align: center; }
        .vtd-match-day-label { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin: 20px 0 8px; }
        .vtd-lobby-info { margin-top: 6px; padding: 6px 10px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; font-size: 0.72rem; color: #92400e; }
        .vtd-overview-grid { display: grid; grid-template-columns: 1fr 320px; gap: 20px; }
        @media (max-width: 800px) {
          .vtd-hero-content { padding: 0 16px; padding-bottom: 16px; }
          .vtd-hero-title { font-size: 1.2rem; }
          .vtd-content { padding: 0 16px 40px; }
          .vtd-overview-grid { grid-template-columns: 1fr; }
          .vtd-stat-row { gap: 8px; }
          .vtd-stat { min-width: 80px; padding: 10px; }
          .vtd-match-card { flex-wrap: wrap; gap: 4px; }
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
          {/* Registration bar */}
          <div className="vtd-reg-bar">
            <div className="vtd-reg-info">
              <div className="vtd-reg-slots">{slotsLeft} slots left</div>
              <div className="vtd-reg-countdown">{countdown}</div>
            </div>
            {canRegister && (
              <button className="vtd-reg-btn" onClick={() => setShowRegister(true)}>Register →</button>
            )}
            {isRegistered && <div className="vtd-reg-done">✓ Registered</div>}
            {regClosed && !isRegistered && (
              <span style={{ fontSize: "0.82rem", color: "#999" }}>Registration closed</span>
            )}
          </div>

          {/* Tabs */}
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
                {/* Stats pills */}
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

                {/* About */}
                <div className="vtd-card">
                  <span className="vtd-card-label">About</span>
                  <p style={{ fontSize: "0.88rem", color: "#444", lineHeight: 1.7 }}>{tournament.desc}</p>
                </div>

                {/* Rules */}
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

              {/* Schedule timeline */}
              <div>
                <div className="vtd-card">
                  <span className="vtd-card-label">Schedule</span>
                  <div className="vtd-timeline">
                    {schedule.registrationOpens && (
                      <TimelineItem label="Registration Opens" date={schedule.registrationOpens} status={new Date(schedule.registrationOpens) <= new Date() ? "past" : "future"} />
                    )}
                    {schedule.registrationCloses && (
                      <TimelineItem label="Registration Closes" date={schedule.registrationCloses} status={new Date(schedule.registrationCloses) <= new Date() ? "past" : new Date(schedule.registrationOpens) <= new Date() ? "active" : "future"} />
                    )}
                    {schedule.squadCreation && (
                      <TimelineItem label="Squad Creation" date={schedule.squadCreation} status={new Date(schedule.squadCreation) <= new Date() ? "past" : "future"} />
                    )}
                    {schedule.groupStageStart && (
                      <TimelineItem label="Group Stage Starts" date={schedule.groupStageStart} status={tournament.status === "active" ? "active" : new Date(schedule.groupStageStart) <= new Date() ? "past" : "future"} badge={tournament.status === "active" ? "ACTIVE" : undefined} />
                    )}
                    {schedule.groupStageEnd && (
                      <TimelineItem label="Group Stage Ends" date={schedule.groupStageEnd} status={new Date(schedule.groupStageEnd) <= new Date() ? "past" : "future"} />
                    )}
                    {schedule.tourneyStageStart && (
                      <TimelineItem label="Tournament Stage" date={schedule.tourneyStageStart} status="future" />
                    )}
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
                  players.map((p: any) => (
                    <div key={p.uid} className="vtd-player-card">
                      {p.riotAvatar ? (
                        <img className="vtd-player-avatar" src={p.riotAvatar} alt={p.riotGameName} />
                      ) : (
                        <div className="vtd-player-avatar" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#999" }}>
                          {(p.riotGameName || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div style={{ flex: 1 }}>
                        <div className="vtd-player-name">{p.riotGameName}<span style={{ color: "#999", fontWeight: 400 }}>#{p.riotTagLine}</span></div>
                        <div className="vtd-player-rank">{p.riotRank || "Unranked"}</div>
                      </div>
                      <span className="vtd-player-skill" style={{
                        background: p.skillLevel >= 4 ? "#fef3c7" : p.skillLevel >= 3 ? "#e0e4ff" : "#F2F1EE",
                        color: p.skillLevel >= 4 ? "#92400e" : p.skillLevel >= 3 ? "#4f5fc0" : "#888",
                        border: `1px solid ${p.skillLevel >= 4 ? "#fde68a" : p.skillLevel >= 3 ? "#c7d0ff" : "#E5E3DF"}`,
                      }}>
                        Skill {p.skillLevel || 1}
                      </span>
                    </div>
                  ))
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
                teams.map((team: any) => (
                  <div key={team.id} className="vtd-team-card">
                    <div className="vtd-team-head">
                      <div className="vtd-team-name">{team.teamName}</div>
                      <div className="vtd-team-avg">Avg Skill: {team.avgSkillLevel}</div>
                    </div>
                    <div className="vtd-team-members">
                      {(team.members || []).map((m: any, i: number) => (
                        <div key={m.uid || i} className="vtd-team-member">
                          {m.riotAvatar ? (
                            <img src={m.riotAvatar} alt={m.riotGameName} style={{ width: 28, height: 28, borderRadius: 5, objectFit: "cover" }} />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: 5, background: "#F2F1EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#999" }}>
                              {(m.riotGameName || "?")[0]}
                            </div>
                          )}
                          <span style={{ fontSize: "0.84rem", fontWeight: 600 }}>{m.riotGameName}</span>
                          <span style={{ fontSize: "0.72rem", color: "#999" }}>{m.riotRank}</span>
                          <span style={{ marginLeft: "auto", fontSize: "0.62rem", color: "#999" }}>Skill {m.skillLevel}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
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
                        <th>#</th>
                        <th>Team</th>
                        <th>P</th>
                        <th>W</th>
                        <th>D</th>
                        <th>L</th>
                        <th style={{ color: "#ff4655" }}>Pts</th>
                        <th>BH</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((s: any, i: number) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 800, color: i < 6 ? "#ff4655" : "#bbb" }}>{i + 1}</td>
                          <td style={{ fontWeight: 700 }}>{s.teamName}</td>
                          <td>{s.played || 0}</td>
                          <td>{s.wins || 0}</td>
                          <td>{s.draws || 0}</td>
                          <td>{s.losses || 0}</td>
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

          {/* ═══════ MATCHES TAB ═══════ */}
          {activeTab === "matches" && (
            <div>
              {matches.length === 0 ? (
                <div className="vtd-empty">
                  <span className="vtd-empty-icon">⚔️</span>
                  <span className="vtd-empty-title">No matches scheduled</span>
                  <span className="vtd-empty-sub">Matches will appear once pairings are generated.</span>
                </div>
              ) : (
                (() => {
                  const days = [...new Set(matches.map((m: any) => m.matchDay))].sort((a, b) => a - b);
                  return days.map(day => (
                    <div key={day}>
                      <div className="vtd-match-day-label">Day {day}</div>
                      {matches.filter((m: any) => m.matchDay === day).map((m: any) => {
                        const hasGame1 = !!m.game1;
                        const hasGame2 = !!m.game2;
                        const isComplete = m.status === "completed";
                        const isDraw = isComplete && m.team1Score === m.team2Score;

                        return (
                          <div key={m.id} style={{ marginBottom: 12 }}>
                            {/* Series card */}
                            <div className="vtd-match-card" style={isComplete ? { borderColor: "#bbf7d0" } : m.status === "live" ? { borderColor: "#fde68a" } : {}}>
                              <div className="vtd-match-team">
                                <div style={{ fontWeight: 700 }}>{m.team1Name}</div>
                                {m.team1ValorantSide && <div style={{ fontSize: "0.62rem", color: "#999" }}>{m.team1ValorantSide} side</div>}
                              </div>
                              <div className="vtd-match-score">
                                {isComplete ? (
                                  <>
                                    <span className={m.team1Score > m.team2Score ? "win" : m.team1Score < m.team2Score ? "loss" : ""} style={{ fontSize: "1.3rem" }}>{m.team1Score}</span>
                                    <span style={{ color: "#ccc", margin: "0 4px" }}>-</span>
                                    <span className={m.team2Score > m.team1Score ? "win" : m.team2Score < m.team1Score ? "loss" : ""} style={{ fontSize: "1.3rem" }}>{m.team2Score}</span>
                                  </>
                                ) : (
                                  <span className="vtd-match-status" style={{
                                    background: m.status === "live" ? "#dcfce7" : "#F2F1EE",
                                    color: m.status === "live" ? "#16a34a" : "#999",
                                  }}>
                                    {m.status === "live" ? "LIVE" : "BO2"}
                                  </span>
                                )}
                              </div>
                              <div className="vtd-match-team right">
                                <div style={{ fontWeight: 700 }}>{m.team2Name}</div>
                                {m.team2ValorantSide && <div style={{ fontSize: "0.62rem", color: "#999" }}>{m.team2ValorantSide} side</div>}
                              </div>
                            </div>

                            {/* Game details (show if at least one game fetched) */}
                            {(hasGame1 || hasGame2) && (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 4 }}>
                                {/* Game 1 */}
                                <div style={{
                                  padding: "8px 12px", borderRadius: 8,
                                  background: hasGame1 ? "#fff" : "#F8F7F4",
                                  border: `1px solid ${hasGame1 ? "#E5E3DF" : "#F2F1EE"}`,
                                  opacity: hasGame1 ? 1 : 0.5,
                                }}>
                                  <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#ff4655", marginBottom: 4 }}>
                                    GAME 1 {hasGame1 ? `— ${m.game1.mapName}` : "— Pending"}
                                  </div>
                                  {hasGame1 && (
                                    <div style={{ fontSize: "0.78rem", color: "#444" }}>
                                      <span style={{ color: m.game1.winningTeam === "Red" ? "#16a34a" : "#999" }}>Red {m.game1.redRoundsWon}</span>
                                      <span style={{ color: "#ccc" }}> - </span>
                                      <span style={{ color: m.game1.winningTeam === "Blue" ? "#16a34a" : "#999" }}>{m.game1.blueRoundsWon} Blue</span>
                                    </div>
                                  )}
                                </div>
                                {/* Game 2 */}
                                <div style={{
                                  padding: "8px 12px", borderRadius: 8,
                                  background: hasGame2 ? "#fff" : "#F8F7F4",
                                  border: `1px solid ${hasGame2 ? "#E5E3DF" : "#F2F1EE"}`,
                                  opacity: hasGame2 ? 1 : 0.5,
                                }}>
                                  <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#3b82f6", marginBottom: 4 }}>
                                    GAME 2 {hasGame2 ? `— ${m.game2.mapName}` : "— Pending"}
                                  </div>
                                  {hasGame2 && (
                                    <div style={{ fontSize: "0.78rem", color: "#444" }}>
                                      <span style={{ color: m.game2.winningTeam === "Red" ? "#16a34a" : "#999" }}>Red {m.game2.redRoundsWon}</span>
                                      <span style={{ color: "#ccc" }}> - </span>
                                      <span style={{ color: m.game2.winningTeam === "Blue" ? "#16a34a" : "#999" }}>{m.game2.blueRoundsWon} Blue</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Lobby info */}
                            {m.lobbyName && (
                              <div className="vtd-lobby-info">
                                🎮 Lobby: <strong>{m.lobbyName}</strong> {m.lobbyPassword && <>| Password: <strong>{m.lobbyPassword}</strong></>}
                              </div>
                            )}

                            {/* Series result summary */}
                            {isComplete && (
                              <div style={{
                                marginTop: 4, padding: "6px 12px", borderRadius: 6,
                                background: isDraw ? "#fffbeb" : "#f0fdf4",
                                border: `1px solid ${isDraw ? "#fde68a" : "#bbf7d0"}`,
                                fontSize: "0.72rem", fontWeight: 700,
                                color: isDraw ? "#92400e" : "#16a34a",
                                textAlign: "center",
                              }}>
                                {isDraw 
                                  ? `Draw 1-1 — 1 point each`
                                  : `${m.team1Score > m.team2Score ? m.team1Name : m.team2Name} wins ${Math.max(m.team1Score, m.team2Score)}-${Math.min(m.team1Score, m.team2Score)} — 2 points`
                                }
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()
              )}
            </div>
          )}


          {/* ═══════ LEADERBOARD TAB ═══════ */}
          {activeTab === "leaderboard" && (
            <div className="vtd-card">
              <span className="vtd-card-label">Player Leaderboard — MVP Tracker</span>
              {leaderboard.length === 0 ? (
                <div className="vtd-empty">
                  <span className="vtd-empty-icon">🏅</span>
                  <span className="vtd-empty-title">No stats yet</span>
                  <span className="vtd-empty-sub">Player stats will appear once match data is fetched.</span>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="vtd-standings-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Player</th>
                        <th>Agent(s)</th>
                        <th>Maps</th>
                        <th style={{ color: "#16a34a" }}>K</th>
                        <th style={{ color: "#dc2626" }}>D</th>
                        <th>A</th>
                        <th style={{ color: "#ff4655" }}>K/D</th>
                        <th>ACS</th>
                        <th>HS%</th>
                        <th>DMG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((p: any, i: number) => {
                        const acs = Math.round((p.totalScore || 0) / Math.max(1, p.totalRoundsPlayed || 1));
                        return (
                          <tr key={p.id} style={i === 0 ? { background: "#FFFBEB" } : {}}>
                            <td style={{ fontWeight: 800, color: i === 0 ? "#f59e0b" : i < 3 ? "#ff4655" : "#bbb" }}>
                              {i === 0 ? "👑" : i + 1}
                            </td>
                            <td>
                              <div style={{ fontWeight: 700 }}>{p.name}</div>
                              <div style={{ fontSize: "0.68rem", color: "#999" }}>#{p.tag}</div>
                            </td>
                            <td style={{ fontSize: "0.72rem", color: "#888" }}>
                              {(p.agents || []).join(", ")}
                            </td>
                            <td>{p.matchesPlayed || 0}</td>
                            <td style={{ fontWeight: 700, color: "#16a34a" }}>{p.totalKills || 0}</td>
                            <td style={{ color: "#dc2626" }}>{p.totalDeaths || 0}</td>
                            <td>{p.totalAssists || 0}</td>
                            <td style={{ fontWeight: 800, color: (p.kd || 0) >= 1.0 ? "#16a34a" : "#dc2626" }}>
                              {p.kd || 0}
                            </td>
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
        <RegisterModal
          tournament={tournament}
          user={user}
          dotaProfile={null}
          game="valorant"
          onClose={() => setShowRegister(false)}
          onSuccess={() => setIsRegistered(true)}
        />
      )}
    </>
  );
}

// Timeline helper component
function TimelineItem({ label, date, status, badge }: { label: string; date: string; status: "past" | "active" | "future"; badge?: string }) {
  return (
    <div className="vtd-tl-item">
      <div className={`vtd-tl-dot ${status}`} />
      <div>
        <div className="vtd-tl-label">
          {label}
          {badge && (
            <span className="vtd-tl-badge" style={{ background: status === "active" ? "#dbeafe" : "#fef3c7", color: status === "active" ? "#1d4ed8" : "#92400e" }}>
              {badge}
            </span>
          )}
        </div>
        <div className="vtd-tl-date">{formatDate(date)} · {formatTime(date)}</div>
      </div>
    </div>
  );
}
