"use client";
import Navbar from "../components/Navbar";
import CS2Tournaments from "../components/CS2Tournaments";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import Image from "next/image";

export default function CS2() {
  const [mounted, setMounted] = useState(false);
  const { user, steamLinked } = useAuth();
  const router = useRouter();

  useEffect(() => { const t = setTimeout(() => setMounted(true), 50); return () => clearTimeout(t); }, []);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        .cs2-page {
          min-height: 100vh;
          background: #0d0d0d;
          color: #F0EEEA;
          font-family: var(--font-geist-sans), system-ui, sans-serif;
          position: relative;
          overflow-x: hidden;
        }

        /* ── Animated background ── */
        .cs2-bg {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
        }
        .cs2-bg-grid {
          position: absolute; inset: 0;
          background-image: linear-gradient(rgba(240,165,0,0.04) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(240,165,0,0.04) 1px, transparent 1px);
          background-size: 64px 64px;
        }
        .cs2-bg-glow1 {
          position: absolute; width: 700px; height: 700px; top: -200px; right: -100px;
          background: radial-gradient(circle, rgba(240,165,0,0.12) 0%, rgba(240,165,0,0.03) 45%, transparent 70%);
          animation: cs2-glow-drift1 20s ease-in-out infinite;
        }
        .cs2-bg-glow2 {
          position: absolute; width: 550px; height: 550px; bottom: 20%; left: -150px;
          background: radial-gradient(circle, rgba(240,165,0,0.09) 0%, rgba(240,165,0,0.02) 45%, transparent 70%);
          animation: cs2-glow-drift2 26s ease-in-out infinite;
        }
        @keyframes cs2-glow-drift1 {
          0%   { transform: translate(0, 0) scale(1); opacity: 0.7; }
          25%  { transform: translate(-80px, 60px) scale(1.18); opacity: 1; }
          50%  { transform: translate(-30px, 120px) scale(0.95); opacity: 0.8; }
          75%  { transform: translate(50px, 40px) scale(1.1); opacity: 0.9; }
          100% { transform: translate(0, 0) scale(1); opacity: 0.7; }
        }
        @keyframes cs2-glow-drift2 {
          0%   { transform: translate(0, 0) scale(1); opacity: 0.6; }
          33%  { transform: translate(100px, -70px) scale(1.15); opacity: 1; }
          66%  { transform: translate(40px, -120px) scale(0.9); opacity: 0.7; }
          100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
        }

        /* ── Page content (above bg) ── */
        .cs2-content { position: relative; z-index: 1; }

        /* ── Hero ── */
        .cs2-hero {
          position: relative; overflow: hidden; height: 340px;
          display: flex; align-items: flex-end;
        }
        .cs2-hero-img {
          position: absolute; inset: -6%; width: 112%; height: 112%;
          object-fit: cover; object-position: center 20%; z-index: 0;
          animation: cs2-hero-kb 14s ease-in-out infinite alternate;
          will-change: transform;
        }
        @keyframes cs2-hero-kb {
          0%   { transform: scale(1) translate(0, 0); }
          50%  { transform: scale(1.05) translate(-1.5%, -0.5%); }
          100% { transform: scale(1.02) translate(1%, -1%); }
        }
        .cs2-hero-overlay {
          position: absolute; inset: 0; z-index: 1;
          background: linear-gradient(to bottom, rgba(13,13,13,0) 0%, rgba(13,13,13,0.55) 55%, #0d0d0d 100%);
        }
        .cs2-hero-content {
          position: relative; z-index: 2; width: 100%; max-width: 1100px;
          margin: 0 auto; padding: 0 30px 32px;
          display: flex; align-items: flex-end; gap: 18px;
          opacity: 0; transform: translateY(16px); transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .cs2-hero-content.show { opacity: 1; transform: translateY(0); }
        .cs2-hero-logo { width: 52px; height: 52px; border-radius: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.5); flex-shrink: 0; }
        .cs2-hero-text { flex: 1; }
        .cs2-hero-title { font-size: 2.4rem; font-weight: 900; color: #fff; letter-spacing: -0.03em; line-height: 1.1; }
        .cs2-hero-title span { color: #f0a500; }
        .cs2-hero-sub { font-size: 0.86rem; color: rgba(255,255,255,0.55); margin-top: 5px; font-weight: 500; }

        /* ── Steam banner ── */
        .cs2-banner {
          max-width: 1100px; margin: 0 auto; padding: 16px 30px 0;
          opacity: 0; transform: translateY(-8px); transition: opacity 0.4s ease 0.3s, transform 0.4s ease 0.3s;
        }
        .cs2-banner.show { opacity: 1; transform: translateY(0); }
        .cs2-banner-box {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 18px; border-radius: 12px; font-size: 0.82rem; line-height: 1.5;
        }
        .cs2-banner-box.gray {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.7);
        }
        .cs2-banner-link { color: #f0a500; font-weight: 700; text-decoration: none; cursor: pointer; white-space: nowrap; }
        .cs2-banner-link:hover { text-decoration: underline; }

        @media (max-width: 700px) {
          .cs2-hero { height: 240px; }
          .cs2-hero-title { font-size: 1.6rem; }
          .cs2-hero-content { padding: 0 16px 22px; gap: 14px; }
          .cs2-hero-logo { width: 40px; height: 40px; border-radius: 12px; }
          .cs2-hero-sub { font-size: 0.78rem; }
          .cs2-banner { padding: 10px 14px 0; }
          .cs2-banner-box { padding: 10px 14px; font-size: 0.78rem; border-radius: 10px; }
        }
      `}</style>

      <div className="cs2-page">
        {/* Animated background */}
        <div className="cs2-bg">
          <div className="cs2-bg-grid" />
          <div className="cs2-bg-glow1" />
          <div className="cs2-bg-glow2" />
        </div>

        <div className="cs2-content">
          <Navbar />

          <div className="cs2-hero">
            <Image className="cs2-hero-img" src="/csimagehd.jpg" alt="CS2" width={1920} height={1080} priority draggable={false} />
            <div className="cs2-hero-overlay" />
            <div className={`cs2-hero-content${mounted ? " show" : ""}`}>
              <Image className="cs2-hero-logo" src="/cs2logo.png" alt="CS2" width={56} height={56} />
              <div className="cs2-hero-text">
                <div className="cs2-hero-title">CS2 <span>Tournaments</span></div>
                <div className="cs2-hero-sub">Competitive Counter-Strike 2 for Indian players</div>
              </div>
            </div>
          </div>

          <div className={`cs2-banner${mounted ? " show" : ""}`}>
            {user && !steamLinked && (
              <div className="cs2-banner-box gray">
                <Trophy size={14} style={{ color: "#f0a500", flexShrink: 0 }} />
                <span>Connect your Steam account to register for tournaments.</span>
                <span className="cs2-banner-link" onClick={() => router.push("/connect-steam")}>Connect now →</span>
              </div>
            )}
            {!user && (
              <div className="cs2-banner-box gray">
                <Trophy size={14} style={{ color: "#f0a500", flexShrink: 0 }} />
                <span>Sign in to register for tournaments and compete.</span>
              </div>
            )}
          </div>

          <CS2Tournaments />
        </div>
      </div>
    </>
  );
}
