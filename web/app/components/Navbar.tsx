"use client";

import { useAuth } from "../context/AuthContext";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  linkWithCredential,
  ConfirmationResult,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import Image from "next/image";

const games = [
  { id: "dota2",    name: "Dota 2",   path: "/dota2",    color: "#3B82F6", glow: "rgba(59,130,246,0.2)",  icon: "/dota2logo.png",    active: true  },
  { id: "valorant", name: "Valorant", path: "/valorant", color: "#ff4655", glow: "rgba(255,70,85,0.2)",  icon: "/valorantlogo.png", active: true },
  { id: "cs2",      name: "CS:Go",    path: "/cs2",      color: "#f0a500", glow: "rgba(240,165,0,0.2)",  icon: "/csgologo.png",     active: false },
  { id: "cod",      name: "COD",      path: "/cod",      color: "#22c55e", glow: "rgba(34,197,94,0.2)",  icon: "/codlogo.jpeg",     active: false },
];

const COUNTRIES = [
  { flag: "🇮🇳", code: "+91"  },
  { flag: "🇺🇸", code: "+1"   },
  { flag: "🇬🇧", code: "+44"  },
  { flag: "🇦🇪", code: "+971" },
  { flag: "🇸🇬", code: "+65"  },
  { flag: "🇦🇺", code: "+61"  },
];

const CACHE_KEY = "ie_user_data";

const DiscordIcon = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.114 18.1.132 18.114a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

type PhoneStep = "phone" | "otp";

export default function Navbar() {
  const { user, logout, riotData } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [steamData, setSteamData] = useState<any>(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; }
  });
  const [dropdownOpen,   setDropdownOpen]   = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [phoneStep,      setPhoneStep]      = useState<PhoneStep>("phone");
  const [phone,          setPhone]          = useState("");
  const [countryCode,    setCountryCode]    = useState("+91");
  const [otp,            setOtp]            = useState(["","","","","",""]);
  const [phoneError,     setPhoneError]     = useState("");
  const [phoneLoading,   setPhoneLoading]   = useState(false);
  const [resendTimer,    setResendTimer]    = useState(0);
  const [verificationId, setVerificationId] = useState("");

  const [hoveredAcc, setHoveredAcc] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phoneRef     = useRef<HTMLInputElement>(null);
  const otpRefs      = useRef<(HTMLInputElement | null)[]>([]);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleAccHoverIn = (id: string) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoveredAcc(id);
  };
  const handleAccHoverOut = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoveredAcc(null), 800);
  };

  useEffect(() => {
    if (!user) {
      localStorage.removeItem(CACHE_KEY);
      setSteamData(null);
      return;
    }
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSteamData(data);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            steamId: data.steamId, steamName: data.steamName, steamAvatar: data.steamAvatar,
            discordId: data.discordId, discordUsername: data.discordUsername, phone: data.phone,
            dotaRankTier: data.dotaRankTier, riotGameName: data.riotGameName, riotTagLine: data.riotTagLine,
            riotAvatar: data.riotAvatar, riotVerified: data.riotVerified,
          }));
        } catch (_) {}
      }
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const discord = searchParams.get("discord");
    if (discord === "linked" || discord === "error") router.replace(pathname);
  }, [searchParams]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);

  const activeGame = games.find((g) =>
    g.id === "dota2"
      ? pathname === "/dota2" || pathname === "/dashboard" || pathname.startsWith("/tournament")
      : pathname.startsWith(g.path)
  ) || games.find((g) => g.id === "valorant")!;

  const discordLinked   = !!steamData?.discordId;
  const discordUsername = steamData?.discordUsername || "";
  const hasPhone        = !!steamData?.phone;
  const hasSteam        = !!steamData?.steamId;
  const riotStatus      = riotData?.riotVerified || "unlinked";

  const unlinkedCount = [!hasSteam, !discordLinked, riotStatus === "unlinked", !hasPhone].filter(Boolean).length;

  const handleDiscordConnect = () => {
    if (!user) return;
    window.location.href = `/api/auth/discord?uid=${user.uid}`;
  };

  const clearRecaptcha = () => {
    try { recaptchaRef.current?.clear(); } catch (_) {}
    recaptchaRef.current = null;
    const el = document.getElementById("navbar-recaptcha");
    if (el) el.innerHTML = "";
  };

  const openPhoneModal = () => {
    setPhoneModalOpen(true); setPhoneStep("phone"); setPhoneError("");
    setDropdownOpen(false); setMobileMenuOpen(false);
    setTimeout(() => phoneRef.current?.focus(), 300);
  };

  const closePhoneModal = () => {
    setPhoneModalOpen(false); setPhone(""); setOtp(["","","","","",""]);
    setPhoneStep("phone"); setPhoneError(""); setVerificationId("");
    if (timerRef.current) clearInterval(timerRef.current);
    setResendTimer(0); clearRecaptcha();
  };

  const startTimer = () => {
    setResendTimer(30);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer(p => { if (p <= 1) { clearInterval(timerRef.current!); return 0; } return p - 1; });
    }, 1000);
  };

  const sendOtp = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8) { setPhoneError("Please enter a valid phone number."); return; }
    try {
      setPhoneLoading(true); setPhoneError("");
      clearRecaptcha();
      recaptchaRef.current = new RecaptchaVerifier(auth, "navbar-recaptcha", {
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
      await updateDoc(doc(db, "users", user.uid), { phone: `${countryCode}${phone.replace(/\D/g, "")}` });
      closePhoneModal();
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

  const AccBadge = ({ id, linked, pending, icon, iconEl, name, label, onClick }: {
    id: string; linked: boolean; pending?: boolean; icon?: string; iconEl?: React.ReactNode;
    name?: string; label: string; onClick?: () => void;
  }) => {
    const isHovered = hoveredAcc === id;
    const isUnlinked = !linked && !pending;

    return (
      <div
        className={`ie-acc2 ${linked ? "linked" : pending ? "pending" : "unlinked"}`}
        onMouseEnter={() => handleAccHoverIn(id)}
        onMouseLeave={handleAccHoverOut}
        onClick={onClick}
        style={{
          display: "flex", alignItems: "center", height: 36, borderRadius: 100,
          cursor: onClick ? "pointer" : "default", overflow: "hidden", flexShrink: 0,
          transition: isHovered
            ? "width 1.5s cubic-bezier(0.16,1,0.3,1), padding-right 1.5s cubic-bezier(0.16,1,0.3,1), background 0.3s, border-color 0.3s, box-shadow 0.3s"
            : "width 1.5s cubic-bezier(0.4,0,0.2,1), padding-right 1.5s cubic-bezier(0.4,0,0.2,1), background 0.3s, border-color 0.3s, box-shadow 0.3s",
          width: isHovered ? "auto" : 36, minWidth: 36,
          maxWidth: isHovered ? 220 : 36,
          paddingRight: isHovered ? 14 : 0,
          background: linked ? "rgba(22,163,74,0.12)" : pending ? "rgba(251,191,36,0.1)" : "rgba(239,68,68,0.1)",
          border: `1.5px ${isUnlinked ? "dashed" : "solid"} ${linked ? "rgba(34,197,94,0.3)" : pending ? "rgba(251,191,36,0.3)" : "rgba(239,68,68,0.35)"}`,
          ...(isUnlinked ? { animation: "ie-acc-pulse 2.5s ease-in-out infinite" } : {}),
        }}
      >
        <div style={{
          width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, margin: "0 2px",
          transition: "opacity 0.3s",
        }}>
          {iconEl || (icon && <img src={icon} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover", opacity: isUnlinked ? 0.4 : 1 }} />)}
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
          overflow: "hidden",
          opacity: isHovered ? 1 : 0,
          maxWidth: isHovered ? 180 : 0,
          transition: isHovered
            ? "opacity 0.8s cubic-bezier(0.16,1,0.3,1) 0.35s, max-width 1.5s cubic-bezier(0.16,1,0.3,1)"
            : "opacity 0.2s ease 0s, max-width 1.5s cubic-bezier(0.4,0,0.2,1)",
        }}>
          {linked ? (
            <>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#e0e0da", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
              <span style={{ fontSize: "0.56rem", fontWeight: 800, padding: "2px 6px", borderRadius: 20, background: "rgba(22,163,74,0.2)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }}>✓</span>
            </>
          ) : pending ? (
            <>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#fbbf24", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
              <span style={{ fontSize: "0.56rem", fontWeight: 800, padding: "2px 6px", borderRadius: 20, background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>Pending</span>
            </>
          ) : (
            <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#f87171" }}>Connect {label}</span>
          )}
        </div>

        {isUnlinked && (
          <div style={{
            position: "absolute", top: -3, right: -3, width: 11, height: 11,
            borderRadius: "50%", background: "#ef4444", border: "2px solid #0A0A0C",
            boxShadow: "0 0 4px rgba(239,68,68,0.5)",
            transition: "opacity 0.3s",
            opacity: isHovered ? 0 : 1,
            pointerEvents: "none",
          }} />
        )}
      </div>
    );
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        .ie-navbar { position: sticky; top: 0; z-index: 100; background: rgba(10,10,12,0.97); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-bottom: 1px solid #2A2A30; font-family: var(--font-geist-sans), system-ui, sans-serif; }
        .ie-nav-accent { height: 3px; transition: background 0.3s; }
        .ie-nav-row { display: flex; align-items: center; justify-content: space-between; padding: 0 28px; height: 62px; gap: 12px; }
        .ie-nav-logo { display: flex; align-items: center; gap: 10px; cursor: pointer; flex-shrink: 0; }
        .ie-nav-logo-name { font-size: 1.05rem; font-weight: 800; color: #F0EEEA; line-height: 1; }
        .ie-nav-logo-name span { color: #3B82F6; }
        .ie-nav-logo-sub { font-size: 0.58rem; color: #555550; letter-spacing: 0.14em; font-weight: 700; text-transform: uppercase; margin-top: 2px; }
        .ie-nav-tabs { display: flex; align-items: center; gap: 2px; flex: 1; justify-content: center; }
        .ie-nav-tab { display: flex; align-items: center; gap: 8px; padding: 7px 14px; border-radius: 10px; border: 1px solid transparent; background: transparent; cursor: pointer; font-size: 0.82rem; font-weight: 600; color: #8A8880; transition: all 0.2s; font-family: inherit; white-space: nowrap; }
        .ie-nav-tab:hover { background: #18181C; color: #bbb; }
        .ie-nav-tab img { width: 20px; height: 20px; object-fit: contain; border-radius: 5px; transition: all 0.2s; }
        .ie-nav-tab.active img { width: 26px; height: 26px; }
        .ie-nav-tab.active { font-size: 0.92rem; font-weight: 800; padding: 8px 18px; }
        .ie-soon-badge { font-size: 0.58rem; font-weight: 800; padding: 2px 7px; border-radius: 100px; background: #1a1a1f; color: #555550; }
        .ie-nav-right { display: flex; align-items: center; gap: 8px; }

        .ie-accounts-row2 { display: flex; align-items: center; gap: 5px; position: relative; }
        .ie-acc2 { position: relative; }

        @keyframes ie-acc-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); border-color: rgba(239,68,68,0.35); }
          50% { box-shadow: 0 0 0 5px rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.6); }
        }
        @keyframes ie-acc-fade-in {
          from { opacity: 0; transform: translateX(-6px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .ie-dropdown-wrap { position: relative; }
        .ie-dots-btn { width: 36px; height: 36px; border-radius: 100px; border: 1px solid #2A2A30; background: #121215; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px; transition: all 0.15s; flex-shrink: 0; position: relative; }
        .ie-dots-btn:hover { background: #18181C; }
        .ie-dots-btn span { width: 4px; height: 4px; border-radius: 50%; background: #8A8880; display: block; }
        .ie-dropdown { position: absolute; top: calc(100% + 10px); right: 0; background: #121215; border: 1px solid #2A2A30; border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); min-width: 276px; overflow: hidden; z-index: 200; animation: ie-dd-in 0.15s ease; }
        @keyframes ie-dd-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        .ie-dd-section { padding: 8px; border-bottom: 1px solid #1e1e22; }
        .ie-dd-section:last-child { border-bottom: none; }
        .ie-dd-label { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #555550; padding: 4px 8px 6px; display: block; }
        .ie-dd-item { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; font-size: 0.84rem; color: #ccc; font-weight: 500; }
        .ie-dd-btn { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; font-size: 0.84rem; font-weight: 700; background: none; border: none; cursor: pointer; font-family: inherit; transition: background 0.12s; text-align: left; color: #ddd; }
        .ie-dd-btn:hover { background: #1a1a1f; }
        .ie-dd-btn.discord { color: #818cf8; }
        .ie-dd-btn.discord:hover { background: rgba(99,102,241,0.1); }
        .ie-dd-btn.profile { color: #60a5fa; }
        .ie-dd-btn.profile:hover { background: rgba(96,165,250,0.1); }
        .ie-dd-btn.logout { color: #f87171; }
        .ie-dd-btn.logout:hover { background: rgba(239,68,68,0.1); }
        .ie-verified-badge { font-size: 0.62rem; color: #4ade80; font-weight: 800; background: rgba(22,163,74,0.15); padding: 2px 7px; border-radius: 20px; border: 1px solid rgba(34,197,94,0.3); }
        .ie-discord-verified { font-size: 0.62rem; color: #818cf8; font-weight: 800; background: rgba(99,102,241,0.12); padding: 2px 7px; border-radius: 20px; border: 1px solid rgba(99,102,241,0.3); }

        @media (max-width: 900px) { .ie-nav-tabs { display: none; } .ie-accounts-row2 { display: none; } }

        .ie-hamburger { display: none; flex-direction: column; gap: 5px; width: 36px; height: 36px; border: 1px solid #2A2A30; background: #121215; border-radius: 9px; cursor: pointer; align-items: center; justify-content: center; flex-shrink: 0; }
        .ie-hamburger span { display: block; width: 18px; height: 2px; background: #8A8880; border-radius: 2px; transition: all 0.2s; transform-origin: center; }
        @media (max-width: 900px) { .ie-hamburger { display: flex; } }

        .ie-mobile-drawer { display: none; flex-direction: column; background: #0A0A0C; border-top: 1px solid #1e1e22; padding: 10px 12px 16px; gap: 4px; }
        .ie-mobile-drawer.open { display: flex; }
        .ie-mobile-game-btn { display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 10px; border: 1px solid transparent; background: transparent; cursor: pointer; font-size: 0.9rem; font-weight: 600; color: #8A8880; transition: all 0.15s; font-family: inherit; width: 100%; text-align: left; }
        .ie-mobile-game-btn:hover { background: #18181C; color: #ddd; }
        .ie-mobile-game-btn img { width: 28px; height: 28px; object-fit: contain; border-radius: 6px; }
        .ie-mobile-divider { height: 1px; background: #1e1e22; margin: 6px 0; }
        .ie-mobile-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; font-size: 0.84rem; color: #8A8880; font-weight: 500; }
        .ie-mobile-action-btn { width: 100%; display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-radius: 10px; font-size: 0.88rem; font-weight: 700; border: 1px solid #2A2A30; cursor: pointer; font-family: inherit; background: #121215; color: #F0EEEA; margin-top: 2px; }
        .ie-mobile-action-btn:hover { background: #18181C; }
        .ie-mobile-connect-btn { width: 100%; display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-radius: 10px; font-size: 0.86rem; font-weight: 700; border: 1.5px dashed rgba(239,68,68,0.35); cursor: pointer; font-family: inherit; background: rgba(239,68,68,0.06); color: #f87171; margin-top: 2px; }
        .ie-mobile-connect-btn:hover { background: rgba(239,68,68,0.1); border-style: solid; }
        .ie-mobile-logout { width: 100%; display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-radius: 10px; font-size: 0.88rem; color: #f87171; font-weight: 700; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); cursor: pointer; font-family: inherit; margin-top: 4px; }
        .ie-mobile-logout:hover { background: rgba(239,68,68,0.14); }

        .ie-private-warning { background: rgba(146,64,14,0.12); border-bottom: 1px solid rgba(251,191,36,0.25); padding: 7px 28px; display: flex; align-items: flex-start; gap: 10px; }
        .ie-private-warning p { color: #fbbf24; font-size: 0.76rem; line-height: 1.5; }
        .ie-private-warning code { background: rgba(251,191,36,0.15); padding: 1px 5px; border-radius: 4px; font-size: 0.72rem; color: #fbbf24; }

        .ph-overlay { position: fixed; inset: 0; z-index: 999; background: rgba(0,0,0,.7); backdrop-filter: blur(4px); display: flex; align-items: flex-end; justify-content: center; }
        @media (min-width: 600px) { .ph-overlay { align-items: center; } }
        .ph-modal { background: #18181C; border-radius: 20px 20px 0 0; padding: 32px 28px 40px; width: 100%; max-width: 400px; position: relative; }
        @media (min-width: 600px) { .ph-modal { border-radius: 20px; } }
        .ph-close { position: absolute; top: 14px; right: 16px; background: #121215; border: 1px solid #2A2A30; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 1rem; color: #8A8880; display: flex; align-items: center; justify-content: center; }
        .ph-title { font-size: 1.4rem; font-weight: 900; margin-bottom: 6px; color: #F0EEEA; }
        .ph-sub { font-size: .85rem; color: #8A8880; margin-bottom: 24px; line-height: 1.5; }
        .ph-label { font-size: .8rem; font-weight: 600; color: #8A8880; margin-bottom: 6px; display: block; }
        .ph-row { display: flex; gap: 10px; margin-bottom: 16px; }
        .ph-select { flex: 0 0 96px; padding: 12px 8px; border: 1.5px solid #2A2A30; border-radius: 10px; font-family: inherit; font-size: .9rem; background: #121215; color: #F0EEEA; }
        .ph-input { flex: 1; padding: 12px 14px; border: 1.5px solid #2A2A30; border-radius: 10px; font-family: inherit; font-size: .95rem; outline: none; transition: border-color .2s; background: #121215; color: #F0EEEA; }
        .ph-input:focus { border-color: #3B82F6; }
        .ph-error { font-size: .8rem; color: #f87171; min-height: 18px; margin-bottom: 8px; }
        .ph-btn { width: 100%; background: #3B82F6; color: #fff; border: none; border-radius: 100px; padding: 14px; font-size: 1rem; font-weight: 700; cursor: pointer; font-family: inherit; }
        .ph-btn:hover { background: #2563EB; }
        .ph-btn:disabled { opacity: .6; cursor: not-allowed; }
        .ph-btn-back { background: none; border: none; color: #3B82F6; font-size: .86rem; font-weight: 600; cursor: pointer; font-family: inherit; margin-bottom: 18px; padding: 0; display: flex; align-items: center; gap: 4px; }
        .ph-otp-wrap { display: flex; gap: 8px; justify-content: space-between; margin-bottom: 4px; }
        .ph-otp-input { width: 44px; height: 52px; text-align: center; border: 1.5px solid #2A2A30; border-radius: 10px; font-size: 1.3rem; font-weight: 700; font-family: inherit; background: #121215; color: #F0EEEA; outline: none; transition: border-color .2s; }
        .ph-otp-input:focus { border-color: #3B82F6; }
        .ph-resend-row { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; }
        .ph-resend-btn { background: none; border: none; color: #3B82F6; font-size: .82rem; font-weight: 600; cursor: pointer; font-family: inherit; }
        .ph-resend-btn:disabled { color: #555550; cursor: default; }
      `}</style>

      <nav className="ie-navbar">
        <div className="ie-nav-accent" style={{ background: activeGame?.color || "#3B82F6" }} />
        <div className="ie-nav-row">

          <div className="ie-nav-logo" onClick={() => router.push(activeGame?.path || "/valorant")}>
            <Image src="/ielogo.png" alt="Indian Esports" width={36} height={36} style={{ borderRadius: 8 }} />
            <div>
              <div className="ie-nav-logo-name">Indian <span>Esports</span></div>
              <div className="ie-nav-logo-sub">Competitive Gaming</div>
            </div>
          </div>

          <div className="ie-nav-tabs">
            {games.map((g) => {
              const isActive = activeGame?.id === g.id;
              return (
                <button key={g.id} className={`ie-nav-tab${isActive ? " active" : ""}`} onClick={() => router.push(g.path)}
                  style={isActive ? {
                    background: `${g.color}14`,
                    border: `1.5px solid ${g.color}40`,
                    color: g.color,
                    boxShadow: `0 2px 16px ${g.glow}, inset 0 0 0 1px ${g.color}10`,
                  } : {}}>
                  <img src={g.icon} alt={g.name} style={{ filter: isActive ? "none" : "grayscale(100%) brightness(45%) opacity(60%)" }} />
                  <span>{g.name}</span>
                  {!g.active && <span className="ie-soon-badge">Soon</span>}
                </button>
              );
            })}
          </div>

          <div className="ie-nav-right">
            <div className="ie-accounts-row2">
              <AccBadge
                id="steam"
                linked={hasSteam}
                icon={hasSteam ? (steamData?.steamAvatar || "https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg") : "https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg"}
                name={steamData?.steamName}
                label="Steam"
                onClick={hasSteam ? undefined : () => { window.location.href = `/api/auth/steam?uid=${user?.uid}`; }}
              />
              <AccBadge
                id="discord"
                linked={discordLinked}
                iconEl={<DiscordIcon size={18} color={discordLinked ? "#818cf8" : "#555550"} />}
                name={discordUsername}
                label="Discord"
                onClick={discordLinked ? undefined : handleDiscordConnect}
              />
              <AccBadge
                id="riot"
                linked={riotStatus === "verified"}
                pending={riotStatus === "pending"}
                icon={riotData?.riotAvatar || "/riot-games.png"}
                name={riotData?.riotGameName ? `${riotData.riotGameName}#${riotData.riotTagLine}` : undefined}
                label="Riot ID"
                onClick={() => router.push("/connect-riot")}
              />
            </div>

            <div className="ie-dropdown-wrap" ref={dropdownRef}>
              <button className="ie-dots-btn" onClick={() => setDropdownOpen(p => !p)} aria-label="More options">
                <span /><span /><span />
                {unlinkedCount > 0 && (
                  <div style={{
                    position: "absolute", top: -4, right: -4, minWidth: 16, height: 16,
                    borderRadius: 100, background: "#dc2626", border: "2px solid #0A0A0C",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.52rem", fontWeight: 900, color: "#fff",
                  }}>{unlinkedCount}</div>
                )}
              </button>

              {dropdownOpen && (
                <div className="ie-dropdown">
                  {unlinkedCount > 0 && (
                    <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.08)", borderBottom: "1px solid rgba(239,68,68,0.2)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
                        <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#f87171" }}>{unlinkedCount} account{unlinkedCount > 1 ? "s" : ""} not connected</span>
                      </div>
                      <p style={{ fontSize: "0.64rem", color: "#555550", lineHeight: 1.5 }}>Connect all accounts to participate in tournaments and receive notifications.</p>
                    </div>
                  )}

                  {hasSteam && (
                    <div className="ie-dd-section">
                      <span className="ie-dd-label">Steam</span>
                      <div className="ie-dd-item">
                        <img src={steamData.steamAvatar} alt="" style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid #22c55e" }} />
                        <span style={{ fontWeight: 600, color: "#e0e0da", fontSize: "0.85rem", flex: 1 }}>{steamData.steamName}</span>
                        <span className="ie-verified-badge">✓</span>
                      </div>
                    </div>
                  )}
                  {!hasSteam && (
                    <div className="ie-dd-section">
                      <span className="ie-dd-label">Steam</span>
                      <button className="ie-dd-btn" onClick={() => { window.location.href = `/api/auth/steam?uid=${user?.uid}`; setDropdownOpen(false); }} style={{ color: "#f87171" }}>
                        <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" alt="" style={{ width: 18, height: 18, opacity: 0.5 }} />
                        Connect Steam
                        <span style={{ marginLeft: "auto", fontSize: "0.58rem", fontWeight: 800, padding: "2px 6px", borderRadius: 100, background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }}>Required</span>
                      </button>
                    </div>
                  )}

                  <div className="ie-dd-section">
                    <span className="ie-dd-label">Phone</span>
                    {hasPhone ? (
                      <div className="ie-dd-item">
                        <span style={{ fontSize: 16 }}>📱</span>
                        <span style={{ fontWeight: 600, color: "#ddd", fontSize: "0.84rem", flex: 1 }}>
                          {steamData.phone.replace(/(\+\d{1,3})(\d{3})(\d+)(\d{3})$/, (_: string, code: string, a: string, _m: string, last: string) => `${code} ${a}*****${last}`)}
                        </span>
                        <span className="ie-verified-badge">✓</span>
                      </div>
                    ) : (
                      <button className="ie-dd-btn" onClick={openPhoneModal} style={{ color: "#f87171" }}>
                        <span style={{ fontSize: 16 }}>📱</span> Connect Phone Number
                        <span style={{ marginLeft: "auto", fontSize: "0.58rem", fontWeight: 800, padding: "2px 6px", borderRadius: 100, background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }}>Required</span>
                      </button>
                    )}
                  </div>

                  <div className="ie-dd-section">
                    <span className="ie-dd-label">Riot / Valorant</span>
                    {riotStatus === "verified" ? (
                      <div className="ie-dd-item">
                        <img src={riotData?.riotAvatar || "/riot-games.png"} alt="" style={{ width: 28, height: 28, borderRadius: 6, border: "2px solid #22c55e" }} />
                        <span style={{ flex: 1, fontWeight: 600, color: "#e0e0da", fontSize: "0.85rem" }}>{riotData?.riotGameName}#{riotData?.riotTagLine}</span>
                        <span className="ie-verified-badge">✓</span>
                      </div>
                    ) : riotStatus === "pending" ? (
                      <div className="ie-dd-item">
                        <img src={riotData?.riotAvatar || "/riot-games.png"} alt="" style={{ width: 28, height: 28, borderRadius: 6, border: "2px solid #f59e0b" }} />
                        <span style={{ flex: 1, fontWeight: 600, color: "#e0e0da", fontSize: "0.85rem" }}>{riotData?.riotGameName}#{riotData?.riotTagLine}</span>
                        <span style={{ fontSize: "0.62rem", color: "#fbbf24", fontWeight: 800, background: "rgba(251,191,36,0.12)", padding: "2px 7px", borderRadius: 20, border: "1px solid rgba(251,191,36,0.3)" }}>Pending</span>
                      </div>
                    ) : (
                      <button className="ie-dd-btn" onClick={() => { router.push("/connect-riot"); setDropdownOpen(false); }} style={{ color: "#f87171" }}>
                        <img src="/riot-games.png" alt="" style={{ width: 18, height: 18, borderRadius: 3, opacity: 0.5 }} />
                        Connect Riot ID
                        <span style={{ marginLeft: "auto", fontSize: "0.58rem", fontWeight: 800, padding: "2px 6px", borderRadius: 100, background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }}>Required</span>
                      </button>
                    )}
                  </div>

                  <div className="ie-dd-section">
                    <span className="ie-dd-label">Discord</span>
                    {discordLinked ? (
                      <div className="ie-dd-item">
                        <DiscordIcon size={18} color="#818cf8" />
                        <span style={{ flex: 1, fontWeight: 600, color: "#818cf8" }}>{discordUsername}</span>
                        <span className="ie-discord-verified">✓</span>
                      </div>
                    ) : (
                      <button className="ie-dd-btn discord" onClick={() => { handleDiscordConnect(); setDropdownOpen(false); }}>
                        <DiscordIcon size={18} color="#818cf8" /> Connect Discord
                        <span style={{ marginLeft: "auto", fontSize: "0.58rem", fontWeight: 800, padding: "2px 6px", borderRadius: 100, background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }}>Required</span>
                      </button>
                    )}
                  </div>

                  <div className="ie-dd-section" style={{ padding: "10px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <button className="ie-dd-btn profile"
                      onClick={() => { router.push(`/player/${user?.uid}`); setDropdownOpen(false); }}
                      style={{ justifyContent: "center", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: "100px", padding: "10px 0" }}>
                      👤 Profile
                    </button>
                    <button className="ie-dd-btn logout"
                      onClick={async () => { await logout(); setDropdownOpen(false); }}
                      style={{ justifyContent: "center", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "100px", padding: "10px 0" }}>
                      🚪 Logout
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button className="ie-hamburger" onClick={() => setMobileMenuOpen(p => !p)} aria-label="Toggle menu">
              <span style={{ transform: mobileMenuOpen ? "rotate(45deg) translate(5px, 5px)" : "none" }} />
              <span style={{ opacity: mobileMenuOpen ? 0 : 1 }} />
              <span style={{ transform: mobileMenuOpen ? "rotate(-45deg) translate(5px, -5px)" : "none" }} />
            </button>
          </div>
        </div>

        <div className={`ie-mobile-drawer${mobileMenuOpen ? " open" : ""}`}>
          {games.map((g) => {
            const isActive = activeGame?.id === g.id;
            return (
              <button key={g.id} className="ie-mobile-game-btn" onClick={() => router.push(g.path)}
                style={isActive ? { background: `${g.color}10`, border: `1px solid ${g.color}30`, color: g.color } : {}}>
                <img src={g.icon} alt={g.name} style={{ filter: isActive ? "none" : "grayscale(100%) brightness(45%)" }} />
                <span style={{ flex: 1 }}>{g.name}</span>
                {!g.active && <span className="ie-soon-badge">Soon</span>}
              </button>
            );
          })}
          <div className="ie-mobile-divider" />

          {hasSteam ? (
            <div className="ie-mobile-row">
              <img src={steamData.steamAvatar} alt="" style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid #22c55e" }} />
              <span style={{ flex: 1, fontWeight: 600, color: "#e0e0da" }}>{steamData.steamName}</span>
              <span className="ie-verified-badge">✓</span>
            </div>
          ) : (
            <button className="ie-mobile-connect-btn" onClick={() => { window.location.href = `/api/auth/steam?uid=${user?.uid}`; }}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" alt="" style={{ width: 20, height: 20, opacity: 0.5 }} />
              Connect Steam
              <span style={{ marginLeft: "auto", fontSize: "0.6rem", fontWeight: 800, color: "#f87171" }}>Required</span>
            </button>
          )}

          {discordLinked ? (
            <div className="ie-mobile-row">
              <DiscordIcon size={18} color="#818cf8" />
              <span style={{ flex: 1, fontWeight: 600, color: "#818cf8" }}>{discordUsername}</span>
              <span className="ie-discord-verified">✓</span>
            </div>
          ) : (
            <button className="ie-mobile-connect-btn" onClick={handleDiscordConnect} style={{ borderColor: "rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.06)", color: "#818cf8" }}>
              <DiscordIcon size={20} color="#818cf8" /> Connect Discord
              <span style={{ marginLeft: "auto", fontSize: "0.6rem", fontWeight: 800, color: "#f87171" }}>Required</span>
            </button>
          )}

          {riotStatus === "verified" ? (
            <div className="ie-mobile-row">
              <img src={riotData?.riotAvatar || "/riot-games.png"} alt="" style={{ width: 22, height: 22, borderRadius: 4 }} />
              <span style={{ flex: 1, fontWeight: 600, color: "#ff4655" }}>{riotData?.riotGameName}#{riotData?.riotTagLine}</span>
              <span className="ie-verified-badge">✓</span>
            </div>
          ) : (
            <button className="ie-mobile-connect-btn" onClick={() => router.push("/connect-riot")} style={{ borderColor: "rgba(255,70,85,0.3)", background: "rgba(255,70,85,0.06)", color: "#ff4655" }}>
              <img src="/riot-games.png" alt="" style={{ width: 20, height: 20, borderRadius: 3, opacity: 0.6 }} />
              Connect Riot ID
              <span style={{ marginLeft: "auto", fontSize: "0.6rem", fontWeight: 800, color: "#f87171" }}>Required</span>
            </button>
          )}

          {hasPhone ? (
            <div className="ie-mobile-row">
              <span style={{ fontSize: 16 }}>📱</span>
              <span style={{ fontWeight: 600, flex: 1 }}>{steamData?.phone}</span>
              <span className="ie-verified-badge">✓</span>
            </div>
          ) : (
            <button className="ie-mobile-action-btn" onClick={openPhoneModal}>
              <span style={{ fontSize: 16 }}>📱</span> Connect Phone Number
            </button>
          )}

          <button className="ie-mobile-logout" onClick={async () => { await logout(); }}>
            <span style={{ fontSize: 16 }}>🚪</span> Logout
          </button>
        </div>

        {pathname?.startsWith("/dota") && steamData?.steamId && (!steamData?.dotaRankTier || steamData?.dotaRankTier === 0) && (
          <div className="ie-private-warning">
            <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
            <p><strong>Your Dota 2 profile is private.</strong> Enable <code>Expose Public Match Data</code> in Dota 2 → Settings → Social. Play one match. Changes take up to 24 hours.</p>
          </div>
        )}
      </nav>

      <div id="navbar-recaptcha" />

      {phoneModalOpen && (
        <div className="ph-overlay" onClick={e => { if (e.target === e.currentTarget) closePhoneModal(); }}>
          <div className="ph-modal">
            <button className="ph-close" onClick={closePhoneModal}>✕</button>
            {phoneStep === "phone" && (
              <>
                <div className="ph-title">Connect Phone 📱</div>
                <div className="ph-sub">Add a phone number for notifications and account recovery.</div>
                <label className="ph-label">Phone Number</label>
                <div className="ph-row">
                  <select className="ph-select" value={countryCode} onChange={e => setCountryCode(e.target.value)}>
                    {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                  </select>
                  <input ref={phoneRef} className="ph-input" type="tel" inputMode="numeric" placeholder="9876543210"
                    value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    onKeyDown={e => { if (e.key === "Enter") sendOtp(); }} maxLength={10} autoComplete="tel" />
                </div>
                <div className="ph-error">{phoneError}</div>
                <button className="ph-btn" onClick={sendOtp} disabled={phoneLoading}>
                  {phoneLoading ? "Sending OTP…" : "Send OTP →"}
                </button>
              </>
            )}
            {phoneStep === "otp" && (
              <>
                <button className="ph-btn-back" onClick={() => { setPhoneStep("phone"); setPhoneError(""); setOtp(["","","","","",""]); clearRecaptcha(); setVerificationId(""); }}>← Back</button>
                <div className="ph-title">Enter OTP</div>
                <div className="ph-sub">6-digit code sent to {countryCode} {phone}</div>
                <div className="ph-otp-wrap" onPaste={handleOtpPaste}>
                  {otp.map((digit, i) => (
                    <input key={i} ref={el => { otpRefs.current[i] = el; }} className="ph-otp-input"
                      type="tel" inputMode="numeric" maxLength={1} value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)} />
                  ))}
                </div>
                <div className="ph-error">{phoneError}</div>
                <button className="ph-btn" onClick={() => verifyOtpStr(otp.join(""))} disabled={phoneLoading} style={{ marginTop: 8 }}>
                  {phoneLoading ? "Linking…" : "Verify & Link ✓"}
                </button>
                <div className="ph-resend-row">
                  <button className="ph-resend-btn" disabled={resendTimer > 0}
                    onClick={() => { setOtp(["","","","","",""]); setPhoneError(""); clearRecaptcha(); setVerificationId(""); sendOtp(); }}>
                    Resend OTP
                  </button>
                  {resendTimer > 0 && <span style={{ fontSize: ".82rem", color: "#555550" }}>Resend in {resendTimer}s</span>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export { Navbar };