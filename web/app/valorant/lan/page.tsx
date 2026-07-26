"use client";

import Navbar from "../../components/Navbar";
import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";
import { Trophy, MapPin, Calendar, Clock, Users, Shield, CreditCard, CheckCircle, AlertTriangle, Loader2, Lock } from "lucide-react";

const TOURNAMENT_ID = "blr-lan-apr25";
const ENTRY_FEE = 600;
const ASCENDANT_MIN_TIER = 21;

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function LANTournament() {
  const { user, riotData, userProfile, registeredValorantTournaments, loading: authLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState("");
  const [slotsBooked, setSlotsBooked] = useState(0);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  const isEligible = (riotData?.riotTier || 0) >= ASCENDANT_MIN_TIER;
  const isLoggedIn = !!user;
  const showTournament = !authLoading && isLoggedIn && isEligible;

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (registeredValorantTournaments.has(TOURNAMENT_ID)) {
      setRegistered(true);
    }
  }, [registeredValorantTournaments]);

  useEffect(() => {
    fetch(`/api/tournaments/detail?id=${TOURNAMENT_ID}&game=valorant`)
      .then(r => r.json())
      .then(d => { if (d.tournament) setSlotsBooked(d.tournament.slotsBooked || 0); })
      .catch(() => {});
  }, [registered]);

  useEffect(() => {
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) {
      setScriptLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    document.body.appendChild(script);
  }, []);

  const slotsLeft = 20 - slotsBooked;

  async function handleRegister() {
    if (!user || !scriptLoaded) return;
    setRegistering(true);
    setError("");

    try {
      const orderRes = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: TOURNAMENT_ID, uid: user.uid }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error || "Failed to create order");

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "IE Sports",
        description: `${orderData.tournamentName} — Entry Fee`,
        order_id: orderData.orderId,
        prefill: {
          name: userProfile?.fullName || "",
          contact: userProfile?.phone || "",
        },
        theme: { color: "#3CCBFF" },
        handler: async function (response: any) {
          try {
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                tournamentId: TOURNAMENT_ID,
                uid: user.uid,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(verifyData.error || "Verification failed");
            setRegistered(true);
          } catch (err: any) {
            setError(err.message || "Payment verification failed");
          }
          setRegistering(false);
        },
        modal: {
          ondismiss: function () {
            setRegistering(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", function (response: any) {
        setError(response.error?.description || "Payment failed");
        setRegistering(false);
      });
      rzp.open();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setRegistering(false);
    }
  }

  const rankName = riotData?.riotRank || "Unknown";

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e13", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} color="#3CCBFF" style={{ animation: "spin 0.6s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!showTournament) {
    return (
      <>
        <style>{`
          .lan-locked-page {
            min-height: 100vh; background: #0a0e13;
            color: #F0EEEA; font-family: var(--font-geist-sans), system-ui, sans-serif;
            display: flex; flex-direction: column;
          }
          .lan-locked-center {
            flex: 1; display: flex; align-items: center; justify-content: center;
            padding: 40px 20px;
          }
          .lan-locked-box {
            text-align: center; max-width: 420px;
          }
          .lan-locked-icon {
            width: 64px; height: 64px; border-radius: 50%;
            background: rgba(60,203,255,0.1); border: 1px solid rgba(60,203,255,0.2);
            display: flex; align-items: center; justify-content: center;
            margin: 0 auto 20px;
          }
          .lan-locked-title {
            font-size: 1.5rem; font-weight: 800; color: #fff; margin: 0 0 10px;
          }
          .lan-locked-msg {
            font-size: 0.95rem; color: rgba(240,238,234,0.5); line-height: 1.5; margin: 0 0 24px;
          }
          .lan-locked-btn {
            display: inline-flex; align-items: center; gap: 8px;
            padding: 12px 28px; border-radius: 10px;
            background: rgba(60,203,255,0.12); border: 1px solid rgba(60,203,255,0.25);
            color: #3CCBFF; font-size: 0.9rem; font-weight: 700;
            cursor: pointer; transition: background 0.15s ease;
          }
          .lan-locked-btn:hover { background: rgba(60,203,255,0.2); }
        `}</style>
        <div className="lan-locked-page">
          <Navbar />
          <div className="lan-locked-center">
            <div className="lan-locked-box">
              <div className="lan-locked-icon">
                <Lock size={28} color="#3CCBFF" />
              </div>
              <h1 className="lan-locked-title">Restricted Tournament</h1>
              <p className="lan-locked-msg">
                {!isLoggedIn
                  ? "Log in and connect your Riot ID to access this tournament. Only Ascendant+ players are eligible."
                  : !riotData?.riotLinked
                  ? "Connect your Riot ID to access this tournament. Only Ascendant+ players are eligible."
                  : `Your current rank is ${rankName}. This tournament is restricted to Ascendant and above.`}
              </p>
              {!isLoggedIn ? (
                <button className="lan-locked-btn" onClick={() => router.push("/login")}>
                  Log In
                </button>
              ) : !riotData?.riotLinked ? (
                <button className="lan-locked-btn" onClick={() => router.push("/connect-riot")}>
                  Connect Riot ID
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        .lan-page {
          min-height: 100vh;
          background: #0a0e13;
          color: #F0EEEA;
          font-family: var(--font-geist-sans), system-ui, sans-serif;
          position: relative;
          overflow-x: hidden;
        }

        .lan-bg {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
        }
        .lan-bg-grid {
          position: absolute; inset: 0;
          background-image: linear-gradient(rgba(60,203,255,0.03) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(60,203,255,0.03) 1px, transparent 1px);
          background-size: 64px 64px;
        }
        .lan-bg-glow {
          position: absolute; width: 800px; height: 800px; top: -200px; left: 50%;
          transform: translateX(-50%);
          background: radial-gradient(circle, rgba(60,203,255,0.1) 0%, rgba(60,203,255,0.02) 50%, transparent 70%);
          animation: lan-pulse 12s ease-in-out infinite;
        }
        @keyframes lan-pulse {
          0%, 100% { opacity: 0.6; transform: translateX(-50%) scale(1); }
          50% { opacity: 1; transform: translateX(-50%) scale(1.15); }
        }

        .lan-content { position: relative; z-index: 1; }

        .lan-hero {
          text-align: center;
          padding: 100px 20px 40px;
          max-width: 800px;
          margin: 0 auto;
          opacity: 0; transform: translateY(20px);
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .lan-hero.show { opacity: 1; transform: translateY(0); }

        .lan-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(60,203,255,0.12);
          border: 1px solid rgba(60,203,255,0.25);
          color: #3CCBFF;
          font-size: 0.75rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em;
          padding: 6px 14px; border-radius: 20px;
          margin-bottom: 20px;
        }

        .lan-title {
          font-size: 2.8rem; font-weight: 900; color: #fff;
          letter-spacing: -0.03em; line-height: 1.1;
          margin: 0 0 12px;
        }
        .lan-title span { color: #3CCBFF; }

        .lan-subtitle {
          font-size: 1.1rem; color: rgba(240,238,234,0.6);
          margin: 0 0 36px; line-height: 1.5;
        }

        .lan-details {
          max-width: 800px; margin: 0 auto;
          padding: 0 20px 40px;
          display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          opacity: 0; transform: translateY(20px);
          transition: opacity 0.7s ease 0.15s, transform 0.7s ease 0.15s;
        }
        .lan-details.show { opacity: 1; transform: translateY(0); }

        .lan-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; padding: 20px;
          display: flex; align-items: flex-start; gap: 14px;
        }
        .lan-card-icon {
          width: 40px; height: 40px; border-radius: 10px;
          background: rgba(60,203,255,0.1);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .lan-card-label {
          font-size: 0.75rem; color: rgba(240,238,234,0.45);
          text-transform: uppercase; letter-spacing: 0.06em;
          margin: 0 0 4px;
        }
        .lan-card-value {
          font-size: 1.05rem; font-weight: 700; color: #fff; margin: 0;
        }
        .lan-card-sub {
          font-size: 0.8rem; color: rgba(240,238,234,0.5); margin: 4px 0 0;
        }

        .lan-prize-section {
          max-width: 800px; margin: 0 auto;
          padding: 0 20px 40px;
          opacity: 0; transform: translateY(20px);
          transition: opacity 0.7s ease 0.3s, transform 0.7s ease 0.3s;
        }
        .lan-prize-section.show { opacity: 1; transform: translateY(0); }

        .lan-prize-box {
          background: linear-gradient(135deg, rgba(60,203,255,0.08) 0%, rgba(60,203,255,0.02) 100%);
          border: 1px solid rgba(60,203,255,0.15);
          border-radius: 16px; padding: 28px;
          text-align: center;
        }
        .lan-prize-label {
          font-size: 0.8rem; color: #3CCBFF; text-transform: uppercase;
          letter-spacing: 0.1em; font-weight: 700; margin: 0 0 8px;
        }
        .lan-prize-amount {
          font-size: 2.6rem; font-weight: 900; color: #fff; margin: 0 0 20px;
        }
        .lan-prize-split {
          display: flex; justify-content: center; gap: 40px;
        }
        .lan-prize-place { text-align: center; }
        .lan-prize-place-label {
          font-size: 0.75rem; color: rgba(240,238,234,0.5);
          text-transform: uppercase; margin: 0 0 4px;
        }
        .lan-prize-place-val {
          font-size: 1.3rem; font-weight: 800; color: #fff; margin: 0;
        }

        .lan-schedule {
          max-width: 800px; margin: 0 auto;
          padding: 0 20px 40px;
          opacity: 0; transform: translateY(20px);
          transition: opacity 0.7s ease 0.4s, transform 0.7s ease 0.4s;
        }
        .lan-schedule.show { opacity: 1; transform: translateY(0); }

        .lan-schedule-title {
          font-size: 1.3rem; font-weight: 800; color: #fff; margin: 0 0 16px;
        }
        .lan-timeline {
          position: relative;
          padding-left: 28px;
        }
        .lan-timeline::before {
          content: ''; position: absolute; left: 8px; top: 6px; bottom: 6px;
          width: 2px; background: rgba(60,203,255,0.2);
        }
        .lan-timeline-item {
          position: relative; padding: 0 0 20px;
        }
        .lan-timeline-item:last-child { padding-bottom: 0; }
        .lan-timeline-dot {
          position: absolute; left: -22px; top: 6px;
          width: 10px; height: 10px; border-radius: 50%;
          background: #3CCBFF;
          box-shadow: 0 0 8px rgba(60,203,255,0.5);
        }
        .lan-timeline-time {
          font-size: 0.8rem; color: #3CCBFF; font-weight: 700; margin: 0 0 2px;
        }
        .lan-timeline-event {
          font-size: 0.95rem; color: rgba(240,238,234,0.85); margin: 0;
        }

        .lan-register {
          max-width: 800px; margin: 0 auto;
          padding: 0 20px 60px;
          opacity: 0; transform: translateY(20px);
          transition: opacity 0.7s ease 0.5s, transform 0.7s ease 0.5s;
        }
        .lan-register.show { opacity: 1; transform: translateY(0); }

        .lan-reg-box {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px; padding: 32px;
          text-align: center;
        }

        .lan-reg-title {
          font-size: 1.3rem; font-weight: 800; color: #fff; margin: 0 0 8px;
        }
        .lan-reg-sub {
          font-size: 0.9rem; color: rgba(240,238,234,0.5); margin: 0 0 24px;
        }

        .lan-reg-info {
          display: flex; flex-direction: column; gap: 10px;
          margin: 0 0 24px; text-align: left;
          background: rgba(255,255,255,0.03);
          border-radius: 12px; padding: 16px;
        }
        .lan-reg-info-row {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 0.9rem;
        }
        .lan-reg-info-label { color: rgba(240,238,234,0.5); }
        .lan-reg-info-value { color: #fff; font-weight: 600; }
        .lan-reg-info-value.rank {
          color: #3CCBFF;
        }

        .lan-reg-btn {
          width: 100%; padding: 16px 32px;
          background: linear-gradient(135deg, #3CCBFF 0%, #2ba8d4 100%);
          color: #0a0e13; font-size: 1.05rem; font-weight: 800;
          border: none; border-radius: 12px; cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        }
        .lan-reg-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(60,203,255,0.3);
        }
        .lan-reg-btn:disabled {
          opacity: 0.5; cursor: not-allowed;
        }

        .lan-reg-success {
          background: rgba(34,197,94,0.1);
          border: 1px solid rgba(34,197,94,0.3);
          border-radius: 12px; padding: 20px;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          color: #22c55e; font-weight: 700; font-size: 1rem;
        }

        .lan-rank-gate {
          background: rgba(245,158,11,0.1);
          border: 1px solid rgba(245,158,11,0.3);
          border-radius: 12px; padding: 20px;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          color: #f59e0b; font-weight: 600; font-size: 0.9rem;
          text-align: left;
        }

        .lan-login-prompt {
          background: rgba(60,203,255,0.08);
          border: 1px solid rgba(60,203,255,0.2);
          border-radius: 12px; padding: 20px;
          color: rgba(240,238,234,0.7); font-size: 0.9rem;
        }

        .lan-error {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 10px; padding: 12px 16px;
          color: #ef4444; font-size: 0.85rem; margin: 16px 0 0;
          text-align: left;
        }

        .lan-slots {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(60,203,255,0.08);
          border: 1px solid rgba(60,203,255,0.15);
          border-radius: 8px; padding: 8px 14px;
          margin: 0 0 20px;
          font-size: 0.85rem; color: rgba(240,238,234,0.7);
        }
        .lan-slots strong { color: #3CCBFF; font-weight: 800; }

        .lan-rules {
          max-width: 800px; margin: 0 auto;
          padding: 0 20px 60px;
          opacity: 0; transform: translateY(20px);
          transition: opacity 0.7s ease 0.45s, transform 0.7s ease 0.45s;
        }
        .lan-rules.show { opacity: 1; transform: translateY(0); }

        .lan-rules-title {
          font-size: 1.3rem; font-weight: 800; color: #fff; margin: 0 0 16px;
        }
        .lan-rules-list {
          list-style: none; padding: 0; margin: 0;
          display: flex; flex-direction: column; gap: 10px;
        }
        .lan-rules-list li {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 10px; padding: 12px 16px;
          font-size: 0.9rem; color: rgba(240,238,234,0.75);
          display: flex; align-items: flex-start; gap: 10px;
        }
        .lan-rules-list li::before {
          content: '→'; color: #3CCBFF; font-weight: 700; flex-shrink: 0;
        }

        .lan-footer {
          text-align: center; padding: 0 20px 40px;
          font-size: 0.75rem; color: rgba(240,238,234,0.3);
          max-width: 800px; margin: 0 auto;
        }

        @media (max-width: 600px) {
          .lan-title { font-size: 2rem; }
          .lan-prize-amount { font-size: 2rem; }
          .lan-details { grid-template-columns: 1fr; }
          .lan-prize-split { gap: 24px; }
          .lan-hero { padding: 90px 16px 30px; }
        }

        .lan-spinner {
          display: inline-block; width: 18px; height: 18px;
          border: 2px solid rgba(10,14,19,0.3);
          border-top-color: #0a0e13;
          border-radius: 50%;
          animation: lan-spin 0.6s linear infinite;
        }
        @keyframes lan-spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="lan-page">
        <div className="lan-bg">
          <div className="lan-bg-grid" />
          <div className="lan-bg-glow" />
        </div>

        <div className="lan-content">
          <Navbar />

          <div className={`lan-hero ${mounted ? "show" : ""}`}>
            <div className="lan-badge">
              <MapPin size={14} />
              LAN Tournament — Bangalore
            </div>
            <h1 className="lan-title">
              Valorant <span>Ascendant+</span> LAN
            </h1>
            <p className="lan-subtitle">
              20 players. 4 teams. 6 hours of competitive Valorant on LAN.
              Jayanagar, Bangalore. Prove your rank on the big stage.
            </p>
          </div>

          <div className={`lan-details ${mounted ? "show" : ""}`}>
            <div className="lan-card">
              <div className="lan-card-icon">
                <Calendar size={20} color="#3CCBFF" />
              </div>
              <div>
                <p className="lan-card-label">Date</p>
                <p className="lan-card-value">Saturday, April 25</p>
                <p className="lan-card-sub">Registration closes Thu, Apr 23 at 11:59 PM</p>
              </div>
            </div>

            <div className="lan-card">
              <div className="lan-card-icon">
                <Clock size={20} color="#3CCBFF" />
              </div>
              <div>
                <p className="lan-card-label">Time</p>
                <p className="lan-card-value">10:00 AM — 4:00 PM</p>
                <p className="lan-card-sub">6 hours including breaks</p>
              </div>
            </div>

            <div className="lan-card">
              <div className="lan-card-icon">
                <MapPin size={20} color="#3CCBFF" />
              </div>
              <div>
                <p className="lan-card-label">Venue</p>
                <p className="lan-card-value">Jayanagar, Bangalore</p>
                <p className="lan-card-sub">Exact venue announced post-registration</p>
              </div>
            </div>

            <div className="lan-card">
              <div className="lan-card-icon">
                <Shield size={20} color="#3CCBFF" />
              </div>
              <div>
                <p className="lan-card-label">Rank Requirement</p>
                <p className="lan-card-value">Ascendant+</p>
                <p className="lan-card-sub">Verified via Riot ID on registration</p>
              </div>
            </div>

            <div className="lan-card">
              <div className="lan-card-icon">
                <Users size={20} color="#3CCBFF" />
              </div>
              <div>
                <p className="lan-card-label">Players</p>
                <p className="lan-card-value">20 Slots</p>
                <p className="lan-card-sub">4 teams of 5 — shuffled for balance</p>
              </div>
            </div>

            <div className="lan-card">
              <div className="lan-card-icon">
                <CreditCard size={20} color="#3CCBFF" />
              </div>
              <div>
                <p className="lan-card-label">Entry Fee</p>
                <p className="lan-card-value">₹600</p>
                <p className="lan-card-sub">Paid online — no refunds within 48hrs</p>
              </div>
            </div>
          </div>

          <div className={`lan-prize-section ${mounted ? "show" : ""}`}>
            <div className="lan-prize-box">
              <p className="lan-prize-label">Total Prize Pool</p>
              <p className="lan-prize-amount">₹12,000</p>
              <div className="lan-prize-split">
                <div className="lan-prize-place">
                  <p className="lan-prize-place-label">1st Place</p>
                  <p className="lan-prize-place-val">₹8,000</p>
                </div>
                <div className="lan-prize-place">
                  <p className="lan-prize-place-label">2nd Place</p>
                  <p className="lan-prize-place-val">₹4,000</p>
                </div>
              </div>
            </div>
          </div>

          <div className={`lan-schedule ${mounted ? "show" : ""}`}>
            <h2 className="lan-schedule-title">Schedule</h2>
            <div className="lan-timeline">
              <div className="lan-timeline-item">
                <div className="lan-timeline-dot" />
                <p className="lan-timeline-time">10:00 AM</p>
                <p className="lan-timeline-event">Check-in, PC setup & warm-up</p>
              </div>
              <div className="lan-timeline-item">
                <div className="lan-timeline-dot" />
                <p className="lan-timeline-time">10:30 AM</p>
                <p className="lan-timeline-event">Rules briefing & team reveal</p>
              </div>
              <div className="lan-timeline-item">
                <div className="lan-timeline-dot" />
                <p className="lan-timeline-time">10:45 AM</p>
                <p className="lan-timeline-event">Semi-Final 1 (BO3)</p>
              </div>
              <div className="lan-timeline-item">
                <div className="lan-timeline-dot" />
                <p className="lan-timeline-time">12:30 PM</p>
                <p className="lan-timeline-event">Semi-Final 2 (BO3)</p>
              </div>
              <div className="lan-timeline-item">
                <div className="lan-timeline-dot" />
                <p className="lan-timeline-time">2:00 PM</p>
                <p className="lan-timeline-event">Lunch Break</p>
              </div>
              <div className="lan-timeline-item">
                <div className="lan-timeline-dot" />
                <p className="lan-timeline-time">2:30 PM</p>
                <p className="lan-timeline-event">Grand Final (BO3)</p>
              </div>
              <div className="lan-timeline-item">
                <div className="lan-timeline-dot" />
                <p className="lan-timeline-time">4:00 PM</p>
                <p className="lan-timeline-event">Prize distribution & wrap-up</p>
              </div>
            </div>
          </div>

          <div className={`lan-rules ${mounted ? "show" : ""}`}>
            <h2 className="lan-rules-title">Rules</h2>
            <ul className="lan-rules-list">
              <li>Rank verified at registration via Riot ID. Ascendant 1 or above required.</li>
              <li>Teams shuffled by IE Sports for balanced matchups (snake draft by rank).</li>
              <li>Map pool follows current VCT rotation. Captains veto before each match.</li>
              <li>All matches played on LAN. No online substitutions.</li>
              <li>Account sharing or boosted accounts result in immediate DQ — no refund.</li>
              <li>No refunds within 48 hours of the event. Full refund if cancelled before that.</li>
              <li>Admin decisions are final in all disputes.</li>
            </ul>
          </div>

          <div className={`lan-register ${mounted ? "show" : ""}`}>
            <div className="lan-reg-box">
              <h2 className="lan-reg-title">Register</h2>
              <p className="lan-reg-sub">Secure your slot with a ₹600 entry fee</p>

              <div className="lan-slots">
                <Users size={14} />
                <strong>{slotsLeft}</strong> of 20 slots remaining
              </div>

              {registered ? (
                <div className="lan-reg-success">
                  <CheckCircle size={20} />
                  You are registered! See you on April 25.
                </div>
              ) : slotsLeft <= 0 ? (
                <div className="lan-rank-gate">
                  <AlertTriangle size={20} style={{ flexShrink: 0 }} />
                  <span>All 20 slots are filled. Registration is closed.</span>
                </div>
              ) : (
                <>
                  <div className="lan-reg-info">
                    <div className="lan-reg-info-row">
                      <span className="lan-reg-info-label">Riot ID</span>
                      <span className="lan-reg-info-value">{riotData?.riotGameName}#{riotData?.riotTagLine}</span>
                    </div>
                    <div className="lan-reg-info-row">
                      <span className="lan-reg-info-label">Rank</span>
                      <span className="lan-reg-info-value rank">{rankName}</span>
                    </div>
                    <div className="lan-reg-info-row">
                      <span className="lan-reg-info-label">Discord</span>
                      <span className="lan-reg-info-value">{userProfile?.discordUsername || userProfile?.discordId || "Not connected"}</span>
                    </div>
                    <div className="lan-reg-info-row">
                      <span className="lan-reg-info-label">Entry Fee</span>
                      <span className="lan-reg-info-value">₹{ENTRY_FEE}</span>
                    </div>
                  </div>

                  <button
                    className="lan-reg-btn"
                    onClick={handleRegister}
                    disabled={registering || !scriptLoaded}
                  >
                    {registering ? (
                      <>
                        <span className="lan-spinner" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard size={18} />
                        Pay ₹{ENTRY_FEE} & Register
                      </>
                    )}
                  </button>
                </>
              )}

              {error && <div className="lan-error">{error}</div>}
            </div>
          </div>

          <div className="lan-footer">
            <p>IE Sports — iesports.in</p>
            <p style={{ marginTop: "8px" }}>
              Valorant and Riot Games are trademarks of Riot Games, Inc. IE Sports is not endorsed by or affiliated with Riot Games.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
