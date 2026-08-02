"use client";

/**
 * Registration — "seat first, setup after".
 *
 * The order is deliberate and is the whole point of this component:
 *
 *   Discord  →  pay  →  name, phone, game account  →  registered
 *
 * The old flow put four setup steps in front of the money, two of which throw
 * the player to another website. Intent leaks at every hop. Now the only thing
 * asked before payment is Discord — because that is how we reach someone whose
 * payment lands but whose setup never finishes, which is the one failure this
 * ordering creates.
 *
 * Consequences handled elsewhere, listed here so they are not a surprise:
 *   - a paid player is not yet IN the tournament; the tournament page shows
 *     them "Details pending" via /api/payments/entitlement
 *   - capacity counts paid-but-unregistered holders, so the slot they bought
 *     cannot be sold twice (see api/payments/payu/initiate)
 *
 * Riot verification state is never shown to players. A linked Riot ID is
 * "done" as far as this flow is concerned; whether we have reviewed the rank is
 * an internal matter and lives in the admin panel only.
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { doc, updateDoc, getDoc, getDocFromServer, setDoc } from "firebase/firestore";
import { db, getFirebaseAuth } from "@/lib/firebase";
import type { ConfirmationResult } from "firebase/auth";
import { navigateWithAppPriority } from "@/app/lib/mobileAuth";
import { startPayuCheckout, type CheckoutMode } from "@/app/lib/payuCheckout";
import { GAME_THEME, UI, type GameKey } from "@/app/lib/gameTheme";

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
  game?: "dota2" | "valorant" | "cs2";
  isSubstitute?: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

/** "auto" lets the flow pick the right screen from what is already done. */
type Stage = "auto" | "checking" | "gate" | "fee" | "waiting" | "hub" | "name" | "phone" | "done";

export default function RegisterModal({ tournament, user, dotaProfile, game = "dota2", isSubstitute = false, onClose, onSuccess }: Props) {
  const { riotData, userProfile } = useAuth();
  const router = useRouter();

  const isCS2 = game === "cs2";
  const isValorant = game === "valorant";
  const gameKey: GameKey = isCS2 ? "cs2" : isValorant ? "valorant" : "dota2";
  const T = GAME_THEME[gameKey];

  const [stage, setStage] = useState<Stage>("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);

  // ── Profile state, refreshed whenever the player returns from an OAuth hop ──
  const [fullName, setFullName] = useState(userProfile?.fullName || "");
  const [nameSaving, setNameSaving] = useState(false);
  const [localDiscord, setLocalDiscord] = useState(false);
  const [localSteam, setLocalSteam] = useState(false);
  const [localRiot, setLocalRiot] = useState(false);
  const [localPhone, setLocalPhone] = useState(false);
  const [localName, setLocalName] = useState(!!userProfile?.fullName);
  // Has the user document been read at least once? Until it has, every
  // "is X connected" answer is a guess that defaults to no.
  const [profileLoaded, setProfileLoaded] = useState(false);

  type DiscordConn = { type: string; name: string; id: string; verified: boolean };
  const [discordConns, setDiscordConns] = useState<DiscordConn[]>([]);
  const [linkingFrom, setLinkingFrom] = useState<string | null>(null);

  // ── Payment state ──────────────────────────────────────────────────────
  const entryFee = Number(tournament?.entryFee) || 0;
  const [hasPaid, setHasPaid] = useState(false);
  const [entitlementLoaded, setEntitlementLoaded] = useState(entryFee <= 0);
  const [watchTxnid, setWatchTxnid] = useState<string | null>(null);

  // ── Phone OTP ──────────────────────────────────────────────────────────
  const [phoneStep, setPhoneStep] = useState<"phone" | "otp">("phone");
  const [phoneNum, setPhoneNum] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [phoneError, setPhoneError] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [verificationId, setVerificationId] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const phoneRef = useRef<HTMLInputElement>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const recaptchaRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearRecaptcha = () => {
    try { recaptchaRef.current?.clear(); } catch {}
    recaptchaRef.current = null;
    const el = document.getElementById("reg-recaptcha");
    if (el) el.innerHTML = "";
  };
  useEffect(() => () => { clearRecaptcha(); if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startTimer = () => {
    setResendTimer(30);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer(p => { if (p <= 1) { clearInterval(timerRef.current!); return 0; } return p - 1; });
    }, 1000);
  };

  // ── Derived completion ─────────────────────────────────────────────────
  const hasDiscord = !!userProfile?.discordId || !!user?.discordId || !!dotaProfile?.discordId || localDiscord;
  const hasPhone = (!!userProfile?.phone && userProfile.phone.length > 3) || localPhone;
  const hasName = (localName && fullName.trim().length >= 2) || (!!userProfile?.fullName && !nameSaving);
  const hasSteam = !!dotaProfile?.steamId || !!user?.steamId || !!userProfile?.steamId || localSteam;
  // Linked is enough. Verification status is deliberately not consulted.
  const hasRiot = !!riotData?.riotGameName || localRiot;
  const hasAccount = isValorant ? hasRiot : hasSteam;

  const accountLabel = isValorant ? "Riot ID" : "Steam";
  const tasksDone = [hasName, hasPhone, hasAccount].filter(Boolean).length;
  const setupComplete = hasName && hasPhone && hasAccount;

  const refreshUserState = async () => {
    if (!user) { setProfileLoaded(true); return; }
    try {
      let snap;
      try { snap = await getDocFromServer(doc(db, "users", user.uid)); } catch { snap = await getDoc(doc(db, "users", user.uid)); }
      const d = snap.data();
      if (d) {
        if (d.discordId) setLocalDiscord(true);
        if (d.steamId) setLocalSteam(true);
        if (d.riotGameName) setLocalRiot(true);
        if (d.phone && d.phone.length > 3) setLocalPhone(true);
        if (d.fullName) { setFullName(d.fullName); setLocalName(true); }
        if (d.discordConnections?.length > 0) setDiscordConns(d.discordConnections);
      }
    } catch {
      // A failed read must not strand the modal on a spinner — fall through to
      // whatever AuthContext already knows.
    } finally {
      setProfileLoaded(true);
    }
  };

  useEffect(() => { refreshUserState(); }, [user]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") refreshUserState(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [user]);

  // Has this player already bought a slot?
  useEffect(() => {
    if (entryFee <= 0 || !user || isSubstitute) return;
    let cancelled = false;
    fetch(`/api/payments/entitlement?game=${gameKey}&tournamentId=${encodeURIComponent(tournament.id)}&uid=${encodeURIComponent(user.uid)}`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (!cancelled) { setHasPaid(!!d.paid); setEntitlementLoaded(true); } })
      .catch(() => { if (!cancelled) setEntitlementLoaded(true); });
    return () => { cancelled = true; };
  }, [user, tournament?.id, entryFee, gameKey, isSubstitute]);

  // ── Watch a payment happening in the other tab ─────────────────────────
  useEffect(() => {
    if (!watchTxnid) return;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`/api/payments/status?txnid=${encodeURIComponent(watchTxnid)}`, { cache: "no-store" });
        const d = await res.json();
        if (cancelled || !res.ok) return;
        if (d.status === "paid") { setWatchTxnid(null); setHasPaid(true); setLoading(false); setStage("hub"); }
        else if (d.status === "failed") { setWatchTxnid(null); setLoading(false); setStage("fee"); setError("That payment didn't go through. Nothing was charged."); }
        else if (d.status === "review") { setWatchTxnid(null); setLoading(false); setStage("fee"); setError("Your payment needs a manual check — we'll sort it out. Don't pay again."); }
      } catch {}
    };
    const interval = setInterval(check, 3000);
    check();
    return () => { cancelled = true; clearInterval(interval); };
  }, [watchTxnid]);

  // ── Which screen ───────────────────────────────────────────────────────
  // Nothing is decided until we know two things: what the player's profile
  // actually contains, and whether they have already paid. Rendering before
  // then guesses — and the guess is always "not connected", which flashed
  // "Connect Discord" at players who connected it weeks ago. A brief spinner is
  // honest; a wrong screen is not.
  const ready = profileLoaded && (entryFee <= 0 || isSubstitute || entitlementLoaded);

  const resolved: Stage =
    stage !== "auto" ? stage
    : !ready ? "checking"
    : !hasDiscord ? "gate"
    // Substitutes never pay. They take the slot of someone who already paid and
    // didn't show, so charging them would collect the entry fee twice for one
    // seat. They still complete every detail up front, so they can be dropped
    // into a team on the day without chasing anyone.
    : (entryFee > 0 && !hasPaid && !isSubstitute) ? "fee"
    : "hub";

  // ── Actions ────────────────────────────────────────────────────────────
  const connectDiscord = () => {
    setConnecting("discord");
    try { localStorage.setItem("pendingRegistration", window.location.pathname); } catch {}
    navigateWithAppPriority(`/api/auth/discord?uid=${user?.uid}&returnTo=${encodeURIComponent(window.location.pathname + "?register=true")}`);
  };

  const connectAccount = () => {
    setConnecting("account");
    try { localStorage.setItem("pendingRegistration", window.location.pathname); } catch {}
    if (isValorant) window.location.href = "/connect-riot";
    else navigateWithAppPriority(`/api/auth/steam?uid=${user?.uid}`);
  };

  const linkFromDiscord = async (type: "steam" | "riot") => {
    const conn = discordConns.find(c => c.type === (type === "steam" ? "steam" : "riotgames"));
    if (!conn || !user) return;
    setLinkingFrom(type); setError("");
    try {
      const res = await fetch("/api/auth/link-from-discord", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, type, platformId: conn.id, platformName: conn.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't link that account");
      if (type === "steam") setLocalSteam(true); else setLocalRiot(true);
      setStage("hub");
    } catch (e: any) { setError(e.message); } finally { setLinkingFrom(null); }
  };

  const saveName = async () => {
    const trimmed = fullName.trim();
    if (trimmed.length < 2) return;
    setNameSaving(true); setError("");
    try {
      await setDoc(doc(db, "users", user.uid), { fullName: trimmed }, { merge: true });
      setLocalName(true); setStage("hub");
    } catch { setError("Couldn't save that. Try again."); }
    finally { setNameSaving(false); }
  };

  const sendOtp = async () => {
    const digits = phoneNum.replace(/\D/g, "");
    if (digits.length < 8) { setPhoneError("That doesn't look like a valid number."); return; }
    try {
      setPhoneLoading(true); setPhoneError("");
      clearRecaptcha();
      const { auth, mod } = await getFirebaseAuth();
      recaptchaRef.current = new mod.RecaptchaVerifier(auth, "reg-recaptcha", { size: "invisible", callback: () => {}, "expired-callback": () => clearRecaptcha() });
      const result: ConfirmationResult = await mod.signInWithPhoneNumber(auth, `${countryCode}${digits}`, recaptchaRef.current);
      setVerificationId(result.verificationId);
      setPhoneStep("otp"); startTimer();
      setTimeout(() => otpRefs.current[0]?.focus(), 150);
    } catch (e: any) { clearRecaptcha(); setPhoneError(e.message || "Couldn't send the code. Try again."); }
    finally { setPhoneLoading(false); }
  };

  const verifyOtpStr = async (code: string) => {
    if (code.length < 6) { setPhoneError("Enter all 6 digits."); return; }
    if (!verificationId || !user) { setPhoneError("Session expired — go back and retry."); return; }
    try {
      setPhoneLoading(true); setPhoneError("");
      const { mod } = await getFirebaseAuth();
      const credential = mod.PhoneAuthProvider.credential(verificationId, code);
      await mod.linkWithCredential(user, credential);
      await updateDoc(doc(db, "users", user.uid), { phone: `${countryCode}${phoneNum.replace(/\D/g, "")}` });
      setLocalPhone(true); clearRecaptcha(); setStage("hub");
    } catch (e: any) {
      if (e.code === "auth/invalid-verification-code") setPhoneError("Wrong code. Try again.");
      else if (e.code === "auth/code-expired") setPhoneError("Code expired — request a new one.");
      else if (e.code === "auth/credential-already-in-use") setPhoneError("That number belongs to another account.");
      else setPhoneError(e.message || "Couldn't verify. Try again.");
    } finally { setPhoneLoading(false); }
  };

  const handleOtpChange = (i: number, val: string) => {
    const d = val.replace(/\D/g, "").slice(-1);
    const n = [...otp]; n[i] = d; setOtp(n);
    if (d && i < 5) otpRefs.current[i + 1]?.focus();
    if (n.every(x => x) && d) setTimeout(() => verifyOtpStr(n.join("")), 100);
  };
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (p.length === 6) { setOtp(p.split("")); e.preventDefault(); setTimeout(() => verifyOtpStr(p), 50); }
  };

  const payNow = async () => {
    setLoading(true); setError("");
    const outcome = await startPayuCheckout({
      uid: user.uid, game: gameKey === "dota2" ? "dota2" : gameKey,
      tournamentId: tournament.id, mode: "solo" as CheckoutMode, newTab: true,
    });
    if (outcome.kind === "redirecting") return;
    if (outcome.kind === "popup") { setStage("waiting"); setWatchTxnid(outcome.txnid); return; }
    if (outcome.kind === "error") { setError(outcome.error); setLoading(false); return; }
    // Free, or already settled — nothing to charge.
    setHasPaid(true); setLoading(false); setStage("hub");
  };

  const finish = async () => {
    setLoading(true); setError(""); setWarning("");
    try {
      if (isSubstitute) {
        const token = await user.getIdToken();
        const res = await fetch("/api/waitlist", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tournamentId: tournament.id, game: isCS2 ? "cs2" : isValorant ? "valorant" : "dota" }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        onSuccess(); setStage("done"); return;
      }
      const endpoint = isCS2 ? "/api/cs2/solo" : isValorant ? "/api/valorant/solo" : "/api/teams/solo";
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: tournament.id, uid: user.uid }),
      });
      const d = await res.json();
      if (res.status === 402 && d?.requiresPayment) { setStage("fee"); setHasPaid(false); return; }
      if (!res.ok && !/already registered|already in/i.test(d?.error || "")) throw new Error(d.error);
      if (d.warning) setWarning(d.warning);
      onSuccess(); setStage("done");
    } catch (e: any) { setError(e.message || "Couldn't complete registration."); }
    finally { setLoading(false); }
  };

  // ── Shared bits ────────────────────────────────────────────────────────
  const cta: React.CSSProperties = {
    width: "100%", border: 0, borderRadius: 12, padding: 16, fontSize: 15, fontWeight: 700,
    color: T.ctaFg, background: `linear-gradient(180deg, ${T.acc}, ${T.acc2})`,
    cursor: "pointer", fontFamily: "inherit", boxShadow: `0 6px 24px ${T.glow}`,
  };
  const ctaMuted: React.CSSProperties = { ...cta, background: "#1c1c1c", color: "#666", boxShadow: "none", cursor: "default" };
  const eyebrow: React.CSSProperties = { fontSize: 11.5, letterSpacing: ".14em", color: UI.faint, fontWeight: 600 };
  const h1: React.CSSProperties = { fontSize: 27, fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.2, color: UI.text };
  const body: React.CSSProperties = { fontSize: 13.5, color: UI.dim, lineHeight: 1.65 };
  const panel: React.CSSProperties = { background: UI.surface, border: `1px solid ${UI.border}`, borderRadius: 12, padding: 15 };
  const field: React.CSSProperties = {
    width: "100%", padding: "14px 16px", background: "#111", border: `1.5px solid #222`,
    borderRadius: 11, color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };

  const Task = ({ done, label, hint, onClick, busy }: { done: boolean; label: string; hint: string; onClick?: () => void; busy?: boolean }) => (
    <button onClick={done ? undefined : onClick} disabled={done || busy} style={{
      width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 13,
      background: UI.surface, border: `1px solid ${done ? "rgba(74,222,128,0.25)" : UI.border}`,
      borderRadius: 13, padding: 15, cursor: done ? "default" : "pointer", fontFamily: "inherit",
      transition: "border-color .2s ease",
    }}
      onMouseEnter={e => { if (!done) e.currentTarget.style.borderColor = T.line; }}
      onMouseLeave={e => { if (!done) e.currentTarget.style.borderColor = UI.border; }}
    >
      <div style={{
        width: 30, height: 30, flex: "none", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
        background: done ? "rgba(74,222,128,0.12)" : T.soft, color: done ? UI.ok : T.acc, fontSize: 14, fontWeight: 800,
      }}>{done ? "✓" : "→"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: done ? UI.dim : "#fff" }}>{label}</div>
        <div style={{ fontSize: 11.5, color: UI.faint, marginTop: 2 }}>{busy ? "Opening…" : done ? "Done" : hint}</div>
      </div>
    </button>
  );

  return (
    <>
      <style>{`
        @media(max-width:480px){
          .reg-overlay{align-items:flex-end !important}
          .reg-modal{max-width:100% !important;border-radius:22px 22px 0 0 !important;max-height:92vh !important}
        }
        @keyframes reg-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes reg-spin{to{transform:rotate(360deg)}}
      `}</style>

      <div className="reg-overlay" style={{
        position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.86)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

        <div className="reg-modal" style={{
          background: UI.bg, border: `1px solid ${UI.border}`, borderRadius: 20,
          width: "100%", maxWidth: 430, maxHeight: "90vh", overflowY: "auto",
          position: "relative", animation: "reg-rise .25s ease both",
        }}>
          <div id="reg-recaptcha" style={{ position: "absolute", opacity: 0, pointerEvents: "none" }} />

          {/* header */}
          <div style={{ padding: "20px 22px 0", display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: ".12em", color: T.acc,
              background: T.soft, padding: "4px 9px", borderRadius: 6,
            }}>{T.label}</span>
            <span style={{ fontSize: 11.5, color: UI.faint, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tournament.name}
            </span>
            <button onClick={onClose} style={{ background: "none", border: 0, color: "#444", fontSize: 17, cursor: "pointer", lineHeight: 1, padding: 0 }}>✕</button>
          </div>

          <div style={{ padding: "18px 22px 24px" }}>

            {/* ═══ CHECKING — brief, and never a wrong screen ═══ */}
            {resolved === "checking" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 13, padding: "44px 10px" }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", border: `2px solid ${UI.border}`, borderTopColor: T.acc, animation: "reg-spin .8s linear infinite" }} />
                <div style={{ fontSize: 13, color: UI.faint }}>Checking your account…</div>
              </div>
            )}

            {/* ═══ DISCORD GATE ═══ */}
            {resolved === "gate" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={eyebrow}>STEP 1 OF {entryFee > 0 ? 3 : 2}</div>
                <div style={h1}>Connect Discord</div>
                <div style={body}>
                  Brackets, match calls and your team all live on our Discord. It&apos;s the one thing we need
                  before anything else.
                </div>
                {error && <p style={{ color: UI.bad, fontSize: 12.5 }}>{error}</p>}
                <button onClick={connectDiscord} disabled={!!connecting} style={{ ...cta, background: connecting ? "#1c1c1c" : "linear-gradient(180deg,#5865F2,#4149C4)", color: "#fff", boxShadow: connecting ? "none" : "0 6px 24px rgba(88,101,242,0.3)" }}>
                  {connecting ? "Opening Discord…" : "Continue with Discord"}
                </button>
                <p style={{ fontSize: 11.5, color: "#444", textAlign: "center", lineHeight: 1.6 }}>
                  Opens Discord, then brings you right back here.
                </p>
              </div>
            )}

            {/* ═══ FEE ═══ */}
            {resolved === "fee" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                <div style={eyebrow}>
                  STEP 2 OF 3
                  {tournament.totalSlots ? ` · ${Math.max(0, tournament.totalSlots - (tournament.slotsBooked || 0))} SLOTS LEFT` : ""}
                </div>
                <div style={h1}>Claim your slot</div>
                <div style={{ fontSize: 58, fontWeight: 700, letterSpacing: "-.03em", lineHeight: 1, color: "#fff" }}>
                  ₹{entryFee}
                </div>
                <div style={body}>That&apos;s the whole entry fee. UPI or Net Banking through PayU, in a new tab.</div>

                <div style={{ ...panel, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 12, color: UI.dimmer, lineHeight: 1.6 }}>
                    Setup comes after — your name, phone and {accountLabel}. About a minute.
                  </div>
                  <div style={{ fontSize: 12, color: T.acc }}>Your slot is held as soon as payment clears.</div>
                </div>

                {error && <p style={{ color: UI.bad, fontSize: 12.5 }}>{error}</p>}

                <button onClick={payNow} disabled={loading} style={loading ? ctaMuted : cta}>
                  {loading ? "Opening PayU…" : `Pay ₹${entryFee}`}
                </button>
              </div>
            )}

            {/* ═══ WAITING FOR PAYU ═══ */}
            {resolved === "waiting" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 15, padding: "34px 10px" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", border: `2px solid ${UI.border}`, borderTopColor: T.acc, animation: "reg-spin .8s linear infinite" }} />
                <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Waiting for PayU</div>
                <div style={{ ...body, textAlign: "center", maxWidth: 270 }}>
                  Finish in the other tab. This updates itself the moment it clears — keep it open.
                </div>
              </div>
            )}

            {/* ═══ SETUP HUB ═══ */}
            {resolved === "hub" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {entryFee > 0 && hasPaid && !isSubstitute && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, color: UI.ok, fontSize: 11.5, letterSpacing: ".1em", fontWeight: 700 }}>
                    ✓ SLOT PAID · ₹{entryFee}
                  </div>
                )}
                {isSubstitute && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.acc, fontSize: 11.5, letterSpacing: ".1em", fontWeight: 700 }}>
                    SUBSTITUTE LIST · NO ENTRY FEE
                  </div>
                )}
                <div style={h1}>
                  {isSubstitute ? (setupComplete ? "Ready to step in" : "Set up to sub in") : setupComplete ? "You're all set" : "Finish your setup"}
                </div>
                <div style={body}>
                  {isSubstitute
                    ? (setupComplete
                        ? "You're set. Join the list and we'll call you the moment a slot frees up."
                        : `${tasksDone} of 3 done. We take these now so you can be dropped straight into a team if someone drops out — no fee, their slot is already paid for.`)
                    : setupComplete
                      ? "Everything's linked. Lock in your place below."
                      : `${tasksDone} of 3 done — we need these to run your matches and pay out.`}
                </div>

                <div style={{ height: 5, borderRadius: 3, background: "#161616", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(tasksDone / 3) * 100}%`, background: T.acc, borderRadius: 3, transition: "width .35s ease" }} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <Task done={hasName} label="Your name" hint="Goes on the payout" onClick={() => setStage("name")} />
                  <Task done={hasPhone} label="Phone number" hint="Match reminders and prize claims" onClick={() => { setPhoneStep("phone"); setPhoneError(""); setStage("phone"); setTimeout(() => phoneRef.current?.focus(), 200); }} />
                  <Task done={hasAccount} label={accountLabel} hint={isValorant ? "So we can seed your bracket" : "Links your profile and match history"} onClick={connectAccount} busy={connecting === "account"} />
                </div>

                {/* Offer the account we already found on their Discord */}
                {!hasAccount && discordConns.some(c => c.type === (isValorant ? "riotgames" : "steam")) && (
                  <button onClick={() => linkFromDiscord(isValorant ? "riot" : "steam")} disabled={!!linkingFrom} style={{
                    background: "rgba(88,101,242,0.08)", border: "1px solid rgba(88,101,242,0.25)", borderRadius: 11,
                    padding: "11px 14px", color: "#a5b4fc", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}>
                    {linkingFrom ? "Linking…" : `Use ${discordConns.find(c => c.type === (isValorant ? "riotgames" : "steam"))?.name} from your Discord`}
                  </button>
                )}

                {error && <p style={{ color: UI.bad, fontSize: 12.5 }}>{error}</p>}

                <button onClick={finish} disabled={!setupComplete || loading} style={setupComplete && !loading ? cta : ctaMuted}>
                  {loading ? "Finishing…"
                    : setupComplete ? (isSubstitute ? "Join the substitute list" : "Complete registration")
                    : `${3 - tasksDone} left`}
                </button>
              </div>
            )}

            {/* ═══ NAME ═══ */}
            {resolved === "name" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <button onClick={() => setStage("hub")} style={{ alignSelf: "flex-start", background: "none", border: 0, color: UI.faint, fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>← Back</button>
                <div style={h1}>Name for the payout</div>
                <div style={body}>As it appears on your bank or UPI account.</div>
                <input autoFocus value={fullName} placeholder="Full name" style={field}
                  onChange={e => { setFullName(e.target.value); setLocalName(false); }}
                  onKeyDown={e => { if (e.key === "Enter" && fullName.trim().length >= 2) saveName(); }} />
                {error && <p style={{ color: UI.bad, fontSize: 12.5 }}>{error}</p>}
                <button onClick={saveName} disabled={nameSaving || fullName.trim().length < 2} style={fullName.trim().length >= 2 && !nameSaving ? cta : ctaMuted}>
                  {nameSaving ? "Saving…" : "Save"}
                </button>
              </div>
            )}

            {/* ═══ PHONE ═══ */}
            {resolved === "phone" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <button onClick={() => { if (phoneStep === "otp") { setPhoneStep("phone"); setOtp(["","","","","",""]); clearRecaptcha(); setVerificationId(""); } else setStage("hub"); }}
                  style={{ alignSelf: "flex-start", background: "none", border: 0, color: UI.faint, fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>← Back</button>

                {phoneStep === "phone" ? (
                  <>
                    <div style={h1}>Verify your phone</div>
                    <div style={body}>Match reminders and prize claims go here. One code, that&apos;s it.</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <select value={countryCode} onChange={e => setCountryCode(e.target.value)} style={{ ...field, flex: "0 0 96px", padding: "14px 8px", fontSize: 13 }}>
                        {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                      </select>
                      <input ref={phoneRef} type="tel" inputMode="numeric" placeholder="9876543210" maxLength={10} autoFocus
                        value={phoneNum} onChange={e => setPhoneNum(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        onKeyDown={e => { if (e.key === "Enter") sendOtp(); }} style={{ ...field, flex: 1 }} />
                    </div>
                    {phoneError && <p style={{ color: UI.bad, fontSize: 12.5 }}>{phoneError}</p>}
                    <button onClick={sendOtp} disabled={phoneLoading} style={phoneLoading ? ctaMuted : cta}>
                      {phoneLoading ? "Sending…" : "Send code"}
                    </button>
                  </>
                ) : (
                  <>
                    <div style={h1}>Enter the code</div>
                    <div style={body}>Sent to {countryCode} {phoneNum}</div>
                    <div style={{ display: "flex", gap: 7, justifyContent: "space-between" }} onPaste={handleOtpPaste}>
                      {otp.map((digit, i) => (
                        <input key={i} ref={el => { otpRefs.current[i] = el; }} type="tel" inputMode="numeric" maxLength={1} value={digit}
                          onChange={e => handleOtpChange(i, e.target.value)}
                          onKeyDown={e => { if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus(); }}
                          style={{ ...field, flex: 1, minWidth: 0, textAlign: "center", fontSize: 20, fontWeight: 700, padding: "13px 0" }}
                          onFocus={e => { e.currentTarget.style.borderColor = T.acc; }}
                          onBlur={e => { e.currentTarget.style.borderColor = "#222"; }} />
                      ))}
                    </div>
                    {phoneError && <p style={{ color: UI.bad, fontSize: 12.5, textAlign: "center" }}>{phoneError}</p>}
                    <button onClick={() => verifyOtpStr(otp.join(""))} disabled={phoneLoading} style={phoneLoading ? ctaMuted : cta}>
                      {phoneLoading ? "Verifying…" : "Verify"}
                    </button>
                    <button disabled={resendTimer > 0} onClick={() => { setOtp(["","","","","",""]); setPhoneError(""); clearRecaptcha(); setVerificationId(""); sendOtp(); }}
                      style={{ background: "none", border: 0, color: resendTimer > 0 ? "#333" : T.acc, fontSize: 12.5, fontWeight: 600, cursor: resendTimer > 0 ? "default" : "pointer", fontFamily: "inherit" }}>
                      {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend code"}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ═══ DONE ═══ */}
            {resolved === "done" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 15, textAlign: "center", padding: "12px 0" }}>
                <div style={{ fontSize: 46 }}>🏆</div>
                <div style={{ ...h1, textAlign: "center" }}>{isSubstitute ? "You're on the sub list" : "You're in"}</div>
                <div style={{ ...body, textAlign: "center" }}>
                  {isSubstitute
                    ? "We'll message you on Discord the moment a slot frees up."
                    : "Check Discord — your bracket and match times land there."}
                </div>
                {warning && (
                  <div style={{ ...panel, textAlign: "left" }}>
                    <p style={{ color: UI.warn, fontSize: 11.5, lineHeight: 1.6 }}>{warning}</p>
                  </div>
                )}
                <button onClick={onClose} style={cta}>Done</button>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
