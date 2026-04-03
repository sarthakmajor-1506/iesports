"use client";

import { useAuth } from "../../context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { navigateWithAppPriority } from "@/app/lib/mobileAuth";
import { Navbar } from "../../components/Navbar";
import RegisterModal from "../../components/RegisterModal";
import Link from "next/link";

const TABS = ["Overview", "Rules", "Matches", "Participants", "Streams"] as const;
type Tab = typeof TABS[number];

export default function TournamentPage() {
  const { user, loading, steamLinked, dotaProfile } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [tournament, setTournament] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [showRegister, setShowRegister] = useState(false);
  const [tLoading, setTLoading] = useState(true);
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/");
    if (!loading && user && !steamLinked) router.push("/connect-steam");
  }, [user, loading, steamLinked, router]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "tournaments", id), (snap) => {
      if (snap.exists()) setTournament({ id: snap.id, ...snap.data() });
      setTLoading(false);
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!user) return;
    const checkReg = async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      const data = snap.data();
      setIsRegistered((data?.registeredTournaments || []).includes(id));
    };
    checkReg();
    window.addEventListener("focus", checkReg);
    return () => window.removeEventListener("focus", checkReg);
  }, [user, id]);

  if (loading || tLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0A0A0C", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, border: "3px solid #2A2A30", borderTopColor: "#3B82F6", borderRadius: "50%", animation: "tp-spin 0.8s linear infinite" }} />
          <span style={{ color: "#555550", fontSize: "0.85rem" }}>Loading tournament…</span>
        </div>
        <style>{`@keyframes tp-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div style={{ minHeight: "100vh", background: "#0A0A0C", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, fontFamily: "system-ui, sans-serif" }}>
        <span style={{ fontSize: 40 }}>🎮</span>
        <p style={{ color: "#8A8880", fontSize: "1rem", fontWeight: 600 }}>Tournament not found.</p>
        <button onClick={() => router.push("/dota2")} style={{ background: "#3B82F6", color: "#fff", border: "none", borderRadius: 100, padding: "10px 24px", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}>
          ← Back to Tournaments
        </button>
      </div>
    );
  }

  const isEnded = tournament.status === "ended";
  const isOngoing = tournament.status === "ongoing";
  const slotsLeft = tournament.totalSlots - tournament.slotsBooked;
  const pct = Math.round((tournament.slotsBooked / tournament.totalSlots) * 100);
  const fillColor = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e";

  const statusBadge = isEnded
    ? { label: "Ended",    bg: "#1a1a1f", color: "#555550",    border: "#2A2A30" }
    : isOngoing
    ? { label: "🟢 Live",  bg: "rgba(22,163,74,0.12)", color: "#4ade80", border: "rgba(34,197,94,0.3)" }
    : { label: "Upcoming", bg: "rgba(59,130,246,0.12)", color: "#60A5FA", border: "rgba(59,130,246,0.3)" };

  return (
    <>
      <style>{`
        @keyframes tp-spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        .tp-page { min-height: 100vh; background: #0A0A0C; font-family: var(--font-geist-sans), system-ui, sans-serif; color: #F0EEEA; }

        .tp-hero { background: #121215; border-bottom: 1px solid #2A2A30; }
        .tp-hero-inner { max-width: 1100px; margin: 0 auto; padding: 28px 30px 24px; }
        .tp-breadcrumb { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; }
        .tp-back-btn { display: flex; align-items: center; gap: 6px; background: #18181C; border: 1px solid #2A2A30; border-radius: 100px; padding: 6px 14px; color: #8A8880; font-size: 0.8rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.15s; }
        .tp-back-btn:hover { background: #1a1a1f; color: #F0EEEA; }
        .tp-breadcrumb-sep { color: #2A2A30; font-size: 0.8rem; }
        .tp-breadcrumb-cur { color: #555550; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }

        .tp-hero-grid { display: grid; grid-template-columns: 1fr auto; gap: 32px; align-items: start; }
        @media (max-width: 700px) { .tp-hero-grid { grid-template-columns: 1fr; } }

        .tp-hero-badges { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
        .tp-status-badge { font-size: 0.68rem; font-weight: 800; padding: 4px 12px; border-radius: 100px; }
        .tp-game-badge { display: flex; align-items: center; gap: 5px; font-size: 0.72rem; font-weight: 700; color: #8A8880; background: #18181C; border: 1px solid #2A2A30; border-radius: 100px; padding: 3px 10px; }
        .tp-game-badge img { width: 14px; height: 14px; object-fit: contain; }

        .tp-hero-title { font-size: 1.6rem; font-weight: 900; color: #F0EEEA; margin-bottom: 6px; line-height: 1.2; }
        .tp-hero-desc { color: #8A8880; font-size: 0.88rem; margin-bottom: 20px; line-height: 1.5; }

        .tp-meta-row { display: flex; gap: 0; flex-wrap: wrap; }
        .tp-meta-item { display: flex; flex-direction: column; padding: 0 20px 0 0; margin-right: 20px; border-right: 1px solid #2A2A30; }
        .tp-meta-item:last-child { border-right: none; }
        .tp-meta-key { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #555550; margin-bottom: 3px; }
        .tp-meta-val { font-size: 0.85rem; font-weight: 700; color: #e0e0da; }

        .tp-panel { background: #18181C; border: 1px solid #2A2A30; border-radius: 14px; padding: 20px; min-width: 220px; display: flex; flex-direction: column; gap: 16px; }
        .tp-prize-label { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #555550; margin-bottom: 4px; }
        .tp-prize-amount { font-size: 2rem; font-weight: 900; color: #3B82F6; line-height: 1; }
        .tp-slots-text { font-size: 0.75rem; color: #8A8880; display: flex; justify-content: space-between; margin-bottom: 5px; }
        .tp-slots-text strong { color: #F0EEEA; font-weight: 800; }
        .tp-slots-bar { height: 5px; background: #2A2A30; border-radius: 3px; overflow: hidden; }
        .tp-slots-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
        .tp-reg-btn { width: 100%; padding: 13px; background: #3B82F6; color: #fff; border: none; border-radius: 100px; font-size: 0.9rem; font-weight: 800; cursor: pointer; font-family: inherit; transition: background 0.15s; box-shadow: 0 2px 12px rgba(59,130,246,0.25); }
        .tp-reg-btn:hover { background: #2563EB; }
        .tp-reg-done { width: 100%; padding: 13px; background: rgba(22,163,74,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); border-radius: 100px; font-size: 0.9rem; font-weight: 800; text-align: center; }

        .tp-overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .tp-brackets { max-width: 1100px; margin: 0 auto; padding: 16px 30px 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        @media (max-width: 800px) { .tp-brackets { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 500px) { .tp-brackets { grid-template-columns: 1fr 1fr; } }
        .tp-bracket-card { background: #121215; border: 1px solid #2A2A30; border-radius: 10px; padding: 12px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
        .tp-bracket-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
        .tp-bracket-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .tp-bracket-name { font-size: 0.72rem; font-weight: 700; color: #8A8880; }
        .tp-bracket-slots { font-size: 1.1rem; font-weight: 800; color: #F0EEEA; }
        .tp-bracket-slots span { color: #555550; font-size: 0.75rem; font-weight: 400; }
        .tp-bracket-bar { height: 3px; background: #1e1e22; border-radius: 2px; overflow: hidden; margin-top: 6px; }

        .tp-tabs-wrap { max-width: 1100px; margin: 0 auto; padding: 20px 30px 0; }
        .tp-tabs { display: flex; gap: 0; border-bottom: 1px solid #2A2A30; margin-bottom: 24px; overflow-x: auto; }
        .tp-tab { padding: 10px 18px; background: transparent; border: none; font-size: 0.86rem; font-weight: 600; color: #8A8880; cursor: pointer; font-family: inherit; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.15s; white-space: nowrap; }
        .tp-tab.active { color: #3B82F6; border-bottom-color: #3B82F6; font-weight: 800; }
        .tp-tab:hover:not(.active) { color: #ccc; }

        .tp-tab-content { padding-bottom: 48px; }

        .tp-card { background: #121215; border: 1px solid #2A2A30; border-radius: 12px; padding: 22px; box-shadow: 0 1px 4px rgba(0,0,0,0.2); }
        .tp-card-label { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #555550; margin-bottom: 16px; display: block; }
        .tp-row { display: flex; justify-content: space-between; align-items: center; padding: 11px 0; border-bottom: 1px solid #1e1e22; }
        .tp-row:last-child { border-bottom: none; }
        .tp-row-key { font-size: 0.84rem; color: #8A8880; }
        .tp-row-val { font-size: 0.84rem; font-weight: 700; color: #e0e0da; }

        .tp-prize-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #1e1e22; }
        .tp-prize-row:last-child { border-bottom: none; }
        .tp-prize-place { font-size: 0.9rem; color: #ccc; }
        .tp-prize-val { font-size: 0.95rem; font-weight: 800; }

        .tp-rule { display: flex; gap: 14px; padding: 12px 0; border-bottom: 1px solid #1e1e22; }
        .tp-rule:last-child { border-bottom: none; }
        .tp-rule-num { color: #3B82F6; font-weight: 800; font-size: 0.85rem; min-width: 22px; }
        .tp-rule-text { color: #8A8880; font-size: 0.85rem; line-height: 1.6; }

        .tp-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64px 0; gap: 10px; }
        .tp-empty-icon { font-size: 2.5rem; }
        .tp-empty-title { font-size: 1rem; font-weight: 800; color: #e0e0da; }
        .tp-empty-sub { font-size: 0.82rem; color: #555550; }

        @media (max-width: 700px) {
          .tp-hero-inner { padding: 20px 16px; }
          .tp-hero-title { font-size: 1.3rem; }
          .tp-hero-desc { font-size: 0.82rem; margin-bottom: 14px; }
          .tp-meta-item { padding: 0 12px 0 0; margin-right: 12px; }
          .tp-meta-key { font-size: 0.56rem; }
          .tp-meta-val { font-size: 0.78rem; }
          .tp-panel { min-width: unset; }
          .tp-tabs-wrap { padding: 16px 16px 0; }
          .tp-tab { padding: 8px 14px; font-size: 0.8rem; }
          .tp-brackets { padding: 12px 16px 0; }
          .tp-overview-grid { grid-template-columns: 1fr; }
          .tp-card { padding: 16px; }
        }
        @media (max-width: 480px) {
          .tp-hero-inner { padding: 16px 12px; }
          .tp-hero-title { font-size: 1.15rem; }
          .tp-meta-item { padding: 0 10px 8px 0; margin-right: 10px; }
          .tp-tab { padding: 7px 12px; font-size: 0.76rem; }
          .tp-brackets { padding: 10px 12px 0; gap: 8px; }
          .tp-breadcrumb-cur { max-width: 160px; }
        }
      `}</style>

      <div className="tp-page">
        <Navbar />

        <div className="tp-hero">
          <div className="tp-hero-inner">
            <div className="tp-breadcrumb">
              <button className="tp-back-btn" onClick={() => router.push("/dota2")}>← Tournaments</button>
              <span className="tp-breadcrumb-sep">›</span>
              <span className="tp-breadcrumb-cur">{tournament.name}</span>
            </div>

            <div className="tp-hero-grid">
              <div>
                <div className="tp-hero-badges">
                  <span className="tp-status-badge" style={{ background: statusBadge.bg, color: statusBadge.color, border: `1px solid ${statusBadge.border}` }}>
                    {statusBadge.label}
                  </span>
                  {isRegistered && !isEnded && (
                    <span className="tp-status-badge" style={{ background: "rgba(22,163,74,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }}>✓ Registered</span>
                  )}
                  <span className="tp-game-badge">
                    <img src="https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png" alt="Dota 2" />
                    Dota 2
                  </span>
                  {tournament.month && (
                    <span style={{ fontSize: "0.72rem", color: "#555550", fontWeight: 600 }}>{tournament.month}</span>
                  )}
                </div>

                <h1 className="tp-hero-title">{tournament.name}</h1>
                {tournament.desc && <p className="tp-hero-desc">{tournament.desc}</p>}

                <div className="tp-meta-row">
                  {[
                    { key: "Start Date",    val: tournament.startDate },
                    { key: "End Date",      val: tournament.endDate },
                    { key: "Reg. Deadline", val: tournament.registrationDeadline },
                    { key: "Entry",         val: tournament.entry },
                  ].map(item => (
                    <div key={item.key} className="tp-meta-item">
                      <span className="tp-meta-key">{item.key}</span>
                      <span className="tp-meta-val">{item.val}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="tp-panel">
                <div>
                  <div className="tp-prize-label">Prize Pool</div>
                  <div className="tp-prize-amount">{tournament.prizePool}</div>
                </div>
                <div>
                  <div className="tp-slots-text">
                    <span><strong>{slotsLeft}</strong> slots left</span>
                    <span>{tournament.slotsBooked} / {tournament.totalSlots} filled</span>
                  </div>
                  <div className="tp-slots-bar">
                    <div className="tp-slots-fill" style={{ width: `${pct}%`, background: fillColor }} />
                  </div>
                </div>
                {!isEnded && (
                  isRegistered ? (
                    <div className="tp-reg-done">✓ You're Registered</div>
                  ) : (
                    <button className="tp-reg-btn" onClick={() => {
                      if (!steamLinked) navigateWithAppPriority(`/api/auth/steam?uid=${user?.uid}`);
                      else setShowRegister(true);
                    }}>
                      Register for Free →
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        {tournament.brackets && (
          <div className="tp-brackets">
            {Object.entries(tournament.brackets).map(([key, val]: any) => {
              const labels: Record<string, { name: string; color: string }> = {
                herald_guardian:  { name: "Herald – Guardian", color: "#6b7280" },
                crusader_archon:  { name: "Crusader – Archon", color: "#3b82f6" },
                legend_ancient:   { name: "Legend – Ancient",  color: "#a855f7" },
                divine_immortal:  { name: "Divine – Immortal", color: "#f59e0b" },
              };
              const b = labels[key] || { name: key, color: "#3B82F6" };
              const bPct = Math.round((val.slotsBooked / val.slotsTotal) * 100);
              return (
                <div key={key} className="tp-bracket-card">
                  <div className="tp-bracket-header">
                    <div className="tp-bracket-dot" style={{ background: b.color }} />
                    <span className="tp-bracket-name">{b.name}</span>
                  </div>
                  <div className="tp-bracket-slots">
                    {val.slotsTotal - val.slotsBooked}<span> / {val.slotsTotal} left</span>
                  </div>
                  <div className="tp-bracket-bar">
                    <div style={{ height: "100%", width: `${bPct}%`, background: b.color, borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="tp-tabs-wrap">
          <div className="tp-tabs">
            {TABS.map(tab => (
              <button key={tab} className={`tp-tab${activeTab === tab ? " active" : ""}`} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
          </div>

          <div className="tp-tab-content">
            {activeTab === "Overview" && (
              <div className="tp-overview-grid">
                <div className="tp-card">
                  <span className="tp-card-label">Tournament Format</span>
                  {[
                    { key: "Game",        val: "Dota 2" },
                    { key: "Format",      val: "5v5 Single Elimination" },
                    { key: "Brackets",    val: "4 rank-based brackets" },
                    { key: "Min Players", val: "40 to run tournament" },
                    { key: "Team Size",   val: "5 players per team" },
                  ].map(item => (
                    <div key={item.key} className="tp-row">
                      <span className="tp-row-key">{item.key}</span>
                      <span className="tp-row-val">{item.val}</span>
                    </div>
                  ))}
                </div>
                <div className="tp-card">
                  <span className="tp-card-label">Prize Distribution</span>
                  {[
                    { place: "🥇 1st Place", prize: "50%", color: "#f59e0b" },
                    { place: "🥈 2nd Place", prize: "30%", color: "#6b7280" },
                    { place: "🥉 3rd Place", prize: "20%", color: "#b45309" },
                  ].map(item => (
                    <div key={item.place} className="tp-prize-row">
                      <span className="tp-prize-place">{item.place}</span>
                      <span className="tp-prize-val" style={{ color: item.color }}>{item.prize} of {tournament.prizePool}</span>
                    </div>
                  ))}
                  <p style={{ color: "#555550", fontSize: "0.75rem", marginTop: 14, lineHeight: 1.5 }}>
                    Prizes paid via UPI within 48 hours of tournament end.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "Rules" && (
              <div className="tp-card" style={{ maxWidth: 680 }}>
                <span className="tp-card-label">Tournament Rules</span>
                {(tournament.rules || []).map((rule: string, i: number) => (
                  <div key={i} className="tp-rule">
                    <span className="tp-rule-num">{i + 1}.</span>
                    <span className="tp-rule-text">{rule}</span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "Matches" && (
              <div className="tp-empty">
                <span className="tp-empty-icon">🗓️</span>
                <span className="tp-empty-title">Matches Not Started</span>
                <span className="tp-empty-sub">Schedule will be published after registration closes.</span>
              </div>
            )}

            {activeTab === "Participants" && (
              <div className="tp-empty">
                <span className="tp-empty-icon">👥</span>
                <span className="tp-empty-title">{tournament.slotsBooked} Players Registered</span>
                <span className="tp-empty-sub">Full participant list visible after registration closes.</span>
              </div>
            )}

            {activeTab === "Streams" && (
              <div className="tp-empty">
                <span className="tp-empty-icon">📺</span>
                <span className="tp-empty-title">No Streams Yet</span>
                <span className="tp-empty-sub">Stream links will be added closer to the tournament date.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {showRegister && user && (
        <RegisterModal
          tournament={tournament}
          user={user}
          dotaProfile={dotaProfile}
          onClose={() => setShowRegister(false)}
          onSuccess={() => setIsRegistered(true)}
        />
      )}
    </>
  );
}