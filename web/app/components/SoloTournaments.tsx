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

  const weekTagLabel: Record<string, string> = { last: "Last Week", current: "This Week", next: "Next Week" };
  const weekTagColor: Record<string, string> = { last: "#444", current: "#22c55e", next: "#3b82f6" };

  const howItWorks = [
    { icon: "🎮", title: "Connect & Join", desc: "Link Steam once. Register for any weekly tournament.", color: "#f97316" },
    { icon: "⚔️", title: "Play Your Games", desc: "Just play normal ranked Dota 2. No custom lobbies.", color: "#22c55e" },
    { icon: "📊", title: "Auto Tracked", desc: "We pull your match stats via OpenDota. Top 3 scores count.", color: "#3b82f6" },
    { icon: "🏆", title: "Get Rewarded", desc: "Top players win prizes paid via UPI within 48 hours.", color: "#a855f7" },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "30px" }}>

      {/* Compact top section */}
      <div style={{
        background: "#0a0a0a", border: "1px solid #141414",
        borderRadius: 14, padding: "20px 24px", marginBottom: 28,
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, #f97316, #22c55e, #3b82f6, #a855f7)" }} />

        {/* Title row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ color: "#f97316", fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>SOLO TOURNAMENTS</p>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>Play. Score. Win.</h2>
            <p style={{ color: "#555", fontSize: 12, marginTop: 3 }}>Top 3 match scores count · Weekly prizes · UPI payouts</p>
          </div>
          <div style={{
            background: "#1a0f00", border: "1px solid #7c2d12",
            borderRadius: 8, padding: "8px 12px", maxWidth: 300,
          }}>
            <p style={{ color: "#f97316", fontSize: 11, fontWeight: 800, marginBottom: 3 }}>🤖 AI Smurf Monitor Active</p>
            <p style={{ color: "#78350f", fontSize: 11, lineHeight: 1.5 }}>
              Abnormal performance vs rank history = <span style={{ color: "#f97316", fontWeight: 700 }}>disqualification & prize forfeiture</span>.
            </p>
          </div>
        </div>

        {/* 4 how-it-works cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          {howItWorks.map((item) => (
            <div key={item.title} style={{
              background: "#050505", border: "1px solid #141414",
              borderRadius: 10, padding: "14px",
              borderTop: `2px solid ${item.color}`,
            }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <p style={{ color: "#fff", fontSize: 12, fontWeight: 700, marginTop: 8, marginBottom: 4 }}>{item.title}</p>
              <p style={{ color: "#444", fontSize: 11, lineHeight: 1.5 }}>{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Compact scoring strip */}
        <div style={{ display: "flex", background: "#050505", border: "1px solid #141414", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", borderRight: "1px solid #141414", display: "flex", alignItems: "center" }}>
            <p style={{ color: "#444", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>SCORING</p>
          </div>
          {[
            { label: "Kill", value: "+3", neg: false },
            { label: "Assist", value: "+1", neg: false },
            { label: "Death", value: "-2", neg: true },
            { label: "10 LH", value: "+1", neg: false },
            { label: "50 GPM", value: "+1", neg: false },
            { label: "50 XPM", value: "+1", neg: false },
            { label: "Win", value: "+20", neg: false },
          ].map((item) => (
            <div key={item.label} style={{
              padding: "8px 14px", borderRight: "1px solid #141414",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            }}>
              <p style={{ color: item.neg ? "#ef4444" : "#22c55e", fontSize: 12, fontWeight: 800 }}>{item.value}</p>
              <p style={{ color: "#444", fontSize: 10 }}>{item.label}</p>
            </div>
          ))}
          <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <p style={{ color: "#f97316", fontSize: 12, fontWeight: 800 }}>Top 3</p>
            <p style={{ color: "#444", fontSize: 10 }}>matches</p>
          </div>
        </div>
      </div>

      {/* Coming soon modal */}
      {comingSoonId && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setComingSoonId(null)}>
          <div style={{
            background: "#0e0e0e", border: "1px solid #2d1b69",
            borderRadius: 16, padding: 32, maxWidth: 380, textAlign: "center",
          }} onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 44 }}>⭐</p>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginTop: 12, color: "#a855f7" }}>Pro Tournament</h3>
            <p style={{ color: "#555", fontSize: 14, marginTop: 10, lineHeight: 1.7 }}>
              Paid tournaments with ₹10,000 prize pool are coming soon. Payment gateway integration is in progress.
            </p>
            <p style={{ color: "#444", fontSize: 13, marginTop: 8 }}>Entry fee: ₹199 · Slots: 50 · Payout via UPI</p>
            <button onClick={() => setComingSoonId(null)} style={{
              marginTop: 20, padding: "10px 24px",
              background: "linear-gradient(135deg, #a855f7, #7c3aed)",
              border: "none", borderRadius: 8, color: "#fff",
              fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}>Got it</button>
          </div>
        </div>
      )}

      {/* Week sections */}
      {weeks.map((week) => (
        <div key={week.label} style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <span style={{
              background: weekTagColor[week.weekTag] + "20",
              color: weekTagColor[week.weekTag],
              border: `1px solid ${weekTagColor[week.weekTag]}40`,
              padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            }}>{weekTagLabel[week.weekTag]}</span>
            <span style={{ color: "#444", fontSize: 13 }}>{week.label}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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

              // --- Core status logic ---
              // Completed: status is ended OR end_time has passed
              const isCompleted = t.status === "ended" || now > endTime + 86400000;
              // Current week
              const isCurrent = !isCompleted && t.status === "active";
              // Upcoming
              const isUpcoming = !isCompleted && !isCurrent;
              // Registration open: upcoming always open, current open until deadline
              const isRegOpen = isUpcoming || (isCurrent && now <= regDeadline);

              // Badge
              const badge = isCompleted
                ? { label: "Completed", bg: "#1a1a1a", color: "#444" }
                : isCurrent
                ? { label: "🟢 Live", bg: "#16a34a15", color: "#22c55e" }
                : { label: "Upcoming", bg: "#1e3a5f20", color: "#3b82f6" };

              return (
                <div
                  key={t.id}
                  style={{
                    background: "#0a0a0a",
                    border: `1px solid ${isRegistered ? "#16a34a40" : isPaid ? "#2d1b69" : "#141414"}`,
                    borderRadius: 12, padding: "22px 24px",
                    opacity: isCompleted ? 0.7 : 1,
                    position: "relative", overflow: "hidden",
                    transition: "border-color 0.2s", cursor: "pointer",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = isRegistered ? "#16a34a80" : isPaid ? "#7c3aed60" : "#f97316")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = isRegistered ? "#16a34a40" : isPaid ? "#2d1b69" : "#141414")}
                >
                  {/* Top accent */}
                  <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: 2,
                    background: isPaid ? "linear-gradient(90deg, #a855f7, #7c3aed)" : "linear-gradient(90deg, #f97316, #ea580c)",
                  }} />

                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                        {/* Type badge */}
                        <span style={{
                          background: isPaid ? "#4c1d9520" : "#16a34a15",
                          color: isPaid ? "#a855f7" : "#22c55e",
                          border: `1px solid ${isPaid ? "#7c3aed40" : "#16a34a40"}`,
                          padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                        }}>{isPaid ? "⭐ PRO" : "FREE"}</span>
                        {/* Status badge */}
                        <span style={{
                          background: badge.bg, color: badge.color,
                          padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                        }}>{badge.label}</span>
                        {/* Registered badge */}
                        {isRegistered && (
                          <span style={{
                            background: "#14532d", color: "#22c55e",
                            border: "1px solid #16a34a40",
                            padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                          }}>✓ Registered</span>
                        )}
                      </div>
                      <p style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{t.name}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ color: "#333", fontSize: 10, letterSpacing: 1 }}>PRIZE POOL</p>
                      <p style={{ fontSize: 22, fontWeight: 800, color: isPaid ? "#a855f7" : "#f97316" }}>{t.prizePool}</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ display: "flex", gap: 20, marginBottom: 14 }}>
                    {[
                      { label: "ENTRY", value: t.entry },
                      { label: "SLOTS LEFT", value: `${slotsLeft} / ${t.totalSlots}` },
                      { label: "FORMAT", value: "Top 3 matches" },
                    ].map((item) => (
                      <div key={item.label}>
                        <p style={{ color: "#333", fontSize: 10, fontWeight: 600, letterSpacing: 1 }}>{item.label}</p>
                        <p style={{ color: "#666", fontSize: 13, fontWeight: 600, marginTop: 2 }}>{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Slots bar */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ width: "100%", height: 3, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e" }} />
                    </div>
                  </div>

                  {/* Countdown — only for current week with reg open */}
                  {isCurrent && isRegOpen && timeLeft && (
                    <div style={{
                      background: "#0f1a0f", border: "1px solid #14532d",
                      borderRadius: 8, padding: "7px 12px", marginBottom: 14,
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span>⏱️</span>
                      <span style={{ color: "#555", fontSize: 12 }}>Registration ends in</span>
                      <span style={{ color: "#22c55e", fontSize: 12, fontWeight: 700 }}>{timeLeft}</span>
                    </div>
                  )}

                  {/* === BUTTON LOGIC === */}

                  {/* 1. COMPLETED */}
                  {isCompleted && (
                    <button
                      onClick={() => router.push(`/tournament/solo/${t.id}`)}
                      style={{
                        width: "100%", padding: "10px 0",
                        background: "#111", border: "1px solid #1a1a1a",
                        borderRadius: 8, color: "#555", fontSize: 13,
                        fontWeight: 700, cursor: "pointer",
                      }}
                    >View Leaderboard</button>
                  )}

                  {/* 2. CURRENT — reg open, not registered */}
                  {isCurrent && isRegOpen && !isRegistered && (
                    <button
                      onClick={() => {
                        if (isPaid) { setComingSoonId(t.id); return; }
                        router.push(`/tournament/solo/${t.id}`);
                      }}
                      style={{
                        width: "100%", padding: "10px 0",
                        background: isPaid ? "linear-gradient(135deg, #4c1d95, #2d1b69)" : "linear-gradient(135deg, #f97316, #ea580c)",
                        border: isPaid ? "1px solid #7c3aed40" : "none",
                        borderRadius: 8, color: isPaid ? "#a855f7" : "#fff",
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                      }}
                    >{isPaid ? "⭐ Join Pro Tournament →" : "Register Free →"}</button>
                  )}

                  {/* 3. CURRENT — reg closed, not registered */}
                  {isCurrent && !isRegOpen && !isRegistered && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{
                        width: "100%", padding: "10px 0", textAlign: "center",
                        background: "#1a0f00", border: "1px solid #7c2d12",
                        borderRadius: 8, color: "#f97316", fontSize: 13, fontWeight: 700,
                      }}>🔒 Registration Closed</div>
                      <button
                        onClick={() => router.push(`/tournament/solo/${t.id}`)}
                        style={{
                          width: "100%", padding: "8px 0",
                          background: "transparent", border: "1px solid #1a1a1a",
                          borderRadius: 8, color: "#444", fontSize: 12,
                          fontWeight: 600, cursor: "pointer",
                        }}
                      >View Leaderboard</button>
                    </div>
                  )}

                  {/* 4. CURRENT or UPCOMING — registered */}
                  {(isCurrent || isUpcoming) && isRegistered && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{
                        width: "100%", padding: "10px 0", textAlign: "center",
                        background: "#14532d", border: "1px solid #16a34a40",
                        borderRadius: 8, color: "#22c55e", fontSize: 13, fontWeight: 700,
                      }}>✓ Registered</div>
                      <button
                        onClick={() => router.push(`/tournament/solo/${t.id}`)}
                        style={{
                          width: "100%", padding: "8px 0",
                          background: "transparent", border: "1px solid #16a34a30",
                          borderRadius: 8, color: "#22c55e", fontSize: 12,
                          fontWeight: 600, cursor: "pointer",
                        }}
                      >View My Score →</button>
                    </div>
                  )}

                  {/* 5. UPCOMING — not registered */}
                  {isUpcoming && !isRegistered && (
                    <button
                      onClick={() => {
                        if (isPaid) { setComingSoonId(t.id); return; }
                        router.push(`/tournament/solo/${t.id}`);
                      }}
                      style={{
                        width: "100%", padding: "10px 0",
                        background: isPaid ? "linear-gradient(135deg, #4c1d95, #2d1b69)" : "linear-gradient(135deg, #f97316, #ea580c)",
                        border: isPaid ? "1px solid #7c3aed40" : "none",
                        borderRadius: 8, color: isPaid ? "#a855f7" : "#fff",
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                      }}
                    >{isPaid ? "⭐ Join Pro Tournament →" : "Register Free →"}</button>
                  )}

                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}