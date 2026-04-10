"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { ValorantTournament } from "@/lib/types";

export default function ValorantTournaments() {
  const { registeredValorantTournaments: registeredIds, refreshUser } = useAuth();
  const router = useRouter();
  const [tournaments, setTournaments] = useState<ValorantTournament[]>([]);
  const [tLoading, setTLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tournaments/list?game=valorant")
      .then(r => r.json())
      .then(data => {
        setTournaments(data.tournaments || []);
        setTLoading(false);
      })
      .catch(() => setTLoading(false));
  }, []);

  useEffect(() => {
    const onFocus = () => { refreshUser(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshUser]);

  const totalSlotsRemaining = tournaments.reduce((acc, t) => acc + (t.totalSlots - t.slotsBooked), 0);

  const ordinal = (d: number) => { const s = ["th","st","nd","rd"]; const v = d % 100; return d + (s[(v - 20) % 10] || s[v] || s[0]); };
  const formatDate = (iso: string) => {
    try { const d = new Date(iso); const day = parseInt(d.toLocaleDateString("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" })); const month = d.toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" }); const year = d.toLocaleDateString("en-IN", { year: "numeric", timeZone: "Asia/Kolkata" }); return `${ordinal(day)} ${month} ${year}`; } catch { return iso; }
  };

  const isEffectivelyEnded = (t: ValorantTournament) => t.status === "ended" || (t.endDate && new Date() > new Date(t.endDate));

  const getRegistrationState = (t: ValorantTournament): "open" | "not_yet" | "closed" => {
    const now = new Date();
    const deadline = new Date(t.registrationDeadline);
    if (now > deadline) return "closed";
    if (t.schedule?.registrationOpens && now < new Date(t.schedule.registrationOpens)) return "not_yet";
    return "open";
  };

  if (tLoading) return (
    <>
      <style>{`
        @keyframes vt-sk-pulse { 0%,100%{background-position:-200% 0} 50%{background-position:200% 0} }
        .vt-sk { background: linear-gradient(90deg,rgba(60,203,255,0.04) 0%,rgba(60,203,255,0.1) 40%,rgba(60,203,255,0.04) 80%); background-size:200% 100%; animation: vt-sk-pulse 1.8s ease-in-out infinite; border-radius:16px; }
      `}</style>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 30px 48px" }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          {[120, 100, 140].map((w, i) => <div key={i} className="vt-sk" style={{ width: w, height: 38, borderRadius: 100 }} />)}
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="vt-sk" style={{ height: 88, marginBottom: 10 }} />
        ))}
      </div>
    </>
  );

  return (
    <>
      <style>{`
        @keyframes vt-card-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }

        .vt-wrap { max-width: 1100px; margin: 0 auto; padding: 20px 30px 56px; }

        .vt-stats { display: flex; gap: 10px; margin-bottom: 22px; flex-wrap: wrap; }
        .vt-stat-pill { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 100px; padding: 6px 16px; }
        .vt-stat-num { font-size: 1rem; font-weight: 800; color: #F0EEEA; }
        .vt-stat-num.red { color: #3CCBFF; }
        .vt-stat-num.green { color: #4ade80; }
        .vt-stat-num.blue { color: #60A5FA; }
        .vt-stat-label { font-size: 0.75rem; color: rgba(255,255,255,0.45); font-weight: 500; }
        .vt-stat-divider { width: 1px; height: 16px; background: rgba(255,255,255,0.1); }

        .vt-section-label { font-size: 0.66rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 12px; margin-top: 8px; }

        .vt-card {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px;
          overflow: hidden; display: flex; align-items: stretch; cursor: pointer;
          transition: all 0.25s ease; margin-bottom: 10px; backdrop-filter: blur(8px);
          animation: vt-card-up 0.35s ease both;
        }
        .vt-card:hover { transform: translateY(-3px); box-shadow: 0 8px 30px rgba(60,203,255,0.15); border-color: rgba(60,203,255,0.3); }
        .vt-card.ended { opacity: 0.9; border-color: rgba(255,215,0,0.15); background: rgba(255,215,0,0.03); }
        .vt-card.ended:hover { box-shadow: 0 8px 30px rgba(255,215,0,0.12); border-color: rgba(255,215,0,0.3); }
        .vt-card.registered { border-color: rgba(34,197,94,0.35); background: rgba(22,163,74,0.07); }
        .vt-card.registered:hover { box-shadow: 0 8px 30px rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.5); }

        .vt-card-accent { width: 4px; flex-shrink: 0; }
        .vt-card-body { flex: 1; display: flex; align-items: center; gap: 18px; padding: 16px 20px; }
        .vt-card-icon { width: 46px; height: 46px; border-radius: 12px; overflow: hidden; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.08); }
        .vt-card-icon img { width: 100%; height: 100%; object-fit: cover; }
        .vt-card-info { flex: 1; min-width: 0; }
        .vt-card-name { font-size: 1rem; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vt-card-meta { display: flex; gap: 16px; margin-top: 6px; flex-wrap: wrap; align-items: center; }
        .vt-meta-item { display: flex; flex-direction: column; }
        .vt-meta-key { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.35); }
        .vt-meta-val { font-size: 0.8rem; font-weight: 700; color: rgba(255,255,255,0.8); }
        .vt-meta-val.prize { color: #3CCBFF; }
        .vt-meta-val.green { color: #4ade80; }
        .vt-card-chip { font-size: 0.68rem; font-weight: 600; color: rgba(255,255,255,0.45); background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 100px; padding: 2px 10px; white-space: nowrap; }

        .vt-badge-auction { font-size: 0.62rem; font-weight: 800; color: #3CCBFF; background: rgba(60,203,255,0.1); border: 1px solid rgba(60,203,255,0.25); border-radius: 100px; padding: 2px 10px; white-space: nowrap; }
        .vt-badge-daily { font-size: 0.62rem; font-weight: 800; color: rgba(255,255,255,0.4); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 100px; padding: 2px 10px; white-space: nowrap; }

        .vt-card-right { display: flex; align-items: center; gap: 14px; padding-right: 20px; flex-shrink: 0; }
        .vt-slots { min-width: 100px; display: flex; flex-direction: column; gap: 5px; }
        .vt-slots-text { font-size: 0.72rem; color: rgba(255,255,255,0.5); text-align: right; }
        .vt-slots-text strong { color: #F0EEEA; font-weight: 800; }
        .vt-slots-bar { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
        .vt-slots-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }

        .vt-reg-btn { padding: 9px 22px; background: #3CCBFF; color: #fff; border: none; border-radius: 100px; font-size: 0.78rem; font-weight: 800; cursor: pointer; transition: all 0.15s; white-space: nowrap; min-width: 130px; text-align: center; }
        .vt-reg-btn:hover { background: #30B5E6; box-shadow: 0 0 20px rgba(60,203,255,0.4); transform: translateY(-1px); }

        .vt-leaderboard-btn { padding: 9px 22px; background: rgba(96,165,250,0.12); color: #60A5FA; border: 1px solid rgba(96,165,250,0.3); border-radius: 100px; font-size: 0.78rem; font-weight: 800; cursor: pointer; transition: all 0.15s; white-space: nowrap; min-width: 130px; text-align: center; }
        .vt-leaderboard-btn:hover { background: rgba(96,165,250,0.2); box-shadow: 0 0 16px rgba(96,165,250,0.25); transform: translateY(-1px); }

        .vt-reg-done { padding: 8px 16px; background: rgba(22,163,74,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); border-radius: 100px; font-size: 0.72rem; font-weight: 800; white-space: nowrap; min-width: 130px; text-align: center; }

        .vt-coming-soon { padding: 8px 16px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 100px; text-align: center; white-space: nowrap; min-width: 130px; }
        .vt-coming-soon-label { font-size: 0.7rem; font-weight: 800; color: rgba(255,255,255,0.4); }
        .vt-coming-soon-date { font-size: 0.6rem; color: rgba(255,255,255,0.25); margin-top: 2px; }

        .vt-empty { text-align: center; padding: 70px 20px; color: #555550; }
        .vt-empty-icon { font-size: 44px; margin-bottom: 12px; }
        .vt-empty-text { font-size: 0.9rem; color: rgba(255,255,255,0.3); }

        @media (max-width: 700px) {
          .vt-card-body { gap: 12px; padding: 14px 14px; }
          .vt-card-right { padding-right: 14px; gap: 10px; }
          .vt-card-icon { width: 38px; height: 38px; }
          .vt-reg-btn { padding: 7px 14px; font-size: 0.72rem; min-width: 110px; }
          .vt-meta-item { display: none; }
          .vt-card-meta { gap: 6px; }
          .vt-card-meta .vt-meta-item:nth-child(-n+3) { display: flex; }
        }
        @media (max-width: 500px) {
          .vt-wrap { padding: 16px 14px 44px; }
          .vt-stats { gap: 8px; justify-content: center; }
          .vt-stat-pill { padding: 6px 14px; }
          .vt-section-label { font-size: 0.62rem; margin-bottom: 14px; margin-top: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); }
          .vt-card { flex-direction: column; border-radius: 14px; margin-bottom: 14px; }
          .vt-card-accent { width: 100%; height: 3px; border-radius: 14px 14px 0 0; }
          .vt-card-body { padding: 16px 16px 12px; gap: 12px; }
          .vt-card-icon { width: 40px; height: 40px; border-radius: 10px; }
          .vt-card-name { white-space: normal; font-size: 0.95rem; line-height: 1.3; }
          .vt-card-meta { gap: 0; margin-top: 10px; display: grid; grid-template-columns: repeat(3, 1fr); row-gap: 8px; }
          .vt-card-meta .vt-meta-item { display: flex; }
          .vt-meta-key { font-size: 0.56rem; }
          .vt-meta-val { font-size: 0.76rem; }
          .vt-card-right { padding: 0 16px 16px; flex-direction: column; gap: 10px; width: 100%; box-sizing: border-box; }
          .vt-slots { min-width: unset; width: 100%; }
          .vt-slots-text { text-align: left; font-size: 0.74rem; }
          .vt-slots-bar { height: 5px; border-radius: 3px; }
          .vt-reg-btn, .vt-reg-done, .vt-coming-soon, .vt-leaderboard-btn { min-width: unset; width: 100%; padding: 10px 16px; font-size: 0.8rem; }
        }
      `}</style>

      <div className="vt-wrap">
        <div className="vt-stats">
          <div className="vt-stat-pill"><span className="vt-stat-num red">{tournaments.length}</span><div className="vt-stat-divider" /><span className="vt-stat-label">Tournaments</span></div>
          <div className="vt-stat-pill"><span className="vt-stat-num green">{totalSlotsRemaining}</span><div className="vt-stat-divider" /><span className="vt-stat-label">Slots Open</span></div>
          <div className="vt-stat-pill"><span className="vt-stat-num blue">Free</span><div className="vt-stat-divider" /><span className="vt-stat-label">Entry</span></div>
        </div>

        {tournaments.length === 0 ? (
          <div className="vt-empty"><div className="vt-empty-icon">🎯</div><p className="vt-empty-text">No Valorant tournaments yet. Check back soon!</p></div>
        ) : (
          <>
            {tournaments.filter(t => !isEffectivelyEnded(t)).length > 0 && (
              <>
                <div className="vt-section-label">Upcoming & Active</div>
                {tournaments.filter(t => !isEffectivelyEnded(t)).map((t) => {
                  const slotsLeft = t.totalSlots - t.slotsBooked;
                  const isRegistered = registeredIds.has(t.id);
                  const regState = getRegistrationState(t);
                  const now = new Date();
                  const isActive = now >= new Date(t.startDate) && now <= new Date(t.endDate);
                  return (
                    <div key={t.id} className={`vt-card${isRegistered ? " registered" : ""}`} style={{ animationDelay: `${0.05 * tournaments.indexOf(t)}s`, position: "relative" }} onClick={() => router.push(`/valorant/tournament/${t.id}`)}>
                      {t.bannerImage && (
                        <>
                          <img src={t.bannerImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.08, borderRadius: 16, pointerEvents: "none" }} />
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(10,15,42,0.85) 0%, rgba(10,15,42,0.5) 50%, rgba(10,15,42,0.85) 100%)", borderRadius: 16, pointerEvents: "none" }} />
                        </>
                      )}
                      <div className="vt-card-accent" style={{ background: "#3CCBFF", position: "relative", zIndex: 1 }} />
                      <div className="vt-card-body" style={{ position: "relative", zIndex: 1 }}>
                        <div className="vt-card-icon"><img src="/valorantlogo.png" alt="Valorant" /></div>
                        <div className="vt-card-info">
                          <div className="vt-card-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>{t.name}{isActive && <span style={{ fontSize: "0.6rem", fontWeight: 800, padding: "2px 8px", borderRadius: 100, background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", whiteSpace: "nowrap", lineHeight: 1.4 }}>LIVE</span>}</div>
                          <div className="vt-card-meta">
                            <div className="vt-meta-item">
                              <span className="vt-meta-key">Prize</span>
                              <span className="vt-meta-val prize">{t.prizePool ? (String(t.prizePool).match(/^[₹Rs]/) ? t.prizePool : `₹${t.prizePool}`) : "TBD"}</span>
                            </div>
                            <div className="vt-meta-item">
                              <span className="vt-meta-key">Entry</span>
                              <span className="vt-meta-val">{t.entryFee === 0 ? "Free" : `₹${t.entryFee}`}</span>
                            </div>
                            <div className="vt-meta-item">
                              <span className="vt-meta-key">Format</span>
                              <span className="vt-meta-val">{t.format === "auction" ? "Auction" : t.format === "shuffle" ? "Shuffle" : "Standard"}</span>
                            </div>
                            <div className="vt-meta-item">
                              <span className="vt-meta-key">Starts</span>
                              <span className="vt-meta-val">{formatDate(t.startDate)}</span>
                            </div>
                            <div className="vt-meta-item">
                              <span className="vt-meta-key">Deadline</span>
                              <span className="vt-meta-val">{formatDate(t.registrationDeadline)}</span>
                            </div>
                            {t.isDailyTournament && <span className="vt-badge-daily">Daily</span>}
                          </div>
                        </div>
                      </div>
                      <div className="vt-card-right" style={{ position: "relative", zIndex: 1 }}>
                        <div className="vt-slots">
                          <div className="vt-slots-text"><strong>{t.slotsBooked}</strong> / {t.totalSlots} filled</div>
                          <div className="vt-slots-bar"><div className="vt-slots-fill" style={{ width: `${Math.round((t.slotsBooked / t.totalSlots) * 100)}%`, background: t.slotsBooked / t.totalSlots > 0.8 ? "#ef4444" : t.slotsBooked / t.totalSlots > 0.5 ? "#f59e0b" : "#22c55e" }} /></div>
                        </div>
                        {isRegistered ? (
                          <div className="vt-reg-done">✓ Registered</div>
                        ) : regState === "closed" ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: "100%" }}>
                            <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 100, padding: "2px 10px", whiteSpace: "nowrap" }}>Registration Closed</span>
                            {t.schedule?.groupStageStart && new Date() < new Date(t.schedule.groupStageStart) && (
                              <span style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.4)" }}>Group stage starts on {formatDate(t.schedule.groupStageStart)}</span>
                            )}
                            {t.schedule?.tourneyStageStart && new Date() >= new Date(t.schedule?.groupStageStart || "") && new Date() < new Date(t.schedule.tourneyStageStart) && (
                              <span style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.4)" }}>Playoffs start on {formatDate(t.schedule.tourneyStageStart)}</span>
                            )}
                            <button className="vt-leaderboard-btn" onClick={(e) => { e.stopPropagation(); router.push(`/valorant/tournament/${t.id}?tab=matches`); }}>Matches</button>
                          </div>
                        ) : regState === "not_yet" ? (
                          <div className="vt-coming-soon">
                            <div className="vt-coming-soon-label">Coming Soon</div>
                            {t.schedule?.registrationOpens && (
                              <div className="vt-coming-soon-date">Reg opens {formatDate(t.schedule.registrationOpens)}</div>
                            )}
                          </div>
                        ) : slotsLeft <= 0 ? (
                          <button className="vt-reg-btn" style={{ background: "#555", cursor: "default", opacity: 0.7 }} disabled onClick={(e) => e.stopPropagation()}>Slots Full</button>
                        ) : (
                          <button className="vt-reg-btn" onClick={(e) => { e.stopPropagation(); router.push(`/valorant/tournament/${t.id}`); }}>Register →</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {tournaments.filter(t => isEffectivelyEnded(t)).length > 0 && (
              <>
                <div className="vt-section-label" style={{ marginTop: 24 }}>Past Tournaments</div>
                {tournaments.filter(t => isEffectivelyEnded(t)).map((t) => {
                  const hasWinner = !!(t as any).championTeamName;
                  const winnerName = (t as any).championTeamName || null;
                  return (
                    <div key={t.id} className="vt-card ended" style={{ position: "relative" }} onClick={() => router.push(`/valorant/tournament/${t.id}`)}>
                      {t.bannerImage && (
                        <>
                          <img src={t.bannerImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.06, borderRadius: 16, pointerEvents: "none" }} />
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(10,15,42,0.9) 0%, rgba(10,15,42,0.6) 50%, rgba(10,15,42,0.9) 100%)", borderRadius: 16, pointerEvents: "none" }} />
                        </>
                      )}
                      <div className="vt-card-accent" style={{ background: "#fbbf24", position: "relative", zIndex: 1 }} />
                      <div className="vt-card-body" style={{ position: "relative", zIndex: 1 }}>
                        <div className="vt-card-icon"><img src="/valorantlogo.png" alt="Valorant" /></div>
                        <div className="vt-card-info">
                          <div className="vt-card-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {t.name}
                            <span style={{ fontSize: "0.58rem", fontWeight: 800, padding: "2px 8px", borderRadius: 100, background: "rgba(255,215,0,0.1)", color: "#fbbf24", border: "1px solid rgba(255,215,0,0.25)", whiteSpace: "nowrap" }}>Completed</span>
                          </div>
                          {hasWinner && (
                            <div style={{ marginBottom: 6 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                <span style={{ fontSize: "0.85rem" }}>👑</span>
                                <span style={{ fontSize: "0.92rem", fontWeight: 900, color: "#ffd700" }}>{winnerName}</span>
                              </div>
                              {(t as any).championMembers && (t as any).championMembers.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "nowrap", gap: 4, marginLeft: 2, overflowX: "auto" }}>
                                  {(t as any).championMembers.map((m: any, i: number) => (
                                    <span key={i} onClick={(e) => { e.stopPropagation(); if (m.uid) router.push(`/player/${m.uid}`); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 100, fontSize: "0.72rem", color: "#e2c66d", cursor: m.uid ? "pointer" : "default", whiteSpace: "nowrap", flexShrink: 0 }}>
                                      {m.avatar ? <img src={m.avatar} alt="" width={14} height={14} style={{ borderRadius: "50%", display: "block" }} /> : <span style={{ width: 14, height: 14, borderRadius: "50%", background: "rgba(255,215,0,0.15)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.55rem", color: "#ffd700", fontWeight: 800 }}>{(m.name || "?")[0].toUpperCase()}</span>}
                                      <span style={{ fontWeight: 700 }}>{m.name}</span>{m.tag && <span style={{ color: "rgba(255,215,0,0.4)", fontWeight: 500 }}>#{m.tag}</span>}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {hasWinner && !((t as any).championMembers?.length > 0) && (
                          <div className="vt-card-meta">
                              <div className="vt-meta-item">
                                <span className="vt-meta-key" style={{ color: "#fbbf24" }}>Winner</span>
                                <span className="vt-meta-val" style={{ color: "#ffd700", display: "flex", alignItems: "center", gap: 4, fontWeight: 900 }}>
                                  <span style={{ fontSize: "0.8rem" }}>👑</span> {winnerName}
                                </span>
                              </div>
                          </div>
                          )}
                        </div>
                      </div>
                      <div className="vt-card-right" style={{ position: "relative", zIndex: 1 }}>
                        <button className="vt-leaderboard-btn" onClick={(e) => { e.stopPropagation(); router.push(`/valorant/tournament/${t.id}?tab=matches`); }}>View Results</button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}