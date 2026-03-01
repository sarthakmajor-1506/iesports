"use client";

import { useAuth } from "../context/AuthContext";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Image from "next/image";

const games = [
  { id: "dota2",    name: "Dota 2",   path: "/dota2",    color: "#F05A28", glow: "rgba(240,90,40,0.2)",  icon: "/dota2logo.png",    active: true  },
  { id: "valorant", name: "Valorant", path: "/valorant", color: "#ff4655", glow: "rgba(255,70,85,0.2)",  icon: "/valorantlogo.png", active: false },
  { id: "cs2",      name: "CS:Go",    path: "/cs2",      color: "#f0a500", glow: "rgba(240,165,0,0.2)",  icon: "/csgologo.png",     active: false },
  { id: "cod",      name: "COD",      path: "/cod",      color: "#22c55e", glow: "rgba(34,197,94,0.2)",  icon: "/codlogo.jpeg",     active: false },
];

const DiscordIcon = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    if (discord === "linked" || discord === "error") router.replace(pathname);
  }, [searchParams]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);

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
        * { box-sizing: border-box; }

        .ie-navbar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(255,255,255,0.97);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid #E5E3DF;
          font-family: var(--font-geist-sans), system-ui, sans-serif;
        }

        .ie-nav-accent { height: 3px; transition: background 0.3s; }

        /* ── Main row ── */
        .ie-nav-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 28px;
          height: 62px;
          gap: 12px;
        }

        /* ── Logo ── */
        .ie-nav-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
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
          font-size: 0.58rem;
          color: #bbb;
          letter-spacing: 0.14em;
          font-weight: 700;
          text-transform: uppercase;
          margin-top: 2px;
        }

        /* ── Desktop game tabs ── */
        .ie-nav-tabs {
          display: flex;
          align-items: center;
          gap: 2px;
          flex: 1;
          justify-content: center;
        }
        .ie-nav-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 14px;
          border-radius: 10px;
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
        .ie-nav-tab:hover { background: #F2F1EE; color: #111; border-color: #E5E3DF; }
        .ie-nav-tab.active { font-weight: 700; }
        .ie-nav-tab img {
          width: 26px;
          height: 26px;
          object-fit: contain;
          border-radius: 5px;
          transition: filter 0.15s;
        }
        .ie-soon-badge {
          font-size: 0.56rem;
          color: #bbb;
          background: #F2F1EE;
          border: 1px solid #E5E3DF;
          padding: 1px 6px;
          border-radius: 20px;
          font-weight: 700;
        }

        /* ── Right side ── */
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
          font-size: 0.84rem;
          font-weight: 600;
          color: #333;
          max-width: 110px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ie-verified-badge {
          font-size: 0.62rem;
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
          font-size: 0.84rem;
          font-weight: 600;
          color: #4f5fc0;
          max-width: 90px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ie-discord-verified {
          font-size: 0.62rem;
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
          white-space: nowrap;
        }
        .ie-discord-btn:hover { background: #e0e4ff; border-color: #a5b0f0; }

        /* ── Three-dot dropdown ── */
        .ie-dropdown-wrap { position: relative; }
        .ie-dots-btn {
          width: 36px;
          height: 36px;
          border-radius: 100px;
          border: 1px solid #E5E3DF;
          background: #F8F7F4;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3px;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .ie-dots-btn:hover { background: #F2F1EE; border-color: #d0ceca; }
        .ie-dots-btn span {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #555;
          display: block;
        }
        .ie-dropdown {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          background: #fff;
          border: 1px solid #E5E3DF;
          border-radius: 14px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.12);
          min-width: 230px;
          overflow: hidden;
          z-index: 200;
          animation: ie-dd-in 0.15s ease;
        }
        @keyframes ie-dd-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ie-dd-section {
          padding: 8px;
          border-bottom: 1px solid #F2F1EE;
        }
        .ie-dd-section:last-child { border-bottom: none; }
        .ie-dd-label {
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #bbb;
          padding: 4px 8px 6px;
          display: block;
        }
        .ie-dd-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border-radius: 8px;
          font-size: 0.84rem;
          color: #444;
          font-weight: 500;
        }
        .ie-dd-btn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border-radius: 8px;
          font-size: 0.84rem;
          font-weight: 700;
          background: none;
          border: none;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.12s;
          text-align: left;
        }
        .ie-dd-btn.discord { color: #4f5fc0; }
        .ie-dd-btn.discord:hover { background: #eef0ff; }
        .ie-dd-btn.logout { color: #dc2626; }
        .ie-dd-btn.logout:hover { background: #fff1f0; }

        /* ── Mobile hamburger ── */
        .ie-hamburger {
          display: none;
          flex-direction: column;
          gap: 5px;
          width: 36px;
          height: 36px;
          border: 1px solid #E5E3DF;
          background: #F8F7F4;
          border-radius: 9px;
          cursor: pointer;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ie-hamburger span {
          display: block;
          width: 18px;
          height: 2px;
          background: #555;
          border-radius: 2px;
          transition: all 0.2s;
          transform-origin: center;
        }

        /* ── Mobile drawer ── */
        .ie-mobile-drawer {
          display: none;
          flex-direction: column;
          background: #fff;
          border-top: 1px solid #F2F1EE;
          padding: 10px 12px 16px;
          gap: 4px;
        }
        .ie-mobile-drawer.open { display: flex; }

        .ie-mobile-game-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 12px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 600;
          color: #555;
          transition: all 0.15s;
          font-family: inherit;
          width: 100%;
          text-align: left;
        }
        .ie-mobile-game-btn:hover { background: #F2F1EE; color: #111; }
        .ie-mobile-game-btn img {
          width: 28px;
          height: 28px;
          object-fit: contain;
          border-radius: 6px;
        }
        .ie-mobile-divider {
          height: 1px;
          background: #F2F1EE;
          margin: 6px 0;
        }
        .ie-mobile-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          font-size: 0.84rem;
          color: #555;
          font-weight: 500;
        }
        .ie-mobile-logout {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 14px;
          border-radius: 10px;
          font-size: 0.88rem;
          color: #dc2626;
          font-weight: 700;
          background: #fff1f0;
          border: 1px solid #fecaca;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
          margin-top: 4px;
        }
        .ie-mobile-logout:hover { background: #fee2e2; }

        /* Private profile warning */
        .ie-private-warning {
          background: #fffbeb;
          border-bottom: 1px solid #fde68a;
          padding: 7px 28px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .ie-private-warning p {
          color: #92400e;
          font-size: 0.76rem;
          margin: 0;
          line-height: 1.5;
        }
        .ie-private-warning strong { color: #b45309; }
        .ie-private-warning code {
          background: #fef3c7;
          padding: 1px 5px;
          border-radius: 4px;
          font-family: inherit;
          font-weight: 600;
          color: #92400e;
          font-size: 0.72rem;
        }

        /* ── Responsive ── */
        @media (max-width: 1100px) {
          .ie-steam-name { display: none; }
          .ie-discord-name { display: none; }
        }
        @media (max-width: 900px) {
          .ie-steam-badge { display: none; }
          .ie-discord-badge { display: none; }
          .ie-discord-btn { display: none; }
        }
        @media (max-width: 768px) {
          .ie-nav-tabs { display: none; }
          .ie-hamburger { display: flex; }
          .ie-nav-row { padding: 0 16px; }
          .ie-private-warning { padding: 7px 16px; }
        }
      `}</style>

      <nav className="ie-navbar">
        {/* Accent line */}
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

          {/* ── Desktop game tabs ── */}
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
                    style={{ filter: isActive ? "none" : "grayscale(100%) brightness(55%)" }}
                  />
                  <span>{g.name}</span>
                  {!g.active && <span className="ie-soon-badge">Soon</span>}
                </button>
              );
            })}
          </div>

          {/* ── Right side ── */}
          <div className="ie-nav-right">

            {/* Steam (hidden <900px — shown in dropdown/drawer instead) */}
            {steamData?.steamId && (
              <div className="ie-steam-badge">
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg"
                  alt="Steam"
                  style={{ width: 20, height: 20, opacity: 0.6 }}
                />
                <img className="avatar" src={steamData.steamAvatar} alt="avatar" />
                <span className="ie-steam-name">{steamData.steamName}</span>
                <span className="ie-verified-badge">✓ Linked</span>
              </div>
            )}

            {/* Discord (hidden <900px) */}
            {discordLinked ? (
              <div className="ie-discord-badge">
                <DiscordIcon size={20} color="#5865F2" />
                <span className="ie-discord-name">{discordUsername}</span>
                <span className="ie-discord-verified">✓ Linked</span>
              </div>
            ) : (
              <button className="ie-discord-btn" onClick={handleDiscordConnect}>
                <DiscordIcon size={20} color="currentColor" />
                Connect Discord
              </button>
            )}

            {/* ── Three-dot dropdown ── */}
            <div className="ie-dropdown-wrap" ref={dropdownRef}>
              <button
                className="ie-dots-btn"
                onClick={() => setDropdownOpen((p) => !p)}
                aria-label="More options"
              >
                <span /><span /><span />
              </button>

              {dropdownOpen && (
                <div className="ie-dropdown">
                  {/* Account info */}
                
                  <div className="ie-dd-item" style={{ justifyContent: "center" }}>
                    <span style={{ fontSize: 15 }}>📱</span>
                    <span style={{ fontWeight: 600, color: "#333", letterSpacing: "0.05em" }}>
                      {(() => {
                        const raw = user?.phoneNumber || "";
                        const match = raw.match(/^(\+\d{1,3})(\d+)$/);
                        if (match) {
                          const code = match[1];
                          const digits = match[2].slice(-10);
                          return `${code} xxxxx ${digits.slice(5)}`;
                        }
                        const digits = raw.replace(/\D/g, "").slice(-10);
                        return `xxxxx ${digits.slice(5)}`;
                      })()}
                    </span>
                  </div>
                  {/* Logout */}
                  <div className="ie-dd-section" style={{ padding: "10px 10px" }}>
                    <button
                      className="ie-dd-btn logout"
                      onClick={async () => { await logout(); setDropdownOpen(false); }}
                      style={{
                        width: "100%",
                        justifyContent: "center",
                        background: "#fff1f0",
                        border: "1px solid #fecaca",
                        borderRadius: "100px",
                        padding: "10px 0",
                        fontSize: "0.9rem",
                        gap: "8px",
                      }}
                    >
                      
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Mobile hamburger ── */}
            <button
              className="ie-hamburger"
              onClick={() => setMobileMenuOpen((p) => !p)}
              aria-label="Toggle menu"
            >
              <span style={{
                transform: mobileMenuOpen ? "rotate(45deg) translate(5px, 5px)" : "none",
              }} />
              <span style={{ opacity: mobileMenuOpen ? 0 : 1 }} />
              <span style={{
                transform: mobileMenuOpen ? "rotate(-45deg) translate(5px, -5px)" : "none",
              }} />
            </button>
          </div>
        </div>

        {/* ── Mobile drawer ── */}
        <div className={`ie-mobile-drawer${mobileMenuOpen ? " open" : ""}`}>

          {/* Game tabs */}
          {games.map((g) => {
            const isActive = activeGame?.id === g.id;
            return (
              <button
                key={g.id}
                className="ie-mobile-game-btn"
                onClick={() => router.push(g.path)}
                style={isActive ? {
                  background: `${g.color}10`,
                  border: `1px solid ${g.color}30`,
                  color: g.color,
                } : {}}
              >
                <img
                  src={g.icon}
                  alt={g.name}
                  style={{ filter: isActive ? "none" : "grayscale(100%) brightness(55%)" }}
                />
                <span style={{ flex: 1 }}>{g.name}</span>
                {!g.active && <span className="ie-soon-badge">Soon</span>}
              </button>
            );
          })}

          <div className="ie-mobile-divider" />

          {/* Steam */}
          {steamData?.steamId && (
            <div className="ie-mobile-row">
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg"
                alt="Steam" style={{ width: 18, height: 18, opacity: 0.6 }}
              />
              <img
                src={steamData.steamAvatar} alt="avatar"
                style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid #22c55e" }}
              />
              <span style={{ flex: 1, fontWeight: 600, color: "#333" }}>{steamData.steamName}</span>
              <span className="ie-verified-badge">✓ Linked</span>
            </div>
          )}

          {/* Discord */}
          {discordLinked ? (
            <div className="ie-mobile-row">
              <DiscordIcon size={18} color="#5865F2" />
              <span style={{ flex: 1, fontWeight: 600, color: "#4f5fc0" }}>{discordUsername}</span>
              <span className="ie-discord-verified">✓ Linked</span>
            </div>
          ) : (
            <button
              className="ie-mobile-game-btn"
              onClick={handleDiscordConnect}
              style={{ color: "#4f5fc0", border: "1px solid #c7d0ff", background: "#eef0ff" }}
            >
              <DiscordIcon size={22} color="#5865F2" />
              Connect Discord
            </button>
          )}

          {/* Phone */}
          <div className="ie-mobile-row">
            <span style={{ fontSize: 16 }}>📱</span>
            <span>{user?.phoneNumber}</span>
          </div>

          {/* Logout */}
          <button className="ie-mobile-logout" onClick={async () => { await logout(); }}>
            <span style={{ fontSize: 16 }}>🚪</span>
            Logout
          </button>
        </div>

        {/* Private profile warning */}
        {steamData?.steamId && (!steamData?.dotaRankTier || steamData?.dotaRankTier === 0) && (
          <div className="ie-private-warning">
            <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
            <p>
              <strong>Your Dota 2 profile is private.</strong>{" "}
              Enable <code>Expose Public Match Data</code> in Dota 2 → Settings → Social.
              Play one match. Changes take up to 24 hours.
            </p>
          </div>
        )}
      </nav>
    </>
  );
}

export { Navbar };