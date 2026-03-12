"use client";
import Navbar from "../components/Navbar";
import DotaTournaments from "../components/DotaTournaments";
import SoloTournaments from "../components/SoloTournaments";
import DailyMatches from "../components/DailyMatches";
import { useState, useEffect, useRef } from "react";

type DotaTab = "tournaments" | "solo" | "daily";

export default function Dota2() {
  const [dotaTab, setDotaTab] = useState<DotaTab>("tournaments");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .d2-page {
          min-height: 100vh;
          background: #F8F7F4;
          color: #111;
          font-family: var(--font-geist-sans), system-ui, sans-serif;
          position: relative;
        }

        /* ── Video hero ── */
        .d2-hero {
          position: relative;
          overflow: hidden;
          height: 320px;
          display: flex;
          align-items: flex-end;
        }
        .d2-hero-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: 0;
          pointer-events: none;
        }
        .d2-hero-overlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: linear-gradient(
            to bottom,
            rgba(255,255,255,0) 0%,
            rgba(248,247,244,0.55) 60%,
            rgba(248,247,244,1) 100%
          );
        }
        .d2-hero-content {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 30px 24px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
        }
        .d2-hero-title {
          font-size: 2rem;
          font-weight: 900;
          color: #111;
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .d2-hero-title span { color: #F05A28; }
        .d2-hero-sub {
          font-size: 0.82rem;
          color: #666;
          margin-top: 5px;
          font-weight: 500;
        }

        /* ── Tab switcher ── */
        .d2-tabs-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 30px 0;
        }
        .d2-tabs {
          display: flex;
          gap: 2px;
          background: #fff;
          border-radius: 12px;
          padding: 4px;
          border: 1px solid #E5E3DF;
          width: fit-content;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        }
        .d2-tab {
          padding: 9px 28px;
          border-radius: 9px;
          border: none;
          background: transparent;
          color: #888;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 600;
          font-family: inherit;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .d2-tab:hover { background: #F2F1EE; color: #555; }
        .d2-tab.active {
          background: #F05A28;
          color: #fff;
          box-shadow: 0 2px 10px rgba(240,90,40,0.3);
        }
        .d2-tab.active:hover { background: #D44A1A; }
        .d2-soon-badge {
          font-size: 0.58rem;
          background: rgba(255,255,255,0.25);
          padding: 1px 6px;
          border-radius: 20px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .d2-tab:not(.active) .d2-soon-badge {
          background: #F2F1EE;
          color: #bbb;
        }

        /* ── Solo coming soon ── */
        .d2-solo-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          color: #bbb;
        }
        .d2-solo-empty p.emoji { font-size: 52px; margin-bottom: 16px; }
        .d2-solo-empty h2 { font-size: 22px; font-weight: 800; color: #333; }
        .d2-solo-empty p.sub { font-size: 14px; color: #aaa; margin-top: 8px; }
      `}</style>

      <div className="d2-page">
        <Navbar />

        {/* ── Hero with video background ── */}
        <div className="d2-hero">
          <video
            ref={videoRef}
            className="d2-hero-video"
            src="/Dota2teaser.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
          />
          <div className="d2-hero-overlay" />
          <div className="d2-hero-content">
            <div>
              <div className="d2-hero-title">Dota 2 <span>Tournaments</span></div>
              <div className="d2-hero-sub">Steam-verified · Rank-locked brackets · Fast UPI payouts</div>
            </div>
          </div>
        </div>

        {/* ── Tab switcher ── */}
        <div className="d2-tabs-wrap" style={{ paddingTop: 20, paddingBottom: 4 }}>
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

        {/* ── Content ── */}
        {dotaTab === "tournaments" && <DotaTournaments />}
        {dotaTab === "solo" && <SoloTournaments />}
        {dotaTab === "daily" && <DailyMatches />}
      </div>
    </>
  );
}