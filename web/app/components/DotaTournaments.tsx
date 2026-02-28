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
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query(collection(db, "tournaments"), where("game", "==", "dota2"));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Tournament[];

      const ended = all
        .filter((t) => t.status === "ended")
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
        .slice(0, 1);

      const upcoming = all
        .filter((t) => t.status === "upcoming" || t.status === "ongoing")
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
      setRegisteredIds(new Set(data?.registeredTournaments || []));
    };
    checkRegistrations();

    window.addEventListener("focus", checkRegistrations);
    return () => window.removeEventListener("focus", checkRegistrations);
  }, [user]);

  const totalSlotsRemaining = tournaments.reduce((acc, t) => acc + (t.totalSlots - t.slotsBooked), 0);

  return (
    <>
      <style>{`
        .dt-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 20px 30px 48px;
        }

        /* ── Stats row ── */
        .dt-stats {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .dt-stat-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #fff;
          border: 1px solid #E5E3DF;
          border-radius: 100px;
          padding: 6px 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .dt-stat-num {
          font-size: 1rem;
          font-weight: 800;
          color: #111;
        }
        .dt-stat-num.orange { color: #F05A28; }
        .dt-stat-num.green  { color: #16a34a; }
        .dt-stat-num.blue   { color: #2563eb; }
        .dt-stat-label {
          font-size: 0.75rem;
          color: #888;
          font-weight: 500;
        }
        .dt-stat-divider {
          width: 1px;
          height: 16px;
          background: #E5E3DF;
        }

        /* ── Section label ── */
        .dt-section-label {
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #bbb;
          margin-bottom: 10px;
          margin-top: 6px;
        }

        /* ── Tournament card — compact ── */
        .dt-card {
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
        .dt-card:hover {
          box-shadow: 0 6px 24px rgba(0,0,0,0.1);
          transform: translateY(-1px);
          border-color: #d0ceca;
        }
        .dt-card.ended {
          opacity: 0.6;
        }
        .dt-card.registered {
          border-color: #bbf7d0;
          background: #f0fdf4;
        }

        /* Left accent bar */
        .dt-card-accent {
          width: 4px;
          flex-shrink: 0;
        }

        /* Card body */
        .dt-card-body {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 14px 18px;
        }

        /* Game icon area */
        .dt-card-icon {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          overflow: hidden;
          flex-shrink: 0;
          background: #F2F1EE;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .dt-card-icon img {
          width: 32px;
          height: 32px;
          object-fit: contain;
        }

        /* Main info */
        .dt-card-info { flex: 1; min-width: 0; }
        .dt-card-name {
          font-size: 0.95rem;
          font-weight: 800;
          color: #111;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 4px;
        }
        .dt-card-meta {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          align-items: center;
        }
        .dt-meta-item { display: flex; flex-direction: column; }
        .dt-meta-key {
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #bbb;
        }
        .dt-meta-val {
          font-size: 0.8rem;
          font-weight: 700;
          color: #444;
        }
        .dt-meta-val.prize { color: #F05A28; }
        .dt-meta-val.green { color: #16a34a; }

        /* Status badge */
        .dt-status-badge {
          font-size: 0.65rem;
          font-weight: 800;
          padding: 3px 10px;
          border-radius: 100px;
          white-space: nowrap;
        }
        .dt-status-badge.upcoming  { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
        .dt-status-badge.ongoing   { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
        .dt-status-badge.ended     { background: #F2F1EE; color: #bbb;    border: 1px solid #E5E3DF; }
        .dt-status-badge.registered { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }

        /* Slot bar area */
        .dt-slots-wrap {
          min-width: 120px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .dt-slots-text {
          font-size: 0.72rem;
          color: #888;
          text-align: right;
        }
        .dt-slots-text strong { color: #111; font-weight: 800; }
        .dt-slots-bar {
          height: 4px;
          background: #F2F1EE;
          border-radius: 2px;
          overflow: hidden;
        }
        .dt-slots-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 0.5s;
        }

        /* CTA button */
        .dt-cta-btn {
          padding: 8px 18px;
          border-radius: 100px;
          border: none;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          white-space: nowrap;
          transition: all 0.15s;
          min-width: 120px;
          text-align: center;
        }
        .dt-cta-btn.primary {
          background: #F05A28;
          color: #fff;
          box-shadow: 0 2px 10px rgba(240,90,40,0.25);
        }
        .dt-cta-btn.primary:hover { background: #D44A1A; }
        .dt-cta-btn.registered-btn {
          background: #f0fdf4;
          color: #16a34a;
          border: 1px solid #bbf7d0;
        }
        .dt-cta-btn.ended-btn {
          background: #F8F7F4;
          color: #888;
          border: 1px solid #E5E3DF;
          cursor: default;
        }

        /* Empty state */
        .dt-empty {
          text-align: center;
          padding: 60px 0;
          color: #bbb;
          font-size: 0.9rem;
        }
      `}</style>

      <div className="dt-wrap">

        {/* ── Stats pills ── */}
        <div className="dt-stats">
          <div className="dt-stat-pill">
            <span className="dt-stat-num orange">{tournaments.filter(t => t.status !== "ended").length}</span>
            <span className="dt-stat-divider" />
            <span className="dt-stat-label">Upcoming</span>
          </div>
          <div className="dt-stat-pill">
            <span className="dt-stat-num green">₹1.2L</span>
            <span className="dt-stat-divider" />
            <span className="dt-stat-label">Total Prize Pool</span>
          </div>
          <div className="dt-stat-pill">
            <span className="dt-stat-num blue">{totalSlotsRemaining}</span>
            <span className="dt-stat-divider" />
            <span className="dt-stat-label">Slots Open</span>
          </div>
        </div>

        {/* ── Tournament list ── */}
        {tournaments.length === 0 ? (
          <div className="dt-empty">No tournaments found. Check back soon!</div>
        ) : (
          <>
            {/* Past */}
            {tournaments.filter(t => t.status === "ended").length > 0 && (
              <>
                <div className="dt-section-label">Past</div>
                {tournaments.filter(t => t.status === "ended").map(t => (
                  <TournamentCard
                    key={t.id}
                    t={t}
                    isRegistered={registeredIds.has(t.id)}
                    onNavigate={() => router.push(`/tournament/${t.id}`)}
                  />
                ))}
              </>
            )}

            {/* Upcoming / Ongoing */}
            {tournaments.filter(t => t.status !== "ended").length > 0 && (
              <>
                <div className="dt-section-label" style={{ marginTop: 16 }}>Upcoming</div>
                {tournaments.filter(t => t.status !== "ended").map(t => (
                  <TournamentCard
                    key={t.id}
                    t={t}
                    isRegistered={registeredIds.has(t.id)}
                    onNavigate={() => router.push(`/tournament/${t.id}`)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

function TournamentCard({
  t,
  isRegistered,
  onNavigate,
}: {
  t: Tournament;
  isRegistered: boolean;
  onNavigate: () => void;
}) {
  const isEnded = t.status === "ended";
  const isOngoing = t.status === "ongoing";
  const pct = Math.round((t.slotsBooked / t.totalSlots) * 100);
  const slotsLeft = t.totalSlots - t.slotsBooked;

  const accentColor = isEnded
    ? "#E5E3DF"
    : isRegistered
    ? "#22c55e"
    : isOngoing
    ? "#16a34a"
    : "#F05A28";

  const fillColor = isEnded
    ? "#E5E3DF"
    : pct > 80
    ? "#ef4444"
    : pct > 50
    ? "#f59e0b"
    : "#22c55e";

  return (
    <div
      className={`dt-card${isEnded ? " ended" : ""}${isRegistered && !isEnded ? " registered" : ""}`}
      onClick={onNavigate}
    >
      {/* Accent bar */}
      <div className="dt-card-accent" style={{ background: accentColor }} />

      <div className="dt-card-body">
        {/* Game icon */}
        <div className="dt-card-icon">
          <img
            src="https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png"
            alt="Dota 2"
          />
        </div>

        {/* Main info */}
        <div className="dt-card-info">
          <div className="dt-card-name">{t.name}</div>
          <div className="dt-card-meta">
            <div className="dt-meta-item">
              <span className="dt-meta-key">Prize</span>
              <span className="dt-meta-val prize">{t.prizePool}</span>
            </div>
            <div className="dt-meta-item">
              <span className="dt-meta-key">Entry</span>
              <span className="dt-meta-val">{t.entry}</span>
            </div>
            <div className="dt-meta-item">
              <span className="dt-meta-key">Format</span>
              <span className="dt-meta-val">5v5</span>
            </div>
            <div className="dt-meta-item">
              <span className="dt-meta-key">Starts</span>
              <span className="dt-meta-val">{t.startDate}</span>
            </div>
            <div className="dt-meta-item">
              <span className="dt-meta-key">Deadline</span>
              <span className="dt-meta-val">{t.registrationDeadline}</span>
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div>
          {isRegistered && !isEnded ? (
            <span className="dt-status-badge registered">✓ Registered</span>
          ) : isOngoing ? (
            <span className="dt-status-badge ongoing">🟢 Live</span>
          ) : isEnded ? (
            <span className="dt-status-badge ended">Ended</span>
          ) : (
            <span className="dt-status-badge upcoming">Upcoming</span>
          )}
        </div>

        {/* Slots */}
        <div className="dt-slots-wrap">
          <div className="dt-slots-text">
            <strong>{slotsLeft}</strong> / {t.totalSlots} slots
          </div>
          <div className="dt-slots-bar">
            <div
              className="dt-slots-fill"
              style={{ width: `${pct}%`, background: fillColor }}
            />
          </div>
        </div>

        {/* CTA */}
        <button
          className={`dt-cta-btn ${isEnded ? "ended-btn" : isRegistered ? "registered-btn" : "primary"}`}
          onClick={(e) => { e.stopPropagation(); onNavigate(); }}
          disabled={isEnded}
        >
          {isEnded ? "View Results" : isRegistered ? "✓ Registered" : "Register →"}
        </button>
      </div>
    </div>
  );
}