"use client";

/**
 * Landing page — the logged-out front door.
 *
 * NAV. The three games sit in the shared <Navbar/>, exactly as they do once you
 * sign in. The page used to carry its own bar with Games / How it Works /
 * Tournament anchors, which meant a visitor's first impression of the product
 * was a table of contents rather than the games. One navbar, one source of
 * truth, and the anchors are gone.
 *
 * LOOK. The sticker style of the Horizon films (app/components/remotion/kit.tsx):
 * cream page, ink outlines, hard offset shadows, sticker labels, highlighter
 * marks, pastel blobs. The palette below is that kit's, kept in sync by hand
 * because the films render through Remotion and cannot share a stylesheet.
 *
 * As in the films, a game accent is only ever a FILL with ink on top — Valorant
 * cyan and CS2 amber fail contrast as text on cream.
 *
 * FIRST FOLD. The hero is the next tournament, not a slogan. Whatever is
 * soonest across the three games is resolved into `nextUp` and rendered as a
 * full card — name, date, prize, entry, capacity, deadline, register — beside
 * the headline, and directly under it on a phone. Everything else is below it.
 *
 * The data arrives as a prop from the Server Component in ./page.tsx, already
 * read from Firestore, so the card is in the first paint. This file used to
 * fetch it itself after hydration and showed a skeleton for seconds.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./context/AuthContext";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Navbar from "./components/Navbar";
import type { FeaturedPayload, FeaturedTournament } from "@/lib/featuredTournaments";

type Tournament = FeaturedTournament;

type GameKey = "dota2" | "valorant" | "cs2";

const GAME: Record<GameKey, {
  label: string; full: string; path: string; acc: string; logo: string; art: string;
  blurb: string; detail: (id: string) => string;
}> = {
  dota2: {
    label: "DOTA 2", full: "Dota 2", path: "/dota2", acc: "#FF5340",
    logo: "/dota2logo.png", art: "/dota2image33.jpeg",
    blurb: "5v5 in your rank bracket, or climb the solo ladder on your own schedule.",
    detail: (id) => `/tournament/${id}`,
  },
  valorant: {
    label: "VALORANT", full: "Valorant", path: "/valorant", acc: "#3CE0FF",
    logo: "/valorantlogo.png", art: "/valorant-agents.jpg",
    blurb: "Rank-verified brackets, round-robin groups and a best-of-3 Grand Final.",
    detail: (id) => `/valorant/tournament/${id}`,
  },
  cs2: {
    label: "CS2", full: "Counter-Strike 2", path: "/cs2", acc: "#FFB627",
    logo: "/cs2logo.png", art: "/csgoimage3.jpg",
    blurb: "Steam-verified entry, community-balanced rosters, one evening to settle it.",
    detail: (id) => `/cs2/tournament/${id}`,
  },
};

const GAME_ORDER: GameKey[] = ["dota2", "valorant", "cs2"];

/** What you get for an entry — the three the perks film promises, plus the basics. */
const TICKER = [
  "🛡️ Rank-verified brackets",
  "📺 Every match streamed live",
  "🎬 Your best plays cut into shorts",
  "🧠 AI performance report",
  "💸 Prizes paid over UPI",
  // No flag emoji anywhere on this page: Chrome on Windows has no regional
  // indicator glyphs and renders the India flag as the letters "IN".
  "★ Built in India",
];

const STEPS = [
  { n: "01", icon: "🔗", title: "Sign in once", desc: "Discord, then link Steam or your Riot ID. You never set it up twice.", bg: "#FF9EC4" },
  { n: "02", icon: "⚔️", title: "Pick your bracket", desc: "Enter as a team of five, or solo and we'll draw balanced rosters.", bg: "#C9B6FF" },
  { n: "03", icon: "📊", title: "Just play", desc: "Results are pulled automatically. No screenshots, no manual reporting.", bg: "#A6F0C6" },
  { n: "04", icon: "🏆", title: "Get paid", desc: "Prize money lands over UPI once the Grand Final is done.", bg: "#FFE066" },
];

const IST = "Asia/Kolkata";
const DAY_MS = 86_400_000;

const toDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};
const fmtDay = (d: Date) => d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: IST });
const fmtDayLong = (d: Date) => d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: IST });
const fmtTime = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST });
const inr = (n: number) => n.toLocaleString("en-IN");

/** "2d 4h" / "6h 20m" / "18m", or null once it's gone. */
const countdown = (target: Date, now: number): string | null => {
  const ms = target.getTime() - now;
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d >= 1) return `${d}d ${h}h`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
};

/** TODAY / TOMORROW / IN 9 DAYS — the sticker that carries the urgency. */
const whenSticker = (start: Date, now: number): string => {
  const days = Math.ceil((start.getTime() - now) / DAY_MS);
  if (days <= 0) return "TODAY";
  if (days === 1) return "TOMORROW";
  return `IN ${days} DAYS`;
};

type Card = {
  key: GameKey; t: Tournament; href: string; acc: string;
  start: Date | null; deadline: Date | null; ended: boolean; regOpen: boolean;
  status: string;
  total: number; booked: number; left: number; pct: number; unit: string;
  prize: string | null; entry: string; squad: string; full: boolean;
};

const buildCard = (key: GameKey, t: Tournament, now: number): Card => {
  const start = toDate(t.startDate);
  const end = toDate(t.endDate);
  const deadline = toDate(t.registrationDeadline || t.schedule?.registrationCloses);
  const ended = t.status === "ended" || t.status === "completed" || (!!end && now > end.getTime());

  // Team mode counts TEAMS against totalTeams; slotsBooked keeps counting
  // players, so it is only a fallback when the API could not read the teams.
  const teamMode = t.registrationMode === "team";
  const size = Number(t.teamSize) || 5;
  const total = teamMode
    ? (Number(t.totalTeams) || Math.floor((Number(t.totalSlots) || 0) / size))
    : (Number(t.totalSlots) || 0);
  const booked = teamMode
    ? (typeof t.teamsBooked === "number" ? t.teamsBooked : Math.floor((Number(t.slotsBooked) || 0) / size))
    : (Number(t.slotsBooked) || 0);
  const left = Math.max(0, total - booked);
  const pct = total > 0 ? Math.min(100, Math.round((booked / total) * 100)) : 0;
  const full = total > 0 && left <= 0;

  const regOpen = !ended && !full && (!deadline || now < deadline.getTime());

  let status = "Registration open";
  if (ended) status = t.championTeamName ? `Won by ${t.championTeamName}` : "Completed";
  else if (full) status = "All slots taken";
  else if (deadline && now > deadline.getTime()) {
    const gs = toDate(t.schedule?.groupStageStart);
    const ts = toDate(t.schedule?.tourneyStageStart);
    if (gs && now < gs.getTime()) status = `Registration closed · Starts ${fmtDay(gs)}`;
    else if (ts && now < ts.getTime()) status = "Group stage live";
    else status = "Registration closed";
  }

  const prizeNum = Number(String(t.prizePool ?? "").replace(/[^\d]/g, ""));
  const fee = Number(t.entryFee) || 0;

  return {
    key, t, acc: GAME[key].acc, href: GAME[key].detail(t.id),
    start, deadline, ended, regOpen, status,
    total, booked, left, pct, unit: teamMode ? (total === 1 ? "team" : "teams") : (total === 1 ? "slot" : "slots"),
    prize: prizeNum > 0 ? `₹${inr(prizeNum)}` : null,
    entry: fee > 0 ? `₹${inr(fee)}${teamMode ? ` / team of ${size}` : ""}` : "Free entry",
    squad: teamMode ? `Teams of ${size}` : t.format === "shuffle" ? "Solo · teams drawn" : "Solo entry",
    full,
  };
};

const signIn = () => {
  try { sessionStorage.setItem("redirectAfterLogin", window.location.pathname); } catch {}
  window.location.href = "/api/auth/discord-login";
};

const DiscordIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: "block" }}>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419s.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419s.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

const Sparkle = ({ className, size, fill = "#16131F" }: { className: string; size: number; fill?: string }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z" fill={fill} stroke="#16131F" strokeWidth={fill === "#16131F" ? 0 : 1.5} />
  </svg>
);

export default function HomeClient({ initial }: { initial: FeaturedPayload }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const featured: Partial<Record<GameKey, Tournament>> = {
    dota2: initial.dota ?? undefined,
    valorant: initial.valorant ?? undefined,
    cs2: initial.cs2 ?? undefined,
  };
  const completedVal = initial.completedValorant;
  const completedDota = initial.completedDota;

  // Seeded from the server's clock, not 0 — so the countdown renders identically
  // on the server and in the first client render (no hydration mismatch), and
  // the card is complete in the HTML instead of appearing a tick later. The
  // effect then hands it to the real client clock and keeps it ticking, so a
  // tab left open does not sit on a stale "closes in 6d 10h".
  const [now, setNow] = useState(initial.generatedAt);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!loading && user) router.replace("/valorant");
  }, [user, loading, router]);

  /** Every live tournament, soonest first. The head of this list is the hero. */
  const cards = useMemo(() => {
    return GAME_ORDER
      .map((k) => (featured[k] ? buildCard(k, featured[k]!, now) : null))
      .filter((c): c is Card => !!c && !c.ended)
      .sort((a, b) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, now]);

  const nextUp = cards[0] ?? null;
  const alsoOn = cards.slice(1);
  const results = [
    completedVal ? { key: "valorant" as GameKey, t: completedVal } : null,
    completedDota ? { key: "dota2" as GameKey, t: completedDota } : null,
  ].filter(Boolean) as { key: GameKey; t: Tournament }[];

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { overflow-x: hidden; width: 100%; }
        html { scroll-behavior: smooth; }

        :root {
          --ink: #16131F; --paper: #FFF7EA; --card: #FFFFFF;
          --body: #4E4858; --muted: #8A8394;
          --lilac: #C9B6FF; --lemon: #FFE066; --pink: #FF9EC4; --mint: #A6F0C6; --gold: #FFD24A;
        }
        body {
          background: var(--paper); color: var(--ink);
          font-family: var(--font-geist-sans), system-ui, -apple-system, "Segoe UI", sans-serif;
        }

        /* ── shared sticker vocabulary ─────────────────────────────────── */
        .ie-stk {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 6px 13px; border: 2.5px solid var(--ink); border-radius: 100px;
          box-shadow: 3px 3px 0 var(--ink); color: var(--ink);
          font-size: .7rem; font-weight: 900; letter-spacing: .09em; text-transform: uppercase;
          white-space: nowrap; transform: rotate(-2deg);
        }
        .ie-stk img { width: 16px; height: 16px; object-fit: contain; border-radius: 3px; }
        .ie-stk.r { transform: rotate(2.5deg); }
        .ie-mark {
          background: linear-gradient(180deg, transparent 54%, var(--hl) 54%, var(--hl) 92%, transparent 92%);
          padding: 0 6px; margin: 0 -3px;
          -webkit-box-decoration-break: clone; box-decoration-break: clone;
        }
        .ie-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ink); animation: ie-blink 1.6s infinite; flex: none; }
        @keyframes ie-blink { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }

        /* ── page backdrop: dot grid + drifting pastel blobs ───────────── */
        .ie-wrap { position: relative; overflow: hidden; }
        .ie-dots {
          position: absolute; inset: 0; z-index: 0; pointer-events: none;
          background-image: radial-gradient(rgba(22,19,31,.14) 1.6px, transparent 1.8px);
          background-size: 26px 26px;
        }
        .ie-blob { position: absolute; border-radius: 50%; z-index: 0; pointer-events: none; filter: blur(.5px); }
        .ie-b1 { width: 460px; height: 460px; background: var(--lilac); opacity: .5;  right: -200px; top: -220px; animation: ie-drift 15s ease-in-out infinite alternate; }
        .ie-b2 { width: 400px; height: 400px; background: var(--lemon); opacity: .55; left: -210px;  bottom: -180px; animation: ie-drift 19s ease-in-out infinite alternate-reverse; }
        .ie-b3 { width: 150px; height: 150px; background: var(--mint);  opacity: .45; right: 6%;     bottom: 14%; animation: ie-drift 13s ease-in-out infinite alternate; }
        @keyframes ie-drift { from { transform: translate(0, 0); } to { transform: translate(18px, -16px); } }
        .ie-sp { position: absolute; z-index: 1; pointer-events: none; animation: ie-spin 14s linear infinite; }
        .ie-sp1 { right: 5%;  top: 18%; }
        .ie-sp2 { left: 3%;   bottom: 12%; animation-direction: reverse; }
        .ie-sp3 { right: 12%; bottom: 8%;  animation-duration: 20s; }
        @keyframes ie-spin { to { transform: rotate(360deg); } }

        /* ── hero ──────────────────────────────────────────────────────── */
        .ie-hero { position: relative; z-index: 2; min-height: calc(100svh - 68px); display: flex; align-items: center; padding: 34px 24px 48px; }
        .ie-hero-grid {
          width: 100%; max-width: 1160px; margin: 0 auto;
          display: grid; grid-template-columns: 1.02fr .98fr; gap: 16px 52px;
          grid-template-areas: "copy card" "sub card" "cta card"; align-items: start;
        }
        .ie-copy { grid-area: copy; }
        .ie-copy h1 {
          font-size: clamp(2.3rem, 5.4vw, 4.05rem); font-weight: 900; line-height: 1.02;
          letter-spacing: -.035em; margin: 18px 0 0;
        }
        .ie-sub { grid-area: sub; font-size: clamp(.95rem, 1.35vw, 1.06rem); font-weight: 500; color: var(--body); line-height: 1.6; max-width: 470px; }
        .ie-actions { grid-area: cta; display: flex; flex-direction: column; gap: 20px; }
        .ie-btn-row { display: flex; gap: 12px; flex-wrap: wrap; }

        .ie-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 9px;
          padding: 13px 24px; border: 3px solid var(--ink); border-radius: 100px;
          box-shadow: 4px 4px 0 var(--ink); background: var(--card); color: var(--ink);
          font-family: inherit; font-size: .95rem; font-weight: 900; letter-spacing: -.01em;
          cursor: pointer; text-decoration: none; transition: transform .12s, box-shadow .12s;
        }
        .ie-btn:hover  { transform: translate(-2px, -2px); box-shadow: 6px 6px 0 var(--ink); }
        .ie-btn:active { transform: translate(2px, 2px);   box-shadow: 1px 1px 0 var(--ink); }
        .ie-btn.wide { width: 100%; }

        .ie-stats { display: flex; gap: 26px; flex-wrap: wrap; }
        .ie-stat-n { font-size: 1.5rem; font-weight: 900; letter-spacing: -.03em; display: block; }
        .ie-stat-l { font-size: .66rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }

        /* ── the next-up card: the whole point of the first fold ───────── */
        .ie-nx {
          grid-area: card; position: relative;
          background: var(--card); border: 3.5px solid var(--ink); border-radius: 26px;
          box-shadow: 9px 9px 0 var(--ink); padding: 22px 22px 24px;
          transform: rotate(-1.1deg); transition: transform .18s, box-shadow .18s;
        }
        .ie-nx:hover { transform: rotate(-1.1deg) translate(-3px, -3px); box-shadow: 12px 12px 0 var(--ink); }
        .ie-nx-rail { position: absolute; left: -3.5px; right: -3.5px; top: -3.5px; height: 14px; border: 3.5px solid var(--ink); border-radius: 26px 26px 0 0; }
        .ie-nx-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 12px 0 15px; flex-wrap: wrap; }
        .ie-nx-name { font-size: clamp(1.45rem, 2.7vw, 2rem); font-weight: 900; line-height: 1.05; letter-spacing: -.035em; }
        .ie-nx-when { display: flex; align-items: center; gap: 8px; margin-top: 9px; font-size: .92rem; font-weight: 700; color: var(--body); }
        .ie-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 15px; }
        .ie-chip {
          display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px;
          border: 2.5px solid var(--ink); border-radius: 100px; background: var(--paper);
          font-size: .79rem; font-weight: 800; white-space: nowrap;
        }
        .ie-meter { margin-top: 18px; }
        .ie-meter-row { display: flex; justify-content: space-between; align-items: baseline; font-size: .76rem; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: var(--body); margin-bottom: 7px; }
        .ie-meter-bar { height: 17px; border: 3px solid var(--ink); border-radius: 100px; background: var(--paper); overflow: hidden; }
        .ie-meter-fill { height: 100%; border-right: 3px solid var(--ink); transition: width .6s cubic-bezier(.33,1,.68,1); }
        .ie-nx-foot { margin-top: 11px; text-align: center; font-size: .78rem; font-weight: 800; color: var(--body); }
        .ie-nx-link { display: block; margin-top: 9px; text-align: center; font-size: .8rem; font-weight: 800; color: var(--body); text-decoration: underline; text-underline-offset: 3px; }

        /* No loading state for the card any more — it is server-rendered, so it
           is either there in the first paint or there is genuinely nothing on. */
        .ie-none { grid-area: card; border: 3.5px dashed rgba(22,19,31,.3); border-radius: 26px; padding: 40px 26px; text-align: center; font-weight: 800; color: var(--body); line-height: 1.6; }

        /* ── ticker ────────────────────────────────────────────────────── */
        .ie-ticker { position: relative; z-index: 2; background: var(--ink); border-top: 3.5px solid var(--ink); border-bottom: 3.5px solid var(--ink); padding: 12px 0; overflow: hidden; }
        .ie-ticker-track { display: flex; width: max-content; gap: 16px; animation: ie-scroll 34s linear infinite; }
        .ie-ticker-item { display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px; border-radius: 100px; background: rgba(255,247,234,.09); color: var(--paper); font-size: .84rem; font-weight: 800; white-space: nowrap; }
        @keyframes ie-scroll { to { transform: translateX(-50%); } }

        /* ── sections ──────────────────────────────────────────────────── */
        .ie-sec { position: relative; z-index: 2; padding: 78px 24px; }
        .ie-inner { max-width: 1160px; margin: 0 auto; }
        .ie-h2 { font-size: clamp(1.85rem, 4vw, 2.9rem); font-weight: 900; letter-spacing: -.035em; line-height: 1.04; }
        .ie-h2-sub { font-size: .98rem; font-weight: 500; color: var(--body); margin-top: 10px; max-width: 520px; line-height: 1.6; }
        .ie-head { margin-bottom: 34px; }

        /* ── games ─────────────────────────────────────────────────────── */
        .ie-games { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
        .ie-game {
          position: relative; border: 3.5px solid var(--ink); border-radius: 24px; overflow: hidden;
          background: var(--card); box-shadow: 8px 8px 0 var(--ink); cursor: pointer; text-align: left;
          font-family: inherit; color: var(--ink); padding: 0; transition: transform .18s, box-shadow .18s;
        }
        .ie-game:nth-child(1) { transform: rotate(-1.2deg); }
        .ie-game:nth-child(3) { transform: rotate(1.2deg); }
        .ie-game:hover { transform: rotate(0deg) translate(-3px, -3px); box-shadow: 11px 11px 0 var(--ink); }
        .ie-game-art { position: relative; height: 178px; border-bottom: 3.5px solid var(--ink); overflow: hidden; }
        .ie-game-art img { object-fit: cover; }
        .ie-game-badge { position: absolute; left: 14px; top: 14px; z-index: 2; }
        .ie-game-body { padding: 17px 18px 20px; }
        .ie-game-name { font-size: 1.32rem; font-weight: 900; letter-spacing: -.03em; display: flex; align-items: center; gap: 9px; }
        .ie-game-name img { width: 26px; height: 26px; object-fit: contain; }
        .ie-game-blurb { font-size: .87rem; font-weight: 500; color: var(--body); line-height: 1.55; margin-top: 8px; }
        .ie-game-go { margin-top: 13px; font-size: .82rem; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }

        /* ── steps ─────────────────────────────────────────────────────── */
        .ie-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
        .ie-step { background: var(--card); border: 3px solid var(--ink); border-radius: 20px; box-shadow: 6px 6px 0 var(--ink); padding: 18px 17px 20px; }
        .ie-step:nth-child(even) { transform: rotate(.9deg); }
        .ie-step:nth-child(odd)  { transform: rotate(-.9deg); }
        .ie-step-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 13px; }
        .ie-step-n { width: 50px; height: 50px; border: 3px solid var(--ink); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.02rem; font-weight: 900; }
        .ie-step-icon { font-size: 1.9rem; }
        .ie-step-t { font-size: 1.05rem; font-weight: 900; letter-spacing: -.02em; }
        .ie-step-d { font-size: .84rem; font-weight: 500; color: var(--body); line-height: 1.55; margin-top: 6px; }

        /* ── secondary tournament rows ─────────────────────────────────── */
        .ie-rows { display: flex; flex-direction: column; gap: 18px; }
        .ie-row {
          display: flex; align-items: center; gap: 22px; text-align: left; width: 100%;
          background: var(--card); border: 3px solid var(--ink); border-radius: 22px;
          box-shadow: 7px 7px 0 var(--ink); padding: 20px 22px; cursor: pointer;
          font-family: inherit; color: var(--ink); transition: transform .16s, box-shadow .16s;
        }
        .ie-row:hover { transform: translate(-3px, -3px); box-shadow: 10px 10px 0 var(--ink); }
        .ie-row-main { flex: 1; min-width: 0; }
        .ie-row-name { font-size: 1.3rem; font-weight: 900; letter-spacing: -.03em; margin: 10px 0 2px; }
        .ie-row-side { flex: none; width: 190px; text-align: center; }
        .ie-row-big { font-size: 2.5rem; font-weight: 900; line-height: 1; letter-spacing: -.04em; }
        .ie-row-small { font-size: .7rem; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; color: var(--body); margin-top: 3px; }

        .ie-empty { border: 3.5px dashed rgba(22,19,31,.3); border-radius: 24px; padding: 44px 24px; text-align: center; }

        /* ── results ───────────────────────────────────────────────────── */
        .ie-win { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .ie-win-p { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px; border: 2px solid var(--ink); border-radius: 100px; background: var(--paper); font-size: .76rem; font-weight: 800; cursor: pointer; }
        .ie-win-p img { width: 17px; height: 17px; border-radius: 50%; display: block; }

        /* ── footer ────────────────────────────────────────────────────── */
        .ie-foot { position: relative; z-index: 2; background: var(--ink); color: var(--paper); padding: 52px 24px 40px; border-top: 3.5px solid var(--ink); }
        .ie-foot-brand { display: flex; align-items: center; justify-content: center; gap: 11px; margin-bottom: 20px; }
        .ie-foot-name { font-size: 1.22rem; font-weight: 900; letter-spacing: -.02em; }
        .ie-foot-links { display: flex; gap: 24px; justify-content: center; flex-wrap: wrap; margin-bottom: 26px; }
        .ie-foot-links a { color: rgba(255,247,234,.62); font-size: .88rem; font-weight: 700; text-decoration: none; }
        .ie-foot-links a:hover { color: var(--paper); text-decoration: underline; text-underline-offset: 4px; }
        .ie-foot-copy { text-align: center; font-size: .78rem; color: rgba(255,247,234,.34); }
        .ie-riot { margin: 18px auto 0; max-width: 880px; padding: 13px 17px; border: 2px solid rgba(255,247,234,.16); border-radius: 12px; font-size: 11px; line-height: 1.55; color: rgba(255,247,234,.5); text-align: center; }

        /* ── responsive ────────────────────────────────────────────────── */
        @media (max-width: 960px) {
          .ie-hero-grid { grid-template-columns: 1fr; grid-template-areas: "copy" "card" "sub" "cta"; gap: 20px; }
          .ie-sub { max-width: none; }
          .ie-nx { transform: rotate(-.7deg); }
          .ie-games { grid-template-columns: 1fr; }
          .ie-steps { grid-template-columns: repeat(2, 1fr); }
          .ie-row { flex-direction: column; align-items: stretch; gap: 16px; }
          .ie-row-side { width: 100%; }
        }
        @media (max-width: 620px) {
          .ie-hero { min-height: 0; padding: 22px 16px 34px; }
          .ie-sec { padding: 54px 16px; }
          .ie-copy h1 { font-size: clamp(2rem, 9vw, 2.6rem); margin: 13px 0 11px; }
          .ie-sub { font-size: .9rem; }
          .ie-nx { padding: 18px 16px 20px; border-radius: 22px; box-shadow: 7px 7px 0 var(--ink); }
          .ie-nx-name { font-size: 1.42rem; }
          .ie-btn { width: 100%; }
          .ie-steps { grid-template-columns: 1fr; }
          .ie-stats { gap: 18px; }
          .ie-b1, .ie-b2, .ie-b3 { opacity: .38; }
          .ie-game-art { height: 148px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ie-ticker-track, .ie-sp, .ie-blob, .ie-dot { animation: none !important; }
          html { scroll-behavior: auto; }
        }
      `}</style>

      <Navbar />

      {/* ═══ HERO — the next tournament, above the fold ═══ */}
      <div className="ie-wrap">
        <div className="ie-dots" />
        <div className="ie-blob ie-b1" />
        <div className="ie-blob ie-b2" />
        <div className="ie-blob ie-b3" />
        <Sparkle className="ie-sp ie-sp1" size={22} />
        <Sparkle className="ie-sp ie-sp2" size={26} fill="#FF9EC4" />

        <section className="ie-hero">
          <div className="ie-hero-grid">

            <div className="ie-copy">
              <span className="ie-stk" style={{ background: "var(--lemon)" }}>🎮 India&apos;s community esports ladder</span>
              <h1>Turn your rank<br />into a <span className="ie-mark" style={{ ["--hl" as string]: "var(--lilac)" }}>trophy</span>.</h1>
            </div>

            {/* Its own grid item so a phone can drop it BELOW the card — four lines
                of prose between the headline and the register button is exactly
                what pushes the thing we want seen out of the first fold. */}
            <p className="ie-sub">
              Dota 2, Valorant and CS2 tournaments run properly — rank-verified brackets,
              every match streamed, and prize money over UPI. Sign in once with Discord and you&apos;re in.
            </p>

            {nextUp ? (
              <NextUpCard card={nextUp} now={now} onGo={() => router.push(nextUp.href)} />
            ) : (
              <div className="ie-none">
                <div style={{ fontSize: "2rem", marginBottom: 10 }}>🗓️</div>
                Nothing scheduled this second.<br />The next bracket goes up on Discord first.
              </div>
            )}

            <div className="ie-actions">
              <div className="ie-btn-row">
                <button className="ie-btn" style={{ background: "var(--mint)" }} onClick={() => router.push("/valorant")}>
                  ⚡ Browse all tournaments
                </button>
                <button className="ie-btn" style={{ background: "#5865F2", color: "#fff" }} onClick={signIn}>
                  <DiscordIcon size={17} /> Sign in with Discord
                </button>
              </div>
              <div className="ie-stats">
                {[
                  { n: "₹50k+", l: "Prizes run" },
                  { n: "3", l: "Live games" },
                  { n: "UPI", l: "Payouts" },
                  { n: "0", l: "Screenshots needed" },
                ].map((s) => (
                  <div key={s.l}>
                    <span className="ie-stat-n">{s.n}</span>
                    <span className="ie-stat-l">{s.l}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>
      </div>

      {/* ═══ TICKER ═══ */}
      <div className="ie-ticker">
        <div className="ie-ticker-track">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span className="ie-ticker-item" key={i}>{t}</span>
          ))}
        </div>
      </div>

      {/* ═══ GAMES ═══ */}
      <div className="ie-wrap">
        <div className="ie-dots" style={{ opacity: .6 }} />
        <Sparkle className="ie-sp ie-sp3" size={20} fill="#C9B6FF" />
        <section className="ie-sec">
          <div className="ie-inner">
            <div className="ie-head">
              <span className="ie-stk" style={{ background: "var(--pink)" }}>Three games, all live</span>
              <h2 className="ie-h2" style={{ marginTop: 15 }}>
                Pick your <span className="ie-mark" style={{ ["--hl" as string]: "var(--mint)" }}>poison</span>.
              </h2>
              <p className="ie-h2-sub">Same platform, same payouts. Your bracket is decided by your actual rank, not by who you know.</p>
            </div>
            <div className="ie-games">
              {GAME_ORDER.map((k) => {
                const g = GAME[k];
                const live = cards.find((c) => c.key === k);
                return (
                  <button className="ie-game" key={k} onClick={() => router.push(g.path)}>
                    <div className="ie-game-art">
                      {/* 35% down keeps the characters' heads in a landscape crop —
                          centred, these key-art banners cut faces in half. */}
                      <Image src={g.art} alt={g.full} fill sizes="(max-width: 960px) 100vw, 33vw" style={{ objectFit: "cover", objectPosition: "center 35%" }} loading="lazy" />
                      <span className="ie-stk ie-game-badge" style={{ background: live ? g.acc : "var(--card)" }}>
                        {live ? <><span className="ie-dot" /> Open now</> : "Live"}
                      </span>
                    </div>
                    <div className="ie-game-body">
                      <div className="ie-game-name"><img src={g.logo} alt="" /> {g.full}</div>
                      <div className="ie-game-blurb">{g.blurb}</div>
                      <div className="ie-game-go">Enter →</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* ═══ ALSO ON + RESULTS ═══ */}
      <div className="ie-wrap" style={{ background: "var(--card)", borderTop: "3.5px solid var(--ink)", borderBottom: "3.5px solid var(--ink)" }}>
        <div className="ie-blob ie-b2" style={{ opacity: .3 }} />
        <section className="ie-sec">
          <div className="ie-inner">
            <div className="ie-head">
              <span className="ie-stk r" style={{ background: "var(--lilac)" }}>The calendar</span>
              <h2 className="ie-h2" style={{ marginTop: 15 }}>
                What else is <span className="ie-mark" style={{ ["--hl" as string]: "var(--lemon)" }}>coming up</span>.
              </h2>
            </div>

            {alsoOn.length > 0 ? (
              <div className="ie-rows">
                {alsoOn.map((c) => <TournamentRow key={c.t.id} card={c} now={now} onGo={() => router.push(c.href)} />)}
              </div>
            ) : (
              <div className="ie-empty">
                <div style={{ fontSize: "2rem", marginBottom: 10 }}>🎯</div>
                <div style={{ fontWeight: 900, fontSize: "1.1rem", marginBottom: 6 }}>
                  {nextUp ? "One tournament on the board right now." : "Nothing on the board right now."}
                </div>
                <p style={{ color: "var(--body)", fontSize: ".9rem", fontWeight: 500, marginBottom: 18 }}>
                  New brackets go up every few weeks. Discord gets them first.
                </p>
                <button className="ie-btn" style={{ background: "#5865F2", color: "#fff" }} onClick={signIn}>
                  <DiscordIcon size={17} /> Join on Discord
                </button>
              </div>
            )}

            {results.length > 0 && (
              <div style={{ marginTop: 62 }}>
                <div className="ie-head">
                  <span className="ie-stk" style={{ background: "var(--gold)" }}>👑 Hall of fame</span>
                  <h2 className="ie-h2" style={{ marginTop: 15 }}>
                    Who actually <span className="ie-mark" style={{ ["--hl" as string]: "var(--gold)" }}>won</span>.
                  </h2>
                </div>
                <div className="ie-rows">
                  {results.map(({ key, t }) => (
                    <button className="ie-row" key={`${key}-${t.id}`} onClick={() => router.push(GAME[key].detail(t.id))} style={{ background: "var(--paper)" }}>
                      <div className="ie-row-main">
                        <span className="ie-stk" style={{ background: "var(--gold)" }}>
                          <img src={GAME[key].logo} alt="" /> {GAME[key].label} · Completed
                        </span>
                        <div className="ie-row-name">{t.name}</div>
                        {t.championTeamName && (
                          <>
                            <div style={{ fontSize: ".95rem", fontWeight: 800 }}>
                              🏆 <span className="ie-mark" style={{ ["--hl" as string]: "var(--gold)" }}>{t.championTeamName}</span>
                            </div>
                            {!!t.championMembers?.length && (
                              <div className="ie-win">
                                {t.championMembers.map((m, i) => (
                                  <span
                                    className="ie-win-p" key={i}
                                    onClick={(e) => { e.stopPropagation(); if (m.uid) router.push(`/player/${m.uid}`); }}
                                  >
                                    {m.avatar
                                      ? <img src={m.avatar} alt="" />
                                      : <span style={{ width: 17, height: 17, borderRadius: "50%", background: "var(--gold)", border: "1.5px solid var(--ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: ".55rem", fontWeight: 900 }}>{(m.name || "?")[0].toUpperCase()}</span>}
                                    {m.name}{m.tag && <span style={{ color: "var(--muted)" }}>#{m.tag}</span>}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <div className="ie-row-side">
                        <span className="ie-btn wide" style={{ background: "var(--gold)" }}>See results →</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ═══ HOW IT WORKS ═══ */}
      <div className="ie-wrap">
        <div className="ie-dots" style={{ opacity: .6 }} />
        <div className="ie-blob ie-b1" style={{ opacity: .35 }} />
        <section className="ie-sec">
          <div className="ie-inner">
            <div className="ie-head">
              <span className="ie-stk" style={{ background: "var(--mint)" }}>Four steps, no admin</span>
              <h2 className="ie-h2" style={{ marginTop: 15 }}>
                Sign-up to <span className="ie-mark" style={{ ["--hl" as string]: "var(--pink)" }}>payout</span>.
              </h2>
            </div>
            <div className="ie-steps">
              {STEPS.map((s) => (
                <div className="ie-step" key={s.n}>
                  <div className="ie-step-top">
                    <div className="ie-step-n" style={{ background: s.bg }}>{s.n}</div>
                    <span className="ie-step-icon">{s.icon}</span>
                  </div>
                  <div className="ie-step-t">{s.title}</div>
                  <div className="ie-step-d">{s.desc}</div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: "center", marginTop: 46 }}>
              <button className="ie-btn" style={{ background: "var(--lemon)", fontSize: "1.05rem", padding: "16px 34px" }} onClick={() => router.push("/valorant")}>
                ⚡ Find your bracket
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* ═══ FOOTER ═══ */}
      <footer className="ie-foot">
        <div className="ie-inner">
          <div className="ie-foot-brand">
            <Image src="/ielogo.png" alt="Indian Esports" width={34} height={34} style={{ borderRadius: 8 }} />
            <span className="ie-foot-name">Indian Esports</span>
          </div>
          <div className="ie-foot-links">
            <a href="/about">About</a>
            <a href="/dota2">Dota 2</a>
            <a href="/valorant">Valorant</a>
            <a href="/cs2">CS2</a>
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
            <a href="mailto:iesportsbot@gmail.com">Contact</a>
          </div>
          <div className="ie-foot-copy">© 2026 Indian Esports. All rights reserved.</div>
          <div className="ie-riot">
            iesports isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
          </div>
        </div>
      </footer>
    </>
  );
}

/** The hero card. Everything a visitor needs to decide, without scrolling. */
function NextUpCard({ card, now, onGo }: { card: Card; now: number; onGo: () => void }) {
  const g = GAME[card.key];
  const t = card.t;
  const closing = card.deadline ? countdown(card.deadline, now) : null;

  return (
    <article className="ie-nx">
      <div className="ie-nx-rail" style={{ background: g.acc }} />
      <div className="ie-nx-head">
        <span className="ie-stk" style={{ background: g.acc }}><img src={g.logo} alt="" /> {g.label}</span>
        {card.start && <span className="ie-stk r" style={{ background: "var(--lemon)" }}>⏱ {whenSticker(card.start, now)}</span>}
      </div>

      <div className="ie-nx-name">{t.name}</div>

      <div className="ie-nx-when">
        {card.regOpen && <span className="ie-dot" />}
        {card.start ? <>📅 {fmtDayLong(card.start)} · {fmtTime(card.start)} IST</> : card.status}
      </div>

      <div className="ie-chips">
        {card.prize && <span className="ie-chip" style={{ background: "var(--gold)" }}>🏆 {card.prize} prize pool</span>}
        <span className="ie-chip">🎟️ {card.entry}</span>
        <span className="ie-chip">👥 {card.squad}</span>
        {t.playoffFormat && <span className="ie-chip">🥇 {t.playoffFormat}</span>}
      </div>

      {card.total > 0 && (
        <div className="ie-meter">
          <div className="ie-meter-row">
            <span>{card.booked} of {card.total} {card.unit} in</span>
            <strong>{card.full ? "Full" : `${card.left} left`}</strong>
          </div>
          <div className="ie-meter-bar">
            <div className="ie-meter-fill" style={{ width: `${Math.max(card.pct, card.booked > 0 ? 6 : 0)}%`, background: g.acc }} />
          </div>
        </div>
      )}

      <button
        className="ie-btn wide"
        style={{ background: card.regOpen ? g.acc : "var(--card)", marginTop: 18, fontSize: "1.02rem", padding: "15px 24px" }}
        onClick={onGo}
      >
        {card.regOpen
          ? (t.registrationMode === "team" ? "Register your team →" : "Grab a slot →")
          : "View tournament →"}
      </button>

      <div className="ie-nx-foot">
        {closing ? `Registration closes in ${closing}` : card.status}
      </div>
      <span className="ie-nx-link">Rules, format and schedule</span>
    </article>
  );
}

/** Any further live tournament, below the fold. */
function TournamentRow({ card, now, onGo }: { card: Card; now: number; onGo: () => void }) {
  const g = GAME[card.key];
  const t = card.t;
  const closing = card.deadline ? countdown(card.deadline, now) : null;

  return (
    <button className="ie-row" onClick={onGo}>
      <div className="ie-row-main">
        <span className="ie-stk" style={{ background: g.acc }}>
          <img src={g.logo} alt="" />
          {card.regOpen && <span className="ie-dot" />} {card.status}
        </span>
        <div className="ie-row-name">{t.name}</div>
        <div className="ie-chips">
          {card.start && <span className="ie-chip">📅 {fmtDay(card.start)} · {fmtTime(card.start)}</span>}
          {card.prize && <span className="ie-chip" style={{ background: "var(--gold)" }}>🏆 {card.prize}</span>}
          <span className="ie-chip">🎟️ {card.entry}</span>
          <span className="ie-chip">👥 {card.squad}</span>
        </div>
      </div>
      <div className="ie-row-side">
        {card.total > 0 && !card.full && (
          <>
            <div className="ie-row-big">{card.left}</div>
            <div className="ie-row-small">{card.unit} left</div>
          </>
        )}
        {card.full && <div className="ie-row-small" style={{ marginBottom: 10 }}>All {card.unit} taken</div>}
        <span className="ie-btn wide" style={{ background: card.regOpen ? g.acc : "var(--card)", marginTop: 12 }}>
          {card.regOpen ? "Register →" : "View →"}
        </span>
        {closing && <div className="ie-row-small" style={{ marginTop: 9, textTransform: "none", letterSpacing: 0 }}>Closes in {closing}</div>}
      </div>
    </button>
  );
}
