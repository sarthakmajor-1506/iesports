"use client";

import { useAuth } from "../context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const games = [
  {
    id: "dota2", name: "Dota 2", path: "/dashboard", active: true,
    color: "#f97316", glow: "rgba(249,115,22,0.35)",
    icon: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/dota_icon_symbol.png",
  },
  {
    id: "valorant", name: "Valorant", path: "/valorant", active: false,
    color: "#ff4655", glow: "rgba(255,70,85,0.35)",
    icon: "https://cdn.jsdelivr.net/gh/yuhengshen/valorant-icons@main/valorant-icon.png",
  },
  {
    id: "cs2", name: "CS2", path: "/cs2", active: false,
    color: "#f0a500", glow: "rgba(240,165,0,0.35)",
    icon: "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/730/69f7ebe2735c366c65c0b33dae00e12dc40edbe4.jpg",
  },
  {
    id: "cod", name: "COD", path: "/cod", active: false,
    color: "#22c55e", glow: "rgba(34,197,94,0.35)",
    icon: "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/1938090/f8103ab5bc4a6e89b2f7a0cf4ae27bdf9e29668b.jpg",
  },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [steamData, setSteamData] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) setSteamData(snap.data());
    };
    fetchData();
  }, [user]);

  const activeGame = games.find((g) =>
    g.id === "dota2"
      ? pathname === "/dashboard" || pathname.startsWith("/tournament")
      : pathname.startsWith(g.path)
  ) || games[0];

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "#050505",
      borderBottom: "1px solid #1a1a1a",
    }}>

      {/* Top strip */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${activeGame.color}, transparent)`, transition: "background 0.3s" }} />

      {/* Main row */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 40px", height: 68,
        borderBottom: "1px solid #111",
      }}>

        {/* Logo */}
        <div onClick={() => router.push("/dashboard")} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
          <div style={{
            width: 42, height: 42,
            background: "linear-gradient(135deg, #f97316, #c2410c)",
            borderRadius: 10, display: "flex", alignItems: "center",
            justifyContent: "center", fontWeight: 900, fontSize: 16, color: "#fff",
            boxShadow: "0 0 24px rgba(249,115,22,0.5)",
          }}>IE</div>
          <div>
            <p style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.5, background: "linear-gradient(90deg, #fff, #aaa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Indian Esports</p>
            <p style={{ fontSize: 9, color: "#444", letterSpacing: 3, fontWeight: 700, marginTop: 1 }}>COMPETITIVE GAMING</p>
          </div>
        </div>

        {/* Game Tabs */}
        <div style={{ display: "flex", gap: 4 }}>
          {games.map((g) => {
            const isActive = activeGame?.id === g.id;
            return (
              <button
                key={g.id}
                onClick={() => router.push(g.path)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 24px",
                  background: isActive ? `${g.color}18` : "transparent",
                  border: isActive ? `1px solid ${g.color}40` : "1px solid transparent",
                  borderRadius: 10,
                  color: isActive ? "#fff" : "#555",
                  cursor: "pointer", fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  transition: "all 0.15s",
                  boxShadow: isActive ? `0 0 20px ${g.glow}` : "none",
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = "#0f0f0f";
                    e.currentTarget.style.color = "#aaa";
                    e.currentTarget.style.border = "1px solid #222";
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#555";
                    e.currentTarget.style.border = "1px solid transparent";
                  }
                }}
              >
                <img
                  src={g.icon}
                  alt={g.name}
                  style={{
                    width: 24, height: 24,
                    objectFit: "contain", borderRadius: 4,
                    filter: isActive ? "none" : "grayscale(100%) brightness(40%)",
                    transition: "filter 0.15s",
                  }}
                />
                <span>{g.name}</span>
                {!g.active && (
                  <span style={{ fontSize: 9, color: "#444", background: "#111", border: "1px solid #1a1a1a", padding: "1px 7px", borderRadius: 20, fontWeight: 600 }}>Soon</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {steamData?.steamId && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "#0a0a0a", border: "1px solid #1e3a2a",
              borderRadius: 10, padding: "7px 14px",
            }}>
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg"
                alt="Steam" style={{ width: 15, height: 15, opacity: 0.7 }}
              />
              <img
                src={steamData.steamAvatar} alt="avatar"
                style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid #22c55e40" }}
              />
              <span style={{ color: "#bbb", fontSize: 13, fontWeight: 600 }}>{steamData.steamName}</span>
              <span style={{
                fontSize: 10, color: "#22c55e", fontWeight: 800,
                background: "#16a34a20", padding: "2px 8px", borderRadius: 20,
              }}>✓ Linked</span>
            </div>
          )}

          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "7px 14px", background: "#0a0a0a",
            border: "1px solid #1a1a1a", borderRadius: 10, color: "#888", fontSize: 13,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              background: "#161616", border: "1px solid #2a2a2a",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
            }}>👤</div>
            {user?.phoneNumber}
          </div>

          <button
            onClick={async () => { await logout(); }}
            style={{
              padding: "8px 18px",
              background: "#150a0a", color: "#ef4444",
              border: "1px solid #3a1212",
              borderRadius: 8, cursor: "pointer",
              fontWeight: 700, fontSize: 13,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#1f0a0a"}
            onMouseLeave={e => e.currentTarget.style.background = "#150a0a"}
          >
            Logout
          </button>
        </div>
      </div>
    {/* Private profile warning banner */}
      {activeGame.id === "dota2" && steamData?.steamId && (!steamData?.dotaRankTier || steamData?.dotaRankTier === 0) && (
        <div style={{
          background: "#1a1200", borderBottom: "1px solid #854d0e",
          padding: "8px 40px", display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <p style={{ color: "#92400e", fontSize: 12, margin: 0 }}>
            <span style={{ color: "#fbbf24", fontWeight: 700 }}>Your Dota 2 profile is private.</span>
            {" "}Enable <span style={{ color: "#fbbf24", fontWeight: 600 }}>Expose Public Match Data</span> in Dota 2 → Settings → Social, then play one match. Changes take up to 24 hours to reflect. Rank verification is required to claim prize winnings.
          </p>
        </div>
      )}
    </div>
  );
}export { Navbar };
