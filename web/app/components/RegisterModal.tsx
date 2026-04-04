"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { doc, updateDoc, getDoc } from "firebase/firestore";
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

  // ── Re-check linked accounts when user returns from another tab ────────
  const [localDiscord, setLocalDiscord] = useState(false);
  const [localSteam, setLocalSteam] = useState(false);
  const [localRiot, setLocalRiot] = useState<string | null>(null);
  const [localPhone, setLocalPhone] = useState(false);

  // ── Discord connected accounts (Steam/Riot found on Discord) ──────────
  type DiscordConn = { type: string; name: string; id: string; verified: boolean };
  const [discordConns, setDiscordConns] = useState<DiscordConn[]>([]);
  const [linkingFromDiscord, setLinkingFromDiscord] = useState<string | null>(null); // "steam" | "riot" | null
  const [linkFromDiscordError, setLinkFromDiscordError] = useState("");

  // ── Account connection status (includes local refresh from tab-switch) ──
  const hasSteam = !!dotaProfile?.steamId || !!user?.steamId || !!userProfile?.steamId || localSteam;
  const riotStatus = localRiot || riotData?.riotVerified || "unlinked";
  const hasRiot = riotStatus === "verified";
  const riotPending = riotStatus === "pending";
  const hasDiscord = !!userProfile?.discordId || !!user?.discordId || !!dotaProfile?.discordId || localDiscord;
  const hasPhone = !!userProfile?.phone || !!user?.phoneNumber || phoneDone || localPhone;
  const hasFullName = fullNameSaved && fullName.trim().length >= 2;

  // Keep fullName in sync if userProfile loads after mount
  useEffect(() => {
    if (userProfile?.fullName && !fullNameSaved) {
      setFullName(userProfile.fullName);
      setFullNameSaved(true);
    }
  }, [userProfile?.fullName, fullNameSaved]);

  // Shared function to refresh user state from Firestore
  const refreshUserState = async () => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      const d = snap.data();
      if (!d) return;
      if (d.discordId) setLocalDiscord(true);
      if (d.steamId) setLocalSteam(true);
      if (d.phone) setLocalPhone(true);
      if (d.riotVerified) setLocalRiot(d.riotVerified);
      if (d.fullName && !fullNameSaved) {
        setFullName(d.fullName);
        setFullNameSaved(true);
      }
      if (d.discordConnections?.length > 0) {
        setDiscordConns(d.discordConnections);
      }
    } catch {}
  };

  // Fetch on mount (user may already have Discord connected)
  useEffect(() => { refreshUserState(); }, [user]);

  // Re-fetch when user returns from another tab
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshUserState();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [user, fullNameSaved]);

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

  // ── Link account from Discord connection ──────────────────────────────
  const discordSteam = discordConns.find(c => c.type === "steam");
  const discordRiot = discordConns.find(c => c.type === "riotgames");

  const linkFromDiscord = async (type: "steam" | "riot") => {
    const conn = type === "steam" ? discordSteam : discordRiot;
    if (!conn || !user) return;
    setLinkingFromDiscord(type);
    setLinkFromDiscordError("");
    try {
      const res = await fetch("/api/auth/link-from-discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          type,
          platformId: conn.id,
          platformName: conn.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to link account");
      // Update local state so the requirement shows as met
      if (type === "steam") setLocalSteam(true);
      if (type === "riot") setLocalRiot("pending");
    } catch (e: any) {
      setLinkFromDiscordError(e.message || "Failed to link account. Try connecting manually.");
    } finally {
      setLinkingFromDiscord(null);
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
  type ReqItem = { id: string; label: string; desc: string; emoji: string; met: boolean; pending?: boolean; actionLabel?: string; action?: () => void };
  const requirements: ReqItem[] = [];

  // Full Name — always first
  requirements.push({
    id: "fullName",
    label: "Full Name",
    desc: "Used for team rosters, match results, and prize payouts",
    emoji: "\u{1F9D1}\u200D\u{1F4BB}",
    met: hasFullName,
  });

  // Phone
  requirements.push({
    id: "phone",
    label: "Phone Number",
    desc: "For match reminders and prize claim verification via OTP",
    emoji: "\u{1F4F2}",
    met: hasPhone,
    actionLabel: "Verify Phone Number",
    action: () => { setShowPhoneOtp(true); setPhoneStep("phone"); setPhoneError(""); setPhoneNum(""); setOtp(["","","","","",""]); setTimeout(() => phoneRef.current?.focus(), 200); },
  });

  // Game-specific account — opens in new tab, modal stays open
  if (isValorant) {
    requirements.push({
      id: "riot",
      label: "Riot ID",
      desc: "We verify your Valorant rank to place you in a fair bracket",
      emoji: "\u{1F3AF}",
      met: hasRiot,
      pending: riotPending,
      actionLabel: "Connect Riot ID",
      action: () => { window.open("/connect-riot", "_blank"); },
    });
  } else {
    requirements.push({
      id: "steam",
      label: "Steam Account",
      desc: "Links your Dota 2 profile so we can verify rank and track matches",
      emoji: "\u{1F3AE}",
      met: hasSteam,
      actionLabel: "Connect Steam",
      action: () => { sessionStorage.setItem("redirectAfterLogin", window.location.pathname); window.open(`/api/auth/steam?uid=${user?.uid}`, "_blank"); },
    });
  }

  // Discord — mandatory for both, opens in new tab
  requirements.push({
    id: "discord",
    label: "Discord",
    desc: "Tournament brackets, match scheduling, and team comms happen on Discord",
    emoji: "\u{1F4AC}",
    met: hasDiscord,
    actionLabel: "Connect Discord",
    action: () => { sessionStorage.setItem("redirectAfterLogin", window.location.pathname); window.open(`/api/auth/discord?uid=${user?.uid}&returnTo=${encodeURIComponent(window.location.pathname)}`, "_blank"); },
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
              background: "linear-gradient(135deg, rgba(59,130,246,0.08), #0e0e0e)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 12,
              padding: "16px 18px", marginBottom: 20, position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: -20, right: -10, fontSize: 60, opacity: 0.05 }}>{"\u{1F6E1}\uFE0F"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{"\u2728"}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#93c5fd" }}>Almost there! Complete these to register</span>
              </div>
              <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
                We need a few details to ensure fair play, coordinate matches, and deliver prizes.
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
            {!showPhoneOtp && <div style={{
              marginBottom: 14, padding: "14px 16px",
              background: hasFullName ? "linear-gradient(135deg, #0a1a0a, #0e1a0e)" : "#111",
              border: `1px solid ${hasFullName ? "#166534" : "#333"}`, borderRadius: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: hasFullName ? 0 : 10 }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{"\u{1F9D1}\u200D\u{1F4BB}"}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: hasFullName ? "#4ade80" : "#fff", marginBottom: 2 }}>
                    Full Name
                    {hasFullName && <span style={{ fontSize: 10, color: "#4ade80", fontWeight: 800, background: "#0a2a0a", padding: "3px 8px", borderRadius: 100, border: "1px solid #166534", marginLeft: 8 }}>{"\u2705"} Saved</span>}
                  </p>
                  <p style={{ fontSize: 11, color: "#666", lineHeight: 1.4 }}>Used for team rosters, match results, and prize payouts</p>
                </div>
              </div>
              {!hasFullName && (
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <input
                    type="text"
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); setFullNameSaved(false); }}
                    disabled={fullNameSaving}
                    style={{
                      flex: 1, padding: "10px 14px", background: "#0a0a0a",
                      border: "1px solid #222", borderRadius: 8,
                      color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" as const,
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") saveFullName(); }}
                  />
                  {fullName.trim().length >= 2 && (
                    <button onClick={saveFullName} disabled={fullNameSaving} style={{
                      padding: "10px 16px", background: fullNameSaving ? "#333" : `linear-gradient(135deg, ${accentColor}, ${isValorant ? "#2A9FCC" : "#ea580c"})`,
                      border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 12,
                      cursor: fullNameSaving ? "default" : "pointer", whiteSpace: "nowrap" as const,
                    }}>
                      {fullNameSaving ? "..." : "Save"}
                    </button>
                  )}
                </div>
              )}
              {!hasFullName && fullName.trim().length > 0 && fullName.trim().length < 2 && (
                <p style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>Name must be at least 2 characters</p>
              )}
            </div>}

            {/* Connection Requirements */}
            {!showPhoneOtp && <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {requirements.filter(r => r.id !== "fullName").map(req => {
                if (req.met) {
                  return (
                    <div key={req.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "14px 16px", background: "linear-gradient(135deg, #0a1a0a, #0e1a0e)", borderRadius: 12,
                      border: "1px solid #166534",
                    }}>
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{req.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 700, fontSize: 13, color: "#4ade80", marginBottom: 2 }}>{req.label}</p>
                        <p style={{ fontSize: 11, color: "#3a6b3a", lineHeight: 1.4 }}>{req.desc}</p>
                      </div>
                      <span style={{ fontSize: 10, color: "#4ade80", fontWeight: 800, background: "#0a2a0a", padding: "4px 10px", borderRadius: 100, border: "1px solid #166534", flexShrink: 0 }}>{"\u2705"} Done</span>
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
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{req.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 700, fontSize: 13, color: "#fbbf24", marginBottom: 2 }}>{req.label}</p>
                        <p style={{ fontSize: 11, color: "#7a6520", lineHeight: 1.4 }}>System is verifying your account — nothing needed from you</p>
                      </div>
                      <span style={{ fontSize: 10, color: "#fbbf24", fontWeight: 800, background: "#1a1200", padding: "4px 10px", borderRadius: 100, border: "1px solid #854d0e", flexShrink: 0 }}>{"\u23F3"} Verifying</span>
                    </div>
                  );
                }
                // Check if Discord has this account linked
                const dcMatch = (req.id === "steam" && !hasSteam && discordSteam)
                  ? discordSteam
                  : (req.id === "riot" && !hasRiot && !riotPending && discordRiot)
                    ? discordRiot
                    : null;
                const isLinking = linkingFromDiscord === (req.id === "steam" ? "steam" : req.id === "riot" ? "riot" : null);

                if (dcMatch) {
                  // ── "Found on Discord" card with one-click link ──
                  return (
                    <div key={req.id} style={{
                      padding: "14px 16px", background: "linear-gradient(135deg, rgba(88,101,242,0.08), #111)", borderRadius: 12,
                      border: "1.5px solid rgba(88,101,242,0.3)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{req.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: 700, fontSize: 13, color: "#fff", marginBottom: 2 }}>{req.label}</p>
                          <p style={{ fontSize: 11, color: "#666", lineHeight: 1.4 }}>{req.desc}</p>
                        </div>
                      </div>
                      {/* Found on Discord banner */}
                      <div style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 12px", background: "rgba(88,101,242,0.1)", borderRadius: 8,
                        border: "1px solid rgba(88,101,242,0.2)", marginBottom: 10,
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="#818cf8" style={{ flexShrink: 0 }}>
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.12-.098.246-.198.373-.292a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419s.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419s.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                        </svg>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: "#a5b4fc" }}>Found on your Discord</p>
                          <p style={{ fontSize: 13, fontWeight: 800, color: "#fff", marginTop: 2 }}>{dcMatch.name}</p>
                        </div>
                      </div>
                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => linkFromDiscord(req.id === "steam" ? "steam" : "riot")} disabled={!!linkingFromDiscord} style={{
                          flex: 2, padding: "10px 14px",
                          background: isLinking ? "#333" : `linear-gradient(135deg, #5865F2, #4752C4)`,
                          border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 12,
                          cursor: isLinking ? "default" : "pointer", fontFamily: "inherit",
                        }}>
                          {isLinking ? "Linking..." : `Use ${dcMatch.name}`}
                        </button>
                        <button onClick={req.action} style={{
                          flex: 1, padding: "10px 14px",
                          background: "transparent", border: "1px solid #333", borderRadius: 8,
                          color: "#888", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                        }}>
                          Connect manually
                        </button>
                      </div>
                      {linkFromDiscordError && !linkingFromDiscord && (
                        <p style={{ fontSize: 11, color: "#f87171", marginTop: 8 }}>{linkFromDiscordError}</p>
                      )}
                    </div>
                  );
                }

                // ── Default unmet requirement card (no Discord match) ──
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
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{req.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 700, fontSize: 13, color: "#fff", marginBottom: 2 }}>{req.actionLabel || `Connect ${req.label}`}</p>
                      <p style={{ fontSize: 11, color: "#666", lineHeight: 1.4 }}>{req.desc}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 100, background: `${accentColor}15`, color: accentColor, border: `1px solid ${accentColor}33`, flexShrink: 0 }}>Connect {"\u2192"}</span>
                    </div>
                  </button>
                );
              })}
            </div>}

            {!showPhoneOtp && error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>}

            {/* Continue button — only when ALL requirements met */}
            {!showPhoneOtp && allRequirementsMet && (
              <button onClick={() => {
                if (isShuffle) { handleSolo(); } else { setStep("choose"); }
              }} disabled={loading} style={{
                width: "100%", padding: 14,
                background: loading ? "#333" : `linear-gradient(135deg, ${accentColor}, ${isValorant ? "#2A9FCC" : "#ea580c"})`,
                border: "none", borderRadius: 10, color: "#fff",
                fontWeight: 700, fontSize: 15, cursor: loading ? "default" : "pointer", marginTop: 4,
                boxShadow: `0 4px 20px ${accentColor}33`,
              }}>
                {loading ? "Registering..." : isShuffle ? `${"\u{1F680}"} Register Now` : `${"\u{1F680}"} Continue to Register`}
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

        {/* Riot pending note for Valorant — subtle, not alarming */}
        {isValorant && riotPending && actualStep !== "connect" && actualStep !== "success" && (
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10, padding: "10px 14px", marginBottom: 16,
            display: "flex", gap: 10, alignItems: "center",
          }}>
            <span style={{ fontSize: 14, opacity: 0.5 }}>{"\u2705"}</span>
            <p style={{ color: "#888", fontSize: 12, lineHeight: 1.5 }}>
              Nothing needed from you — our system is verifying your Riot ID. You can register normally.
            </p>
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
