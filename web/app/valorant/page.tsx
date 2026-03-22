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
          position: relative;
        }

        /* ── Hero banner ── */
        .val-hero {
          position: relative;
          overflow: hidden;
          height: 220px;
          display: flex;
          align-items: flex-end;
          background: linear-gradient(135deg, #ff4655 0%, #1a0008 100%);
        }
        .val-hero-overlay {
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
        .val-hero-content {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 30px 20px;
        }
        .val-hero-title {
          font-size: 2rem;
          font-weight: 900;
          color: #111;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .val-hero-title img {
          width: 44px;
          height: 44px;
          border-radius: 10px;
        }
        .val-hero-sub {
          font-size: 0.88rem;
          color: #888;
          margin-top: 4px;
          font-weight: 500;
        }

        /* ── Riot ID banners ── */
        .val-banner {
          max-width: 1100px;
          margin: 0 auto;
          padding: 12px 30px 0;
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

        /* ── Tabs ── */
        .val-tabs {
          max-width: 1100px;
          margin: 0 auto;
          padding: 16px 30px 0;
          display: flex;
          gap: 0;
          border-bottom: 1px solid #E5E3DF;
        }
        .val-tab {
          padding: 10px 22px;
          font-size: 0.88rem;
          font-weight: 600;
          color: #888;
          background: none;
          border: none;
          cursor: pointer;
          font-family: inherit;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .val-tab:hover { color: #555; }
        .val-tab.active {
          color: #ff4655;
          border-bottom-color: #ff4655;
          font-weight: 800;
        }

        /* ── Coming soon panel ── */
        .val-coming-soon {
          text-align: center;
          padding: 80px 20px;
          color: #bbb;
        }
        .val-coming-soon-icon { font-size: 48px; margin-bottom: 12px; }
        .val-coming-soon-title { font-size: 1.1rem; font-weight: 700; color: #888; margin-bottom: 6px; }
        .val-coming-soon-text { font-size: 0.85rem; }

        @media (max-width: 700px) {
          .val-hero { height: 180px; }
          .val-hero-title { font-size: 1.5rem; }
          .val-hero-title img { width: 36px; height: 36px; }
          .val-hero-content { padding: 0 16px 16px; }
          .val-banner { padding: 10px 16px 0; }
          .val-tabs { padding: 12px 16px 0; }
        }
      `}</style>

      <div className="val-page">
        <Navbar />

        {/* Hero */}
        <div className="val-hero">
          <div className="val-hero-overlay" />
          <div className="val-hero-content">
            <div className="val-hero-title">
              <img src="/valorantlogo.png" alt="Valorant" />
              Valorant
            </div>
            <p className="val-hero-sub">Auction-format tournaments for Indian Valorant players</p>
          </div>
        </div>

        {/* Riot ID Banners */}
        <div className="val-banner">
          {riotData?.riotLinked && riotData?.riotVerified === "pending" && (
            <div className="val-banner-box amber">
              <span style={{ fontSize: 14, flexShrink: 0 }}>⏳</span>
              <span>Your Riot ID is pending verification — this usually takes under 24 hours. You can still browse tournaments.</span>
            </div>
          )}
          {!riotData?.riotLinked && (
            <div className="val-banner-box gray">
              <span style={{ fontSize: 14, flexShrink: 0 }}>🎯</span>
              <span>Connect your Riot ID to register for tournaments.</span>
              <span className="val-banner-link" onClick={() => router.push("/connect-riot")}>Connect now →</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="val-tabs">
          <button className={`val-tab${valTab === "tournaments" ? " active" : ""}`} onClick={() => setValTab("tournaments")}>
            Tournaments
          </button>
          <button className={`val-tab${valTab === "solo" ? " active" : ""}`} onClick={() => setValTab("solo")}>
            Solo
          </button>
        </div>

        {/* Tab content */}
        {valTab === "tournaments" && <ValorantTournaments />}
        {valTab === "solo" && (
          <div className="val-coming-soon">
            <div className="val-coming-soon-icon">🎮</div>
            <div className="val-coming-soon-title">Solo Tournaments Coming Soon</div>
            <p className="val-coming-soon-text">Solo ranked tournaments for Valorant are in development.</p>
          </div>
        )}
      </div>
    </>
  );
}