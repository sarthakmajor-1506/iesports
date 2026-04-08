"use client";
import Navbar from "../components/Navbar";
import DotaTournaments from "../components/DotaTournaments";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { Trophy, Swords, Gamepad2 } from "lucide-react";
import Image from "next/image";

const SoloTournaments = dynamic(() => import("../components/SoloTournaments"), { ssr: false });
const DailyMatches = dynamic(() => import("../components/DailyMatches"), { ssr: false });

type DotaTab = "tournaments" | "solo" | "daily";

export default function Dota2() {
  const [dotaTab, setDotaTab] = useState<DotaTab>("tournaments");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 50); return () => clearTimeout(t); }, []);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        .d2-page {
          min-height: 100vh;
          background: #0a0e18;
          color: #F0EEEA;
          font-family: var(--font-geist-sans), system-ui, sans-serif;
          position: relative;
          overflow-x: hidden;
        }

        /* ── Animated background ── */
        .d2-bg {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
        }
        .d2-bg-grid {
          position: absolute; inset: 0;
          background-image: linear-gradient(rgba(59,130,246,0.04) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(59,130,246,0.04) 1px, transparent 1px);
          background-size: 64px 64px;
        }
        .d2-bg-glow1 {
          position: absolute; width: 700px; height: 700px; top: -200px; right: -100px;
          background: radial-gradient(circle, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0.03) 45%, transparent 70%);
          animation: d2-glow-drift1 20s ease-in-out infinite;
        }
        .d2-bg-glow2 {
          position: absolute; width: 550px; height: 550px; bottom: 20%; left: -150px;
          background: radial-gradient(circle, rgba(59,130,246,0.09) 0%, rgba(59,130,246,0.02) 45%, transparent 70%);
          animation: d2-glow-drift2 26s ease-in-out infinite;
        }
        @keyframes d2-glow-drift1 {
          0%   { transform: translate(0, 0) scale(1); opacity: 0.7; }
          25%  { transform: translate(-80px, 60px) scale(1.18); opacity: 1; }
          50%  { transform: translate(-30px, 120px) scale(0.95); opacity: 0.8; }
          75%  { transform: translate(50px, 40px) scale(1.1); opacity: 0.9; }
          100% { transform: translate(0, 0) scale(1); opacity: 0.7; }
        }
        @keyframes d2-glow-drift2 {
          0%   { transform: translate(0, 0) scale(1); opacity: 0.6; }
          33%  { transform: translate(100px, -70px) scale(1.15); opacity: 1; }
          66%  { transform: translate(40px, -120px) scale(0.9); opacity: 0.7; }
          100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
        }

        /* ── Page content (above bg) ── */
        .d2-content { position: relative; z-index: 1; }

        /* ── Hero ── */
        .d2-hero {
          position: relative;
          overflow: hidden;
          height: 340px;
          display: flex;
          align-items: flex-end;
        }
        .d2-hero-img {
          position: absolute;
          inset: -6%;
          width: 112%;
          height: 112%;
          object-fit: cover;
          object-position: center 20%;
          z-index: 0;
          animation: d2-hero-kb 14s ease-in-out infinite alternate;
          will-change: transform;
        }
        @keyframes d2-hero-kb {
          0%   { transform: scale(1) translate(0, 0); }
          50%  { transform: scale(1.05) translate(-1.5%, -0.5%); }
          100% { transform: scale(1.02) translate(1%, -1%); }
        }
        .d2-hero-overlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: linear-gradient(to bottom, rgba(10,14,24,0) 0%, rgba(10,14,24,0.55) 55%, #0a0e18 100%);
        }
        .d2-hero-content {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 30px 32px;
          display: flex;
          align-items: flex-end;
          gap: 18px;
          opacity: 0; transform: translateY(16px); transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .d2-hero-content.show { opacity: 1; transform: translateY(0); }
        .d2-hero-logo {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.5);
          flex-shrink: 0;
        }
        .d2-hero-text { flex: 1; }
        .d2-hero-title {
          font-size: 2.4rem;
          font-weight: 900;
          color: #fff;
          letter-spacing: -0.03em;
          line-height: 1.1;
        }
        .d2-hero-title span { color: #3B82F6; }
        .d2-hero-sub {
          font-size: 0.86rem;
          color: rgba(255,255,255,0.55);
          margin-top: 5px;
          font-weight: 500;
        }

        /* ── Tab switcher ── */
        .d2-tabs-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 24px 30px 0;
          opacity: 0; transition: opacity 0.3s ease 0.5s;
        }
        .d2-tabs-wrap.show { opacity: 1; }
        .d2-tabs {
          display: flex;
          gap: 6px;
          background: rgba(255,255,255,0.04);
          border-radius: 14px;
          padding: 5px;
          border: 1px solid rgba(255,255,255,0.08);
          width: fit-content;
        }
        .d2-tab {
          padding: 10px 28px;
          border-radius: 10px;
          border: none;
          background: transparent;
          color: rgba(255,255,255,0.5);
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 700;
          font-family: inherit;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .d2-tab:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.85); }
        .d2-tab.active {
          background: #3B82F6;
          color: #fff;
          box-shadow: 0 0 20px rgba(59,130,246,0.35);
        }
        .d2-tab.active:hover { background: #2563EB; }

        @media (max-width: 700px) {
          .d2-hero { height: 260px; }
          .d2-hero-title { font-size: 1.7rem; }
          .d2-hero-content { padding: 0 16px 22px; }
          .d2-hero-logo { width: 42px; height: 42px; }
          .d2-tabs-wrap { padding: 18px 16px 0; }
          .d2-tab { padding: 9px 18px; font-size: 0.84rem; }
        }
      `}</style>

      <div className="d2-page">
        {/* Animated background */}
        <div className="d2-bg">
          <div className="d2-bg-grid" />
          <div className="d2-bg-glow1" />
          <div className="d2-bg-glow2" />
        </div>

        <div className="d2-content">
          <Navbar />

          <div className="d2-hero">
            <Image
              className="d2-hero-img"
              src="/dota2poster3.jpg"
              alt="Dota 2"
              width={1920}
              height={1080}
              priority
              draggable={false}
            />
            <div className="d2-hero-overlay" />
            <div className={`d2-hero-content${mounted ? " show" : ""}`}>
              <Image className="d2-hero-logo" src="/dota2logo.png" alt="Dota 2" width={56} height={56} />
              <div className="d2-hero-text">
                <div className="d2-hero-title">Dota 2 <span>Tournaments</span></div>
                <div className="d2-hero-sub">
                  Steam-verified · Rank-locked brackets · Fast UPI payouts
                </div>
              </div>
            </div>
          </div>

          <div className={`d2-tabs-wrap${mounted ? " show" : ""}`}>
            <div className="d2-tabs">
              <button
                className={`d2-tab${dotaTab === "tournaments" ? " active" : ""}`}
                onClick={() => setDotaTab("tournaments")}
              >
                <Trophy size={16} /> Tournaments
              </button>
              <button
                className={`d2-tab${dotaTab === "solo" ? " active" : ""}`}
                onClick={() => setDotaTab("solo")}
              >
                <Swords size={16} /> Solo
              </button>
              <button
                className={`d2-tab${dotaTab === "daily" ? " active" : ""}`}
                onClick={() => setDotaTab("daily")}
              >
                <Gamepad2 size={16} /> Daily Matches
              </button>
            </div>
          </div>

          {dotaTab === "tournaments" && <DotaTournaments />}
          {dotaTab === "solo" && <SoloTournaments />}
          {dotaTab === "daily" && <DailyMatches />}
        </div>
      </div>
    </>
  );
}
