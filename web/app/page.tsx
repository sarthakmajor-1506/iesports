"use client";

import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "./context/AuthContext";
import { useRouter } from "next/navigation";

export default function Home() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.push("/dashboard");
  }, [user, router]);

  const setupRecaptcha = () => {
    if (!(window as any).recaptchaVerifier) {
      (window as any).recaptchaVerifier = new RecaptchaVerifier(
        auth, "recaptcha-container", { size: "invisible" }
      );
      (window as any).recaptchaVerifier.render();
    }
  };

  const sendOtp = async () => {
    try {
      setLoading(true);
      setupRecaptcha();
      const result = await signInWithPhoneNumber(
        auth, phone, (window as any).recaptchaVerifier
      );
      (window as any).confirmationResult = result;
      setConfirmationResult(result);
      alert("OTP Sent!");
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Error sending OTP");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    try {
      setLoading(true);
      const result = await (window as any).confirmationResult.confirm(otp.trim());
      const u = result.user;
      await setDoc(doc(db, "users", u.uid),
        { phone: u.phoneNumber, createdAt: new Date() },
        { merge: true }
      );
      window.location.href = "/dashboard";
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#050505", color: "#fff", fontFamily: "system-ui, sans-serif" }}>

      {/* LEFT SIDE */}
      <div style={{ flex: 2, padding: "60px 50px", display: "flex", flexDirection: "column", gap: 40 }}>

        {/* Header */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, background: "linear-gradient(135deg, #f97316, #ea580c)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: 18 }}>IE</div>
            <h1 style={{ fontSize: 32, fontWeight: 800, background: "linear-gradient(90deg, #f97316, #fb923c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Indian Esports</h1>
          </div>
          <p style={{ marginTop: 8, color: "#666", fontSize: 15, letterSpacing: 1 }}>COMPETITIVE DOTA 2 & VALORANT TOURNAMENTS</p>
        </div>

        {/* Tournament Card */}
        <div style={{ background: "linear-gradient(135deg, #111 0%, #0d0d0d 100%)", border: "1px solid #1f1f1f", borderRadius: 14, padding: 30, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #f97316, #22c55e, #3b82f6)" }}></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ color: "#f97316", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>🏆 Featured Tournament</p>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>Dota 2 Launch Invitational</h2>
            </div>
            <div style={{ background: "#16a34a22", color: "#22c55e", padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600 }}>Registration Open</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginTop: 24 }}>
            {[
              { label: "FORMAT", value: "5v5" },
              { label: "PRIZE POOL", value: "₹25,000" },
              { label: "ENTRY", value: "Free" },
              { label: "REGION", value: "India / SEA" },
            ].map((item) => (
              <div key={item.label} style={{ background: "#0a0a0a", borderRadius: 10, padding: "14px 16px", border: "1px solid #1a1a1a" }}>
                <p style={{ color: "#555", fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>{item.label}</p>
                <p style={{ color: "#fff", fontSize: 17, fontWeight: 700, marginTop: 4 }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Brackets + Why Play */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

          {/* Brackets */}
          <div style={{ background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#e5e5e5", marginBottom: 16 }}>📋 Rank Brackets</h3>
            {[
              { rank: "Herald – Guardian", color: "#6b7280" },
              { rank: "Crusader – Archon", color: "#3b82f6" },
              { rank: "Legend – Ancient", color: "#a855f7" },
              { rank: "Divine – Immortal", color: "#f59e0b" },
            ].map((b) => (
              <div key={b.rank} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #151515" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: b.color }}></div>
                <span style={{ color: "#bbb", fontSize: 14 }}>{b.rank}</span>
              </div>
            ))}
          </div>

          {/* Why Play */}
          <div style={{ background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#e5e5e5", marginBottom: 16 }}>✅ Why Play Here</h3>
            {[
              "Steam-verified accounts",
              "Rank-locked fair brackets",
              "Fast prize payouts via UPI",
              "Monthly tournaments",
            ].map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #151515" }}>
                <div style={{ color: "#22c55e", fontWeight: "bold" }}>✓</div>
                <span style={{ color: "#bbb", fontSize: 14 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT SIDE - Login */}
      <div style={{
        flex: 1, padding: 40,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#0a0a0a", borderLeft: "1px solid #1a1a1a",
        minWidth: 340,
      }}>
        <div style={{ width: "100%", maxWidth: 300 }}>

          <h2 style={{ fontSize: 24, fontWeight: 800, textAlign: "center", marginBottom: 8, color: "#fff" }}>Welcome</h2>
          <p style={{ textAlign: "center", color: "#555", fontSize: 14, marginBottom: 30 }}>Sign in to join tournaments</p>

          <label style={{ color: "#666", fontSize: 12, fontWeight: 600, letterSpacing: 1, display: "block", marginBottom: 6 }}>PHONE NUMBER</label>
          <input
            type="text"
            placeholder="+91XXXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{
              padding: 14, width: "100%", boxSizing: "border-box",
              background: "#111", border: "1px solid #222",
              borderRadius: 8, color: "#fff", fontSize: 15,
              outline: "none",
            }}
          />

          <button
            onClick={sendOtp}
            disabled={loading}
            style={{
              marginTop: 14, padding: 14, width: "100%",
              background: loading ? "#b45309" : "linear-gradient(135deg, #f97316, #ea580c)",
              color: "#fff", fontWeight: 700, fontSize: 15,
              border: "none", borderRadius: 8, cursor: loading ? "default" : "pointer",
              letterSpacing: 0.5,
            }}
          >
            {loading ? "Sending..." : "Send OTP →"}
          </button>

          <div id="recaptcha-container"></div>

          {confirmationResult && (
            <>
              <label style={{ color: "#666", fontSize: 12, fontWeight: 600, letterSpacing: 1, display: "block", marginTop: 24, marginBottom: 6 }}>ENTER OTP</label>
              <input
                type="text"
                placeholder="6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                style={{
                  padding: 14, width: "100%", boxSizing: "border-box",
                  background: "#111", border: "1px solid #222",
                  borderRadius: 8, color: "#fff", fontSize: 15,
                  outline: "none", letterSpacing: 4, textAlign: "center",
                }}
              />
              <button
                onClick={verifyOtp}
                disabled={loading}
                style={{
                  marginTop: 14, padding: 14, width: "100%",
                  background: loading ? "#166534" : "linear-gradient(135deg, #22c55e, #16a34a)",
                  color: "#fff", fontWeight: 700, fontSize: 15,
                  border: "none", borderRadius: 8, cursor: loading ? "default" : "pointer",
                  letterSpacing: 0.5,
                }}
              >
                {loading ? "Verifying..." : "Verify & Login ✓"}
              </button>
            </>
          )}

          <p style={{ textAlign: "center", color: "#333", fontSize: 12, marginTop: 30 }}>
            By signing in, you agree to our Terms of Service
          </p>
        </div>
      </div>

    </div>
  );
}