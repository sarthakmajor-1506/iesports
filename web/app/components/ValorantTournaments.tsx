"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { ValorantTournament } from "@/lib/types";

export default function ValorantTournaments() {
  const { user } = useAuth();
  const router = useRouter();
  const [tournaments, setTournaments] = useState<ValorantTournament[]>([]);
  const [tLoading, setTLoading] = useState(true);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query(collection(db, "valorantTournaments"), where("game", "==", "valorant"));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ValorantTournament[];
      const visible = all.filter((t) => !t.isTestTournament);
      const ended = visible.filter((t) => t.status === "ended").sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()).slice(0, 1);
      const upcoming = visible.filter((t) => t.status === "upcoming" || t.status === "active").sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()).slice(0, 3);
      setTournaments([...ended, ...upcoming]);
      setTLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const checkRegistrations = async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      const data = snap.data();
      setRegisteredIds(new Set(data?.registeredValorantTournaments || []));
    };
    checkRegistrations();
    window.addEventListener("focus", checkRegistrations);
    return () => window.removeEventListener("focus", checkRegistrations);
  }, [user]);

  const totalSlotsRemaining = tournaments.reduce((acc, t) => acc + (t.totalSlots - t.slotsBooked), 0);

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); } catch { return iso; }
  };

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
        .vt-card.ended { opacity: 0.5; }
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

        @media (max-width: 700px) { .vt-card-body { gap: 12px; padding: 13px 14px; } .vt-card-right { padding-right: 14px; gap: 10px; } .vt-card-icon { width: 38px; height: 38px; } .vt-reg-btn { padding: 7px 14px; font-size: 0.72rem; min-width: 110px; } .vt-meta-item { display: none; } .vt-card-meta { gap: 6px; } .vt-card-meta .vt-meta-item:nth-child(-n+3) { display: flex; } }
        @media (max-width: 500px) { .vt-wrap { padding: 16px 16px 44px; } .vt-card { flex-direction: column; } .vt-card-accent { width: 100%; height: 3px; } .vt-card-right { padding: 0 14px 14px; justify-content: space-between; width: 100%; box-sizing: border-box; } .vt-slots { min-width: unset; width: 100%; } .vt-slots-text { text-align: left; } .vt-card-meta .vt-meta-item { display: flex; } }
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
            {tournaments.filter(t => t.status !== "ended").length > 0 && (
              <>
                <div className="vt-section-label">Upcoming & Active</div>
                {tournaments.filter(t => t.status !== "ended").map((t) => {
                  const slotsLeft = t.totalSlots - t.slotsBooked;
                  const isRegistered = registeredIds.has(t.id);
                  const regState = getRegistrationState(t);
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
                          <div className="vt-card-name">{t.name}</div>
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
                          <button className="vt-leaderboard-btn" onClick={(e) => { e.stopPropagation(); router.push(`/valorant/tournament/${t.id}?tab=leaderboard`); }}>Leaderboard</button>
                        ) : regState === "not_yet" ? (
                          <div className="vt-coming-soon">
                            <div className="vt-coming-soon-label">Coming Soon</div>
                            {t.schedule?.registrationOpens && (
                              <div className="vt-coming-soon-date">Reg opens {formatDate(t.schedule.registrationOpens)}</div>
                            )}
                          </div>
                        ) : (
                          <button className="vt-reg-btn" onClick={(e) => { e.stopPropagation(); router.push(`/valorant/tournament/${t.id}`); }}>Register →</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {tournaments.filter(t => t.status === "ended").length > 0 && (
              <>
                <div className="vt-section-label" style={{ marginTop: 24 }}>Past Tournaments</div>
                {tournaments.filter(t => t.status === "ended").map((t) => (
                  <div key={t.id} className="vt-card ended" onClick={() => router.push(`/valorant/tournament/${t.id}`)}>
                    <div className="vt-card-accent" style={{ background: "#555550" }} />
                    <div className="vt-card-body">
                      <div className="vt-card-icon"><img src="/valorantlogo.png" alt="Valorant" /></div>
                      <div className="vt-card-info">
                        <div className="vt-card-name">{t.name}</div>
                        <div className="vt-card-meta">
                          <div className="vt-meta-item">
                            <span className="vt-meta-key">Prize</span>
                            <span className="vt-meta-val">{t.prizePool ? (String(t.prizePool).match(/^[₹Rs]/) ? t.prizePool : `₹${t.prizePool}`) : "TBD"}</span>
                          </div>
                          <div className="vt-meta-item">
                            <span className="vt-meta-key">Format</span>
                            <span className="vt-meta-val">{t.format === "auction" ? "Auction" : t.format === "shuffle" ? "Shuffle" : "Standard"}</span>
                          </div>
                          <div className="vt-meta-item">
                            <span className="vt-meta-key">Date</span>
                            <span className="vt-meta-val">{formatDate(t.startDate)}</span>
                          </div>
                          <span className="vt-card-chip">Ended</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}