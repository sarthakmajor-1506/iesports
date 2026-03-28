"use client";
import Navbar from "../components/Navbar";
import DotaTournaments from "../components/DotaTournaments";
import SoloTournaments from "../components/SoloTournaments";
import DailyMatches from "../components/DailyMatches";
import { useState } from "react";

type DotaTab = "tournaments" | "solo" | "daily";

export default function Dota2() {
  const [dotaTab, setDotaTab] = useState<DotaTab>("tournaments");

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        .d2-page {
          min-height: 100vh;
          background: #0A0A0C;
          color: #F0EEEA;
          font-family: var(--font-geist-sans), system-ui, sans-serif;
        }

        /* ── Hero ── */
        .d2-hero {
          position: relative;
          overflow: hidden;
          height: 320px;
          display: flex;
          align-items: flex-end;
        }
        .d2-hero-img {
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
        .d2-hero-overlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: linear-gradient(
            to bottom,
            rgba(10,10,12,0) 0%,
            rgba(10,10,12,0.5) 55%,
            rgba(10,10,12,1) 100%
          );
        }
        .d2-hero-content {
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
        .d2-hero-logo {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        }
        .d2-hero-title {
          font-size: 2.2rem;
          font-weight: 900;
          color: #F0EEEA;
          letter-spacing: -0.03em;
          line-height: 1.1;
        }
        .d2-hero-title span { color: #3B82F6; }
        .d2-hero-sub {
          font-size: 0.84rem;
          color: #8A8880;
          margin-top: 4px;
          font-weight: 500;
        }

        /* ── Tab switcher ── */
        .d2-tabs-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 20px 30px 0;
        }
        .d2-tabs {
          display: flex;
          gap: 2px;
          background: #121215;
          border-radius: 12px;
          padding: 4px;
          border: 1px solid #2A2A30;
          width: fit-content;
          box-shadow: 0 1px 4px rgba(0,0,0,0.2);
        }
        .d2-tab {
          padding: 9px 28px;
          border-radius: 9px;
          border: none;
          background: transparent;
          color: #8A8880;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 600;
          font-family: inherit;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .d2-tab:hover { background: #1a1a1f; color: #bbb; }
        .d2-tab.active {
          background: #3B82F6;
          color: #fff;
          box-shadow: 0 2px 10px rgba(59,130,246,0.3);
        }
        .d2-tab.active:hover { background: #2563EB; }
        .d2-soon-badge {
          font-size: 0.58rem;
          background: rgba(255,255,255,0.15);
          padding: 1px 6px;
          border-radius: 20px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .d2-tab:not(.active) .d2-soon-badge {
          background: #1a1a1f;
          color: #555550;
        }

        @media (max-width: 700px) {
          .d2-hero { height: 240px; }
          .d2-hero-title { font-size: 1.6rem; }
          .d2-hero-content { padding: 0 16px 20px; }
          .d2-hero-logo { width: 38px; height: 38px; }
          .d2-tabs-wrap { padding: 16px 16px 0; }
          .d2-tab { padding: 8px 18px; font-size: 0.82rem; }
        }
      `}</style>

      <div className="d2-page">
        <Navbar />

        <div className="d2-hero">
          <img
            className="d2-hero-img"
            src="/dota2image3.jpeg"
            alt="Dota 2"
            draggable={false}
          />
          <div className="d2-hero-overlay" />
          <div className="d2-hero-content">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <img className="d2-hero-logo" src="/dota2logo.png" alt="Dota 2" />
                <div className="d2-hero-title">Dota 2 <span></span></div>
              </div>
              <div className="d2-hero-sub">
                Steam-verified · Rank-locked brackets · Fast UPI payouts
              </div>
            </div>
          </div>
        </div>

        <div className="d2-tabs-wrap">
          <div className="d2-tabs">
            <button
              className={`d2-tab${dotaTab === "tournaments" ? " active" : ""}`}
              onClick={() => setDotaTab("tournaments")}
            >
              🏆 Tournaments
            </button>
            <button
              className={`d2-tab${dotaTab === "solo" ? " active" : ""}`}
              onClick={() => setDotaTab("solo")}
            >
              ⚔️ Solo
            </button>
            <button
              className={`d2-tab${dotaTab === "daily" ? " active" : ""}`}
              onClick={() => setDotaTab("daily")}
            >
              🎮 Daily Matches
            </button>
          </div>
        </div>

        {dotaTab === "tournaments" && <DotaTournaments />}
        {dotaTab === "solo" && <SoloTournaments />}
        {dotaTab === "daily" && <DailyMatches />}
      </div>
    </>
  );
}