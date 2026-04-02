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

  const isRegistrationOpen = (t: ValorantTournament) => {
    const now = new Date();
    // If there's an explicit registrationOpens date, use it
    if (t.schedule?.registrationOpens) {
      return now >= new Date(t.schedule.registrationOpens);
    }
    // Otherwise check deadline hasn't passed and tournament isn't ended
    const deadline = new Date(t.registrationDeadline);
    return now <= deadline;
  };

  if (tLoading) return (
    <>
      <style>{`
        @keyframes vt-sk-pulse { 0%,100%{background-position:-200% 0} 50%{background-position:200% 0} }
        .vt-sk { background: linear-gradient(90deg,#0d1118 0%,#1a2535 40%,#0d1118 80%); background-size:200% 100%; animation: vt-sk-pulse 1.8s ease-in-out infinite; border-radius:12px; }
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
        .vt-wrap { max-width: 1100px; margin: 0 auto; padding: 20px 30px 48px; }

        .vt-stats { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
        .vt-stat-pill { display: flex; align-items: center; gap: 8px; background: #121215; border: 1px solid #2A2A30; border-radius: 100px; padding: 6px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
        .vt-stat-num { font-size: 1rem; font-weight: 800; color: #F0EEEA; }
        .vt-stat-num.red { color: #ff4655; }
        .vt-stat-num.green { color: #4ade80; }
        .vt-stat-num.blue { color: #60A5FA; }
        .vt-stat-label { font-size: 0.75rem; color: #8A8880; font-weight: 500; }
        .vt-stat-divider { width: 1px; height: 16px; background: #2A2A30; }

        .vt-section-label { font-size: 0.68rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #555550; margin-bottom: 10px; margin-top: 6px; }

        .vt-card { background: #121215; border: 1px solid #2A2A30; border-radius: 12px; overflow: hidden; display: flex; align-items: stretch; cursor: pointer; transition: box-shadow 0.18s, transform 0.18s, border-color 0.18s; box-shadow: 0 1px 4px rgba(0,0,0,0.2); margin-bottom: 10px; }
        .vt-card:hover { box-shadow: 0 6px 24px rgba(0,0,0,0.35); transform: translateY(-1px); border-color: #3a3a42; }
        .vt-card.ended { opacity: 0.6; }
        .vt-card.registered { border-color: rgba(34,197,94,0.3); background: rgba(22,163,74,0.06); }

        .vt-card-accent { width: 4px; flex-shrink: 0; }
        .vt-card-body { flex: 1; display: flex; align-items: center; gap: 20px; padding: 14px 18px; }
        .vt-card-icon { width: 44px; height: 44px; border-radius: 10px; overflow: hidden; flex-shrink: 0; }
        .vt-card-icon img { width: 100%; height: 100%; object-fit: cover; }
        .vt-card-info { flex: 1; min-width: 0; }
        .vt-card-name { font-size: 0.95rem; font-weight: 800; color: #F0EEEA; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vt-card-meta { display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; align-items: center; }
        .vt-card-chip { font-size: 0.68rem; font-weight: 600; color: #8A8880; background: #18181C; border: 1px solid #2A2A30; border-radius: 100px; padding: 2px 10px; white-space: nowrap; }

        .vt-badge-auction { font-size: 0.62rem; font-weight: 800; color: #ff4655; background: rgba(255,70,85,0.1); border: 1px solid rgba(255,70,85,0.25); border-radius: 100px; padding: 2px 10px; white-space: nowrap; }
        .vt-badge-daily { font-size: 0.62rem; font-weight: 800; color: #8A8880; background: #18181C; border: 1px solid #2A2A30; border-radius: 100px; padding: 2px 10px; white-space: nowrap; }

        .vt-card-right { display: flex; align-items: center; gap: 14px; padding-right: 18px; flex-shrink: 0; }
        .vt-slots { text-align: right; min-width: 60px; }
        .vt-slots-num { font-size: 1.1rem; font-weight: 800; color: #F0EEEA; }
        .vt-slots-label { font-size: 0.62rem; color: #555550; font-weight: 500; }

        .vt-reg-btn:hover { background: #e63e4d; }


        .vt-reg-btn { padding: 8px 20px; background: #ff4655; color: #fff; border: none; border-radius: 100px; font-size: 0.78rem; font-weight: 800; cursor: pointer; transition: background 0.15s; white-space: nowrap; min-width: 130px; text-align: center; }

        .vt-reg-done { padding: 8px 16px; background: rgba(22,163,74,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); border-radius: 100px; font-size: 0.72rem; font-weight: 800; white-space: nowrap; min-width: 130px; text-align: center; }

        .vt-coming-soon { padding: 6px 14px; background: rgba(255,255,255,0.04); border: 1px solid #2A2A30; border-radius: 100px; text-align: center; white-space: nowrap; min-width: 130px; }


        .vt-coming-soon-label { font-size: 0.7rem; font-weight: 800; color: #8A8880; }
        .vt-coming-soon-date { font-size: 0.6rem; color: #555550; margin-top: 2px; }

        .vt-empty { text-align: center; padding: 60px 20px; color: #555550; }
        .vt-empty-icon { font-size: 44px; margin-bottom: 12px; }
        .vt-empty-text { font-size: 0.9rem; }

        @media (max-width: 700px) { .vt-card-body { gap: 12px; padding: 12px 14px; } .vt-card-right { padding-right: 14px; gap: 10px; } .vt-card-icon { width: 36px; height: 36px; } .vt-reg-btn { padding: 7px 14px; font-size: 0.72rem; } }
        @media (max-width: 500px) { .vt-wrap { padding: 16px 16px 40px; } .vt-card { flex-direction: column; } .vt-card-accent { width: 100%; height: 3px; } .vt-card-right { padding: 0 14px 12px; justify-content: space-between; width: 100%; box-sizing: border-box; } }
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
                  const regOpen = isRegistrationOpen(t);
                  return (
                    <div key={t.id} className={`vt-card${isRegistered ? " registered" : ""}`} onClick={() => router.push(`/valorant/tournament/${t.id}`)}>
                      <div className="vt-card-accent" style={{ background: "#ff4655" }} />
                      <div className="vt-card-body">
                        <div className="vt-card-icon"><img src="/valorantlogo.png" alt="Valorant" /></div>
                        <div className="vt-card-info">
                          <div className="vt-card-name">{t.name}</div>
                          <div className="vt-card-meta">
                            <span className="vt-card-chip">{formatDate(t.startDate)}</span>
                            <span className="vt-card-chip">{t.entryFee === 0 ? "Free" : `₹${t.entryFee}`}</span>
                            {t.format === "auction" && <span className="vt-badge-auction" title="Players are auctioned to captains after registration closes">Auction Format</span>}
                            {t.isDailyTournament && <span className="vt-badge-daily">Daily</span>}
                          </div>
                        </div>
                      </div>
                      <div className="vt-card-right">
                        <div className="vt-slots"><div className="vt-slots-num">{slotsLeft}</div><div className="vt-slots-label">slots left</div></div>
                        {isRegistered ? (
                          <div className="vt-reg-done">✓ Registered</div>
                        ) : !regOpen ? (
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
                        <div className="vt-card-meta"><span className="vt-card-chip">{formatDate(t.startDate)}</span><span className="vt-card-chip">Ended</span></div>
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