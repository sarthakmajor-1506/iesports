"use client";
// /app/components/PhoneVerifyModal.tsx
// Optional phone verification modal — opened from Navbar "Verify Phone" button
// Uses Firebase Phone Auth (OTP) then calls /api/auth/verify-phone to save to Firestore

import { useState, useRef } from "react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  getAuth,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

interface PhoneVerifyModalProps {
  onClose: () => void;
  onVerified: () => void;
}

export default function PhoneVerifyModal({ onClose, onVerified }: PhoneVerifyModalProps) {
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<HTMLDivElement>(null);

  const sendOtp = async () => {
    if (!phone.match(/^\+91[6-9]\d{9}$/)) {
      setError("Enter a valid Indian mobile number (+91XXXXXXXXXX)");
      return;
    }
    setError("");
    setLoading(true);

    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(
          auth,
          recaptchaRef.current!,
          { size: "invisible" }
        );
      }
      const result = await signInWithPhoneNumber(auth, phone, window.recaptchaVerifier);
      setConfirmation(result);
      setStep("otp");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      setError("Enter the 6-digit OTP");
      return;
    }
    if (!confirmation || !user) return;

    setError("");
    setLoading(true);

    try {
      await confirmation.confirm(otp);

      // Save phone to Firestore via API
      const idToken = await user.getIdToken();
      const res = await fetch("/api/auth/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, phone }),
      });

      if (!res.ok) throw new Error("Failed to save phone number");

      onVerified();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Invalid OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-white font-bold text-lg">Verify Phone Number</h3>
            <p className="text-gray-400 text-xs mt-0.5">
              Optional — adds extra security to your account
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        {step === "phone" ? (
          <>
            <label className="text-gray-400 text-sm mb-2 block">Mobile Number</label>
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\s/g, ""))}
              className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-500 text-white rounded-xl px-4 py-3 text-sm outline-none transition-colors mb-4"
            />
            {error && <p className="text-red-400 text-xs mb-4">{error}</p>}
            <button
              onClick={sendOtp}
              disabled={loading}
              className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-gray-900 font-bold py-3 rounded-xl transition-colors"
            >
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>
          </>
        ) : (
          <>
            <p className="text-gray-400 text-sm mb-4">
              Enter the 6-digit OTP sent to <span className="text-white">{phone}</span>
            </p>
            <input
              type="number"
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.slice(0, 6))}
              className="w-full bg-gray-800 border border-gray-700 focus:border-yellow-500 text-white rounded-xl px-4 py-3 text-sm outline-none transition-colors mb-4 text-center tracking-widest text-xl font-bold"
            />
            {error && <p className="text-red-400 text-xs mb-4">{error}</p>}
            <button
              onClick={verifyOtp}
              disabled={loading}
              className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-gray-900 font-bold py-3 rounded-xl transition-colors mb-3"
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>
            <button
              onClick={() => { setStep("phone"); setOtp(""); setError(""); }}
              className="w-full text-gray-500 hover:text-gray-300 text-sm py-2 transition-colors"
            >
              Change number
            </button>
          </>
        )}

        {/* Invisible recaptcha container */}
        <div ref={recaptchaRef} />
      </div>
    </div>
  );
}

// Augment Window to allow recaptchaVerifier
declare global {
  interface Window {
    recaptchaVerifier: any;
  }
}