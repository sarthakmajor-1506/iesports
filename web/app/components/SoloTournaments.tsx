"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getThreeWeeks, formatWeekLabel, getTimeUntilDeadline } from "@/lib/soloTournaments";
import { SoloTournament } from "@/lib/types";

type WeekGroup = {
  label: string;
  weekTag: "last" | "current" | "next";
  free: SoloTournament | null;
  paid: SoloTournament | null;
};

const HOW_IT_WORKS = [
  { icon: "🎮", title: "Connect & Join",   desc: "Link Steam once. Register for any weekly tournament.",          color: "#F05A28" },
  { icon: "⚔️", title: "Play Your Games",  desc: "Just play normal ranked Dota 2. No custom lobbies needed.",    color: "#16a34a" },
  { icon: "📊", title: "Auto Tracked",     desc: "We pull your match stats via OpenDota. Top 3 scores count.",   color: "#2563eb" },
  { icon: "🏆", title: "Get Rewarded",     desc: "Top players win prizes paid via UPI within 48 hours.",         color: "#7c3aed" },
];

const SCORING = [
  { label: "Kill",    value: "+3",  neg: false },
  { label: "Assist",  value: "+1",  neg: false },
  { label: "Death",   value: "-2",  neg: true  },
  { label: "10 LH",  value: "+1",  neg: false },
  { label: "50 GPM",  value: "+1",  neg: false },
  { label: "50 XPM",  value: "+1",  neg: false },
  { label: "Win",     value: "+20", neg: false },
];

export default function SoloTournaments() {
  const { user } = useAuth();
  const router = useRouter();
  const [weeks, setWeeks] = useState<WeekGroup[]>([]);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());
  const [countdown, setCountdown] = useState<Record<string, string>>({});
  const [comingSoonId, setComingSoonId] = useState<string | null>(null);

  useEffect(() => {
    const { last, current, next } = getThreeWeeks();
    const weekTags: Record<string, "last" | "current" | "next"> = {
      [last]: "last", [current]: "current", [next]: "next",
    };
    const q = query(collection(db, "soloTournaments"), where("game", "==", "dota2"));
    const unsub = onSnapshot(q, (snap) => {
      const all: Record<string, SoloTournament> = {};
      snap.docs.forEach((d) => { all[d.id] = { id: d.id, ...d.data() } as SoloTournament; });
      const grouped: WeekGroup[] = [last, current, next].map((weekId) => ({
        label: formatWeekLabel(weekId),
        weekTag: weekTags[weekId],
        free: all[`${weekId}-free`] || null,
        paid: all[`${weekId}-paid`] || null,
      }));
      setWeeks(grouped);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const data = userSnap.data();
      setRegisteredIds(new Set(data?.registeredSoloTournaments || []));
    };
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [user]);

  useEffect(() => {
    const tick = () => {
      const updated: Record<string, string> = {};
      weeks.forEach((w) => {
        [w.free, w.paid].forEach((t) => {
          if (t) updated[t.id] = getTimeUntilDeadline(t.registrationDeadline);
        });
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
        .st-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 20px 30px 48px;
        }

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
        .st-info-body {
          padding: 20px 24px;
        }
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
        .st-info-sub {
          font-size: 0.78rem;
          color: #888;
        }

        /* Smurf banner */
        .st-smurf {
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 10px;
          padding: 10px 14px;
          max-width: 300px;
        }
        .st-smurf-title {
          font-size: 0.72rem;
          font-weight: 800;
          color: #ea580c;
          margin-bottom: 4px;
        }
        .st-smurf-desc {
          font-size: 0.72rem;
          color: #92400e;
          line-height: 1.5;
        }
        .st-smurf-desc strong { color: #ea580c; }

        /* How it works grid */
        .st-hiw-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-bottom: 16px;
        }
        @media (max-width: 700px) { .st-hiw-grid { grid-template-columns: 1fr 1fr; } }
        .st-hiw-card {
          background: #F8F7F4;
          border: 1px solid #E5E3DF;
          border-radius: 10px;
          padding: 14px;
          border-top-width: 2px;
        }
        .st-hiw-icon { font-size: 1.2rem; margin-bottom: 8px; display: block; }
        .st-hiw-name {
          font-size: 0.78rem;
          font-weight: 800;
          color: #111;
          margin-bottom: 4px;
        }
        .st-hiw-desc {
          font-size: 0.7rem;
          color: #888;
          line-height: 1.5;
        }

        /* Scoring strip */
        .st-scoring {
          display: flex;
          background: #F8F7F4;
          border: 1px solid #E5E3DF;
          border-radius: 8px;
          overflow: hidden;
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
        .st-scoring-val {
          font-size: 0.78rem;
          font-weight: 800;
        }
        .st-scoring-val.pos { color: #16a34a; }
        .st-scoring-val.neg { color: #dc2626; }
        .st-scoring-val.special { color: #F05A28; }
        .st-scoring-key {
          font-size: 0.65rem;
          color: #aaa;
        }

        /* ── Week section ── */
        .st-week-label-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        .st-week-tag {
          font-size: 0.7rem;
          font-weight: 800;
          padding: 4px 12px;
          border-radius: 100px;
          border: 1px solid;
        }
        .st-week-date {
          font-size: 0.8rem;
          color: #888;
          font-weight: 500;
        }

        /* Tournament cards grid */
        .st-cards-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 640px) { .st-cards-grid { grid-template-columns: 1fr; } }

        /* Individual card */
        .st-card {
          background: #fff;
          border: 1px solid #E5E3DF;
          border-radius: 14px;
          overflow: hidden;
          position: relative;
          transition: box-shadow 0.18s, transform 0.18s, border-color 0.18s;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
          cursor: pointer;
        }
        .st-card:hover {
          box-shadow: 0 6px 24px rgba(0,0,0,0.1);
          transform: translateY(-2px);
        }
        .st-card.completed { opacity: 0.65; }
        .st-card.registered { border-color: #bbf7d0; background: #fafffe; }
        .st-card.paid-card  { border-color: #e9d5ff; background: #fdfaff; }

        .st-card-accent { height: 3px; width: 100%; }

        .st-card-body { padding: 18px 20px 20px; }

        /* Card header */
        .st-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }
        .st-card-badges {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 7px;
        }
        .st-badge-pill {
          font-size: 0.62rem;
          font-weight: 800;
          padding: 3px 9px;
          border-radius: 100px;
          border: 1px solid;
        }
        .st-badge-free     { background: #fff7ed; color: #ea580c; border-color: #fed7aa; }
        .st-badge-pro      { background: #faf5ff; color: #7c3aed; border-color: #e9d5ff; }
        .st-badge-live     { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }
        .st-badge-upcoming { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
        .st-badge-ended    { background: #F2F1EE; color: #888;    border-color: #E5E3DF; }
        .st-badge-reg      { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }

        .st-card-name {
          font-size: 0.95rem;
          font-weight: 800;
          color: #111;
        }

        .st-prize-col { text-align: right; flex-shrink: 0; }
        .st-prize-lbl {
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #bbb;
          margin-bottom: 3px;
        }
        .st-prize-val {
          font-size: 1.35rem;
          font-weight: 900;
          line-height: 1;
        }
        .st-prize-val.free-prize { color: #F05A28; }
        .st-prize-val.pro-prize  { color: #7c3aed; }

        /* Stats row */
        .st-stats-row {
          display: flex;
          gap: 18px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .st-stat-item { }
        .st-stat-key {
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #bbb;
          margin-bottom: 2px;
        }
        .st-stat-val {
          font-size: 0.82rem;
          font-weight: 700;
          color: #444;
        }

        /* Slot bar */
        .st-slot-bar {
          height: 3px;
          background: #F2F1EE;
          border-radius: 2px;
          overflow: hidden;
          margin-bottom: 12px;
        }
        .st-slot-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }

        /* Countdown chip */
        .st-countdown-chip {
          display: flex;
          align-items: center;
          gap: 7px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          padding: 7px 12px;
          margin-bottom: 12px;
          font-size: 0.76rem;
        }
        .st-countdown-chip .time { color: #16a34a; font-weight: 700; }
        .st-countdown-chip .label { color: #888; }

        /* Buttons */
        .st-btn {
          width: 100%;
          padding: 10px 0;
          border-radius: 100px;
          border: none;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
          text-align: center;
        }
        .st-btn-primary {
          background: #F05A28;
          color: #fff;
          box-shadow: 0 2px 10px rgba(240,90,40,0.25);
        }
        .st-btn-primary:hover { background: #D44A1A; }
        .st-btn-pro {
          background: #faf5ff;
          color: #7c3aed;
          border: 1px solid #e9d5ff !important;
          box-shadow: 0 2px 8px rgba(124,58,237,0.12);
        }
        .st-btn-pro:hover { background: #f3e8ff; }
        .st-btn-ghost {
          background: transparent;
          color: #888;
          border: 1px solid #E5E3DF !important;
        }
        .st-btn-ghost:hover { background: #F8F7F4; color: #555; }
        .st-btn-ghost-green {
          background: transparent;
          color: #16a34a;
          border: 1px solid #bbf7d0 !important;
        }
        .st-btn-ghost-green:hover { background: #f0fdf4; }

        .st-reg-closed-pill {
          width: 100%;
          padding: 10px 0;
          text-align: center;
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 100px;
          color: #ea580c;
          font-size: 0.82rem;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .st-registered-pill {
          width: 100%;
          padding: 10px 0;
          text-align: center;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 100px;
          color: #16a34a;
          font-size: 0.82rem;
          font-weight: 700;
          margin-bottom: 8px;
        }

        /* ── Pro coming soon modal ── */
        .st-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .st-modal {
          background: #fff;
          border: 1px solid #E5E3DF;
          border-radius: 20px;
          padding: 36px 32px;
          max-width: 360px;
          width: 90%;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        }
        .st-modal-emoji { font-size: 44px; margin-bottom: 14px; display: block; }
        .st-modal-title {
          font-size: 1.3rem;
          font-weight: 900;
          color: #7c3aed;
          margin-bottom: 10px;
        }
        .st-modal-desc {
          font-size: 0.85rem;
          color: #666;
          line-height: 1.7;
          margin-bottom: 6px;
        }
        .st-modal-meta {
          font-size: 0.78rem;
          color: #aaa;
          margin-bottom: 22px;
        }
        .st-modal-btn {
          padding: 11px 28px;
          background: #7c3aed;
          border: none;
          border-radius: 100px;
          color: #fff;
          font-weight: 700;
          font-size: 0.88rem;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
        }
        .st-modal-btn:hover { background: #6d28d9; }
      `}</style>

      <div className="st-wrap">

        {/* ── Info panel ─────────────────────────────────────────────────────── */}
        <div className="st-info-panel">
          <div className="st-info-accent" />
          <div className="st-info-body">

            {/* Title + smurf warning */}
            <div className="st-info-top">
              <div>
                <div className="st-info-label">Solo Tournaments</div>
                <div className="st-info-title">Play. Score. Win.</div>
                <div className="st-info-sub">Top 3 match scores count · Weekly prizes · UPI payouts</div>
              </div>
              <div className="st-smurf">
                <div className="st-smurf-title">🤖 AI Smurf Monitor Active</div>
                <div className="st-smurf-desc">
                  Abnormal performance vs rank history = <strong>disqualification & prize forfeiture</strong>.
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="st-hiw-grid">
              {HOW_IT_WORKS.map((item) => (
                <div
                  key={item.title}
                  className="st-hiw-card"
                  style={{ borderTopColor: item.color }}
                >
                  <span className="st-hiw-icon">{item.icon}</span>
                  <div className="st-hiw-name">{item.title}</div>
                  <div className="st-hiw-desc">{item.desc}</div>
                </div>
              ))}
            </div>

            {/* Scoring strip */}
            <div className="st-scoring">
              <div className="st-scoring-label"><span>Scoring</span></div>
              {SCORING.map((s) => (
                <div className="st-scoring-item" key={s.label}>
                  <span className={`st-scoring-val ${s.neg ? "neg" : "pos"}`}>{s.value}</span>
                  <span className="st-scoring-key">{s.label}</span>
                </div>
              ))}
              <div className="st-scoring-item">
                <span className="st-scoring-val special">Top 3</span>
                <span className="st-scoring-key">matches</span>
              </div>
            </div>

          </div>
        </div>

        {/* ── Week sections ───────────────────────────────────────────────────── */}
        {weeks.map((week) => {
          const cfg = weekTagConfig[week.weekTag];
          return (
            <div key={week.label} style={{ marginBottom: 32 }}>

              {/* Week label */}
              <div className="st-week-label-row">
                <span
                  className="st-week-tag"
                  style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}
                >
                  {cfg.label}
                </span>
                <span className="st-week-date">{week.label}</span>
              </div>

              {/* Cards */}
              <div className="st-cards-grid">
                {[week.free, week.paid].map((t) => {
                  if (!t) return null;

                  const now = Date.now();
                  const endTime = new Date(t.weekEnd).getTime();
                  const regDeadline = new Date(t.registrationDeadline).getTime();
                  const isPaid = t.type === "paid";
                  const isRegistered = registeredIds.has(t.id);
                  const slotsLeft = t.totalSlots - t.slotsBooked;
                  const pct = Math.round((t.slotsBooked / t.totalSlots) * 100);
                  const timeLeft = countdown[t.id] || "";

                  const isCompleted = t.status === "ended" || now > endTime + 86400000;
                  const isCurrent   = !isCompleted && t.status === "active";
                  const isUpcoming  = !isCompleted && !isCurrent;
                  const isRegOpen   = isUpcoming || (isCurrent && now <= regDeadline);

                  const fillColor = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e";
                  const accentBg  = isPaid
                    ? "linear-gradient(90deg, #a855f7, #7c3aed)"
                    : "linear-gradient(90deg, #F05A28, #ea580c)";

                  let cardClass = "st-card";
                  if (isCompleted) cardClass += " completed";
                  else if (isRegistered) cardClass += " registered";
                  else if (isPaid) cardClass += " paid-card";

                  return (
                    <div key={t.id} className={cardClass}>
                      <div className="st-card-accent" style={{ background: accentBg }} />
                      <div className="st-card-body">

                        {/* Header */}
                        <div className="st-card-header">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="st-card-badges">
                              <span className={`st-badge-pill ${isPaid ? "st-badge-pro" : "st-badge-free"}`}>
                                {isPaid ? "⭐ PRO" : "FREE"}
                              </span>
                              {isCompleted ? (
                                <span className="st-badge-pill st-badge-ended">Ended</span>
                              ) : isCurrent ? (
                                <span className="st-badge-pill st-badge-live">🟢 Live</span>
                              ) : (
                                <span className="st-badge-pill st-badge-upcoming">Upcoming</span>
                              )}
                              {isRegistered && !isCompleted && (
                                <span className="st-badge-pill st-badge-reg">✓ Registered</span>
                              )}
                            </div>
                            <div className="st-card-name">{t.name}</div>
                          </div>
                          <div className="st-prize-col" style={{ marginLeft: 12 }}>
                            <div className="st-prize-lbl">Prize Pool</div>
                            <div className={`st-prize-val ${isPaid ? "pro-prize" : "free-prize"}`}>
                              {t.prizePool}
                            </div>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="st-stats-row">
                          {[
                            { key: "Entry",      val: t.entry },
                            { key: "Slots Left", val: `${slotsLeft} / ${t.totalSlots}` },
                            { key: "Format",     val: "Top 3 matches" },
                          ].map((s) => (
                            <div className="st-stat-item" key={s.key}>
                              <div className="st-stat-key">{s.key}</div>
                              <div className="st-stat-val">{s.val}</div>
                            </div>
                          ))}
                        </div>

                        {/* Slot bar */}
                        <div className="st-slot-bar">
                          <div className="st-slot-fill" style={{ width: `${pct}%`, background: fillColor }} />
                        </div>

                        {/* Countdown */}
                        {isCurrent && isRegOpen && timeLeft && (
                          <div className="st-countdown-chip">
                            <span>⏱️</span>
                            <span className="label">Registration ends in</span>
                            <span className="time">{timeLeft}</span>
                          </div>
                        )}

                        {/* ── Button logic ── */}

                        {/* 1. Completed */}
                        {isCompleted && (
                          <button
                            className="st-btn st-btn-ghost"
                            onClick={() => router.push(`/tournament/solo/${t.id}`)}
                          >
                            View Leaderboard
                          </button>
                        )}

                        {/* 2. Current, reg open, not registered */}
                        {isCurrent && isRegOpen && !isRegistered && (
                          <button
                            className={`st-btn ${isPaid ? "st-btn-pro" : "st-btn-primary"}`}
                            onClick={() => {
                              if (isPaid) { setComingSoonId(t.id); return; }
                              router.push(`/tournament/solo/${t.id}`);
                            }}
                          >
                            {isPaid ? "⭐ Join Pro Tournament →" : "Register Free →"}
                          </button>
                        )}

                        {/* 3. Current, reg closed, not registered */}
                        {isCurrent && !isRegOpen && !isRegistered && (
                          <>
                            <div className="st-reg-closed-pill">🔒 Registration Closed</div>
                            <button
                              className="st-btn st-btn-ghost"
                              onClick={() => router.push(`/tournament/solo/${t.id}`)}
                            >
                              View Leaderboard
                            </button>
                          </>
                        )}

                        {/* 4. Current or upcoming, registered */}
                        {(isCurrent || isUpcoming) && isRegistered && (
                          <>
                            <div className="st-registered-pill">✓ Registered</div>
                            <button
                              className="st-btn st-btn-ghost-green"
                              onClick={() => router.push(`/tournament/solo/${t.id}`)}
                            >
                              View My Score →
                            </button>
                          </>
                        )}

                        {/* 5. Upcoming, not registered */}
                        {isUpcoming && !isRegistered && (
                          <button
                            className={`st-btn ${isPaid ? "st-btn-pro" : "st-btn-primary"}`}
                            onClick={() => {
                              if (isPaid) { setComingSoonId(t.id); return; }
                              router.push(`/tournament/solo/${t.id}`);
                            }}
                          >
                            {isPaid ? "⭐ Join Pro Tournament →" : "Register Free →"}
                          </button>
                        )}

                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* ── Pro coming soon modal ───────────────────────────────────────────── */}
        {comingSoonId && (
          <div className="st-modal-overlay" onClick={() => setComingSoonId(null)}>
            <div className="st-modal" onClick={(e) => e.stopPropagation()}>
              <span className="st-modal-emoji">⭐</span>
              <div className="st-modal-title">Pro Tournament</div>
              <p className="st-modal-desc">
                Paid tournaments with ₹10,000 prize pool are coming soon. Payment gateway integration is in progress.
              </p>
              <p className="st-modal-meta">Entry fee: ₹199 · Slots: 50 · Payout via UPI</p>
              <button className="st-modal-btn" onClick={() => setComingSoonId(null)}>
                Got it
              </button>
            </div>
          </div>
        )}

      </div>
    </>
  );
}