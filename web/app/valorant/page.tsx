"use client";
import Navbar from "../components/Navbar";
import ValorantTournaments from "../components/ValorantTournaments";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { Trophy, Swords, Clock } from "lucide-react";

type ValorantTab = "tournaments" | "solo";

export default function Valorant() {
  const [valTab, setValTab] = useState<ValorantTab>("tournaments");
  const [mounted, setMounted] = useState(false);
  const { user, riotData } = useAuth();
  const router = useRouter();

  useEffect(() => { const t = setTimeout(() => setMounted(true), 50); return () => clearTimeout(t); }, []);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        .val-page {
          min-height: 100vh;
          background: #0f1923;
          color: #F0EEEA;
          font-family: var(--font-geist-sans), system-ui, sans-serif;
          position: relative;
          overflow-x: hidden;
        }

        /* ── Animated background ── */
        .val-bg {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
        }
        .val-bg-grid {
          position: absolute; inset: 0;
          background-image: linear-gradient(rgba(60,203,255,0.04) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(60,203,255,0.04) 1px, transparent 1px);
          background-size: 64px 64px;
        }
        .val-bg-glow1 {
          position: absolute; width: 700px; height: 700px; top: -200px; right: -100px;
          background: radial-gradient(circle, rgba(60,203,255,0.12) 0%, rgba(60,203,255,0.03) 45%, transparent 70%);
          animation: val-glow-drift1 20s ease-in-out infinite;
        }
        .val-bg-glow2 {
          position: absolute; width: 550px; height: 550px; bottom: 20%; left: -150px;
          background: radial-gradient(circle, rgba(60,203,255,0.09) 0%, rgba(60,203,255,0.02) 45%, transparent 70%);
          animation: val-glow-drift2 26s ease-in-out infinite;
        }
        @keyframes val-glow-drift1 {
          0%   { transform: translate(0, 0) scale(1); opacity: 0.7; }
          25%  { transform: translate(-80px, 60px) scale(1.18); opacity: 1; }
          50%  { transform: translate(-30px, 120px) scale(0.95); opacity: 0.8; }
          75%  { transform: translate(50px, 40px) scale(1.1); opacity: 0.9; }
          100% { transform: translate(0, 0) scale(1); opacity: 0.7; }
        }
        @keyframes val-glow-drift2 {
          0%   { transform: translate(0, 0) scale(1); opacity: 0.6; }
          33%  { transform: translate(100px, -70px) scale(1.15); opacity: 1; }
          66%  { transform: translate(40px, -120px) scale(0.9); opacity: 0.7; }
          100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
        }

        /* ── Page content (above bg) ── */
        .val-content { position: relative; z-index: 1; }

        /* ── Hero ── */
        .val-hero {
          position: relative; overflow: hidden; height: 340px;
          display: flex; align-items: flex-end;
        }
        .val-hero-img {
          position: absolute; inset: -6%; width: 112%; height: 112%;
          object-fit: cover; object-position: center 20%; z-index: 0;
          animation: val-hero-kb 14s ease-in-out infinite alternate;
          will-change: transform;
        }
        @keyframes val-hero-kb {
          0%   { transform: scale(1) translate(0, 0); }
          50%  { transform: scale(1.05) translate(-1.5%, -0.5%); }
          100% { transform: scale(1.02) translate(1%, -1%); }
        }
        .val-hero-overlay {
          position: absolute; inset: 0; z-index: 1;
          background: linear-gradient(to bottom, rgba(15,25,35,0) 0%, rgba(15,25,35,0.55) 55%, #0f1923 100%);
        }
        .val-hero-content {
          position: relative; z-index: 2; width: 100%; max-width: 1100px;
          margin: 0 auto; padding: 0 30px 32px;
          display: flex; align-items: flex-end; gap: 18px;
          opacity: 0; transform: translateY(16px); transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .val-hero-content.show { opacity: 1; transform: translateY(0); }
        .val-hero-logo { width: 52px; height: 52px; border-radius: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.5); flex-shrink: 0; }
        .val-hero-text { flex: 1; }
        .val-hero-title { font-size: 2.4rem; font-weight: 900; color: #fff; letter-spacing: -0.03em; line-height: 1.1; }
        .val-hero-title span { color: #3CCBFF; }
        .val-hero-sub { font-size: 0.86rem; color: rgba(255,255,255,0.55); margin-top: 5px; font-weight: 500; }

        /* ── Riot ID banners ── */
        .val-banner {
          max-width: 1100px; margin: 0 auto; padding: 16px 30px 0;
          opacity: 0; transform: translateY(-8px); transition: opacity 0.4s ease 0.3s, transform 0.4s ease 0.3s;
        }
        .val-banner.show { opacity: 1; transform: translateY(0); }
        .val-banner-box {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 18px; border-radius: 12px; font-size: 0.82rem; line-height: 1.5;
        }
        .val-banner-box.amber {
          background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); color: #fbbf24;
        }
        .val-banner-box.gray {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.7);
        }
        .val-banner-link { color: #3CCBFF; font-weight: 700; text-decoration: none; cursor: pointer; white-space: nowrap; }
        .val-banner-link:hover { text-decoration: underline; }

        /* ── Tabs ── */
        .val-tabs-wrap {
          max-width: 1100px; margin: 0 auto; padding: 24px 30px 0;
          opacity: 0; transition: opacity 0.3s ease 0.5s;
        }
        .val-tabs-wrap.show { opacity: 1; }
        .val-tabs {
          display: flex; gap: 6px; background: rgba(255,255,255,0.04);
          border-radius: 14px; padding: 5px; border: 1px solid rgba(255,255,255,0.08);
          width: fit-content;
        }
        .val-tab {
          padding: 10px 28px; border-radius: 10px; border: none;
          background: transparent; color: rgba(255,255,255,0.5);
          cursor: pointer; font-size: 0.9rem; font-weight: 700; font-family: inherit;
          transition: all 0.2s; display: flex; align-items: center; gap: 8px;
        }
        .val-tab:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.85); }
        .val-tab.active {
          background: #3CCBFF; color: #fff;
          box-shadow: 0 0 20px rgba(60,203,255,0.35);
        }
        .val-tab.active:hover { background: #30B5E6; }

        /* ── Coming soon ── */
        .val-coming-soon {
          max-width: 1100px; margin: 60px auto; padding: 60px 30px;
          text-align: center; color: #555550;
          opacity: 0; transform: translateY(16px); transition: opacity 0.3s ease, transform 0.3s ease;
        }
        .val-coming-soon.show { opacity: 1; transform: translateY(0); }
        .val-coming-soon-title { font-size: 1.1rem; font-weight: 700; color: #8A8880; margin-bottom: 6px; display: block; }
        .val-coming-soon-text { font-size: 0.85rem; display: block; margin-top: 8px; }

        @media (max-width: 700px) {
          .val-hero { height: 260px; }
          .val-hero-title { font-size: 1.7rem; }
          .val-hero-content { padding: 0 16px 22px; }
          .val-hero-logo { width: 42px; height: 42px; }
          .val-banner { padding: 10px 16px 0; }
          .val-tabs-wrap { padding: 18px 16px 0; }
          .val-tab { padding: 9px 18px; font-size: 0.84rem; }
        }
      `}</style>

      <div className="val-page">
        {/* Animated background */}
        <div className="val-bg">
          <div className="val-bg-grid" />
          <div className="val-bg-glow1" />
          <div className="val-bg-glow2" />
        </div>

        <div className="val-content">
          <Navbar />

          <div className="val-hero">
            <img className="val-hero-img" src="/valorantimg3.jpg" alt="Valorant" draggable={false} />
            <div className="val-hero-overlay" />
            <div className={`val-hero-content${mounted ? " show" : ""}`}>
              <img className="val-hero-logo" src="/valorantlogo.png" alt="Valorant" />
              <div className="val-hero-text">
                <div className="val-hero-title">Valorant <span>Tournaments</span></div>
                <div className="val-hero-sub">Rank-verified competitive play for Indian Valorant players</div>
              </div>
            </div>
          </div>

          <div className={`val-banner${mounted ? " show" : ""}`}>
            {user && riotData?.riotLinked && riotData?.riotVerified === "pending" && (
              <div className="val-banner-box gray" style={{ opacity: 0.7 }}>
                <Clock size={14} style={{ flexShrink: 0, color: "#8A8880" }} />
                <span style={{ color: "#8A8880" }}>Nothing needed from you — our system is verifying your Riot ID. This usually takes under 24 hours.</span>
              </div>
            )}
            {user && !riotData?.riotLinked && (
              <div className="val-banner-box gray">
                <Trophy size={14} style={{ color: "#3CCBFF", flexShrink: 0 }} />
                <span>Connect your Riot ID to register for tournaments.</span>
                <span className="val-banner-link" onClick={() => router.push("/connect-riot")}>Connect now →</span>
              </div>
            )}
            {!user && (
              <div className="val-banner-box gray">
                <Trophy size={14} style={{ color: "#3CCBFF", flexShrink: 0 }} />
                <span>Sign in to register for tournaments and compete.</span>
              </div>
            )}
          </div>

          <div className={`val-tabs-wrap${mounted ? " show" : ""}`}>
            <div className="val-tabs">
              <button className={`val-tab${valTab === "tournaments" ? " active" : ""}`} onClick={() => setValTab("tournaments")}>
                <Trophy size={16} /> Tournaments
              </button>
              <button className={`val-tab${valTab === "solo" ? " active" : ""}`} onClick={() => setValTab("solo")}>
                <Swords size={16} /> Solo
              </button>
            </div>
          </div>

          {valTab === "tournaments" && <ValorantTournaments />}
          {valTab === "solo" && (
            <div className={`val-coming-soon${mounted ? " show" : ""}`}>
              <Swords size={48} strokeWidth={1} style={{ color: "#555550", marginBottom: 14, display: "block", margin: "0 auto 14px" }} />
              <span className="val-coming-soon-title">Solo Tournaments Coming Soon</span>
              <span className="val-coming-soon-text">Solo ranked tournaments for Valorant are in development.</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
