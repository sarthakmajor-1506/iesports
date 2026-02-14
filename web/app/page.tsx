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
    if (user) {
      router.push("/dashboard");
    }
  }, [user, router]);

  const setupRecaptcha = () => {
    if (!(window as any).recaptchaVerifier) {
      (window as any).recaptchaVerifier = new RecaptchaVerifier(
        auth,
        "recaptcha-container",
        { size: "invisible" }
      );
      (window as any).recaptchaVerifier.render();
    }
  };

  const sendOtp = async () => {
    try {
      setLoading(true);
      setupRecaptcha();
      const appVerifier = (window as any).recaptchaVerifier;
      const result = await signInWithPhoneNumber(auth, phone, appVerifier);
      (window as any).confirmationResult = result;
      setConfirmationResult(result);
      alert("OTP Sent!");
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Error sending OTP");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    try {
      setLoading(true);
      const result = await (window as any).confirmationResult.confirm(otp.trim());
      const u = result.user;
      await setDoc(
        doc(db, "users", u.uid),
        { phone: u.phoneNumber, createdAt: new Date() },
        { merge: true }
      );
      window.location.href = "/dashboard";
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>

      {/* LEFT - Tournament Info */}
      <div style={{ flex: 2, padding: 50 }}>
        <h1 style={{ fontSize: 36, fontWeight: "bold", color: "#f97316" }}>
          Indian Esports
        </h1>
        <p style={{ marginTop: 8, color: "#888", fontSize: 16 }}>
          Dota 2 / Valorant competitive tournaments
        </p>

        <div style={{ marginTop: 50 }}>
          <h2 style={{ fontSize: 22, fontWeight: "bold", color: "#e5e5e5" }}>
            🏆 Upcoming Tournament
          </h2>
          <div style={{
            marginTop: 16, padding: 24,
            background: "#161616", border: "1px solid #2a2a2a", borderRadius: 10,
          }}>
            <p style={{ fontWeight: "bold", fontSize: 20, color: "#fff" }}>
              Dota 2 Launch Invitational
            </p>
            <p style={{ color: "#999", marginTop: 10 }}>Format: 5v5 | All Ranks | 4 Brackets</p>
            <p style={{ color: "#999", marginTop: 4 }}>Prize Pool: ₹25,000</p>
            <p style={{ color: "#999", marginTop: 4 }}>Entry: Free (Limited Slots)</p>
            <p style={{ color: "#999", marginTop: 4 }}>Region: India / SEA</p>
          </div>
        </div>

        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 22, fontWeight: "bold", color: "#e5e5e5" }}>📋 Brackets</h2>
          <div style={{ marginTop: 12, color: "#bbb", lineHeight: 2.2 }}>
            <p>🔹 Herald – Guardian</p>
            <p>🔹 Crusader – Archon</p>
            <p>🔹 Legend – Ancient</p>
            <p>🔹 Divine – Immortal</p>
          </div>
        </div>

        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 22, fontWeight: "bold", color: "#e5e5e5" }}>✅ Why Play Here</h2>
          <div style={{ marginTop: 12, color: "#bbb", lineHeight: 2.2 }}>
            <p>Steam-verified accounts</p>
            <p>Rank-locked fair brackets</p>
            <p>Fast prize payouts via UPI</p>
            <p>Monthly tournaments</p>
          </div>
        </div>
      </div>

      {/* RIGHT - Login */}
      <div style={{
        flex: 1, padding: 40,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#111", borderLeft: "1px solid #222",
      }}>
        <h2 style={{ fontSize: 26, fontWeight: "bold", marginBottom: 30, color: "#f97316" }}>
          Login
        </h2>

        <input
          type="text"
          placeholder="+91XXXXXXXXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{
            padding: 12, width: "100%", maxWidth: 280,
            background: "#1a1a1a", border: "1px solid #333",
            borderRadius: 6, color: "#fff", fontSize: 15,
          }}
        />

        <button
          onClick={sendOtp}
          disabled={loading}
          style={{
            marginTop: 14, padding: "12px 20px",
            width: "100%", maxWidth: 280,
            background: "#f97316", color: "#000", fontWeight: "bold",
            border: "none", borderRadius: 6, cursor: "pointer", fontSize: 15,
          }}
        >
          {loading ? "Sending..." : "Send OTP"}
        </button>

        <div id="recaptcha-container"></div>

        {confirmationResult && (
          <>
            <input
              type="text"
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              style={{
                marginTop: 14, padding: 12, width: "100%", maxWidth: 280,
                background: "#1a1a1a", border: "1px solid #333",
                borderRadius: 6, color: "#fff", fontSize: 15,
              }}
            />
            <button
              onClick={verifyOtp}
              disabled={loading}
              style={{
                marginTop: 14, padding: "12px 20px",
                width: "100%", maxWidth: 280,
                background: "#22c55e", color: "#000", fontWeight: "bold",
                border: "none", borderRadius: 6, cursor: "pointer", fontSize: 15,
              }}
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>
          </>
        )}
      </div>

    </div>
  );
}