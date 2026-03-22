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
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query(collection(db, "valorantTournaments"), where("game", "==", "valorant"));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ValorantTournament[];

      // Filter out test tournaments for non-admin users
      const visible = all.filter((t) => !t.isTestTournament);

      const ended = visible
        .filter((t) => t.status === "ended")
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
        .slice(0, 1);

      const upcoming = visible
        .filter((t) => t.status === "upcoming" || t.status === "active")
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
        .slice(0, 3);

      setTournaments([...ended, ...upcoming]);
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
    try {
      return new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
      });
    } catch { return iso; }
  };

  return (
    <>
      <style>{`
        .vt-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 20px 30px 48px;
        }

        /* ── Stats row ── */
        .vt-stats {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .vt-stat-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #fff;
          border: 1px solid #E5E3DF;
          border-radius: 100px;
          padding: 6px 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .vt-stat-num {
          font-size: 1rem;
          font-weight: 800;
          color: #111;
        }
        .vt-stat-num.red { color: #ff4655; }
        .vt-stat-num.green { color: #16a34a; }
        .vt-stat-num.blue { color: #2563eb; }
        .vt-stat-label {
          font-size: 0.75rem;
          color: #888;
          font-weight: 500;
        }
        .vt-stat-divider {
          width: 1px;
          height: 16px;
          background: #E5E3DF;
        }

        /* ── Section label ── */
        .vt-section-label {
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #bbb;
          margin-bottom: 10px;
          margin-top: 6px;
        }

        /* ── Tournament card ── */
        .vt-card {
          background: #fff;
          border: 1px solid #E5E3DF;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          align-items: stretch;
          cursor: pointer;
          transition: box-shadow 0.18s, transform 0.18s, border-color 0.18s;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
          margin-bottom: 10px;
        }
        .vt-card:hover {
          box-shadow: 0 6px 24px rgba(0,0,0,0.1);
          transform: translateY(-1px);
          border-color: #d0ceca;
        }
        .vt-card.ended { opacity: 0.6; }
        .vt-card.registered { border-color: #bbf7d0; background: #f0fdf4; }

        /* Left accent bar */
        .vt-card-accent { width: 4px; flex-shrink: 0; }

        /* Card body */
        .vt-card-body {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 14px 18px;
        }

        /* Game icon */
        .vt-card-icon {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .vt-card-icon img { width: 100%; height: 100%; object-fit: cover; }

        /* Info area */
        .vt-card-info { flex: 1; min-width: 0; }
        .vt-card-name {
          font-size: 0.95rem;
          font-weight: 800;
          color: #111;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .vt-card-meta {
          display: flex;
          gap: 8px;
          margin-top: 4px;
          flex-wrap: wrap;
          align-items: center;
        }
        .vt-card-chip {
          font-size: 0.68rem;
          font-weight: 600;
          color: #888;
          background: #F8F7F4;
          border: 1px solid #F2F1EE;
          border-radius: 100px;
          padding: 2px 10px;
          white-space: nowrap;
        }

        /* Format badges */
        .vt-badge-auction {
          font-size: 0.62rem;
          font-weight: 800;
          color: #ff4655;
          background: #fff0f1;
          border: 1px solid #fecdd3;
          border-radius: 100px;
          padding: 2px 10px;
          white-space: nowrap;
        }
        .vt-badge-daily {
          font-size: 0.62rem;
          font-weight: 800;
          color: #888;
          background: #F8F7F4;
          border: 1px solid #E5E3DF;
          border-radius: 100px;
          padding: 2px 10px;
          white-space: nowrap;
        }

        /* Right side — slots + button */
        .vt-card-right {
          display: flex;
          align-items: center;
          gap: 14px;
          padding-right: 18px;
          flex-shrink: 0;
        }
        .vt-slots {
          text-align: right;
          min-width: 60px;
        }
        .vt-slots-num {
          font-size: 1.1rem;
          font-weight: 800;
          color: #111;
        }
        .vt-slots-label {
          font-size: 0.62rem;
          color: #bbb;
          font-weight: 500;
        }
        .vt-reg-btn {
          padding: 8px 20px;
          background: #ff4655;
          color: #fff;
          border: none;
          border-radius: 100px;
          font-size: 0.78rem;
          font-weight: 800;
          cursor: pointer;
          transition: background 0.15s;
          white-space: nowrap;
        }
        .vt-reg-btn:hover { background: #e63e4d; }
        .vt-reg-done {
          padding: 8px 16px;
          background: #f0fdf4;
          color: #16a34a;
          border: 1px solid #bbf7d0;
          border-radius: 100px;
          font-size: 0.72rem;
          font-weight: 800;
          white-space: nowrap;
        }

        /* Empty state */
        .vt-empty {
          text-align: center;
          padding: 60px 20px;
          color: #bbb;
        }
        .vt-empty-icon { font-size: 44px; margin-bottom: 12px; }
        .vt-empty-text { font-size: 0.9rem; }

        @media (max-width: 700px) {
          .vt-card-body { gap: 12px; padding: 12px 14px; }
          .vt-card-right { padding-right: 14px; gap: 10px; }
          .vt-card-icon { width: 36px; height: 36px; }
          .vt-reg-btn { padding: 7px 14px; font-size: 0.72rem; }
        }
        @media (max-width: 500px) {
          .vt-wrap { padding: 16px 16px 40px; }
          .vt-card { flex-direction: column; }
          .vt-card-accent { width: 100%; height: 3px; }
          .vt-card-right { padding: 0 14px 12px; justify-content: space-between; width: 100%; box-sizing: border-box; }
        }
      `}</style>

      <div className="vt-wrap">
        {/* Stats row */}
        <div className="vt-stats">
          <div className="vt-stat-pill">
            <span className="vt-stat-num red">{tournaments.length}</span>
            <div className="vt-stat-divider" />
            <span className="vt-stat-label">Tournaments</span>
          </div>
          <div className="vt-stat-pill">
            <span className="vt-stat-num green">{totalSlotsRemaining}</span>
            <div className="vt-stat-divider" />
            <span className="vt-stat-label">Slots Open</span>
          </div>
          <div className="vt-stat-pill">
            <span className="vt-stat-num blue">Free</span>
            <div className="vt-stat-divider" />
            <span className="vt-stat-label">Entry</span>
          </div>
        </div>

        {tournaments.length === 0 ? (
          <div className="vt-empty">
            <div className="vt-empty-icon">🎯</div>
            <p className="vt-empty-text">No Valorant tournaments yet. Check back soon!</p>
          </div>
        ) : (
          <>
            {/* Upcoming / Active */}
            {tournaments.filter(t => t.status !== "ended").length > 0 && (
              <>
                <div className="vt-section-label">Upcoming & Active</div>
                {tournaments.filter(t => t.status !== "ended").map((t) => {
                  const slotsLeft = t.totalSlots - t.slotsBooked;
                  const isRegistered = registeredIds.has(t.id);
                  return (
                    <div
                      key={t.id}
                      className={`vt-card${isRegistered ? " registered" : ""}`}
                      onClick={() => router.push(`/valorant/tournament/${t.id}`)}
                    >
                      <div className="vt-card-accent" style={{ background: "#ff4655" }} />
                      <div className="vt-card-body">
                        <div className="vt-card-icon">
                          <img src="/valorantlogo.png" alt="Valorant" />
                        </div>
                        <div className="vt-card-info">
                          <div className="vt-card-name">{t.name}</div>
                          <div className="vt-card-meta">
                            <span className="vt-card-chip">{formatDate(t.startDate)}</span>
                            <span className="vt-card-chip">{t.entryFee === 0 ? "Free" : `₹${t.entryFee}`}</span>
                            {t.format === "auction" && (
                              <span className="vt-badge-auction" title="Players are auctioned to captains after registration closes">Auction Format</span>
                            )}
                            {t.isDailyTournament && (
                              <span className="vt-badge-daily">Daily</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="vt-card-right">
                        <div className="vt-slots">
                          <div className="vt-slots-num">{slotsLeft}</div>
                          <div className="vt-slots-label">slots left</div>
                        </div>
                        {isRegistered ? (
                          <div className="vt-reg-done">✓ Registered</div>
                        ) : (
                          <button className="vt-reg-btn" onClick={(e) => { e.stopPropagation(); router.push(`/valorant/tournament/${t.id}`); }}>
                            Register →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Ended */}
            {tournaments.filter(t => t.status === "ended").length > 0 && (
              <>
                <div className="vt-section-label" style={{ marginTop: 24 }}>Past Tournaments</div>
                {tournaments.filter(t => t.status === "ended").map((t) => (
                  <div key={t.id} className="vt-card ended" onClick={() => router.push(`/valorant/tournament/${t.id}`)}>
                    <div className="vt-card-accent" style={{ background: "#ccc" }} />
                    <div className="vt-card-body">
                      <div className="vt-card-icon">
                        <img src="/valorantlogo.png" alt="Valorant" />
                      </div>
                      <div className="vt-card-info">
                        <div className="vt-card-name">{t.name}</div>
                        <div className="vt-card-meta">
                          <span className="vt-card-chip">{formatDate(t.startDate)}</span>
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