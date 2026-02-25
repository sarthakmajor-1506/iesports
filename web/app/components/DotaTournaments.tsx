"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { Tournament } from "@/lib/types";

const DOTA_IMAGES = [
  "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/axe.png",
  "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/invoker.png",
  "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/pudge.png",
  "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/juggernaut.png",
];

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

  // Check which tournaments the user is registered in
  useEffect(() => {
    if (!user) return;
    const checkRegistrations = async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      const data = snap.data();
      setRegisteredIds(new Set(data?.registeredTournaments || []));
    };
    checkRegistrations();

    // Re-check when user returns to tab
    window.addEventListener("focus", checkRegistrations);
    return () => window.removeEventListener("focus", checkRegistrations);
  }, [user]);
   
  const totalSlotsRemaining = tournaments.reduce((acc, t) => acc + (t.totalSlots - t.slotsBooked), 0);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "30px" }}>

      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg, #0f0f0f, #111)", border: "1px solid #1a1a1a", borderRadius: 14, padding: "30px 36px", position: "relative", overflow: "hidden", marginBottom: 28 }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, #f97316, #22c55e, #3b82f6)" }}></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ color: "#f97316", fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>DOTA 2 TOURNAMENTS</p>
            <h1 style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>Compete. Win. Rise.</h1>
            <p style={{ color: "#555", fontSize: 14, marginTop: 6 }}>Steam-verified • Rank-locked brackets • Fast UPI payouts</p>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 24, fontWeight: 800, color: "#f97316" }}>{tournaments.filter(t => t.status !== "ended").length}</p>
              <p style={{ color: "#555", fontSize: 11 }}>Upcoming</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 24, fontWeight: 800, color: "#22c55e" }}>₹1.2L</p>
              <p style={{ color: "#555", fontSize: 11 }}>Prize Pool</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 24, fontWeight: 800, color: "#3b82f6" }}>{totalSlotsRemaining}</p>
              <p style={{ color: "#555", fontSize: 11 }}>Slots Open</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tournament Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {tournaments.map((t, i) => {
          const pct = Math.round((t.slotsBooked / t.totalSlots) * 100);
          const isEnded = t.status === "ended";
          const slotsLeft = t.totalSlots - t.slotsBooked;
          const isRegistered = registeredIds.has(t.id);

          return (
            <div
              key={t.id}
              onClick={() => router.push(`/tournament/${t.id}`)}
              style={{
                background: "#0a0a0a",
                border: `1px solid ${isEnded ? "#111" : isRegistered ? "#16a34a40" : "#141414"}`,
                borderRadius: 12, overflow: "hidden", display: "flex",
                alignItems: "stretch", cursor: "pointer", opacity: isEnded ? 0.6 : 1,
                transition: "border-color 0.2s",
              }}
              onMouseEnter={e => !isEnded && (e.currentTarget.style.borderColor = isRegistered ? "#16a34a80" : "#f97316")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = isEnded ? "#111" : isRegistered ? "#16a34a40" : "#141414")}
            >
              {/* Image */}
              <div style={{ width: 130, flexShrink: 0, background: "#0d0d0d", position: "relative" }}>
                <img src={DOTA_IMAGES[i % DOTA_IMAGES.length]} alt="hero" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: isEnded ? 0.4 : 0.7 }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent, #0a0a0a)" }}></div>
              </div>

              {/* Content */}
              <div style={{ flex: 1, padding: "20px 24px", display: "flex", alignItems: "center", gap: 24 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h3 style={{ fontSize: 17, fontWeight: 700, color: isEnded ? "#555" : "#fff" }}>{t.name}</h3>
                    <span style={{
                      background: isEnded ? "#1a1a1a" : t.status === "ongoing" ? "#1e3a5f" : "#16a34a15",
                      color: isEnded ? "#444" : t.status === "ongoing" ? "#3b82f6" : "#22c55e",
                      padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                    }}>
                      {isEnded ? "Ended" : t.status === "ongoing" ? "🔴 Live" : "Upcoming"}
                    </span>
                    <span style={{ background: "#1a1a1a", color: "#555", padding: "3px 10px", borderRadius: 20, fontSize: 10 }}>{t.month}</span>
                    {/* Registered badge */}
                    {isRegistered && !isEnded && (
                      <span style={{
                        background: "#14532d", color: "#22c55e",
                        padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                        border: "1px solid #16a34a40",
                      }}>✓ Registered</span>
                    )}
                  </div>
                  <p style={{ color: "#444", fontSize: 13, marginTop: 6 }}>{t.desc}</p>
                  <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
                    {[
                      { label: "PRIZE", value: t.prizePool, color: isEnded ? "#555" : "#f97316" },
                      { label: "STARTS", value: t.startDate },
                      { label: "DEADLINE", value: t.registrationDeadline },
                      { label: "ENTRY", value: t.entry },
                    ].map((item) => (
                      <div key={item.label}>
                        <p style={{ color: "#333", fontSize: 10, fontWeight: 600, letterSpacing: 1 }}>{item.label}</p>
                        <p style={{ color: item.color || "#666", fontSize: 13, fontWeight: 700, marginTop: 2 }}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Slots + Button */}
                <div style={{ minWidth: 140, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
                  <div style={{ width: "100%", textAlign: "right" }}>
                    <p style={{ color: "#555", fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: isEnded ? "#444" : "#f97316", fontWeight: 700 }}>{slotsLeft}</span>
                      <span style={{ color: "#333" }}> / {t.totalSlots} slots left</span>
                    </p>
                    <div style={{ width: "100%", height: 4, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: isEnded ? "#222" : pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e", borderRadius: 2 }}></div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/tournament/${t.id}`); }}
                    disabled={isEnded}
                    style={{
                      padding: "9px 18px", width: "100%",
                      background: isEnded ? "#111" : isRegistered ? "#14532d" : "linear-gradient(135deg, #f97316, #ea580c)",
                      color: isEnded ? "#333" : isRegistered ? "#22c55e" : "#fff",
                      fontWeight: 700, fontSize: 12,
                      border: isEnded ? "1px solid #1a1a1a" : isRegistered ? "1px solid #16a34a40" : "none",
                      borderRadius: 8,
                      cursor: isEnded ? "default" : "pointer",
                    }}
                  >
                    {isEnded ? "View Results" : isRegistered ? "✓ Registered" : "View & Register →"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}