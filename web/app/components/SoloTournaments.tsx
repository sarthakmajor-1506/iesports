"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getThreeWeeks, formatWeekLabel, getTimeUntilDeadline } from "@/lib/soloTournaments";
import { SoloTournament } from "@/lib/types";

type WeekGroup = {
  label:   string;
  weekTag: "last" | "current" | "next";
  free:    SoloTournament | null;
};

const HOW_IT_WORKS = [
  { icon: "🎮", title: "Connect & Join",  desc: "Link Steam once. Register for any weekly tournament.",       color: "#3B82F6" },
  { icon: "⚔️", title: "Play Your Games", desc: "Play normal ranked Dota 2. No custom lobbies needed.",       color: "#4ade80" },
  { icon: "📊", title: "Auto Tracked",    desc: "We pull match stats via OpenDota. Top 5 scores count.",      color: "#60A5FA" },
  { icon: "🏆", title: "Get Rewarded",    desc: "Top players win prizes paid via UPI within 48 hours.",       color: "#a78bfa" },
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
  const { registeredSoloTournaments: registeredIds } = useAuth();
  const router   = useRouter();

  const [weeks,         setWeeks]         = useState<WeekGroup[]>([]);
  const [countdown,     setCountdown]     = useState<Record<string, string>>({});

  useEffect(() => {
    const { last, current, next } = getThreeWeeks();
    const weekTags: Record<string, "last" | "current" | "next"> = { [last]: "last", [current]: "current", [next]: "next" };
    const q = query(collection(db, "soloTournaments"), where("game", "==", "dota2"), where("type", "==", "free"));
    const unsub = onSnapshot(q, (snap) => {
      const all: Record<string, SoloTournament> = {};
      snap.docs.forEach((d) => { all[d.id] = { id: d.id, ...d.data() } as SoloTournament; });
      const grouped: WeekGroup[] = [last, current, next].map((weekId) => ({ label: formatWeekLabel(weekId), weekTag: weekTags[weekId], free: all[`${weekId}-free`] || null }));
      setWeeks(grouped);
    });
    return () => unsub();
  }, []);


  useEffect(() => {
    const tick = () => { const updated: Record<string, string> = {}; weeks.forEach((w) => { if (w.free) updated[w.free.id] = getTimeUntilDeadline(w.free.registrationDeadline); }); setCountdown(updated); };
    tick(); const interval = setInterval(tick, 1000); return () => clearInterval(interval);
  }, [weeks]);

  const weekTagConfig = {
    last:    { label: "Last Week",  bg: "#1a1a1f", color: "#8A8880",    border: "#2A2A30" },
    current: { label: "This Week",  bg: "rgba(22,163,74,0.12)", color: "#4ade80", border: "rgba(34,197,94,0.3)" },
    next:    { label: "Next Week",  bg: "rgba(59,130,246,0.12)", color: "#60A5FA", border: "rgba(59,130,246,0.3)" },
  };

  return (
    <>
      <style>{`
        .st-wrap { max-width: 900px; margin: 0 auto; padding: 20px 28px 60px; }

        .st-info-panel { background: #121215; border: 1px solid #2A2A30; border-radius: 16px; overflow: hidden; margin-bottom: 28px; box-shadow: 0 1px 4px rgba(0,0,0,0.2); }
        .st-info-accent { height: 3px; background: linear-gradient(90deg, #3B82F6, #4ade80, #60A5FA, #a78bfa); }
        .st-info-body { padding: 20px 24px; }
        .st-info-top { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
        .st-info-label { font-size: 0.65rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #3B82F6; margin-bottom: 4px; }
        .st-info-title { font-size: 1.25rem; font-weight: 900; color: #F0EEEA; letter-spacing: -0.02em; margin-bottom: 3px; }
        .st-info-sub { font-size: 0.78rem; color: #8A8880; }

        .st-smurf { background: rgba(234,88,12,0.08); border: 1px solid rgba(234,88,12,0.25); border-radius: 10px; padding: 10px 14px; max-width: 280px; }
        .st-smurf-title { font-size: 0.72rem; font-weight: 800; color: #fb923c; margin-bottom: 4px; }
        .st-smurf-desc { font-size: 0.72rem; color: #d97706; line-height: 1.5; }
        .st-smurf-desc strong { color: #fb923c; }

        .st-hiw-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
        @media (max-width: 640px) { .st-hiw-grid { grid-template-columns: 1fr 1fr; } }
        .st-hiw-card { background: #18181C; border: 1px solid #2A2A30; border-top-width: 2px; border-radius: 10px; padding: 14px; }
        .st-hiw-icon { font-size: 1.2rem; margin-bottom: 8px; display: block; }
        .st-hiw-name { font-size: 0.78rem; font-weight: 800; color: #F0EEEA; margin-bottom: 4px; }
        .st-hiw-desc { font-size: 0.7rem; color: #8A8880; line-height: 1.5; }

        .st-scoring { display: flex; background: #18181C; border: 1px solid #2A2A30; border-radius: 8px; overflow: hidden; flex-wrap: wrap; }
        .st-scoring-label { padding: 8px 14px; border-right: 1px solid #2A2A30; display: flex; align-items: center; flex-shrink: 0; }
        .st-scoring-label span { font-size: 0.6rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #555550; }
        .st-scoring-item { padding: 8px 14px; border-right: 1px solid #2A2A30; display: flex; flex-direction: column; align-items: center; gap: 2px; flex-shrink: 0; }
        .st-scoring-item:last-child { border-right: none; }
        .st-scoring-val { font-size: 0.78rem; font-weight: 800; }
        .st-scoring-val.pos { color: #4ade80; }
        .st-scoring-val.neg { color: #f87171; }
        .st-scoring-key { font-size: 0.65rem; color: #555550; }

        .st-week-label-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .st-week-tag { font-size: 0.7rem; font-weight: 800; padding: 4px 12px; border-radius: 100px; border: 1px solid; }
        .st-week-date { font-size: 0.8rem; color: #8A8880; font-weight: 500; }

        .st-row-card { background: #121215; border: 1px solid #2A2A30; border-radius: 14px; overflow: hidden; margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.2); transition: box-shadow 0.18s, transform 0.18s; }
        .st-row-card:hover { box-shadow: 0 4px 18px rgba(0,0,0,0.35); transform: translateY(-1px); }
        .st-row-card.registered { border-color: rgba(34,197,94,0.3); }
        .st-row-card.ended { opacity: 0.7; }

        .st-row-accent { height: 3px; background: linear-gradient(90deg, #3B82F6, #2563EB); }
        .st-row-body { display: flex; align-items: center; gap: 20px; padding: 16px 20px; flex-wrap: wrap; }

        .st-row-left { flex: 1; min-width: 180px; }
        .st-row-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
        .st-badge-pill { font-size: 0.62rem; font-weight: 800; padding: 3px 9px; border-radius: 100px; border: 1px solid; }
        .badge-free     { background: rgba(234,88,12,0.1); color: #fb923c; border-color: rgba(234,88,12,0.3); }
        .badge-live     { background: rgba(22,163,74,0.12); color: #4ade80; border-color: rgba(34,197,94,0.3); }
        .badge-upcoming { background: rgba(59,130,246,0.12); color: #60A5FA; border-color: rgba(59,130,246,0.3); }
        .badge-ended    { background: #1a1a1f; color: #8A8880; border-color: #2A2A30; }
        .badge-reg      { background: rgba(22,163,74,0.12); color: #4ade80; border-color: rgba(34,197,94,0.3); }

        .st-row-name { font-size: 0.95rem; font-weight: 800; color: #F0EEEA; }

        .st-row-stats { display: flex; gap: 20px; flex-shrink: 0; }
        .st-stat { display: flex; flex-direction: column; align-items: center; }
        .st-stat-key { font-size: 0.58rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #555550; margin-bottom: 2px; }
        .st-stat-val { font-size: 0.84rem; font-weight: 700; color: #e0e0da; }
        .st-stat-prize { font-size: 1rem; font-weight: 900; color: #3B82F6; }

        .st-countdown-chip { display: flex; align-items: center; gap: 6px; background: rgba(22,163,74,0.1); border: 1px solid rgba(34,197,94,0.25); border-radius: 100px; padding: 5px 12px; font-size: 0.74rem; flex-shrink: 0; }
        .st-countdown-chip .time { color: #4ade80; font-weight: 700; }
        .st-countdown-chip .label { color: #8A8880; }

        .st-row-cta { flex-shrink: 0; min-width: 160px; }
        .st-btn { width: 100%; padding: 10px 18px; border-radius: 100px; border: none; font-size: 0.82rem; font-weight: 700; cursor: pointer; font-family: inherit; transition: all 0.15s; text-align: center; white-space: nowrap; }
        .st-btn-primary { background: #3B82F6; color: #fff; box-shadow: 0 2px 10px rgba(59,130,246,0.25); }
        .st-btn-primary:hover:not(:disabled) { background: #2563EB; }
        .st-btn-ghost { background: transparent; color: #8A8880; border: 1px solid #2A2A30 !important; }
        .st-btn-ghost:hover { background: #18181C; }
        .st-btn-ghost-green { background: transparent; color: #4ade80; border: 1px solid rgba(34,197,94,0.3) !important; }
        .st-btn-ghost-green:hover { background: rgba(22,163,74,0.08); }
        .st-btn-reg-closed { background: rgba(234,88,12,0.08); color: #fb923c; border: 1px solid rgba(234,88,12,0.25) !important; cursor: default; }

        @media (max-width: 640px) { .st-row-body { flex-direction: column; align-items: flex-start; gap: 12px; } .st-row-cta { width: 100%; } .st-row-stats { gap: 14px; } }
      `}</style>

      <div className="st-wrap">
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
                <div className="st-smurf-desc">Abnormal performance vs rank history = <strong>disqualification & prize forfeiture</strong>.</div>
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
              {SCORING_PILLS.map((s) => (<div className="st-scoring-item" key={s.label}><span className={`st-scoring-val ${s.neg ? "neg" : "pos"}`}>{s.value}</span><span className="st-scoring-key">{s.label}</span></div>))}
              <div className="st-scoring-item"><span className="st-scoring-val pos">Top 5</span><span className="st-scoring-key">matches</span></div>
            </div>
          </div>
        </div>

        {weeks.map((week) => {
          const cfg = weekTagConfig[week.weekTag];
          const t = week.free;
          if (!t) return null;
          const nowMs = Date.now();
          const tWeekStart = new Date(t.weekStart).getTime();
          const tWeekEnd = new Date(t.weekEnd).getTime();
          const regDeadline = new Date(t.registrationDeadline).getTime();
          const isCompleted = nowMs > tWeekEnd;
          const isCurrent = nowMs >= tWeekStart && nowMs <= tWeekEnd;
          const isUpcoming = nowMs < tWeekStart;
          const isRegOpen = nowMs <= regDeadline && !isCompleted;
          const isRegistered = registeredIds.has(t.id);
          const slotsLeft = t.totalSlots - (t.slotsBooked || 0);
          const timeLeft = countdown[t.id] || "";
          const startLabel = new Date(t.weekStart).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
          const endLabel = new Date(t.weekEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
          let cardClass = "st-row-card";
          if (isCompleted) cardClass += " ended";
          if (isRegistered) cardClass += " registered";

          return (
            <div key={week.label} style={{ marginBottom: 28 }}>
              <div className="st-week-label-row">
                <span className="st-week-tag" style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>{cfg.label}</span>
                <span className="st-week-date">{week.label}</span>
              </div>
              <div className={cardClass}>
                <div className="st-row-accent" />
                <div className="st-row-body">
                  <div className="st-row-left">
                    <div className="st-row-badges">
                      <span className="st-badge-pill badge-free">FREE</span>
                      {isCompleted && <span className="st-badge-pill badge-ended">Ended</span>}
                      {isCurrent && <span className="st-badge-pill badge-live">🟢 Live</span>}
                      {isUpcoming && <span className="st-badge-pill badge-upcoming">Upcoming</span>}
                      {isRegistered && !isCompleted && <span className="st-badge-pill badge-reg">✓ Registered</span>}
                    </div>
                    <div className="st-row-name">{t.name}</div>
                  </div>
                  <div className="st-row-stats">
                    <div className="st-stat"><span className="st-stat-key">Prize Pool</span><span className="st-stat-prize">{t.prizePool}</span></div>
                    <div className="st-stat"><span className="st-stat-key">Slots Left</span><span className="st-stat-val">{slotsLeft} / {t.totalSlots}</span></div>
                    <div className="st-stat"><span className="st-stat-key">Starts</span><span className="st-stat-val">{startLabel}</span></div>
                    <div className="st-stat"><span className="st-stat-key">Ends</span><span className="st-stat-val">{endLabel}</span></div>
                  </div>
                  {(isCurrent || isUpcoming) && isRegOpen && !isRegistered && timeLeft && timeLeft !== "Registration Closed" && (
                    <div className="st-countdown-chip"><span>⏱️</span><span className="label">Reg closes in</span><span className="time">{timeLeft}</span></div>
                  )}
                  {isRegistered && !isCompleted && (
                    <div className="st-countdown-chip" style={{ background: "rgba(22,163,74,0.1)", borderColor: "rgba(34,197,94,0.25)" }}><span>✓</span><span className="label" style={{ color: "#4ade80" }}>Registered</span></div>
                  )}
                  <div className="st-row-cta">
                    {isCompleted && <button className="st-btn st-btn-ghost" onClick={() => router.push(`/solo/${t.id}?tab=leaderboard`)}>View Leaderboard →</button>}
                    {(isCurrent || isUpcoming) && isRegOpen && !isRegistered && <button className="st-btn st-btn-primary" onClick={() => router.push(`/solo/${t.id}`)}>Register Free →</button>}
                    {isCurrent && !isRegOpen && !isRegistered && <button className="st-btn st-btn-ghost" onClick={() => router.push(`/solo/${t.id}?tab=leaderboard`)}>View Leaderboard →</button>}
                    {(isCurrent || isUpcoming) && isRegistered && <button className="st-btn st-btn-ghost-green" onClick={() => router.push(`/solo/${t.id}?tab=leaderboard`)}>View My Score →</button>}
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