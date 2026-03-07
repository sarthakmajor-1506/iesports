"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getThreeWeeks, formatWeekLabel, getTimeUntilDeadline } from "@/lib/soloTournaments";
import { SoloTournament } from "@/lib/types";

type WeekGroup = {
  label:   string;
  weekTag: "last" | "current" | "next";
  free:    SoloTournament | null;
};

const HOW_IT_WORKS = [
  { icon: "🎮", title: "Connect & Join",  desc: "Link Steam once. Register for any weekly tournament.",       color: "#F05A28" },
  { icon: "⚔️", title: "Play Your Games", desc: "Play normal ranked Dota 2. No custom lobbies needed.",       color: "#16a34a" },
  { icon: "📊", title: "Auto Tracked",    desc: "We pull match stats via OpenDota. Top 5 scores count.",      color: "#2563eb" },
  { icon: "🏆", title: "Get Rewarded",    desc: "Top players win prizes paid via UPI within 48 hours.",       color: "#7c3aed" },
];

const SCORING_PILLS = [
  { label: "Kill",     value: "+3",   neg: false },
  { label: "Assist",   value: "+1",   neg: false },
  { label: "Death",    value: "−2",   neg: true  },
  { label: "10 LH",   value: "+1",   neg: false },
  { label: "50 GPM",  value: "+1",   neg: false },
  { label: "50 XPM",  value: "+1",   neg: false },
  { label: "Win",      value: "+20",  neg: false },
];

export default function SoloTournaments() {
  const { user } = useAuth();
  const router   = useRouter();

  const [weeks,         setWeeks]         = useState<WeekGroup[]>([]);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());
  const [countdown,     setCountdown]     = useState<Record<string, string>>({});

  // Load tournaments — free only
  useEffect(() => {
    const { last, current, next } = getThreeWeeks();
    const weekTags: Record<string, "last" | "current" | "next"> = {
      [last]: "last", [current]: "current", [next]: "next",
    };
    const q = query(
      collection(db, "soloTournaments"),
      where("game", "==", "dota2"),
      where("type", "==", "free"),   // free only — no paid cards
    );
    const unsub = onSnapshot(q, (snap) => {
      const all: Record<string, SoloTournament> = {};
      snap.docs.forEach((d) => { all[d.id] = { id: d.id, ...d.data() } as SoloTournament; });
      const grouped: WeekGroup[] = [last, current, next].map((weekId) => ({
        label:   formatWeekLabel(weekId),
        weekTag: weekTags[weekId],
        free:    all[`${weekId}-free`] || null,
      }));
      setWeeks(grouped);
    });
    return () => unsub();
  }, []);

  // Track registered tournaments
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      setRegisteredIds(new Set(snap.data()?.registeredSoloTournaments || []));
    };
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [user]);

  // Live countdown
  useEffect(() => {
    const tick = () => {
      const updated: Record<string, string> = {};
      weeks.forEach((w) => {
        if (w.free) updated[w.free.id] = getTimeUntilDeadline(w.free.registrationDeadline);
      });
      setCountdown(updated);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [weeks]);

  const weekTagConfig = {
    last:    { label: "Last Week",  bg: "#F2F1EE", color: "#888",    border: "#E5E3DF" },
    current: { label: "This Week",  bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
    next:    { label: "Next Week",  bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
  };

  return (
    <>
      <style>{`
        .st-wrap { max-width: 900px; margin: 0 auto; padding: 20px 28px 60px; }

        /* ── Info panel ── */
        .st-info-panel {
          background: #fff;
          border: 1px solid #E5E3DF;
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 28px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.05);
        }
        .st-info-accent {
          height: 3px;
          background: linear-gradient(90deg, #F05A28, #16a34a, #2563eb, #7c3aed);
        }
        .st-info-body { padding: 20px 24px; }
        .st-info-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 20px;
        }
        .st-info-label {
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #F05A28;
          margin-bottom: 4px;
        }
        .st-info-title {
          font-size: 1.25rem;
          font-weight: 900;
          color: #111;
          letter-spacing: -0.02em;
          margin-bottom: 3px;
        }
        .st-info-sub { font-size: 0.78rem; color: #888; }

        .st-smurf {
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 10px;
          padding: 10px 14px;
          max-width: 280px;
        }
        .st-smurf-title { font-size: 0.72rem; font-weight: 800; color: #ea580c; margin-bottom: 4px; }
        .st-smurf-desc  { font-size: 0.72rem; color: #92400e; line-height: 1.5; }
        .st-smurf-desc strong { color: #ea580c; }

        .st-hiw-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-bottom: 16px;
        }
        @media (max-width: 640px) { .st-hiw-grid { grid-template-columns: 1fr 1fr; } }
        .st-hiw-card {
          background: #F8F7F4;
          border: 1px solid #E5E3DF;
          border-top-width: 2px;
          border-radius: 10px;
          padding: 14px;
        }
        .st-hiw-icon  { font-size: 1.2rem; margin-bottom: 8px; display: block; }
        .st-hiw-name  { font-size: 0.78rem; font-weight: 800; color: #111; margin-bottom: 4px; }
        .st-hiw-desc  { font-size: 0.7rem; color: #888; line-height: 1.5; }

        .st-scoring {
          display: flex;
          background: #F8F7F4;
          border: 1px solid #E5E3DF;
          border-radius: 8px;
          overflow: hidden;
          flex-wrap: wrap;
        }
        .st-scoring-label {
          padding: 8px 14px;
          border-right: 1px solid #E5E3DF;
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        .st-scoring-label span {
          font-size: 0.6rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #bbb;
        }
        .st-scoring-item {
          padding: 8px 14px;
          border-right: 1px solid #E5E3DF;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          flex-shrink: 0;
        }
        .st-scoring-item:last-child { border-right: none; }
        .st-scoring-val { font-size: 0.78rem; font-weight: 800; }
        .st-scoring-val.pos { color: #16a34a; }
        .st-scoring-val.neg { color: #dc2626; }
        .st-scoring-key { font-size: 0.65rem; color: #aaa; }

        /* ── Week section ── */
        .st-week-label-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        .st-week-tag {
          font-size: 0.7rem;
          font-weight: 800;
          padding: 4px 12px;
          border-radius: 100px;
          border: 1px solid;
        }
        .st-week-date { font-size: 0.8rem; color: #888; font-weight: 500; }

        /* ── Tournament row card ── */
        .st-row-card {
          background: #fff;
          border: 1px solid #E5E3DF;
          border-radius: 14px;
          overflow: hidden;
          margin-bottom: 10px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.05);
          transition: box-shadow 0.18s, transform 0.18s;
        }
        .st-row-card:hover { box-shadow: 0 4px 18px rgba(0,0,0,0.09); transform: translateY(-1px); }
        .st-row-card.registered { border-color: #bbf7d0; }
        .st-row-card.ended { opacity: 0.7; }

        .st-row-accent { height: 3px; background: linear-gradient(90deg, #F05A28, #ea580c); }

        .st-row-body {
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 16px 20px;
          flex-wrap: wrap;
        }

        /* Left: name + badges */
        .st-row-left { flex: 1; min-width: 180px; }
        .st-row-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
        .st-badge-pill {
          font-size: 0.62rem;
          font-weight: 800;
          padding: 3px 9px;
          border-radius: 100px;
          border: 1px solid;
        }
        .badge-free     { background: #fff7ed; color: #ea580c; border-color: #fed7aa; }
        .badge-live     { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }
        .badge-upcoming { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
        .badge-ended    { background: #F2F1EE; color: #888;    border-color: #E5E3DF; }
        .badge-reg      { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }

        .st-row-name { font-size: 0.95rem; font-weight: 800; color: #111; }

        /* Middle: stats pills */
        .st-row-stats {
          display: flex;
          gap: 20px;
          flex-shrink: 0;
        }
        .st-stat { display: flex; flex-direction: column; align-items: center; }
        .st-stat-key {
          font-size: 0.58rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #bbb;
          margin-bottom: 2px;
        }
        .st-stat-val { font-size: 0.84rem; font-weight: 700; color: #333; }
        .st-stat-prize { font-size: 1rem; font-weight: 900; color: #F05A28; }

        /* Countdown chip */
        .st-countdown-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 100px;
          padding: 5px 12px;
          font-size: 0.74rem;
          flex-shrink: 0;
        }
        .st-countdown-chip .time  { color: #16a34a; font-weight: 700; }
        .st-countdown-chip .label { color: #888; }

        /* Right: CTA button */
        .st-row-cta { flex-shrink: 0; min-width: 160px; }
        .st-btn {
          width: 100%;
          padding: 10px 18px;
          border-radius: 100px;
          border: none;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
          text-align: center;
          white-space: nowrap;
        }
        .st-btn-primary { background: #F05A28; color: #fff; box-shadow: 0 2px 10px rgba(240,90,40,0.25); }
        .st-btn-primary:hover:not(:disabled) { background: #D44A1A; }
        .st-btn-ghost {
          background: transparent;
          color: #555;
          border: 1px solid #E5E3DF !important;
        }
        .st-btn-ghost:hover { background: #F8F7F4; }
        .st-btn-ghost-green {
          background: transparent;
          color: #16a34a;
          border: 1px solid #bbf7d0 !important;
        }
        .st-btn-ghost-green:hover { background: #f0fdf4; }
        .st-btn-reg-closed {
          background: #fff7ed;
          color: #ea580c;
          border: 1px solid #fed7aa !important;
          cursor: default;
        }

        @media (max-width: 640px) {
          .st-row-body  { flex-direction: column; align-items: flex-start; gap: 12px; }
          .st-row-cta   { width: 100%; }
          .st-row-stats { gap: 14px; }
        }
      `}</style>

      <div className="st-wrap">

        {/* ── Info panel ── */}
        <div className="st-info-panel">
          <div className="st-info-accent" />
          <div className="st-info-body">
            <div className="st-info-top">
              <div>
                <div className="st-info-label">Solo Tournaments</div>
                <div className="st-info-title">Play. Score. Win.</div>
                <div className="st-info-sub">Top 5 match scores count · Weekly prizes · UPI payouts</div>
              </div>
              <div className="st-smurf">
                <div className="st-smurf-title">🤖 AI Smurf Monitor Active</div>
                <div className="st-smurf-desc">
                  Abnormal performance vs rank history = <strong>disqualification & prize forfeiture</strong>.
                </div>
              </div>
            </div>

            <div className="st-hiw-grid">
              {HOW_IT_WORKS.map((item) => (
                <div key={item.title} className="st-hiw-card" style={{ borderTopColor: item.color }}>
                  <span className="st-hiw-icon">{item.icon}</span>
                  <div className="st-hiw-name">{item.title}</div>
                  <div className="st-hiw-desc">{item.desc}</div>
                </div>
              ))}
            </div>

            <div className="st-scoring">
              <div className="st-scoring-label"><span>Scoring</span></div>
              {SCORING_PILLS.map((s) => (
                <div className="st-scoring-item" key={s.label}>
                  <span className={`st-scoring-val ${s.neg ? "neg" : "pos"}`}>{s.value}</span>
                  <span className="st-scoring-key">{s.label}</span>
                </div>
              ))}
              <div className="st-scoring-item">
                <span className="st-scoring-val pos">Top 5</span>
                <span className="st-scoring-key">matches</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Week sections ── */}
        {weeks.map((week) => {
          const cfg = weekTagConfig[week.weekTag];
          const t   = week.free;
          if (!t) return null;

          const now         = Date.now();
          const endTime     = new Date(t.weekEnd).getTime();
          const regDeadline = new Date(t.registrationDeadline).getTime();

          const isCompleted = t.status === "ended" || now > endTime + 86400000;
          const isCurrent   = !isCompleted && t.status === "active";
          const isUpcoming  = !isCompleted && !isCurrent;
          const isRegOpen   = isUpcoming || (isCurrent && now <= regDeadline);
          const isRegistered = registeredIds.has(t.id);

          const slotsLeft = t.totalSlots - t.slotsBooked;
          const timeLeft  = countdown[t.id] || "";

          // Start / end dates for display
          const startLabel = new Date(t.weekStart).toLocaleDateString("en-IN", {
            day: "numeric", month: "short", year: "numeric",
          });
          const endLabel = new Date(t.weekEnd).toLocaleDateString("en-IN", {
            day: "numeric", month: "short", year: "numeric",
          });

          let cardClass = "st-row-card";
          if (isCompleted)  cardClass += " ended";
          if (isRegistered) cardClass += " registered";

          return (
            <div key={week.label} style={{ marginBottom: 28 }}>
              {/* Week label */}
              <div className="st-week-label-row">
                <span className="st-week-tag" style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
                  {cfg.label}
                </span>
                <span className="st-week-date">{week.label}</span>
              </div>

              {/* Single row card */}
              <div className={cardClass}>
                <div className="st-row-accent" />
                <div className="st-row-body">

                  {/* Left — name + badges */}
                  <div className="st-row-left">
                    <div className="st-row-badges">
                      <span className="st-badge-pill badge-free">FREE</span>
                      {isCompleted && <span className="st-badge-pill badge-ended">Ended</span>}
                      {isCurrent   && <span className="st-badge-pill badge-live">🟢 Live</span>}
                      {isUpcoming  && <span className="st-badge-pill badge-upcoming">Upcoming</span>}
                      {isRegistered && !isCompleted && <span className="st-badge-pill badge-reg">✓ Registered</span>}
                    </div>
                    <div className="st-row-name">{t.name}</div>
                  </div>

                  {/* Middle — stats */}
                  <div className="st-row-stats">
                    <div className="st-stat">
                      <span className="st-stat-key">Prize Pool</span>
                      <span className="st-stat-prize">{t.prizePool}</span>
                    </div>
                    <div className="st-stat">
                      <span className="st-stat-key">Slots Left</span>
                      <span className="st-stat-val">{slotsLeft} / {t.totalSlots}</span>
                    </div>
                    <div className="st-stat">
                      <span className="st-stat-key">Starts</span>
                      <span className="st-stat-val">{startLabel}</span>
                    </div>
                    <div className="st-stat">
                      <span className="st-stat-key">Ends</span>
                      <span className="st-stat-val">{endLabel}</span>
                    </div>
                  </div>

                  {/* Countdown chip — only when reg is open */}
                  {isCurrent && isRegOpen && timeLeft && (
                    <div className="st-countdown-chip">
                      <span>⏱️</span>
                      <span className="label">Reg closes in</span>
                      <span className="time">{timeLeft}</span>
                    </div>
                  )}

                  {/* CTA button */}
                  <div className="st-row-cta">

                    {/* Ended — view leaderboard */}
                    {isCompleted && (
                      <button
                        className="st-btn st-btn-ghost"
                        onClick={() => router.push(`/solo/${t.id}?tab=leaderboard`)}
                      >
                        View Leaderboard →
                      </button>
                    )}

                    {/* Active, reg open, not registered */}
                    {isCurrent && isRegOpen && !isRegistered && (
                      <button
                        className="st-btn st-btn-primary"
                        onClick={() => router.push(`/solo/${t.id}`)}
                      >
                        Register Free →
                      </button>
                    )}

                    {/* Active, reg closed, not registered */}
                    {isCurrent && !isRegOpen && !isRegistered && (
                      <button
                        className="st-btn st-btn-ghost"
                        onClick={() => router.push(`/solo/${t.id}?tab=leaderboard`)}
                      >
                        View Leaderboard →
                      </button>
                    )}

                    {/* Active or upcoming, registered */}
                    {(isCurrent || isUpcoming) && isRegistered && (
                      <button
                        className="st-btn st-btn-ghost-green"
                        onClick={() => router.push(`/solo/${t.id}?tab=leaderboard`)}
                      >
                        View My Score →
                      </button>
                    )}

                    {/* Upcoming, not registered */}
                    {isUpcoming && !isRegistered && (
                      <button
                        className="st-btn st-btn-primary"
                        onClick={() => router.push(`/solo/${t.id}`)}
                      >
                        Register Free →
                      </button>
                    )}

                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}