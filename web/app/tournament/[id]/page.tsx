"use client";

import { useAuth } from "../../context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import RegisterModal from "../../components/RegisterModal";

const TABS = ["Overview", "Rules", "Matches", "Participants", "Streams"] as const;
type Tab = typeof TABS[number];

export default function TournamentPage() {
  const { user, loading, steamLinked, dotaProfile } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [tournament, setTournament] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [showRegister, setShowRegister] = useState(false);
  const [tLoading, setTLoading] = useState(true);
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/");
    if (!loading && user && !steamLinked) router.push("/connect-steam");
  }, [user, loading, steamLinked, router]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "tournaments", id), (snap) => {
      if (snap.exists()) setTournament({ id: snap.id, ...snap.data() });
      setTLoading(false);
    });
    return () => unsub();
  }, [id]);
  
  useEffect(() => {
    if (!user) return;
    const checkReg = async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      const data = snap.data();
      const registered = data?.registeredTournaments || [];
      setIsRegistered(registered.includes(id));
    };
    checkReg();
    window.addEventListener("focus", checkReg);
    return () => window.removeEventListener("focus", checkReg);
  }, [user, id]);


  if (loading || tLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#555" }}>Loading...</p>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#555" }}>Tournament not found.</p>
      </div>
    );
  }

  const isEnded = tournament.status === "ended";
  const slotsLeft = tournament.totalSlots - tournament.slotsBooked;
  const pct = Math.round((tournament.slotsBooked / tournament.totalSlots) * 100);

  return (
    <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", fontFamily: "system-ui, sans-serif" }}>

      {/* TOP BAR */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "12px 30px", borderBottom: "1px solid #141414", background: "#080808",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <button onClick={() => router.push("/dashboard")} style={{
          background: "transparent", border: "1px solid #1a1a1a", borderRadius: 6,
          color: "#555", fontSize: 13, padding: "6px 12px", cursor: "pointer",
        }}>← Back</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: "linear-gradient(135deg, #f97316, #ea580c)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: 12, color: "#fff" }}>IE</div>
          <span style={{ fontSize: 16, fontWeight: 800, background: "linear-gradient(90deg, #f97316, #fb923c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Indian Esports</span>
        </div>
      </div>

      {/* HERO BANNER */}
      <div style={{
        background: "linear-gradient(135deg, #0f0f0f, #111)",
        borderBottom: "1px solid #1a1a1a", padding: "36px 40px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #f97316, #22c55e, #3b82f6)" }}></div>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{
                background: isEnded ? "#1a1a1a" : tournament.status === "ongoing" ? "#1e3a5f" : "#16a34a15",
                color: isEnded ? "#444" : tournament.status === "ongoing" ? "#3b82f6" : "#22c55e",
                padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              }}>
                {isEnded ? "Ended" : tournament.status === "ongoing" ? "🔴 Live" : "Upcoming"}
              </span>
              <span style={{ color: "#444", fontSize: 12 }}>{tournament.month}</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>{tournament.name}</h1>
            <p style={{ color: "#555", fontSize: 14 }}>{tournament.desc}</p>
            <div style={{ display: "flex", gap: 20, marginTop: 16, flexWrap: "wrap" }}>
              {[
                { label: "START DATE", value: tournament.startDate },
                { label: "END DATE", value: tournament.endDate },
                { label: "REG. DEADLINE", value: tournament.registrationDeadline },
                { label: "ENTRY", value: tournament.entry },
              ].map((item) => (
                <div key={item.label}>
                  <p style={{ color: "#333", fontSize: 10, fontWeight: 600, letterSpacing: 1 }}>{item.label}</p>
                  <p style={{ color: "#aaa", fontSize: 13, fontWeight: 700, marginTop: 2 }}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Prize + Slots + Register */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 16, minWidth: 200 }}>
            <div style={{ textAlign: "right" }}>
              <p style={{ color: "#333", fontSize: 10, fontWeight: 600, letterSpacing: 1 }}>PRIZE POOL</p>
              <p style={{ fontSize: 32, fontWeight: 800, color: "#f97316", marginTop: 2 }}>{tournament.prizePool}</p>
            </div>
            <div style={{ width: "100%", textAlign: "right" }}>
              <p style={{ color: "#555", fontSize: 11, marginBottom: 6 }}>
                <span style={{ color: "#f97316", fontWeight: 700 }}>{slotsLeft}</span>
                <span style={{ color: "#333" }}> / {tournament.totalSlots} slots left</span>
              </p>
              <div style={{ width: "100%", height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e", borderRadius: 3 }}></div>
              </div>
            </div>
            {!isEnded && (
              isRegistered ? (
                <div style={{
                  padding: "12px 28px", width: "100%", textAlign: "center",
                  background: "#14532d", border: "1px solid #16a34a40",
                  borderRadius: 10, color: "#22c55e", fontWeight: 700, fontSize: 14,
                }}>
                  ✓ Registered
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (!steamLinked) {
                      window.location.href = `/api/auth/steam?uid=${user?.uid}`;
                    } else {
                      setShowRegister(true);
                    }
                  }}
                  style={{
                    padding: "12px 28px",
                    background: "linear-gradient(135deg, #f97316, #ea580c)",
                    border: "none", borderRadius: 10, color: "#fff",
                    fontWeight: 700, fontSize: 14, cursor: "pointer",
                    width: "100%", textAlign: "center",
                  }}
                >
                  Register for Free →
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* BRACKET SLOTS */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 40px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          {tournament.brackets && Object.entries(tournament.brackets).map(([key, val]: any) => {
            const bPct = Math.round((val.slotsBooked / val.slotsTotal) * 100);
            const labels: Record<string, { name: string; color: string }> = {
              herald_guardian:  { name: "Herald – Guardian", color: "#6b7280" },
              crusader_archon:  { name: "Crusader – Archon", color: "#3b82f6" },
              legend_ancient:   { name: "Legend – Ancient",  color: "#a855f7" },
              divine_immortal:  { name: "Divine – Immortal", color: "#f59e0b" },
            };
            const b = labels[key];
            return (
              <div key={key} style={{ background: "#0a0a0a", border: "1px solid #141414", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: b.color }}></div>
                  <p style={{ color: "#888", fontSize: 12, fontWeight: 600 }}>{b.name}</p>
                </div>
                <p style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{val.slotsTotal - val.slotsBooked}<span style={{ color: "#333", fontSize: 12, fontWeight: 400 }}> / {val.slotsTotal}</span></p>
                <div style={{ width: "100%", height: 3, background: "#1a1a1a", borderRadius: 2, overflow: "hidden", marginTop: 8 }}>
                  <div style={{ width: `${bPct}%`, height: "100%", background: b.color, borderRadius: 2 }}></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* TABS */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 40px" }}>
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid #141414", marginBottom: 28 }}>
          {TABS.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: "10px 20px", background: "transparent", border: "none",
              color: activeTab === tab ? "#fff" : "#444",
              fontWeight: activeTab === tab ? 700 : 400,
              fontSize: 14, cursor: "pointer",
              borderBottom: activeTab === tab ? "2px solid #f97316" : "2px solid transparent",
              marginBottom: -1,
            }}>{tab}</button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === "Overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ background: "#0a0a0a", border: "1px solid #141414", borderRadius: 12, padding: 24 }}>
              <p style={{ color: "#444", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, marginBottom: 16 }}>TOURNAMENT FORMAT</p>
              {[
                { label: "Game", value: "Dota 2" },
                { label: "Format", value: "5v5 Single Elimination" },
                { label: "Brackets", value: "4 rank-based brackets" },
                { label: "Min Players", value: "40 to run tournament" },
                { label: "Team Size", value: "5 players per team" },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #111" }}>
                  <span style={{ color: "#555", fontSize: 13 }}>{item.label}</span>
                  <span style={{ color: "#aaa", fontSize: 13, fontWeight: 600 }}>{item.value}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "#0a0a0a", border: "1px solid #141414", borderRadius: 12, padding: 24 }}>
              <p style={{ color: "#444", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, marginBottom: 16 }}>PRIZE DISTRIBUTION</p>
              {[
                { place: "🥇 1st Place", prize: "50%", color: "#f59e0b" },
                { place: "🥈 2nd Place", prize: "30%", color: "#9ca3af" },
                { place: "🥉 3rd Place", prize: "20%", color: "#b45309" },
              ].map((item) => (
                <div key={item.place} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #111" }}>
                  <span style={{ color: "#aaa", fontSize: 14 }}>{item.place}</span>
                  <span style={{ color: item.color, fontSize: 15, fontWeight: 700 }}>{item.prize} of {tournament.prizePool}</span>
                </div>
              ))}
              <p style={{ color: "#333", fontSize: 11, marginTop: 14 }}>Prizes paid via UPI within 48 hours of tournament end.</p>
            </div>
          </div>
        )}

        {/* RULES TAB */}
        {activeTab === "Rules" && (
          <div style={{ background: "#0a0a0a", border: "1px solid #141414", borderRadius: 12, padding: 28, maxWidth: 700 }}>
            <p style={{ color: "#444", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, marginBottom: 20 }}>TOURNAMENT RULES</p>
            {(tournament.rules || []).map((rule: string, i: number) => (
              <div key={i} style={{ display: "flex", gap: 14, padding: "12px 0", borderBottom: "1px solid #111" }}>
                <span style={{ color: "#f97316", fontWeight: 700, fontSize: 14, minWidth: 24 }}>{i + 1}.</span>
                <span style={{ color: "#aaa", fontSize: 14, lineHeight: 1.6 }}>{rule}</span>
              </div>
            ))}
          </div>
        )}

        {/* MATCHES TAB */}
        {activeTab === "Matches" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
            <p style={{ fontSize: 40 }}>🗓️</p>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 16 }}>Matches Not Started</h3>
            <p style={{ color: "#444", fontSize: 14, marginTop: 8 }}>Match schedule will be published after registration closes.</p>
          </div>
        )}

        {/* PARTICIPANTS TAB */}
        {activeTab === "Participants" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
            <p style={{ fontSize: 40 }}>👥</p>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 16 }}>
              {tournament.slotsBooked} Players Registered
            </h3>
            <p style={{ color: "#444", fontSize: 14, marginTop: 8 }}>
              Full participant list will be visible after registration closes.
            </p>
          </div>
        )}

        {/* STREAMS TAB */}
        {activeTab === "Streams" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
            <p style={{ fontSize: 40 }}>📺</p>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 16 }}>No Streams Yet</h3>
            <p style={{ color: "#444", fontSize: 14, marginTop: 8 }}>Stream links will be added closer to the tournament date.</p>
          </div>
        )}
      </div>

      {/* REGISTER MODAL */}
      {showRegister && user && (
        <RegisterModal
          tournament={tournament}
          user={user}
          dotaProfile={dotaProfile}
          onClose={() => setShowRegister(false)}
          onSuccess={() => setIsRegistered(true)}
        />
      )}      
    </div>
  );
}
