"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { Tournament } from "@/lib/types";

export default function DotaTournaments() {
  const { user } = useAuth();
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tLoading, setTLoading] = useState(true);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query(collection(db, "tournaments"), where("game", "==", "dota2"));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Tournament[];
      const ended = all.filter((t) => t.status === "ended").sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()).slice(0, 1);
      const upcoming = all.filter((t) => t.status === "upcoming" || t.status === "ongoing").sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()).slice(0, 3);
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
      setRegisteredIds(new Set(data?.registeredTournaments || []));
    };
    checkRegistrations();
    window.addEventListener("focus", checkRegistrations);
    return () => window.removeEventListener("focus", checkRegistrations);
  }, [user]);

  const totalSlotsRemaining = tournaments.reduce((acc, t) => acc + (t.totalSlots - t.slotsBooked), 0);

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); } catch { return iso; }
  };

  const getRegistrationState = (t: Tournament): "open" | "not_yet" | "closed" => {
    const now = new Date();
    const deadline = new Date(t.registrationDeadline);
    if (now > deadline) return "closed";
    if (t.schedule?.registrationOpens && now < new Date(t.schedule.registrationOpens)) return "not_yet";
    return "open";
  };

  if (tLoading) return (
    <>
      <style>{`
        @keyframes dt-sk-pulse { 0%,100%{background-position:-200% 0} 50%{background-position:200% 0} }
        .dt-sk { background: linear-gradient(90deg,rgba(59,130,246,0.04) 0%,rgba(59,130,246,0.1) 40%,rgba(59,130,246,0.04) 80%); background-size:200% 100%; animation: dt-sk-pulse 1.8s ease-in-out infinite; border-radius:16px; }
      `}</style>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 30px 48px" }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          {[120, 100, 140].map((w, i) => <div key={i} className="dt-sk" style={{ width: w, height: 38, borderRadius: 100 }} />)}
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="dt-sk" style={{ height: 88, marginBottom: 10 }} />
        ))}
      </div>
    </>
  );

  return (
    <>
      <style>{`
        @keyframes dt-card-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }

        .dt-wrap { max-width: 1100px; margin: 0 auto; padding: 20px 30px 56px; }

        .dt-stats { display: flex; gap: 10px; margin-bottom: 22px; flex-wrap: wrap; }
        .dt-stat-pill { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 100px; padding: 6px 16px; }
        .dt-stat-num { font-size: 1rem; font-weight: 800; color: #F0EEEA; }
        .dt-stat-num.blue { color: #3B82F6; }
        .dt-stat-num.green { color: #4ade80; }
        .dt-stat-num.light-blue { color: #60A5FA; }
        .dt-stat-label { font-size: 0.75rem; color: rgba(255,255,255,0.45); font-weight: 500; }
        .dt-stat-divider { width: 1px; height: 16px; background: rgba(255,255,255,0.1); }

        .dt-section-label { font-size: 0.66rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 12px; margin-top: 8px; }

        .dt-card {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px;
          overflow: hidden; display: flex; align-items: stretch; cursor: pointer;
          transition: all 0.25s ease; margin-bottom: 10px; backdrop-filter: blur(8px);
          animation: dt-card-up 0.35s ease both;
        }
        .dt-card:hover { transform: translateY(-3px); box-shadow: 0 8px 30px rgba(59,130,246,0.15); border-color: rgba(59,130,246,0.3); }
        .dt-card.ended { opacity: 0.5; }
        .dt-card.registered { border-color: rgba(34,197,94,0.35); background: rgba(22,163,74,0.07); }
        .dt-card.registered:hover { box-shadow: 0 8px 30px rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.5); }

        .dt-card-accent { width: 4px; flex-shrink: 0; }
        .dt-card-body { flex: 1; display: flex; align-items: center; gap: 18px; padding: 16px 20px; }
        .dt-card-icon { width: 46px; height: 46px; border-radius: 12px; overflow: hidden; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; }
        .dt-card-icon img { width: 32px; height: 32px; object-fit: contain; }
        .dt-card-info { flex: 1; min-width: 0; }
        .dt-card-name { font-size: 1rem; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dt-card-meta { display: flex; gap: 16px; margin-top: 6px; flex-wrap: wrap; align-items: center; }
        .dt-meta-item { display: flex; flex-direction: column; }
        .dt-meta-key { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.35); }
        .dt-meta-val { font-size: 0.8rem; font-weight: 700; color: rgba(255,255,255,0.8); }
        .dt-meta-val.prize { color: #3B82F6; }
        .dt-meta-val.green { color: #4ade80; }
        .dt-card-chip { font-size: 0.68rem; font-weight: 600; color: rgba(255,255,255,0.45); background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 100px; padding: 2px 10px; white-space: nowrap; }

        .dt-badge-shuffle { font-size: 0.62rem; font-weight: 800; color: #3B82F6; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.25); border-radius: 100px; padding: 2px 10px; white-space: nowrap; }

        .dt-card-right { display: flex; align-items: center; gap: 14px; padding-right: 20px; flex-shrink: 0; }
        .dt-slots { min-width: 100px; display: flex; flex-direction: column; gap: 5px; }
        .dt-slots-text { font-size: 0.72rem; color: rgba(255,255,255,0.5); text-align: right; }
        .dt-slots-text strong { color: #F0EEEA; font-weight: 800; }
        .dt-slots-bar { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
        .dt-slots-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }

        .dt-reg-btn { padding: 9px 22px; background: #3B82F6; color: #fff; border: none; border-radius: 100px; font-size: 0.78rem; font-weight: 800; cursor: pointer; transition: all 0.15s; white-space: nowrap; min-width: 130px; text-align: center; }
        .dt-reg-btn:hover { background: #2563EB; box-shadow: 0 0 20px rgba(59,130,246,0.4); transform: translateY(-1px); }

        .dt-leaderboard-btn { padding: 9px 22px; background: rgba(96,165,250,0.12); color: #60A5FA; border: 1px solid rgba(96,165,250,0.3); border-radius: 100px; font-size: 0.78rem; font-weight: 800; cursor: pointer; transition: all 0.15s; white-space: nowrap; min-width: 130px; text-align: center; }
        .dt-leaderboard-btn:hover { background: rgba(96,165,250,0.2); box-shadow: 0 0 16px rgba(96,165,250,0.25); transform: translateY(-1px); }

        .dt-reg-done { padding: 8px 16px; background: rgba(22,163,74,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); border-radius: 100px; font-size: 0.72rem; font-weight: 800; white-space: nowrap; min-width: 130px; text-align: center; }

        .dt-coming-soon { padding: 8px 16px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 100px; text-align: center; white-space: nowrap; min-width: 130px; }
        .dt-coming-soon-label { font-size: 0.7rem; font-weight: 800; color: rgba(255,255,255,0.4); }
        .dt-coming-soon-date { font-size: 0.6rem; color: rgba(255,255,255,0.25); margin-top: 2px; }

        .dt-empty { text-align: center; padding: 70px 20px; color: #555550; }
        .dt-empty-icon { font-size: 44px; margin-bottom: 12px; }
        .dt-empty-text { font-size: 0.9rem; color: rgba(255,255,255,0.3); }

        @media (max-width: 700px) { .dt-card-body { gap: 12px; padding: 13px 14px; } .dt-card-right { padding-right: 14px; gap: 10px; } .dt-card-icon { width: 38px; height: 38px; } .dt-card-icon img { width: 26px; height: 26px; } .dt-reg-btn { padding: 7px 14px; font-size: 0.72rem; min-width: 110px; } .dt-meta-item { display: none; } .dt-card-meta { gap: 6px; } .dt-card-meta .dt-meta-item:nth-child(-n+3) { display: flex; } }
        @media (max-width: 500px) { .dt-wrap { padding: 16px 16px 44px; } .dt-card { flex-direction: column; } .dt-card-accent { width: 100%; height: 3px; } .dt-card-right { padding: 0 14px 14px; justify-content: space-between; width: 100%; box-sizing: border-box; } .dt-slots { min-width: unset; width: 100%; } .dt-slots-text { text-align: left; } .dt-card-meta .dt-meta-item { display: flex; } }
      `}</style>

      <div className="dt-wrap">
        <div className="dt-stats">
          <div className="dt-stat-pill"><span className="dt-stat-num blue">{tournaments.filter(t => t.status !== "ended").length}</span><div className="dt-stat-divider" /><span className="dt-stat-label">Upcoming</span></div>
          <div className="dt-stat-pill"><span className="dt-stat-num green">{totalSlotsRemaining}</span><div className="dt-stat-divider" /><span className="dt-stat-label">Slots Open</span></div>
          <div className="dt-stat-pill"><span className="dt-stat-num light-blue">Free</span><div className="dt-stat-divider" /><span className="dt-stat-label">Entry</span></div>
        </div>

        {tournaments.length === 0 ? (
          <div className="dt-empty"><div className="dt-empty-icon">🎮</div><p className="dt-empty-text">No Dota 2 tournaments yet. Check back soon!</p></div>
        ) : (
          <>
            {tournaments.filter(t => t.status !== "ended").length > 0 && (
              <>
                <div className="dt-section-label">Upcoming & Active</div>
                {tournaments.filter(t => t.status !== "ended").map((t) => {
                  const isRegistered = registeredIds.has(t.id);
                  const regState = getRegistrationState(t);
                  const pct = Math.round((t.slotsBooked / t.totalSlots) * 100);
                  const entryDisplay = t.entryFee !== undefined ? (t.entryFee === 0 ? "Free" : `₹${t.entryFee}`) : t.entry;
                  return (
                    <div key={t.id} className={`dt-card${isRegistered ? " registered" : ""}`} style={{ animationDelay: `${0.05 * tournaments.indexOf(t)}s`, position: "relative" }} onClick={() => router.push(`/tournament/${t.id}`)}>
                      {t.bannerImage && (
                        <>
                          <img src={t.bannerImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.08, borderRadius: 16, pointerEvents: "none" }} />
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(10,14,24,0.85) 0%, rgba(10,14,24,0.5) 50%, rgba(10,14,24,0.85) 100%)", borderRadius: 16, pointerEvents: "none" }} />
                        </>
                      )}
                      <div className="dt-card-accent" style={{ background: "#3B82F6", position: "relative", zIndex: 1 }} />
                      <div className="dt-card-body" style={{ position: "relative", zIndex: 1 }}>
                        <div className="dt-card-icon">
                          <img src="https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png" alt="Dota 2" />
                        </div>
                        <div className="dt-card-info">
                          <div className="dt-card-name">{t.name}</div>
                          <div className="dt-card-meta">
                            <div className="dt-meta-item">
                              <span className="dt-meta-key">Prize</span>
                              <span className="dt-meta-val prize">{t.prizePool || "TBD"}</span>
                            </div>
                            <div className="dt-meta-item">
                              <span className="dt-meta-key">Entry</span>
                              <span className="dt-meta-val">{entryDisplay}</span>
                            </div>
                            <div className="dt-meta-item">
                              <span className="dt-meta-key">Format</span>
                              <span className="dt-meta-val">{t.format === "shuffle" ? "Shuffle" : t.format === "auction" ? "Auction" : "5v5"}</span>
                            </div>
                            <div className="dt-meta-item">
                              <span className="dt-meta-key">Starts</span>
                              <span className="dt-meta-val">{formatDate(t.startDate)}</span>
                            </div>
                            <div className="dt-meta-item">
                              <span className="dt-meta-key">Deadline</span>
                              <span className="dt-meta-val">{formatDate(t.registrationDeadline)}</span>
                            </div>
                            {t.format === "shuffle" && <span className="dt-badge-shuffle">Shuffle</span>}
                          </div>
                        </div>
                      </div>
                      <div className="dt-card-right" style={{ position: "relative", zIndex: 1 }}>
                        <div className="dt-slots">
                          <div className="dt-slots-text"><strong>{t.slotsBooked}</strong> / {t.totalSlots} filled</div>
                          <div className="dt-slots-bar"><div className="dt-slots-fill" style={{ width: `${pct}%`, background: pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e" }} /></div>
                        </div>
                        {isRegistered ? (
                          <div className="dt-reg-done">✓ Registered</div>
                        ) : regState === "closed" ? (
                          <button className="dt-leaderboard-btn" onClick={(e) => { e.stopPropagation(); router.push(`/tournament/${t.id}?tab=leaderboard`); }}>Leaderboard</button>
                        ) : regState === "not_yet" ? (
                          <div className="dt-coming-soon">
                            <div className="dt-coming-soon-label">Coming Soon</div>
                            {t.schedule?.registrationOpens && (
                              <div className="dt-coming-soon-date">Reg opens {formatDate(t.schedule.registrationOpens)}</div>
                            )}
                          </div>
                        ) : (
                          <button className="dt-reg-btn" onClick={(e) => { e.stopPropagation(); router.push(`/tournament/${t.id}`); }}>Register →</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {tournaments.filter(t => t.status === "ended").length > 0 && (
              <>
                <div className="dt-section-label" style={{ marginTop: 24 }}>Past Tournaments</div>
                {tournaments.filter(t => t.status === "ended").map((t) => (
                  <div key={t.id} className="dt-card ended" onClick={() => router.push(`/tournament/${t.id}`)}>
                    <div className="dt-card-accent" style={{ background: "#555550" }} />
                    <div className="dt-card-body">
                      <div className="dt-card-icon">
                        <img src="https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png" alt="Dota 2" />
                      </div>
                      <div className="dt-card-info">
                        <div className="dt-card-name">{t.name}</div>
                        <div className="dt-card-meta">
                          <div className="dt-meta-item">
                            <span className="dt-meta-key">Prize</span>
                            <span className="dt-meta-val">{t.prizePool || "TBD"}</span>
                          </div>
                          <div className="dt-meta-item">
                            <span className="dt-meta-key">Format</span>
                            <span className="dt-meta-val">{t.format === "shuffle" ? "Shuffle" : t.format === "auction" ? "Auction" : "5v5"}</span>
                          </div>
                          <div className="dt-meta-item">
                            <span className="dt-meta-key">Date</span>
                            <span className="dt-meta-val">{formatDate(t.startDate)}</span>
                          </div>
                          <span className="dt-card-chip">Ended</span>
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
