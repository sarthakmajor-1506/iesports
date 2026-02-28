"use client";

import { useAuth } from "../context/AuthContext";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Image from "next/image";

const games = [
  { id: "dota2",    name: "Dota 2",   path: "/dota2",    color: "#F05A28", glow: "rgba(240,90,40,0.2)",  icon: "/dota2logo.png", active: true },
  { id: "valorant", name: "Valorant", path: "/valorant", color: "#ff4655", glow: "rgba(255,70,85,0.2)",  icon: "/valorantlogo.png",          active: false },
  { id: "cs2",      name: "CS:Go",      path: "/cs2",      color: "#f0a500", glow: "rgba(240,165,0,0.2)",  icon: "/csgologo.png",       active: false },
  { id: "cod",      name: "COD",      path: "/cod",      color: "#22c55e", glow: "rgba(34,197,94,0.2)",  icon: "/codlogo.jpeg", active: false },
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
    <>
      <style>{`
        .ie-navbar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(255, 255, 255, 0.97);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid #E5E3DF;
          font-family: var(--font-geist-sans), system-ui, sans-serif;
        }

        /* Active game accent line */
        .ie-nav-accent {
          height: 3px;
          transition: background 0.3s;
        }

        /* Main row */
        .ie-nav-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          height: 60px;
          gap: 16px;
        }

        /* Logo */
        .ie-nav-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          text-decoration: none;
          flex-shrink: 0;
        }
        .ie-nav-logo-name {
          font-size: 1.05rem;
          font-weight: 800;
          color: #111;
          line-height: 1;
        }
        .ie-nav-logo-name span { color: #F05A28; }
        .ie-nav-logo-sub {
          font-size: 0.6rem;
          color: #bbb;
          letter-spacing: 0.14em;
          font-weight: 700;
          text-transform: uppercase;
          margin-top: 2px;
        }

        /* Game tabs */
        .ie-nav-tabs {
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .ie-nav-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 16px;
          border-radius: 9px;
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          font-size: 0.84rem;
          font-weight: 600;
          color: #888;
          transition: all 0.15s;
          white-space: nowrap;
          font-family: inherit;
        }
        .ie-nav-tab:hover {
          background: #F2F1EE;
          color: #111;
          border-color: #E5E3DF;
        }
        .ie-nav-tab.active {
          color: #111;
          font-weight: 700;
        }
        .ie-nav-tab img {
          width: 20px;
          height: 20px;
          object-fit: contain;
          border-radius: 4px;
          transition: filter 0.15s;
        }
        .ie-soon-badge {
          font-size: 0.58rem;
          color: #bbb;
          background: #F2F1EE;
          border: 1px solid #E5E3DF;
          padding: 1px 6px;
          border-radius: 20px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        /* Right side */
        .ie-nav-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        /* Steam badge */
        .ie-steam-badge {
          display: flex;
          align-items: center;
          gap: 7px;
          background: #F8F7F4;
          border: 1px solid #E5E3DF;
          border-radius: 100px;
          padding: 5px 12px 5px 8px;
        }
        .ie-steam-badge img.avatar {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          border: 2px solid #22c55e;
        }
        .ie-steam-name {
          font-size: 0.9rem;
          font-weight: 600;
          color: #333;
        }
        .ie-verified-badge {
          font-size: 0.65rem;
          color: #16a34a;
          font-weight: 800;
          background: #dcfce7;
          padding: 2px 7px;
          border-radius: 20px;
          border: 1px solid #bbf7d0;
        }

        /* Discord badge / button */
        .ie-discord-badge {
          display: flex;
          align-items: center;
          gap: 7px;
          background: #eef0ff;
          border: 1px solid #c7d0ff;
          border-radius: 100px;
          padding: 5px 12px 5px 10px;
        }
        .ie-discord-name {
          font-size: 0.9rem;
          font-weight: 600;
          color: #4f5fc0;
        }
        .ie-discord-verified {
          font-size: 0.65rem;
          color: #4f5fc0;
          font-weight: 800;
          background: #e0e4ff;
          padding: 2px 7px;
          border-radius: 20px;
          border: 1px solid #c7d0ff;
        }
        .ie-discord-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 14px;
          background: #eef0ff;
          border: 1px solid #c7d0ff;
          border-radius: 100px;
          cursor: pointer;
          font-weight: 700;
          font-size: 0.8rem;
          color: #4f5fc0;
          transition: all 0.15s;
          font-family: inherit;
        }
        .ie-discord-btn:hover {
          background: #e0e4ff;
          border-color: #a5b0f0;
        }

        /* User pill */
        .ie-user-pill {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 14px;
          background: #F8F7F4;
          border: 1px solid #E5E3DF;
          border-radius: 100px;
          color: #555;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .ie-user-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #E5E3DF;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
        }

        /* Logout button */
        .ie-logout-btn {
          padding: 7px 16px;
          background: #fff1f0;
          color: #dc2626;
          border: 1px solid #fecaca;
          border-radius: 100px;
          cursor: pointer;
          font-weight: 700;
          font-size: 0.9rem;
          font-family: inherit;
          transition: all 0.15s;
        }
        .ie-logout-btn:hover {
          background: #fee2e2;
          border-color: #fca5a5;
        }

        /* Private profile warning */
        .ie-private-warning {
          background: #fffbeb;
          border-bottom: 1px solid #fde68a;
          padding: 7px 32px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ie-private-warning p {
          color: #92400e;
          font-size: 0.78rem;
          margin: 0;
          line-height: 1.5;
        }
        .ie-private-warning strong {
          color: #b45309;
          font-weight: 700;
        }
        .ie-private-warning code {
          background: #fef3c7;
          padding: 1px 5px;
          border-radius: 4px;
          font-family: inherit;
          font-weight: 600;
          color: #92400e;
          font-size: 0.75rem;
        }

        @media (max-width: 1024px) {
          .ie-nav-row { padding: 0 20px; gap: 10px; }
          .ie-nav-tab { padding: 6px 10px; font-size: 0.78rem; }
          .ie-nav-tab span.label { display: none; }
        }
        @media (max-width: 768px) {
          .ie-nav-tabs { display: none; }
          .ie-nav-row { padding: 0 16px; }
        }
      `}</style>

      <nav className="ie-navbar">
        {/* Active game colour accent line */}
        <div
          className="ie-nav-accent"
          style={{ background: `linear-gradient(90deg, ${activeGame.color} 0%, ${activeGame.color}33 60%, transparent 100%)` }}
        />

        {/* Main row */}
        <div className="ie-nav-row">

          {/* ── Logo ── */}
          <div className="ie-nav-logo" onClick={() => router.push("/dashboard")}>
            <Image
              src="/ielogo.png"
              alt="Indian Esports"
              width={36}
              height={36}
              style={{ borderRadius: 8, boxShadow: "0 2px 10px rgba(240,90,40,0.25)" }}
            />
            <div>
              <div className="ie-nav-logo-name">Indian <span>Esports</span></div>
              <div className="ie-nav-logo-sub">Competitive Gaming</div>
            </div>
          </div>

          {/* ── Game tabs ── */}
          <div className="ie-nav-tabs">
            {games.map((g) => {
              const isActive = activeGame?.id === g.id;
              return (
                <button
                  key={g.id}
                  className={`ie-nav-tab${isActive ? " active" : ""}`}
                  onClick={() => router.push(g.path)}
                  style={isActive ? {
                    background: `${g.color}12`,
                    border: `1px solid ${g.color}35`,
                    color: g.color,
                    boxShadow: `0 2px 12px ${g.glow}`,
                  } : {}}
                >
                  <img
                    src={g.icon}
                    alt={g.name}
                    style={{ filter: isActive ? "none" : "grayscale(100%) brightness(60%)" }}
                  />
                  <span className="label">{g.name}</span>
                  {!g.active && <span className="ie-soon-badge">Soon</span>}
                </button>
              );
            })}
          </div>

          {/* ── Right side ── */}
          <div className="ie-nav-right">

            {/* Steam badge */}
            {steamData?.steamId && (
              <div className="ie-steam-badge">
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg"
                  alt="Steam"
                  style={{ width: 26, height: 26, opacity: 0.7 }}
                />
                <img
                  className="avatar"
                  src={steamData.steamAvatar}
                  alt="avatar"
                />
                <span className="ie-steam-name">{steamData.steamName}</span>
                <span className="ie-verified-badge">✓ Linked</span>
              </div>
            )}

            {/* Discord */}
            {discordLinked ? (
              <div className="ie-discord-badge">
                <DiscordIcon size={26} color="#5865F2" />
                <span className="ie-discord-name">{discordUsername}</span>
                <span className="ie-discord-verified">✓ Linked</span>
              </div>
            ) : (
              <button className="ie-discord-btn" onClick={handleDiscordConnect}>
                <DiscordIcon size={26} color="currentColor" />
                Connect Discord
              </button>
            )}

            {/* User phone pill */}
            <div className="ie-user-pill">
              <div className="ie-user-avatar">👤</div>
              {user?.phoneNumber}
            </div>

            {/* Logout */}
            <button className="ie-logout-btn" onClick={async () => { await logout(); }}>
              Logout
            </button>
          </div>
        </div>

        {/* Private profile warning */}
        {steamData?.steamId && (!steamData?.dotaRankTier || steamData?.dotaRankTier === 0) && (
          <div className="ie-private-warning">
            <span style={{ fontSize: 14 }}>⚠️</span>
            <p>
              <strong>Your Dota 2 profile is private.</strong>{" "}
              Enable <code>Expose Public Match Data</code> in Dota 2 → Settings → Social.
              Play one match or changes can take up max 24 hours to reflect.
            </p>
          </div>
        )}
      </nav>
    </>
  );
}

export { Navbar };