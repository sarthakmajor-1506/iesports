"use client";
import Navbar from "../components/Navbar";
import ValorantTournaments from "../components/ValorantTournaments";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";

type ValorantTab = "tournaments" | "solo";

export default function Valorant() {
  const [valTab, setValTab] = useState<ValorantTab>("tournaments");
  const { riotData } = useAuth();
  const router = useRouter();

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        .val-page {
          min-height: 100vh;
          background: #F8F7F4;
          color: #111;
          font-family: var(--font-geist-sans), system-ui, sans-serif;
        }

        /* ── Hero ── */
        .val-hero {
          position: relative;
          overflow: hidden;
          height: 320px;
          display: flex;
          align-items: flex-end;
        }
        .val-hero-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: 0;
          animation: heroKenBurns 10s ease-in-out infinite alternate;
          will-change: transform;
        }
        @keyframes heroKenBurns {
          0%   { transform: scale(1)    translateX(0);   }
          50%  { transform: scale(1.06) translateX(-1%);  }
          100% { transform: scale(1.1)  translateX(-2%);  }
        }
        .val-hero-overlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: linear-gradient(
            to bottom,
            rgba(248,247,244,0) 0%,
            rgba(248,247,244,0.5) 55%,
            rgba(248,247,244,1) 100%
          );
        }
        .val-hero-content {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 30px 28px;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .val-hero-logo {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .val-hero-title {
          font-size: 2.2rem;
          font-weight: 900;
          color: #111;
          letter-spacing: -0.03em;
          line-height: 1.1;
        }
        .val-hero-title span { color: #ff4655; }
        .val-hero-sub {
          font-size: 0.84rem;
          color: #666;
          margin-top: 4px;
          font-weight: 500;
        }

        /* ── Riot ID banners ── */
        .val-banner {
          max-width: 1100px;
          margin: 0 auto;
          padding: 14px 30px 0;
        }
        .val-banner-box {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          border-radius: 10px;
          font-size: 0.82rem;
          line-height: 1.5;
        }
        .val-banner-box.amber {
          background: #fffbeb;
          border: 1px solid #fde68a;
          color: #92400e;
        }
        .val-banner-box.gray {
          background: #F8F7F4;
          border: 1px solid #E5E3DF;
          color: #888;
        }
        .val-banner-link {
          color: #ff4655;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
          white-space: nowrap;
        }
        .val-banner-link:hover { text-decoration: underline; }

        /* ── Tabs (pill style matching Dota) ── */
        .val-tabs-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 20px 30px 0;
        }
        .val-tabs {
          display: flex;
          gap: 2px;
          background: #fff;
          border-radius: 12px;
          padding: 4px;
          border: 1px solid #E5E3DF;
          width: fit-content;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        }
        .val-tab {
          padding: 9px 26px;
          border-radius: 9px;
          border: none;
          background: transparent;
          color: #888;
          cursor: pointer;
          font-size: 0.88rem;
          font-weight: 600;
          font-family: inherit;
          transition: all 0.18s;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .val-tab:hover { background: #F2F1EE; color: #555; }
        .val-tab.active {
          background: #ff4655;
          color: #fff;
          box-shadow: 0 2px 10px rgba(255,70,85,0.3);
        }
        .val-tab.active:hover { background: #e03a48; }

        /* ── Coming soon ── */
        .val-coming-soon {
          text-align: center;
          padding: 80px 20px;
          color: #bbb;
        }
        .val-coming-soon-icon { font-size: 48px; margin-bottom: 12px; }
        .val-coming-soon-title {
          font-size: 1.1rem;
          font-weight: 700;
          color: #888;
          margin-bottom: 6px;
        }
        .val-coming-soon-text { font-size: 0.85rem; }

        @media (max-width: 700px) {
          .val-hero { height: 240px; }
          .val-hero-title { font-size: 1.6rem; }
          .val-hero-content { padding: 0 16px 20px; }
          .val-hero-logo { width: 38px; height: 38px; }
          .val-banner { padding: 10px 16px 0; }
          .val-tabs-wrap { padding: 16px 16px 0; }
          .val-tab { padding: 8px 18px; font-size: 0.82rem; }
        }
      `}</style>

      <div className="val-page">
        <Navbar />

        {/* ── Hero ── */}
        <div className="val-hero">
          <img
            className="val-hero-img"
            src="/valorantimg3.jpg"
            alt="Valorant"
            draggable={false}
          />
          <div className="val-hero-overlay" />
          <div className="val-hero-content">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <img className="val-hero-logo" src="/valorantlogo.png" alt="Valorant" />
                <div className="val-hero-title">Valorant <span></span></div>
              </div>
              <div className="val-hero-sub">
                Auction-format tournaments for Indian Valorant players
              </div>
            </div>
          </div>
        </div>

        {/* ── Riot ID Banners ── */}
        <div className="val-banner">
          {riotData?.riotLinked && riotData?.riotVerified === "pending" && (
            <div className="val-banner-box amber">
              <span style={{ fontSize: 14, flexShrink: 0 }}>⏳</span>
              <span>
                Your Riot ID is pending verification — this usually takes under
                24 hours. You can still browse tournaments.
              </span>
            </div>
          )}
          {!riotData?.riotLinked && (
            <div className="val-banner-box gray">
              <span style={{ fontSize: 14, flexShrink: 0 }}>🎯</span>
              <span>Connect your Riot ID to register for tournaments.</span>
              <span
                className="val-banner-link"
                onClick={() => router.push("/connect-riot")}
              >
                Connect now →
              </span>
            </div>
          )}
        </div>

        {/* ── Tabs (pill style) ── */}
        <div className="val-tabs-wrap">
          <div className="val-tabs">
            <button
              className={`val-tab${valTab === "tournaments" ? " active" : ""}`}
              onClick={() => setValTab("tournaments")}
            >
              🏆 Tournaments
            </button>
            <button
              className={`val-tab${valTab === "solo" ? " active" : ""}`}
              onClick={() => setValTab("solo")}
            >
              ⚔️ Solo
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        {valTab === "tournaments" && <ValorantTournaments />}
        {valTab === "solo" && (
          <div className="val-coming-soon">
            <div className="val-coming-soon-icon">🎮</div>
            <div className="val-coming-soon-title">Solo Tournaments Coming Soon</div>
            <p className="val-coming-soon-text">
              Solo ranked tournaments for Valorant are in development.
            </p>
          </div>
        )}
      </div>
    </>
  );
}