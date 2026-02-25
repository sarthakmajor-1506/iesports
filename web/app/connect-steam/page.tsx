"use client";

import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ConnectSteam() {
  const { user, loading, steamLinked, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/");
    if (!loading && steamLinked) router.push("/dashboard");
  }, [user, loading, steamLinked, router]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#555" }}>Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div style={{
      minHeight: "100vh", background: "#050505", color: "#fff",
      fontFamily: "system-ui, sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 48 }}>
        <div style={{ width: 36, height: 36, background: "linear-gradient(135deg, #f97316, #ea580c)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: 15, color: "#fff" }}>IE</div>
        <span style={{ fontSize: 20, fontWeight: 800, background: "linear-gradient(90deg, #f97316, #fb923c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Indian Esports</span>
      </div>

      {/* Card */}
      <div style={{
        background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 16,
        padding: "40px 48px", maxWidth: 480, width: "100%", textAlign: "center",
        position: "relative", overflow: "hidden",
      }}>
        {/* Top accent */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #f97316, #22c55e, #3b82f6)" }}></div>

        <p style={{ fontSize: 48, marginBottom: 16 }}>🎮</p>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Connect Your Steam Account</h1>
        <p style={{ color: "#555", fontSize: 14, lineHeight: 1.6, marginBottom: 32 }}>
          Steam is required to participate in tournaments. We use it to verify your Dota 2 rank and ensure fair competition.
        </p>

        {/* Why Steam */}
        <div style={{ background: "#0a0a0a", border: "1px solid #141414", borderRadius: 10, padding: "16px 20px", marginBottom: 32, textAlign: "left" }}>
          {[
            { icon: "🏆", text: "Verify your Dota 2 rank for bracket placement" },
            { icon: "🛡️", text: "Prevent smurfing and ensure fair matches" },
            { icon: "📊", text: "Track your match history and performance" },
            { icon: "💸", text: "Fast prize payouts tied to your verified account" },
          ].map((item) => (
            <div key={item.text} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #111" }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span style={{ color: "#888", fontSize: 13 }}>{item.text}</span>
            </div>
          ))}
        </div>

        {/* Connect Button */}
        <button
          onClick={() => window.location.href = `/api/auth/steam?uid=${user.uid}`}
          style={{
            width: "100%", padding: "14px 20px",
            background: "linear-gradient(135deg, #1b2838, #2a475e)",
            border: "1px solid #3d6b8c", borderRadius: 10,
            color: "#fff", fontWeight: 700, fontSize: 15,
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 10,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15h-2v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.8c4.56-.93 8-4.96 8-9.8 0-5.52-4.48-10-10-10z"/>
          </svg>
          Connect with Steam
        </button>

        {/* Skip — disabled */}
        <button
          disabled
          style={{
            marginTop: 12, width: "100%", padding: "10px 20px",
            background: "transparent", border: "1px solid #1a1a1a",
            borderRadius: 10, color: "#2a2a2a", fontSize: 13,
            cursor: "not-allowed",
          }}
        >
          Skip for now (not available)
        </button>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20 }}>
          <p style={{ color: "#2a2a2a", fontSize: 11 }}>
            Logged in as {user.phoneNumber}
          </p>
          <button
            onClick={async () => { await logout(); }}
            style={{
              background: "transparent", border: "none",
              color: "#ef4444", fontSize: 12, cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}