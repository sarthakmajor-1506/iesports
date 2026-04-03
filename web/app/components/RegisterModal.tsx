"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  linkWithCredential,
  ConfirmationResult,
} from "firebase/auth";
import { navigateWithAppPriority } from "@/app/lib/mobileAuth";

const COUNTRIES = [
  { flag: "\u{1F1EE}\u{1F1F3}", code: "+91" },
  { flag: "\u{1F1FA}\u{1F1F8}", code: "+1" },
  { flag: "\u{1F1EC}\u{1F1E7}", code: "+44" },
  { flag: "\u{1F1E6}\u{1F1EA}", code: "+971" },
  { flag: "\u{1F1F8}\u{1F1EC}", code: "+65" },
  { flag: "\u{1F1E6}\u{1F1FA}", code: "+61" },
];

type Props = {
  tournament: any;
  user: any;
  dotaProfile: any;
  game?: "dota2" | "valorant";
  onClose: () => void;
  onSuccess: () => void;
};

type Step = "choose" | "create" | "join" | "solo" | "success" | "connect";

export default function RegisterModal({ tournament, user, dotaProfile, game = "dota2", onClose, onSuccess }: Props) {
  const { riotData, userProfile } = useAuth();
  const [step, setStep] = useState<Step>("connect"); // always start at connect check
  const [joinCode, setJoinCode] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [fullName, setFullName] = useState(userProfile?.fullName || "");
  const [fullNameSaving, setFullNameSaving] = useState(false);
  const [fullNameSaved, setFullNameSaved] = useState(!!userProfile?.fullName);
  const router = useRouter();

  // ── Phone OTP state ──────────────────────────────────────────────────────
  const [showPhoneOtp, setShowPhoneOtp] = useState(false);
  const [phoneStep, setPhoneStep] = useState<"phone" | "otp">("phone");
  const [phoneNum, setPhoneNum] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [phoneError, setPhoneError] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [verificationId, setVerificationId] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const [phoneDone, setPhoneDone] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearRecaptcha = () => {
    try { recaptchaRef.current?.clear(); } catch {}
    recaptchaRef.current = null;
    const el = document.getElementById("reg-recaptcha");
    if (el) el.innerHTML = "";
  };

  useEffect(() => {
    return () => { clearRecaptcha(); if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startTimer = () => {
    setResendTimer(30);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer(p => { if (p <= 1) { clearInterval(timerRef.current!); return 0; } return p - 1; });
    }, 1000);
  };

  const sendOtp = async () => {
    const digits = phoneNum.replace(/\D/g, "");
    if (digits.length < 8) { setPhoneError("Please enter a valid phone number."); return; }
    try {
      setPhoneLoading(true); setPhoneError("");
      clearRecaptcha();
      recaptchaRef.current = new RecaptchaVerifier(auth, "reg-recaptcha", {
        size: "invisible", callback: () => {}, "expired-callback": () => { clearRecaptcha(); },
      });
      const result: ConfirmationResult = await signInWithPhoneNumber(auth, `${countryCode}${digits}`, recaptchaRef.current);
      setVerificationId(result.verificationId);
      setPhoneStep("otp"); startTimer();
      setTimeout(() => otpRefs.current[0]?.focus(), 150);
    } catch (e: any) {
      clearRecaptcha();
      setPhoneError(e.message || "Error sending OTP. Please try again.");
    } finally { setPhoneLoading(false); }
  };

  const verifyOtpStr = async (code: string) => {
    if (code.length < 6) { setPhoneError("Please enter the 6-digit OTP."); return; }
    if (!verificationId) { setPhoneError("Session expired. Go back and try again."); return; }
    if (!user) { setPhoneError("Not logged in. Please refresh."); return; }
    try {
      setPhoneLoading(true); setPhoneError("");
      const credential = PhoneAuthProvider.credential(verificationId, code);
      await linkWithCredential(user, credential);
      await updateDoc(doc(db, "users", user.uid), { phone: `${countryCode}${phoneNum.replace(/\D/g, "")}` });
      setPhoneDone(true);
      setShowPhoneOtp(false);
      clearRecaptcha();
    } catch (e: any) {
      if (e.code === "auth/invalid-verification-code") setPhoneError("Invalid OTP. Please try again.");
      else if (e.code === "auth/code-expired") setPhoneError("OTP expired. Go back and request a new one.");
      else if (e.code === "auth/provider-already-linked") setPhoneError("A phone is already linked to this account.");
      else if (e.code === "auth/credential-already-in-use") setPhoneError("This number belongs to another account.");
      else setPhoneError(e.message || "Verification failed. Please try again.");
    } finally { setPhoneLoading(false); }
  };

  const handleOtpChange = (i: number, val: string) => {
    const d = val.replace(/\D/g, "").slice(-1);
    const n = [...otp]; n[i] = d; setOtp(n);
    if (d && i < 5) otpRefs.current[i + 1]?.focus();
    if (n.every(x => x) && d) setTimeout(() => verifyOtpStr(n.join("")), 100);
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (p.length === 6) {
      setOtp(p.split("")); e.preventDefault();
      setTimeout(() => { otpRefs.current[5]?.focus(); verifyOtpStr(p); }, 50);
    }
  };

  const isValorant = game === "valorant";
  const isShuffle = isValorant && tournament?.format === "shuffle";
  const accentColor = isValorant ? "#3CCBFF" : "#f97316";

  const isProfilePrivate = !isValorant && (!dotaProfile?.dotaRankTier || dotaProfile?.dotaRankTier === 0);

  // ── Account connection status ────────────────────────────────────────────
  const hasSteam = !!dotaProfile?.steamId || !!user?.steamId || !!userProfile?.steamId;
  const riotStatus = riotData?.riotVerified || "unlinked";
  const hasRiot = riotStatus === "verified";
  const riotPending = riotStatus === "pending";
  const hasDiscord = !!userProfile?.discordId || !!user?.discordId || !!dotaProfile?.discordId;
  const hasPhone = !!userProfile?.phone || !!user?.phoneNumber || phoneDone;
  const hasFullName = fullNameSaved && fullName.trim().length >= 2;

  // Keep fullName in sync if userProfile loads after mount
  useEffect(() => {
    if (userProfile?.fullName && !fullNameSaved) {
      setFullName(userProfile.fullName);
      setFullNameSaved(true);
    }
  }, [userProfile?.fullName, fullNameSaved]);

  // Save full name to Firestore
  const saveFullName = async () => {
    const trimmed = fullName.trim();
    if (trimmed.length < 2) return;
    setFullNameSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { fullName: trimmed });
      setFullNameSaved(true);
    } catch {
      setError("Failed to save name. Please try again.");
    } finally {
      setFullNameSaving(false);
    }
  };

  // Check all requirements
  const gameAccountOk = isValorant ? (hasRiot || riotPending) : hasSteam;
  const allRequirementsMet = hasFullName && hasPhone && hasDiscord && gameAccountOk;

  // Auto-advance past connect step if ALL requirements are met
  const actualStep = step === "connect" && allRequirementsMet
    ? (isShuffle ? "solo" : "choose")
    : step;

  // ── Requirement items for UI ───────────────────────────────────────────
  type ReqItem = { id: string; label: string; met: boolean; pending?: boolean; actionLabel?: string; action?: () => void };
  const requirements: ReqItem[] = [];

  // Full Name — always first
  requirements.push({
    id: "fullName",
    label: "Full Name",
    met: hasFullName,
  });

  // Phone
  requirements.push({
    id: "phone",
    label: "Phone Number",
    met: hasPhone,
    actionLabel: "Connect Phone Number",
    action: () => { setShowPhoneOtp(true); setPhoneStep("phone"); setPhoneError(""); setPhoneNum(""); setOtp(["","","","","",""]); setTimeout(() => phoneRef.current?.focus(), 200); },
  });

  // Game-specific account
  if (isValorant) {
    requirements.push({
      id: "riot",
      label: "Riot ID",
      met: hasRiot,
      pending: riotPending,
      actionLabel: "Connect Riot ID",
      action: () => router.push("/connect-riot"),
    });
  } else {
    requirements.push({
      id: "steam",
      label: "Steam",
      met: hasSteam,
      actionLabel: "Connect Steam",
      action: () => { sessionStorage.setItem("redirectAfterLogin", window.location.pathname); navigateWithAppPriority(`/api/auth/steam?uid=${user?.uid}`); },
    });
  }

  // Discord — mandatory for both
  requirements.push({
    id: "discord",
    label: "Discord",
    met: hasDiscord,
    actionLabel: "Connect Discord",
    action: () => { sessionStorage.setItem("redirectAfterLogin", window.location.pathname); navigateWithAppPriority(`/api/auth/discord?uid=${user?.uid}&returnTo=${encodeURIComponent(window.location.pathname)}`); },
  });

  const unmetRequirements = requirements.filter(r => !r.met && !r.pending);

  const handleCreateTeam = async () => {
    setLoading(true); setError("");
    try {
      const endpoint = isValorant ? "/api/valorant/teams/create" : "/api/teams/create";
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tournamentId: tournament.id, uid: user.uid }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTeamCode(data.teamCode); onSuccess(); setStep("success");
    } catch (e: any) { setError(e.message || "Failed to create team"); } finally { setLoading(false); }
  };

  const handleJoinTeam = async () => {
    if (joinCode.length !== 6) { setError("Enter a valid 6-digit code"); return; }
    setLoading(true); setError("");
    try {
      const endpoint = isValorant ? "/api/valorant/teams/join" : "/api/teams/join";
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: joinCode.toUpperCase(), uid: user.uid }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSuccess(); setStep("success");
    } catch (e: any) { setError(e.message || "Failed to join team"); } finally { setLoading(false); }
  };

  const handleSolo = async () => {
    setLoading(true); setError(""); setWarning("");
    try {
      const endpoint = isValorant ? "/api/valorant/solo" : "/api/teams/solo";
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tournamentId: tournament.id, uid: user.uid }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.warning) setWarning(data.warning);
      onSuccess(); setStep("success");
    } catch (e: any) { setError(e.message || "Failed to register"); } finally { setLoading(false); }
  };

  const handleWhatsApp = () => {
    const gameName = isValorant ? "Valorant" : "Dota 2";
    const msg = encodeURIComponent(`Join my ${gameName} team on Indian Esports!\nTournament: ${tournament.name}\n${teamCode ? `Team Code: ${teamCode}\n` : ""}Join here: ${window.location.origin}`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 16,
        padding: 32, width: "100%", maxWidth: 460, position: "relative",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 16, right: 16,
          background: "transparent", border: "none", color: "#444",
          fontSize: 20, cursor: "pointer", lineHeight: 1,
        }}>✕</button>

        <p style={{ color: accentColor, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>🏆 REGISTER</p>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 4, marginBottom: 16, color: "#fff" }}>{tournament.name}</h2>

        {/* ═══════ CONNECT STEP — shows when any requirements are missing ═══════ */}
        {actualStep === "connect" && (
          <div>
            {!showPhoneOtp && <div style={{
              background: "linear-gradient(135deg, #1a0808, #0e0e0e)", border: "1px solid #7f1d1d", borderRadius: 12,
              padding: "16px 18px", marginBottom: 20, position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: -20, right: -10, fontSize: 60, opacity: 0.06 }}>📋</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>📝</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#fca5a5" }}>Complete All Requirements</span>
              </div>
              <p style={{ fontSize: 12, color: "#b45050", lineHeight: 1.6 }}>
                All fields below are mandatory to register for this tournament.
              </p>
            </div>}

            <style>{`@keyframes reg-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>

            <div id="reg-recaptcha" />

            {/* ── Inline Phone OTP Flow ── */}
            {showPhoneOtp && (
              <div style={{ marginBottom: 16 }}>
                {phoneStep === "phone" && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <p style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>Connect Phone Number</p>
                      <button onClick={() => setShowPhoneOtp(false)} style={{ background: "none", border: "none", color: "#555", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                    </div>
                    <p style={{ fontSize: 12, color: "#888", marginBottom: 14, lineHeight: 1.5 }}>We'll send a 6-digit OTP to verify your number.</p>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <select value={countryCode} onChange={e => setCountryCode(e.target.value)} style={{
                        flex: "0 0 88px", padding: "10px 6px", border: "1.5px solid #333", borderRadius: 8,
                        fontSize: 13, background: "#111", color: "#fff", fontFamily: "inherit",
                      }}>
                        {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                      </select>
                      <input ref={phoneRef} type="tel" inputMode="numeric" placeholder="9876543210"
                        value={phoneNum} onChange={e => setPhoneNum(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        onKeyDown={e => { if (e.key === "Enter") sendOtp(); }} maxLength={10}
                        style={{
                          flex: 1, padding: "10px 14px", border: "1.5px solid #333", borderRadius: 8,
                          fontSize: 14, background: "#111", color: "#fff", outline: "none",
                        }}
                      />
                    </div>
                    {phoneError && <p style={{ fontSize: 12, color: "#f87171", marginBottom: 8 }}>{phoneError}</p>}
                    <button onClick={sendOtp} disabled={phoneLoading} style={{
                      width: "100%", padding: 12, background: phoneLoading ? "#333" : "#3B82F6",
                      border: "none", borderRadius: 100, color: "#fff", fontWeight: 700, fontSize: 14,
                      cursor: phoneLoading ? "default" : "pointer", fontFamily: "inherit",
                    }}>
                      {phoneLoading ? "Sending OTP..." : "Send OTP →"}
                    </button>
                  </>
                )}
                {phoneStep === "otp" && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <button onClick={() => { setPhoneStep("phone"); setPhoneError(""); setOtp(["","","","","",""]); clearRecaptcha(); setVerificationId(""); }} style={{ background: "none", border: "none", color: "#3B82F6", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>← Back</button>
                      <button onClick={() => setShowPhoneOtp(false)} style={{ background: "none", border: "none", color: "#555", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Enter OTP</p>
                    <p style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>6-digit code sent to {countryCode} {phoneNum}</p>
                    <div style={{ display: "flex", gap: 6, justifyContent: "space-between", marginBottom: 8 }} onPaste={handleOtpPaste}>
                      {otp.map((digit, i) => (
                        <input key={i} ref={el => { otpRefs.current[i] = el; }}
                          type="tel" inputMode="numeric" maxLength={1} value={digit}
                          onChange={e => handleOtpChange(i, e.target.value)}
                          onKeyDown={e => handleOtpKeyDown(i, e)}
                          style={{
                            width: 44, height: 50, textAlign: "center" as const, border: "1.5px solid #333",
                            borderRadius: 8, fontSize: 20, fontWeight: 700, fontFamily: "inherit",
                            background: "#111", color: "#fff", outline: "none",
                          }}
                          onFocus={e => { e.currentTarget.style.borderColor = "#3B82F6"; }}
                          onBlur={e => { e.currentTarget.style.borderColor = "#333"; }}
                        />
                      ))}
                    </div>
                    {phoneError && <p style={{ fontSize: 12, color: "#f87171", marginBottom: 8 }}>{phoneError}</p>}
                    <button onClick={() => verifyOtpStr(otp.join(""))} disabled={phoneLoading} style={{
                      width: "100%", padding: 12, background: phoneLoading ? "#333" : "#3B82F6",
                      border: "none", borderRadius: 100, color: "#fff", fontWeight: 700, fontSize: 14,
                      cursor: phoneLoading ? "default" : "pointer", fontFamily: "inherit", marginTop: 4,
                    }}>
                      {phoneLoading ? "Verifying..." : "Verify & Link"}
                    </button>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                      <button disabled={resendTimer > 0} onClick={() => { setOtp(["","","","","",""]); setPhoneError(""); clearRecaptcha(); setVerificationId(""); sendOtp(); }} style={{
                        background: "none", border: "none", color: resendTimer > 0 ? "#555" : "#3B82F6",
                        fontSize: 12, fontWeight: 600, cursor: resendTimer > 0 ? "default" : "pointer", fontFamily: "inherit",
                      }}>Resend OTP</button>
                      {resendTimer > 0 && <span style={{ fontSize: 12, color: "#555" }}>Resend in {resendTimer}s</span>}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Full Name Input */}
            {!showPhoneOtp && <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: hasFullName ? "#166534" : "#888", marginBottom: 6, textTransform: "uppercase" as const }}>
                {hasFullName ? "✅ " : "👤 "}Full Name {!hasFullName && <span style={{ color: "#dc2626", fontSize: 9 }}>REQUIRED</span>}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); setFullNameSaved(false); }}
                  disabled={fullNameSaving}
                  style={{
                    flex: 1, padding: "10px 14px", background: hasFullName ? "#0a1a0a" : "#111",
                    border: `1px solid ${hasFullName ? "#166534" : "#333"}`, borderRadius: 8,
                    color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" as const,
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") saveFullName(); }}
                />
                {!fullNameSaved && fullName.trim().length >= 2 && (
                  <button onClick={saveFullName} disabled={fullNameSaving} style={{
                    padding: "10px 16px", background: fullNameSaving ? "#333" : `linear-gradient(135deg, ${accentColor}, ${isValorant ? "#2A9FCC" : "#ea580c"})`,
                    border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 12,
                    cursor: fullNameSaving ? "default" : "pointer", whiteSpace: "nowrap" as const,
                  }}>
                    {fullNameSaving ? "..." : "Save"}
                  </button>
                )}
              </div>
              {fullName.trim().length > 0 && fullName.trim().length < 2 && (
                <p style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>Name must be at least 2 characters</p>
              )}
            </div>}

            {/* Connection Requirements */}
            {!showPhoneOtp && <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {requirements.filter(r => r.id !== "fullName").map(req => {
                const emoji = req.id === "discord" ? "💬" : req.id === "phone" ? "📱" : req.id === "steam" ? "🎮" : req.id === "riot" ? "🎯" : "🔗";
                if (req.met) {
                  return (
                    <div key={req.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "14px 16px", background: "linear-gradient(135deg, #0a1a0a, #0e1a0e)", borderRadius: 12,
                      border: "1px solid #166534",
                    }}>
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{emoji}</span>
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13, color: "#4ade80" }}>{req.label}</span>
                      <span style={{ fontSize: 10, color: "#4ade80", fontWeight: 800, background: "#0a2a0a", padding: "4px 10px", borderRadius: 100, border: "1px solid #166534" }}>✅ Connected</span>
                    </div>
                  );
                }
                if (req.pending) {
                  return (
                    <div key={req.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "14px 16px", background: "linear-gradient(135deg, #1a1200, #161000)", borderRadius: 12,
                      border: "1px solid #854d0e",
                    }}>
                      <span style={{ fontSize: 20, flexShrink: 0 }}>⏳</span>
                      <span style={{ flex: 1, fontWeight: 700, fontSize: 13, color: "#fbbf24" }}>{req.label}</span>
                      <span style={{ fontSize: 10, color: "#fbbf24", fontWeight: 800, background: "#1a1200", padding: "4px 10px", borderRadius: 100, border: "1px solid #854d0e" }}>⏳ Pending</span>
                    </div>
                  );
                }
                return (
                  <button key={req.id} onClick={req.action} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "14px 16px", background: "#111", borderRadius: 12,
                    border: "1.5px solid #333", cursor: "pointer", textAlign: "left" as const, width: "100%",
                    transition: "all 0.2s ease",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.background = "#1a1a1a"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.background = "#111"; e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{emoji}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 700, fontSize: 13, color: "#fff", marginBottom: 2 }}>{req.actionLabel || `Connect ${req.label}`}</p>
                      <p style={{ fontSize: 11, color: "#666" }}>Required to register</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 100, background: "rgba(249,115,22,0.15)", color: accentColor, border: `1px solid ${accentColor}33` }}>Connect →</span>
                    </div>
                  </button>
                );
              })}
            </div>}

            {!showPhoneOtp && error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>}

            {/* Continue button — only when ALL requirements met */}
            {!showPhoneOtp && allRequirementsMet && (
              <button onClick={() => setStep(isShuffle ? "solo" : "choose")} style={{
                width: "100%", padding: 14,
                background: `linear-gradient(135deg, ${accentColor}, ${isValorant ? "#2A9FCC" : "#ea580c"})`,
                border: "none", borderRadius: 10, color: "#fff",
                fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 4,
                boxShadow: `0 4px 20px ${accentColor}33`,
              }}>
                🚀 Continue to Register
              </button>
            )}

            {/* Summary of what's still missing */}
            {!showPhoneOtp && !allRequirementsMet && unmetRequirements.length > 0 && (
              <div style={{ textAlign: "center", marginTop: 10, padding: "8px 12px", background: "#111", borderRadius: 8, border: "1px solid #222" }}>
                <p style={{ fontSize: 12, color: "#888" }}>
                  🔒 {unmetRequirements.length} requirement{unmetRequirements.length > 1 ? "s" : ""} remaining to unlock registration
                </p>
              </div>
            )}
          </div>
        )}

        {/* Dota: private profile warning */}
        {!isValorant && isProfilePrivate && actualStep === "choose" && (
          <div style={{
            background: "#1a1200", border: "1px solid #854d0e",
            borderRadius: 10, padding: "12px 14px", marginBottom: 20,
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <span style={{ fontSize: 16, marginTop: 1 }}>⚠️</span>
            <div>
              <p style={{ color: "#fbbf24", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Your Dota 2 profile appears to be private</p>
              <p style={{ color: "#92400e", fontSize: 12, lineHeight: 1.6 }}>
                You can still register, but your rank won't be verified. Turn on{" "}
                <span style={{ color: "#fbbf24", fontWeight: 600 }}>Expose Public Match Data</span> in Dota 2 → Settings → Social.
              </p>
            </div>
          </div>
        )}

        {/* Riot pending warning for Valorant */}
        {isValorant && riotPending && actualStep !== "connect" && actualStep !== "success" && (
          <div style={{
            background: "#1a1200", border: "1px solid #854d0e",
            borderRadius: 10, padding: "12px 14px", marginBottom: 16,
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <span style={{ fontSize: 16, marginTop: 1 }}>⏳</span>
            <div>
              <p style={{ color: "#fbbf24", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Riot ID verification pending</p>
              <p style={{ color: "#92400e", fontSize: 12, lineHeight: 1.6 }}>
                You can register now, but please complete the verification on the{" "}
                <span style={{ color: "#fbbf24", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/connect-riot")}>Connect Riot page</span> before the tournament starts.
              </p>
            </div>
          </div>
        )}

        {/* ═══════ SHUFFLE FORMAT: Direct solo registration ═══════ */}
        {actualStep === "solo" && isShuffle && (
          <div>
            <p style={{ color: "#aaa", fontSize: 14, marginBottom: 8, lineHeight: 1.6 }}>
              This is a <span style={{ color: accentColor, fontWeight: 700 }}>shuffle tournament</span> — all players register solo. Teams will be auto-generated with balanced skill levels after registration closes.
            </p>
            <p style={{ color: "#666", fontSize: 12, marginBottom: 20 }}>No premades, no comfort picks — just raw skill.</p>
            {error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button onClick={handleSolo} disabled={loading} style={{
              width: "100%", padding: 14,
              background: loading ? "#991b1b" : `linear-gradient(135deg, ${accentColor}, #2A9FCC)`,
              border: "none", borderRadius: 8, color: "#fff",
              fontWeight: 700, fontSize: 15, cursor: loading ? "default" : "pointer",
            }}>
              {loading ? "Registering..." : "Register Solo →"}
            </button>
          </div>
        )}

        {/* ═══════ STANDARD/AUCTION: 3-choice menu ═══════ */}
        {actualStep === "choose" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button onClick={() => setStep("create")} style={{
              padding: "18px 20px", background: "#111", border: "1px solid #222",
              borderRadius: 12, color: "#fff", cursor: "pointer", textAlign: "left" as const,
              transition: "all 0.2s ease",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>👑</span>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 15 }}>Create a Team</p>
                  <p style={{ color: "#555", fontSize: 12, marginTop: 4 }}>Be the captain, invite up to 4 friends with a code</p>
                </div>
              </div>
            </button>

            <button onClick={() => setStep("join")} style={{
              padding: "18px 20px", background: "#111", border: "1px solid #222",
              borderRadius: 12, color: "#fff", cursor: "pointer", textAlign: "left" as const,
              transition: "all 0.2s ease",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>🤝</span>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 15 }}>Join a Team</p>
                  <p style={{ color: "#555", fontSize: 12, marginTop: 4 }}>Enter the 6-digit code your captain shared</p>
                </div>
              </div>
            </button>

            <button onClick={handleSolo} disabled={loading} style={{
              padding: "18px 20px", background: "#111", border: "1px solid #222",
              borderRadius: 12, color: "#fff", cursor: loading ? "default" : "pointer", textAlign: "left" as const,
              transition: "all 0.2s ease",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#22c55e"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>🎲</span>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 15 }}>Find Me a Team</p>
                  <p style={{ color: "#555", fontSize: 12, marginTop: 4 }}>
                    {loading ? "Registering..." : "Register solo, we'll place you in a team by rank"}
                  </p>
                </div>
              </div>
            </button>
            {error && <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center" }}>{error}</p>}
          </div>
        )}

        {actualStep === "create" && (
          <div>
            <p style={{ color: "#aaa", fontSize: 14, marginBottom: 24 }}>
              You'll be the team captain. We'll generate a 6-digit code you can share with your teammates.
            </p>
            {error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep("choose")} style={{
                flex: 1, padding: 12, background: "transparent", border: "1px solid #1a1a1a",
                borderRadius: 8, color: "#555", fontSize: 13, cursor: "pointer",
              }}>← Back</button>
              <button onClick={handleCreateTeam} disabled={loading} style={{
                flex: 2, padding: 12,
                background: loading ? "#b45309" : `linear-gradient(135deg, ${accentColor}, #ea580c)`,
                border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 14, cursor: loading ? "default" : "pointer",
              }}>{loading ? "Creating..." : "Create Team →"}</button>
            </div>
          </div>
        )}

        {actualStep === "join" && (
          <div>
            <p style={{ color: "#aaa", fontSize: 14, marginBottom: 16 }}>Enter the 6-digit code your captain shared with you.</p>
            <input type="text" placeholder="e.g. AX72KP" maxLength={6} value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              style={{
                width: "100%", padding: 14, background: "#111", border: "1px solid #222",
                borderRadius: 8, color: "#fff", fontSize: 22, letterSpacing: 8, textAlign: "center" as const,
                boxSizing: "border-box" as const, marginBottom: 12, outline: "none",
              }}
            />
            {error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep("choose")} style={{
                flex: 1, padding: 12, background: "transparent", border: "1px solid #1a1a1a",
                borderRadius: 8, color: "#555", fontSize: 13, cursor: "pointer",
              }}>← Back</button>
              <button onClick={handleJoinTeam} disabled={loading} style={{
                flex: 2, padding: 12,
                background: loading ? "#166534" : "linear-gradient(135deg, #22c55e, #16a34a)",
                border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 14, cursor: loading ? "default" : "pointer",
              }}>{loading ? "Joining..." : "Join Team →"}</button>
            </div>
          </div>
        )}

        {actualStep === "success" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 56 }}>{teamCode ? "🎉" : "🏆"}</p>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginTop: 12, color: "#fff" }}>
              {teamCode ? "⚔️ Team Created!" : "✨ You're Registered!"}
            </h3>

            {teamCode ? (
              <>
                <p style={{ color: "#555", fontSize: 13, marginTop: 8, marginBottom: 24 }}>Share this code with your teammates</p>
                <div style={{ background: "#111", border: "1px solid #222", borderRadius: 10, padding: "20px", marginBottom: 20 }}>
                  <p style={{ color: "#555", fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>TEAM CODE</p>
                  <p style={{ fontSize: 36, fontWeight: 800, letterSpacing: 10, color: accentColor }}>{teamCode}</p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => navigator.clipboard.writeText(teamCode)} style={{
                    flex: 1, padding: 12, background: "#111", border: "1px solid #1a1a1a",
                    borderRadius: 8, color: "#aaa", fontSize: 13, cursor: "pointer",
                  }}>Copy Code</button>
                  <button onClick={handleWhatsApp} style={{
                    flex: 1, padding: 12, background: "linear-gradient(135deg, #25d366, #128c7e)",
                    border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                  }}>Share on WhatsApp</button>
                </div>
              </>
            ) : isShuffle ? (
              <p style={{ color: "#555", fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
                You're registered! Teams will be auto-generated with balanced skill levels after registration closes.
              </p>
            ) : (
              <p style={{ color: "#555", fontSize: 13, marginTop: 8 }}>
                You're in the solo pool. We'll assign you to a team based on your rank before the tournament starts.
              </p>
            )}

            {warning && (
              <div style={{ marginTop: 12, background: "#1a1200", border: "1px solid #854d0e", borderRadius: 8, padding: "10px 14px", textAlign: "left" as const }}>
                <p style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700, marginBottom: 3 }}>⚠️ Note</p>
                <p style={{ color: "#92400e", fontSize: 11, lineHeight: 1.6 }}>{warning}</p>
              </div>
            )}

            {!isValorant && isProfilePrivate && (
              <div style={{ marginTop: 16, background: "#1a1200", border: "1px solid #854d0e", borderRadius: 8, padding: "10px 14px", textAlign: "left" as const }}>
                <p style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700, marginBottom: 3 }}>⚠️ Action needed to claim prizes</p>
                <p style={{ color: "#92400e", fontSize: 11, lineHeight: 1.6 }}>
                  Enable <span style={{ color: "#fbbf24" }}>Expose Public Match Data</span> in Dota 2 → Settings → Social and play one match.
                </p>
              </div>
            )}

            <button onClick={onClose} style={{
              marginTop: 16, width: "100%", padding: 12, background: "transparent",
              border: "1px solid #1a1a1a", borderRadius: 8, color: "#444", fontSize: 13, cursor: "pointer",
            }}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
