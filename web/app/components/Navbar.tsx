"use client";

import { useAuth } from "../context/AuthContext";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

const games = [
  { id: "dota2",    name: "Dota 2",   path: "/dota2",    color: "#f97316", glow: "rgba(249,115,22,0.3)",  icon: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png", active: true },
  { id: "valorant", name: "Valorant", path: "/valorant", color: "#ff4655", glow: "rgba(255,70,85,0.3)",   icon: "https://upload.wikimedia.org/wikipedia/commons/f/fc/Valorant_logo_-_pink_color_version.svg",          active: false },
  { id: "cs2",      name: "CS2",      path: "/cs2",      color: "#f0a500", glow: "rgba(240,165,0,0.3)",   icon: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/CS2_Logo.svg/800px-CS2_Logo.svg.png",       active: false },
  { id: "cod",      name: "COD",      path: "/cod",      color: "#22c55e", glow: "rgba(34,197,94,0.3)",   icon: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Call_of_Duty_logo.svg/800px-Call_of_Duty_logo.svg.png", active: false },
];

const DiscordIcon = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.114 18.1.132 18.114a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

export default function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [steamData, setSteamData] = useState<any>(null);
  const [discordLinked, setDiscordLinked] = useState(false);
  const [discordUsername, setDiscordUsername] = useState("");

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSteamData(data);
        if (data.discordId) {
          setDiscordLinked(true);
          setDiscordUsername(data.discordUsername || "");
        }
      }
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const discord = searchParams.get("discord");
    if (discord === "linked" || discord === "error") {
      router.replace(pathname);
    }
  }, [searchParams]);

  const activeGame = games.find((g) =>
    g.id === "dota2"
      ? pathname === "/dota2" || pathname === "/dashboard" || pathname.startsWith("/tournament")
      : pathname.startsWith(g.path)
  ) || games[0];

  const handleDiscordConnect = () => {
    if (!user) return;
    window.location.href = `/api/auth/discord?uid=${user.uid}`;
  };

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 100, background: "#050505", borderBottom: "1px solid #1a1a1a" }}>

      {/* Top colour strip */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${activeGame.color}, transparent)`, transition: "background 0.3s" }} />

      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px", height: 68, borderBottom: "1px solid #111" }}>

        {/* Logo */}
        <div onClick={() => router.push("/dashboard")} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
          <div style={{ width: 42, height: 42, background: "linear-gradient(135deg, #f97316, #c2410c)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: "#fff", boxShadow: "0 0 24px rgba(249,115,22,0.5)" }}>IE</div>
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
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 24px", background: isActive ? `${g.color}18` : "transparent", border: isActive ? `1px solid ${g.color}40` : "1px solid transparent", borderRadius: 10, color: isActive ? "#fff" : "#555", cursor: "pointer", fontSize: 14, fontWeight: isActive ? 700 : 500, transition: "all 0.15s", boxShadow: isActive ? `0 0 20px ${g.glow}` : "none" }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "#0f0f0f"; e.currentTarget.style.color = "#aaa"; e.currentTarget.style.border = "1px solid #222"; } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#555"; e.currentTarget.style.border = "1px solid transparent"; } }}
              >
                <img src={g.icon} alt={g.name} style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 4, filter: isActive ? "none" : "grayscale(100%) brightness(40%)", transition: "filter 0.15s" }} />
                <span>{g.name}</span>
                {!g.active && <span style={{ fontSize: 9, color: "#444", background: "#111", border: "1px solid #1a1a1a", padding: "1px 7px", borderRadius: 20, fontWeight: 600 }}>Soon</span>}
              </button>
            );
          })}
        </div>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

          {/* Steam badge */}
          {steamData?.steamId && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#0a0a0a", border: "1px solid #1e3a2a", borderRadius: 10, padding: "7px 14px" }}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" alt="Steam" style={{ width: 15, height: 15, opacity: 0.7 }} />
              <img src={steamData.steamAvatar} alt="avatar" style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid #22c55e40" }} />
              <span style={{ color: "#bbb", fontSize: 13, fontWeight: 600 }}>{steamData.steamName}</span>
              <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 800, background: "#16a34a20", padding: "2px 8px", borderRadius: 20 }}>✓ Linked</span>
            </div>
          )}

          {/* Discord — connected badge or connect button */}
          {discordLinked ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#5865F215", border: "1px solid #5865F240", borderRadius: 8, padding: "7px 14px" }}>
              <DiscordIcon size={16} color="#8a9bff" />
              <span style={{ color: "#8a9bff", fontSize: 13, fontWeight: 600 }}>{discordUsername}</span>
              <span style={{ fontSize: 10, color: "#8a9bff", fontWeight: 800, background: "#5865F220", padding: "2px 8px", borderRadius: 20 }}>✓ Linked</span>
            </div>
          ) : (
            <button
              onClick={handleDiscordConnect}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", background: "#5865F220", border: "1px solid #5865F240", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#8a9bff", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#5865F230"; e.currentTarget.style.borderColor = "#5865F280"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#5865F220"; e.currentTarget.style.borderColor = "#5865F240"; }}
            >
              <DiscordIcon size={18} color="currentColor" />
              Connect Discord
            </button>
          )}

          {/* Phone number pill */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, color: "#888", fontSize: 13 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#161616", border: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>👤</div>
            {user?.phoneNumber}
          </div>

          {/* Logout */}
          <button
            onClick={async () => { await logout(); }}
            style={{ padding: "8px 18px", background: "#150a0a", color: "#ef4444", border: "1px solid #3a1212", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 }}
            onMouseEnter={e => e.currentTarget.style.background = "#1f0a0a"}
            onMouseLeave={e => e.currentTarget.style.background = "#150a0a"}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Private profile warning */}
      {steamData?.steamId && (!steamData?.dotaRankTier || steamData?.dotaRankTier === 0) && (
        <div style={{ background: "#1a1200", borderBottom: "1px solid #854d0e", padding: "8px 40px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <p style={{ color: "#92400e", fontSize: 12, margin: 0 }}>
            <span style={{ color: "#fbbf24", fontWeight: 700 }}>Your Dota 2 profile is private.</span>
            {" "}Enable <span style={{ color: "#fbbf24", fontWeight: 600 }}>Expose Public Match Data</span> in Dota 2 → Settings → Social, then play one match. Changes take up to 24 hours to reflect.
          </p>
        </div>
      )}
    </div>
  );
}

export { Navbar };