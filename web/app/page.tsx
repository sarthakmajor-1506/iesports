"use client";

import { useState, useEffect, useRef } from "react";
import { auth, db } from "@/lib/firebase";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import {
  doc, setDoc,
  collection, query, where, getDocs,
} from "firebase/firestore";
import { useAuth } from "./context/AuthContext";
import { useRouter } from "next/navigation";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────
type ModalStep = "phone" | "otp";

interface Tournament {
  id: string;
  name: string;
  game: string;
  month: string;
  status: string;
  prizePool: string;
  entry: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
  totalSlots: number;
  slotsBooked: number;
  desc: string;
}

const COUNTRIES = [
  { flag: "🇮🇳", code: "+91"  },
  { flag: "🇺🇸", code: "+1"   },
  { flag: "🇬🇧", code: "+44"  },
  { flag: "🇦🇪", code: "+971" },
  { flag: "🇸🇬", code: "+65"  },
  { flag: "🇦🇺", code: "+61"  },
];

const HOW_IT_WORKS = [
  {
    icon: "🔗",
    title: "Connect & Join",
    desc: "Link your Steam account once. Then browse tournaments and register, no repeated setup needed.",
    color: "#3b82f6",
  },
  {
    icon: "⚔️",
    title: "5v5 and Solo Mode",
    desc: "Play 5v5 team tournaments in your rank bracket, or climb the leaderboard solo on your own schedule.",
    color: "#f97316",
  },
  {
    icon: "📊",
    title: "Automated Results",
    desc: "We track your match results automatically. Just play your game as usual, no manual reporting.",
    color: "#8b5cf6",
  },
  {
    icon: "🏆",
    title: "Get Rewarded",
    desc: "Once a tournament ends you are rewarded based on your score. Prizes paid instantly via UPI.",
    color: "#22c55e",
  },
];

export default function Home() {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const [phone, setPhone]             = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [otp, setOtp]                 = useState(["","","","","",""]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [modalStep, setModalStep]     = useState<ModalStep>("phone");
  const [modalOpen, setModalOpen]     = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // ── Tournament ───────────────────────────────────────────────────────────────
  const [featuredTournament, setFeaturedTournament] = useState<Tournament | null>(null);
  const [tournamentLoading, setTournamentLoading]   = useState(true);

  // ── Active nav section ───────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState("");

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const otpRefs    = useRef<(HTMLInputElement | null)[]>([]);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const phoneRef   = useRef<HTMLInputElement>(null);
  const videoRef   = useRef<HTMLVideoElement>(null);

  const { user } = useAuth();
  const router   = useRouter();
  useEffect(() => { if (user) router.push("/dashboard"); }, [user, router]);

  // ── Fetch tournament ─────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchTournament = async () => {
      try {
        const q = query(
          collection(db, "tournaments"),
          where("status", "==", "upcoming")
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament));
          all.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
          setFeaturedTournament(all[0]);
        }
      } catch (e) {
        console.error("Tournament fetch error:", e);
      } finally {
        setTournamentLoading(false);
      }
    };
    fetchTournament();
  }, []);

  // ── Scroll-spy for nav highlight ─────────────────────────────────────────────
  useEffect(() => {
    const sections = ["games", "how-it-works", "tournament"];
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) setActiveSection(e.target.id);
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  // ── Fade-up observer — FIXED: lower threshold + rootMargin so all cards trigger ──
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add("visible");
      }),
      { threshold: 0.05, rootMargin: "0px 0px -20px 0px" }
    );
    document.querySelectorAll(".fade-up").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // ── Video autoplay ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // ── Modal ────────────────────────────────────────────────────────────────────
  const openModal = () => {
    setModalOpen(true); setModalStep("phone"); setError("");
    setTimeout(() => phoneRef.current?.focus(), 300);
  };
  const closeModal = () => {
    setModalOpen(false); setError(""); setPhone(""); setOtp(["","","","","",""]);
    setModalStep("phone");
    if (timerRef.current) clearInterval(timerRef.current); setResendTimer(0);
  };

  // ── Firebase OTP ─────────────────────────────────────────────────────────────
  const setupRecaptcha = () => {
    if (!(window as any).recaptchaVerifier) {
      (window as any).recaptchaVerifier = new RecaptchaVerifier(
        auth, "recaptcha-container", { size: "invisible" }
      );
      (window as any).recaptchaVerifier.render();
    }
  };

  const sendOtp = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8) { setError("Please enter a valid phone number."); return; }
    try {
      setLoading(true); setError("");
      setupRecaptcha();
      const result = await signInWithPhoneNumber(auth, `${countryCode}${digits}`, (window as any).recaptchaVerifier);
      (window as any).confirmationResult = result;
      setModalStep("otp"); startResendTimer();
      setTimeout(() => otpRefs.current[0]?.focus(), 150);
    } catch (e: any) {
      setError(e.message || "Error sending OTP."); (window as any).recaptchaVerifier = null;
    } finally { setLoading(false); }
  };

  const verifyOtpStr = async (s: string) => {
    if (s.length < 6) { setError("Please enter the complete 6-digit OTP."); return; }
    try {
      setLoading(true); setError("");
      const result = await (window as any).confirmationResult.confirm(s);
      const u = result.user;
      await setDoc(doc(db, "users", u.uid), { phone: u.phoneNumber, createdAt: new Date() }, { merge: true });
    } catch { setError("Invalid OTP. Please try again."); }
    finally { setLoading(false); }
  };

  const verifyOtp = () => verifyOtpStr(otp.join(""));

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
    if (p.length === 6) { setOtp(p.split("")); e.preventDefault(); setTimeout(() => otpRefs.current[5]?.focus(), 50); }
  };

  const startResendTimer = () => {
    setResendTimer(30);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer(p => { if (p <= 1) { clearInterval(timerRef.current!); return 0; } return p - 1; });
    }, 1000);
  };
  const resendOtp = async () => {
    if (resendTimer > 0) return;
    (window as any).recaptchaVerifier = null;
    setOtp(["","","","","",""]); setError(""); await sendOtp();
  };

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, []);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const slotsLeft = featuredTournament ? featuredTournament.totalSlots - featuredTournament.slotsBooked : null;
  const slotPct   = featuredTournament ? Math.round((featuredTournament.slotsBooked / featuredTournament.totalSlots) * 100) : 0;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        :root {
          --orange:#F05A28; --orange-dark:#D44A1A;
          --off-white:#F8F7F4; --surface2:#F2F1EE;
          --text-primary:#111; --text-secondary:#555; --text-muted:#888;
          --border:#E5E3DF; --radius:14px; --radius-sm:8px;
          --shadow:0 2px 16px rgba(0,0,0,.08); --shadow-lg:0 8px 40px rgba(0,0,0,.16);
        }
        html { scroll-behavior:smooth; }
        body { font-family:var(--font-geist-sans),system-ui,sans-serif; background:#fff; color:var(--text-primary); overflow-x:hidden; }

        /* ── Navbar ── */
        .ie-nav {
          position:sticky; top:0; z-index:100;
          background:rgba(255,255,255,.96);
          backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
          border-bottom:1px solid var(--border);
          padding:0 20px; height:52px;
          display:grid;
          grid-template-columns:auto 1fr auto;
          align-items:center; gap:20px;
        }
        .ie-nav-brand { display:flex; align-items:center; gap:10px; text-decoration:none; }
        .ie-nav-name { font-size:1.05rem; font-weight:800; color:var(--text-primary); line-height:1; }
        .ie-nav-name span { color:var(--orange); }
        .ie-nav-links { display:flex; align-items:center; gap:4px; justify-content:flex-start; }
        .ie-nav-link {
          color:var(--text-secondary); font-size:.84rem; font-weight:600;
          padding:6px 12px; border-radius:7px;
          transition:background .15s,color .15s; cursor:pointer; border:none; background:none; font-family:inherit; white-space:nowrap;
        }
        .ie-nav-link:hover { background:var(--surface2); color:var(--text-primary); }
        .ie-nav-link.active { color:var(--orange); background:rgba(240,90,40,.08); }
        .ie-btn-login {
          background:var(--orange); color:#fff; border:none; border-radius:100px;
          padding:8px 20px; font-size:.84rem; font-weight:700;
          cursor:pointer; font-family:inherit; min-height:36px;
          transition:background .2s, transform .1s; justify-self:end;
        }
        .ie-btn-login:hover { background:var(--orange-dark); }
        .ie-btn-login:active { transform:scale(.97); }
        @media (max-width:640px) { .ie-nav-links { display:none; } .ie-nav { padding:0 16px; grid-template-columns:auto auto; } }

        /* ── Hero — 25% smaller ── */
        .ie-hero {
          position:relative; overflow:hidden;
          padding:30px 20px 33px;
          min-height:38svh;
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          text-align:center;
        }
        .ie-hero-video {
          position:absolute; inset:0; width:100%; height:100%;
          object-fit:cover; z-index:0;
          pointer-events:none;
        }
        .ie-hero-overlay {
          position:absolute; inset:0; z-index:1;
          background:linear-gradient(to bottom,
            rgba(0,0,0,.72) 0%,
            rgba(0,0,0,.58) 50%,
            rgba(0,0,0,.80) 100%);
        }
        .ie-hero-glow { position:absolute; top:-60px; left:50%; transform:translateX(-50%); width:560px; height:560px; background:radial-gradient(circle,rgba(240,90,40,.22) 0%,transparent 70%); pointer-events:none; z-index:2; }
        .ie-hero-content { position:relative; z-index:3; max-width:700px; width:100%; }
        .ie-hero-logo { margin-bottom:12px; display:flex; justify-content:center; }
        .ie-hero-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(240,90,40,.16); border:1px solid rgba(240,90,40,.38); color:#ff7043; font-size:.72rem; font-weight:700; padding:5px 14px; border-radius:100px; margin-bottom:12px; letter-spacing:.06em; text-transform:uppercase; }
        .ie-pulse { width:6px; height:6px; background:var(--orange); border-radius:50%; animation:ie-pulse 1.8s infinite; flex-shrink:0; }
        @keyframes ie-pulse { 0%,100%{opacity:1;} 50%{opacity:.3;} }
        .ie-hero h1 { font-size:clamp(1.7rem,5.5vw,3.6rem); font-weight:900; line-height:1.02; color:#fff; letter-spacing:-.02em; margin-bottom:10px; }
        .ie-hero h1 .accent { color:var(--orange); }
        .ie-hero-sub { font-size:clamp(.82rem,1.8vw,.95rem); color:rgba(255,255,255,.64); line-height:1.7; max-width:520px; margin:0 auto 20px; }
        .ie-hero-cta { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
        .ie-btn-primary { background:var(--orange); color:#fff; border:none; border-radius:100px; padding:11px 24px; font-size:.9rem; font-weight:700; cursor:pointer; font-family:inherit; min-height:44px; transition:background .2s,transform .1s; display:inline-flex; align-items:center; gap:8px; box-shadow:0 4px 22px rgba(240,90,40,.45); }
        .ie-btn-primary:hover { background:var(--orange-dark); }
        .ie-btn-primary:active { transform:scale(.97); }
        .ie-btn-secondary { background:rgba(255,255,255,.1); color:#fff; border:1.5px solid rgba(255,255,255,.3); border-radius:100px; padding:11px 24px; font-size:.9rem; font-weight:600; cursor:pointer; font-family:inherit; min-height:44px; transition:background .2s,border-color .2s; display:inline-flex; align-items:center; gap:8px; text-decoration:none; backdrop-filter:blur(4px); }
        .ie-btn-secondary:hover { border-color:rgba(255,255,255,.6); background:rgba(255,255,255,.16); }
        .ie-hero-stats { position:relative; z-index:3; display:flex; justify-content:center; gap:28px; margin-top:24px; flex-wrap:wrap; }
        .ie-stat { text-align:center; }
        .ie-stat-num { font-size:1.45rem; font-weight:900; color:#fff; display:block; }
        .ie-stat-num span { color:var(--orange); }
        .ie-stat-label { font-size:.65rem; color:rgba(255,255,255,.44); text-transform:uppercase; letter-spacing:.08em; }
        @media (max-width:480px) {
          .ie-hero { min-height:75svh; padding:30px 18px 30px; }
          .ie-hero-cta { flex-direction:column; align-items:stretch; }
          .ie-btn-primary,.ie-btn-secondary { width:100%; justify-content:center; }
          .ie-hero-stats { gap:16px; margin-top:20px; }
        }

        /* ── Trust ── */
        .ie-trust { background:var(--surface2); border-top:1px solid var(--border); border-bottom:1px solid var(--border); padding:20px 20px; }
        .ie-trust-items { display:flex; justify-content:center; align-items:center; flex-wrap:wrap; gap:22px; max-width:900px; margin:0 auto; }
        .ie-trust-item { display:flex; align-items:center; gap:8px; }
        .ie-trust-text { font-size:.83rem; font-weight:600; color:var(--text-secondary); }

        /* ── Section commons ── */
        .ie-section { padding:72px 20px; }
        .ie-section-light { background:var(--off-white); }
        .ie-section-white { background:#fff; }
        .ie-section-title { font-size:clamp(1.75rem,4.5vw,2.7rem); font-weight:900; color:var(--text-primary); letter-spacing:-.02em; }
        .ie-section-title .accent { color:var(--orange); }
        .ie-section-sub { font-size:1rem; color:var(--text-secondary); margin-top:8px; max-width:480px; }
        .ie-section-header { margin-bottom:44px; }
        .ie-container { max-width:1120px; margin:0 auto; }

        /* ── Game cards ── */
        .ie-games-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
        @media (max-width:900px) { .ie-games-grid { grid-template-columns:repeat(2,1fr); } }
        @media (max-width:480px) { .ie-games-grid { grid-template-columns:1fr; } }
        .ie-game-card { border-radius:var(--radius); overflow:hidden; position:relative; aspect-ratio:3/4; cursor:pointer; transition:transform .25s; box-shadow:var(--shadow); }
        .ie-game-card:hover { transform:translateY(-6px); box-shadow:var(--shadow-lg); }
        .ie-game-card:active { transform:scale(.98); }
        .ie-game-overlay { position:absolute; inset:0; background:linear-gradient(to top,rgba(0,0,0,.92) 0%,rgba(0,0,0,.08) 55%,transparent 100%); }
        .ie-game-info { position:absolute; bottom:0; left:0; right:0; padding:20px 16px 18px; }
        .ie-game-tag { display:inline-block; background:var(--orange); color:#fff; font-size:.62rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; padding:3px 8px; border-radius:4px; margin-bottom:6px; }
        .ie-game-tag.soon { background:rgba(255,255,255,.18); backdrop-filter:blur(4px); }
        .ie-game-name { font-size:1.25rem; font-weight:900; color:#fff; }
        .ie-game-card-img { transition:transform .45s; }
        .ie-game-card:hover .ie-game-card-img { transform:scale(1.05); }

        /* ── How It Works — FIXED: always visible, no delay stagger ── */
        .ie-hiw-grid {
          display:grid;
          grid-template-columns:repeat(4,1fr);
          gap:20px;
        }
        @media (max-width:900px) { .ie-hiw-grid { grid-template-columns:repeat(2,1fr); } }
        @media (max-width:480px) { .ie-hiw-grid { grid-template-columns:1fr; } }
        .ie-hiw-card {
          background:#fff; border-radius:20px;
          overflow:hidden; display:flex; flex-direction:column;
          box-shadow:0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.06);
          transition:transform .2s, box-shadow .2s;
          border:1px solid var(--border);
          /* Always visible — never rely on fade-up observer for grid children */
          opacity:1 !important; transform:none !important;
        }
        .ie-hiw-card:hover { transform:translateY(-4px) !important; box-shadow:0 8px 32px rgba(0,0,0,.1); }
        .ie-hiw-img-wrap {
          height:160px; display:flex; align-items:center; justify-content:center;
          position:relative; overflow:hidden;
        }
        .ie-hiw-icon-big { font-size:3.5rem; z-index:1; filter:drop-shadow(0 4px 12px rgba(0,0,0,.2)); }
        .ie-hiw-body { padding:22px 20px 24px; flex:1; }
        .ie-hiw-title { font-size:1.05rem; font-weight:800; color:var(--text-primary); margin-bottom:10px; }
        .ie-hiw-desc { font-size:.87rem; color:var(--text-secondary); line-height:1.68; }

        /* ── Tournament ── */
        .ie-tourn-wrap { background:#111; border-radius:20px; overflow:hidden; position:relative; padding:48px 44px; display:flex; align-items:center; justify-content:space-between; gap:40px; flex-wrap:wrap; }
        .ie-tourn-glow { position:absolute; right:-60px; top:50%; transform:translateY(-50%); width:380px; height:380px; background:radial-gradient(circle,rgba(240,90,40,.22) 0%,transparent 70%); pointer-events:none; }
        .ie-tourn-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(240,90,40,.2); border:1px solid rgba(240,90,40,.4); color:#ff7043; font-size:.72rem; font-weight:700; padding:4px 12px; border-radius:100px; margin-bottom:16px; text-transform:uppercase; letter-spacing:.07em; }
        .ie-tourn-title { font-size:clamp(1.8rem,4.5vw,3rem); font-weight:900; color:#fff; line-height:1.05; margin-bottom:20px; }
        .ie-tourn-title .accent { color:var(--orange); }
        .ie-tourn-meta { display:flex; flex-wrap:wrap; gap:24px; margin-bottom:32px; }
        .ie-meta-label { font-size:.7rem; color:rgba(255,255,255,.38); text-transform:uppercase; letter-spacing:.08em; margin-bottom:4px; }
        .ie-meta-value { font-size:1.08rem; font-weight:700; color:#fff; }
        .ie-meta-value.prize { color:var(--orange); }
        .ie-tourn-right { position:relative; z-index:1; min-width:220px; }
        .ie-slots { background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); border-radius:var(--radius); padding:20px 24px; margin-bottom:14px; text-align:center; }
        .ie-slots-num { font-size:2.6rem; font-weight:900; color:var(--orange); line-height:1; }
        .ie-slots-label { font-size:.78rem; color:rgba(255,255,255,.45); margin-top:4px; }
        .ie-slots-bar { height:5px; border-radius:3px; background:rgba(255,255,255,.1); overflow:hidden; margin-top:12px; }
        .ie-slots-fill { height:100%; border-radius:3px; transition:width .6s; }
        .ie-btn-register { background:var(--orange); color:#fff; border:none; border-radius:100px; padding:15px 36px; font-size:1rem; font-weight:700; cursor:pointer; font-family:inherit; min-height:52px; width:100%; transition:background .2s,transform .1s; box-shadow:0 4px 20px rgba(240,90,40,.4); }
        .ie-btn-register:hover { background:var(--orange-dark); }
        .ie-btn-register:active { transform:scale(.97); }
        .ie-tourn-detail-link { display:block; text-align:center; margin-top:10px; font-size:.82rem; color:rgba(255,255,255,.38); text-decoration:none; transition:color .2s; }
        .ie-tourn-detail-link:hover { color:rgba(255,255,255,.7); }
        @media (max-width:700px) { .ie-tourn-wrap { padding:36px 24px; flex-direction:column; } .ie-tourn-right { width:100%; } }

        /* ── Footer ── */
        .ie-footer { background:#111; color:rgba(255,255,255,.45); padding:40px 20px; text-align:center; }
        .ie-footer-brand { display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:16px; }
        .ie-footer-name { font-size:1.1rem; font-weight:800; color:#fff; }
        .ie-footer-links { display:flex; gap:20px; justify-content:center; flex-wrap:wrap; margin-bottom:24px; }
        .ie-footer-links a { color:rgba(255,255,255,.42); font-size:.84rem; text-decoration:none; transition:color .2s; }
        .ie-footer-links a:hover { color:var(--orange); }
        .ie-footer-copy { font-size:.77rem; color:rgba(255,255,255,.22); }

        /* ── Modal ── */
        .ie-modal-overlay { position:fixed; inset:0; z-index:999; background:rgba(0,0,0,.65); backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); display:flex; align-items:flex-end; justify-content:center; opacity:0; pointer-events:none; transition:opacity .25s; }
        @media (min-width:600px) { .ie-modal-overlay { align-items:center; } }
        .ie-modal-overlay.open { opacity:1; pointer-events:all; }
        .ie-modal { background:#fff; border-radius:20px 20px 0 0; padding:36px 28px 44px; width:100%; max-width:420px; transform:translateY(40px); transition:transform .3s cubic-bezier(.34,1.56,.64,1); position:relative; }
        @media (min-width:600px) { .ie-modal { border-radius:20px; } }
        .ie-modal-overlay.open .ie-modal { transform:translateY(0); }
        .ie-modal-close { position:absolute; top:14px; right:16px; background:var(--surface2); border:none; width:32px; height:32px; border-radius:50%; cursor:pointer; font-size:1rem; color:var(--text-secondary); display:flex; align-items:center; justify-content:center; }
        .ie-modal-close:hover { background:var(--border); }
        .ie-step-dots { display:flex; gap:6px; margin-bottom:24px; }
        .ie-step-dot { height:4px; flex:1; border-radius:2px; background:var(--border); transition:background .3s; }
        .ie-step-dot.active { background:var(--orange); }
        .ie-modal-logo { display:flex; align-items:center; gap:8px; margin-bottom:22px; }
        .ie-modal-logo-name { font-size:1.08rem; font-weight:800; }
        .ie-modal-title { font-size:1.6rem; font-weight:900; margin-bottom:6px; }
        .ie-modal-sub { font-size:.88rem; color:var(--text-secondary); margin-bottom:28px; }
        .ie-form-label { font-size:.82rem; font-weight:600; color:var(--text-secondary); margin-bottom:6px; display:block; }
        .ie-form-row { display:flex; gap:10px; }
        .ie-country-select { flex:0 0 100px; padding:12px 8px; border:1.5px solid var(--border); border-radius:var(--radius-sm); font-family:inherit; font-size:.9rem; background:var(--off-white); color:var(--text-primary); cursor:pointer; }
        .ie-phone-input { flex:1; padding:12px 14px; border:1.5px solid var(--border); border-radius:var(--radius-sm); font-family:inherit; font-size:.95rem; background:#fff; color:var(--text-primary); outline:none; transition:border-color .2s; }
        .ie-phone-input:focus { border-color:var(--orange); }
        .ie-btn-submit { width:100%; background:var(--orange); color:#fff; border:none; border-radius:100px; padding:15px; font-size:1rem; font-weight:700; cursor:pointer; font-family:inherit; min-height:52px; transition:background .2s,opacity .2s; margin-top:8px; }
        .ie-btn-submit:hover { background:var(--orange-dark); }
        .ie-btn-submit:disabled { opacity:.6; cursor:not-allowed; }
        .ie-otp-fields { display:flex; gap:8px; justify-content:space-between; margin-bottom:4px; }
        .ie-otp-input { width:44px; height:52px; text-align:center; border:1.5px solid var(--border); border-radius:var(--radius-sm); font-size:1.3rem; font-weight:700; font-family:inherit; background:var(--off-white); color:var(--text-primary); outline:none; transition:border-color .2s; }
        .ie-otp-input:focus { border-color:var(--orange); }
        .ie-error { font-size:.82rem; color:#dc2626; margin-top:8px; min-height:20px; }
        .ie-back-btn { background:none; border:none; color:var(--orange); font-size:.88rem; font-weight:600; cursor:pointer; padding:0; font-family:inherit; display:flex; align-items:center; gap:4px; margin-bottom:20px; }
        .ie-resend-row { display:flex; justify-content:space-between; align-items:center; margin-top:14px; }
        .ie-resend-btn { background:none; border:none; color:var(--orange); font-size:.83rem; font-weight:600; cursor:pointer; font-family:inherit; }
        .ie-resend-btn:disabled { color:var(--text-muted); cursor:default; }
        .ie-terms { font-size:.75rem; color:var(--text-muted); text-align:center; margin-top:16px; line-height:1.5; }
        .ie-terms a { color:var(--orange); text-decoration:none; }

        /* ── Animations ── */
        .fade-up { opacity:0; transform:translateY(24px); transition:opacity .5s,transform .5s; }
        .fade-up.visible { opacity:1; transform:none; }
      `}</style>

      {/* ─── NAVBAR ─────────────────────────────────────────────────────────────── */}
      <nav className="ie-nav">
        <a className="ie-nav-brand" href="#">
          <Image src="/ielogo.png" alt="Indian Esports" width={38} height={38} priority style={{ borderRadius: 7 }} />
          <span className="ie-nav-name">Indian <span>Esports</span></span>
        </a>

        <div className="ie-nav-links">
          {[
            { label: "Games",        id: "games"        },
            { label: "How it Works", id: "how-it-works" },
            { label: "Tournament",   id: "tournament"   },
          ].map(({ label, id }) => (
            <button
              key={id}
              className={`ie-nav-link${activeSection === id ? " active" : ""}`}
              onClick={() => scrollTo(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <button className="ie-btn-login" onClick={openModal}>Login</button>
      </nav>

      {/* ─── HERO — 25% smaller ─────────────────────────────────────────────────── */}
      <section className="ie-hero" id="home">
        <video
          ref={videoRef}
          className="ie-hero-video"
          src="/Dota2teaser.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        />
        <div className="ie-hero-overlay" />
        <div className="ie-hero-glow" />

        <div className="ie-hero-content">
          <div className="ie-hero-logo">
            <Image
              src="/ielogo.png"
              alt="Indian Esports"
              width={144}
              height={144}
              priority
              style={{
                borderRadius: 22,
                filter: "drop-shadow(0 8px 32px rgba(240,90,40,.6))",
              }}
            />
          </div>

          <div className="ie-hero-badge">
            <span className="ie-pulse" />
            Now Live – May Championship 2026
          </div>

          <h1>
            Compete on<br />
            <span className="accent">Indian Esports</span>
          </h1>

          <p className="ie-hero-sub">
            Play what you love. Compete in your rank bracket in totally free community events. Win with skills.
          </p>

          <div className="ie-hero-cta">
            <button className="ie-btn-primary" onClick={openModal}>
              <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Start Playing Now
            </button>
            <a href="#how-it-works" className="ie-btn-secondary">
              Learn More
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </a>
          </div>
        </div>

        <div className="ie-hero-stats">
          {[
            { num: "₹1L", suffix: "+", label: "Prize Pool"   },
            { num: "4",   suffix: "",  label: "Games"        },
            { num: "2",   suffix: "",  label: "Modes"        },
            { num: "UPI", suffix: "",  label: "Fast Payouts" },
          ].map(s => (
            <div className="ie-stat" key={s.label}>
              <span className="ie-stat-num">{s.num}<span>{s.suffix}</span></span>
              <span className="ie-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── TRUST STRIP ────────────────────────────────────────────────────────── */}
      <div className="ie-trust">
        <div className="ie-trust-items">
          {[
            { icon: "🛡️", text: "Verified & Safe Platform" },
            { icon: "💸", text: "Instant UPI Payouts"      },
            { icon: "🏆", text: "Skill-Based Brackets"     },
            { icon: "📱", text: "100% Free Entry"     },
            { icon: "🇮🇳", text: "Made for India"           },
          ].map(t => (
            <div className="ie-trust-item" key={t.text}>
              <span>{t.icon}</span>
              <span className="ie-trust-text">{t.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── AVAILABLE GAMES ────────────────────────────────────────────────────── */}
      <section className="ie-section ie-section-white" id="games">
        <div className="ie-container">
          <div className="ie-section-header fade-up">
            <h2 className="ie-section-title">Available <span className="accent">Games</span></h2>
            <p className="ie-section-sub">Pick your game and compete against players in your skill tier.</p>
          </div>
          <div className="ie-games-grid">
            {[
              { name: "Dota 2",       tag: "Live Now",    src: "/dota2image3.jpeg",   soon: false, delay: "0.05s" },
              { name: "Valorant",     tag: "Coming Soon", src: "/valorantimage1.jpg", soon: true,  delay: "0.10s" },
              { name: "CS:GO",        tag: "Coming Soon", src: "/csgoimage3.jpg",     soon: true,  delay: "0.15s" },
              { name: "Call of Duty", tag: "Coming Soon", src: "/codimage1.jpg",      soon: true,  delay: "0.20s" },
            ].map(g => (
              <div className="ie-game-card fade-up" key={g.name} style={{ transitionDelay: g.delay }}>
                <Image
                  className="ie-game-card-img"
                  src={g.src} alt={g.name} fill
                  sizes="(max-width:480px) 100vw,(max-width:900px) 50vw,25vw"
                  style={{ objectFit: "cover" }}
                  loading="lazy"
                />
                <div className="ie-game-overlay" />
                <div className="ie-game-info">
                  <span className={`ie-game-tag${g.soon ? " soon" : ""}`}>{g.tag}</span>
                  <div className="ie-game-name">{g.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS — all 4 cards always visible ──────────────────────────── */}
      <section className="ie-section ie-section-light" id="how-it-works">
        <div className="ie-container">
          <div className="ie-section-header fade-up" style={{ textAlign: "center" }}>
            <h2 className="ie-section-title">How It <span className="accent">Works</span></h2>
            <p className="ie-section-sub" style={{ margin: "8px auto 0" }}>
              From signup to prize money in 4 simple steps.
            </p>
          </div>

          {/* No fade-up on the grid or cards — opacity forced to 1 via CSS */}
          <div className="ie-hiw-grid">
            {HOW_IT_WORKS.map((item, i) => (
              <div className="ie-hiw-card" key={item.title}>
                <div
                  className="ie-hiw-img-wrap"
                  style={{ background: `linear-gradient(135deg, ${item.color}22 0%, ${item.color}44 100%)` }}
                >
                  <svg
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.15 }}
                    viewBox="0 0 300 160" preserveAspectRatio="xMidYMid slice"
                  >
                    <circle cx="240" cy="-20" r="100" fill={item.color} />
                    <circle cx="60" cy="180" r="80" fill={item.color} />
                    <circle cx="150" cy="80" r="50" fill={item.color} />
                  </svg>
                  <span className="ie-hiw-icon-big">{item.icon}</span>
                  <span style={{
                    position: "absolute", top: 12, left: 14,
                    background: item.color, color: "#fff",
                    fontSize: ".7rem", fontWeight: 800,
                    padding: "3px 9px", borderRadius: 100,
                    letterSpacing: ".04em",
                  }}>
                    STEP {i + 1}
                  </span>
                </div>
                <div className="ie-hiw-body">
                  <div className="ie-hiw-title">{item.title}</div>
                  <div className="ie-hiw-desc">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURED TOURNAMENT ────────────────────────────────────────────────── */}
      <section className="ie-section ie-section-white" id="tournament">
        <div className="ie-container">
          <div className="ie-section-header fade-up">
            <h2 className="ie-section-title">Featured <span className="accent">Tournament</span></h2>
          </div>

          {tournamentLoading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)", fontSize: ".95rem" }}>
              Loading tournament…
            </div>
          ) : featuredTournament ? (
            <div className="ie-tourn-wrap fade-up">
              <div className="ie-tourn-glow" />
              <div style={{ position: "relative", zIndex: 1 }}>
                <div className="ie-tourn-badge">
                  <span className="ie-pulse" /> Registrations Open
                </div>
                <h3 className="ie-tourn-title">
                  {(() => {
                    const words = featuredTournament.name.split(" ");
                    const last  = words.pop();
                    return <>{words.join(" ")}<br /><span className="accent">{last}</span></>;
                  })()}
                </h3>
                <div className="ie-tourn-meta">
                  {[
                    { label: "Game",          value: "Dota 2",                                prize: false },
                    { label: "Prize Pool",    value: featuredTournament.prizePool,            prize: true  },
                    { label: "Entry",         value: featuredTournament.entry,                prize: false },
                    { label: "Format",        value: "5v5",                                   prize: false },
                    { label: "Start Date",    value: featuredTournament.startDate,            prize: false },
                    { label: "Reg. Deadline", value: featuredTournament.registrationDeadline, prize: false },
                  ].map(m => (
                    <div key={m.label}>
                      <div className="ie-meta-label">{m.label}</div>
                      <div className={`ie-meta-value${m.prize ? " prize" : ""}`}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ie-tourn-right">
                <div className="ie-slots">
                  <div className="ie-slots-num">{slotsLeft}</div>
                  <div className="ie-slots-label">slots left of {featuredTournament.totalSlots}</div>
                  <div className="ie-slots-bar">
                    <div className="ie-slots-fill" style={{
                      width: `${slotPct}%`,
                      background: slotPct > 80 ? "#ef4444" : slotPct > 50 ? "#f59e0b" : "var(--orange)",
                    }} />
                  </div>
                </div>
                <button className="ie-btn-register" onClick={openModal}>Register Now →</button>
                <a href={`/tournament/${featuredTournament.id}`} className="ie-tourn-detail-link">
                  View full details & rules →
                </a>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)", fontSize: ".95rem" }}>
              No upcoming tournaments right now. Check back soon!
            </div>
          )}
        </div>
      </section>

      {/* ─── FOOTER ─────────────────────────────────────────────────────────────── */}
      <footer className="ie-footer">
        <div className="ie-container">
          <div className="ie-footer-brand">
            <Image src="/ielogo.png" alt="Indian Esports" width={30} height={30} style={{ borderRadius: 6 }} />
            <span className="ie-footer-name">Indian Esports</span>
          </div>
          <div className="ie-footer-links">
            {["About","Games","Tournaments","Leaderboard","Terms","Privacy","Contact"].map(l => (
              <a key={l} href="#">{l}</a>
            ))}
          </div>
          <div className="ie-footer-copy">© 2026 Indian Esports. All rights reserved.</div>
        </div>
      </footer>

      {/* ─── RECAPTCHA ───────────────────────────────────────────────────────────── */}
      <div id="recaptcha-container" />

      {/* ─── LOGIN MODAL ────────────────────────────────────────────────────────── */}
      <div
        className={`ie-modal-overlay${modalOpen ? " open" : ""}`}
        onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        role="dialog" aria-modal="true" aria-label="Login"
      >
        <div className="ie-modal">
          <button className="ie-modal-close" onClick={closeModal} aria-label="Close">✕</button>
          <div className="ie-step-dots">
            <div className={`ie-step-dot${modalStep === "phone" || modalStep === "otp" ? " active" : ""}`} />
            <div className={`ie-step-dot${modalStep === "otp" ? " active" : ""}`} />
          </div>

          {modalStep === "phone" && (
            <>
              <div className="ie-modal-logo">
                <Image src="/ielogo.png" alt="Logo" width={32} height={32} style={{ borderRadius: 6 }} />
                <span className="ie-modal-logo-name">Indian Esports</span>
              </div>
              <div className="ie-modal-title">Welcome 👋</div>
              <div className="ie-modal-sub">Enter your phone number to continue.</div>
              <div style={{ marginBottom: 16 }}>
                <label className="ie-form-label">Phone Number</label>
                <div className="ie-form-row">
                  <select className="ie-country-select" value={countryCode} onChange={e => setCountryCode(e.target.value)}>
                    {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                  </select>
                  <input
                    ref={phoneRef} className="ie-phone-input"
                    type="tel" inputMode="numeric" placeholder="9876543210"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g,"").slice(0,10))}
                    onKeyDown={e => { if (e.key === "Enter") sendOtp(); }}
                    maxLength={10} autoComplete="tel"
                  />
                </div>
              </div>
              <p className="ie-error">{error}</p>
              <button className="ie-btn-submit" onClick={sendOtp} disabled={loading}>
                {loading ? "Sending OTP…" : "Send OTP →"}
              </button>
              <p className="ie-terms">By continuing you agree to our <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.</p>
            </>
          )}

          {modalStep === "otp" && (
            <>
              <button className="ie-back-btn" onClick={() => { setModalStep("phone"); setError(""); }}>← Back</button>
              <div className="ie-modal-title">Enter OTP</div>
              <div className="ie-modal-sub">6-digit code sent to {countryCode} {phone}</div>
              <div style={{ marginBottom: 8 }}>
                <label className="ie-form-label">Verification Code</label>
                <div className="ie-otp-fields" onPaste={handleOtpPaste}>
                  {otp.map((digit, i) => (
                    <input
                      key={i} ref={el => { otpRefs.current[i] = el; }}
                      className="ie-otp-input" type="tel" inputMode="numeric" maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                    />
                  ))}
                </div>
              </div>
              <p className="ie-error">{error}</p>
              <button className="ie-btn-submit" onClick={verifyOtp} disabled={loading}>
                {loading ? "Verifying…" : "Verify & Login ✓"}
              </button>
              <div className="ie-resend-row">
                <button className="ie-resend-btn" onClick={resendOtp} disabled={resendTimer > 0}>Resend OTP</button>
                {resendTimer > 0 && <span style={{ fontSize: ".83rem", color: "var(--text-muted)" }}>Resend in {resendTimer}s</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}