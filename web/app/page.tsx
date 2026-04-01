"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./context/AuthContext";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface Tournament {
  id: string; name: string; game: string; month: string; status: string;
  prizePool: string; entry: string; startDate: string; endDate: string;
  registrationDeadline: string; totalSlots: number; slotsBooked: number; desc: string;
}

const HOW_IT_WORKS = [
  { icon: "🔗", title: "Connect & Join",    desc: "Link your Steam account once. Then browse tournaments and register, no repeated setup needed.", color: "#3b82f6" },
  { icon: "⚔️", title: "Multiple Modes", desc: "Play 5v5 team tournaments in your rank bracket, or climb the leaderboard solo on your own schedule.", color: "#f97316" },
  { icon: "📊", title: "Automated Results", desc: "We track your match results automatically. Just play your game as usual, no manual reporting.", color: "#8b5cf6" },
  { icon: "🏆", title: "Get Rewarded",      desc: "Once a tournament ends you are rewarded based on your score. Prizes paid instantly via UPI.", color: "#22c55e" },
];

const HERO_IMAGES = [
  "/dota2poster3.png",
  "/valorantimg3.jpg",
  "/dota2image3.jpeg",
  "/valorant-agents.jpg",
  ];

const SteamIcon = ({ size = 18 }: { size?: number }) => (
  <img
    src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg"
    alt="Steam"
    width={size}
    height={size}
    style={{ display: "block" }}
  />
);

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [activeSection,      setActiveSection]      = useState("home");
  const [featuredTournament, setFeaturedTournament] = useState<Tournament | null>(null);
  const [featuredValTournament, setFeaturedValTournament] = useState<Tournament | null>(null);
  const [tournamentLoading,  setTournamentLoading]  = useState(true);
  const [riotModalOpen, setRiotModalOpen] = useState(false);

  // Hero image rotation state
  const [heroImageIndex, setHeroImageIndex] = useState(0);

  useEffect(() => {
    if (!loading && user) router.replace("/dota2");
  }, [user, loading, router]);

  // Fetch featured tournaments via API route (uses Admin SDK, bypasses auth rules)
  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const res = await fetch("/api/featured-tournaments");
        const data = await res.json();
        console.log("[Landing] Featured tournaments API response:", data);

        if (data.dota) {
          setFeaturedTournament(data.dota as Tournament);
        }
        if (data.valorant) {
          setFeaturedValTournament(data.valorant as Tournament);
        }
      } catch (e) { console.error("[Landing] Featured tournament fetch error:", e); }
      finally { setTournamentLoading(false); }
    };
    fetchTournaments();
  }, []);

  // Rotate hero images every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setHeroImageIndex((prev) => (prev + 3) % HERO_IMAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const sections = ["home", "games", "how-it-works", "tournament"];
    const observer = new IntersectionObserver(
      entries => { entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.id); }); },
      { threshold: 0.3 }
    );
    sections.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const loginWithSteam = () => { window.location.href = "/api/auth/steam"; };

  const slotsLeft = featuredTournament ? featuredTournament.totalSlots - featuredTournament.slotsBooked : null;
  const slotPct   = featuredTournament ? Math.round((featuredTournament.slotsBooked / featuredTournament.totalSlots) * 100) : 0;

  const valSlotsLeft = featuredValTournament ? featuredValTournament.totalSlots - featuredValTournament.slotsBooked : null;
  const valSlotPct   = featuredValTournament ? Math.round((featuredValTournament.slotsBooked / featuredValTournament.totalSlots) * 100) : 0;

  if (loading) return null;

  return (
    <>
      <style>{`
      
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        :root {
          --accent:#3B82F6; --accent-dark:#2563EB; --accent-light:#60A5FA;
          --orange:#3B82F6; --orange-dark:#2563EB;
          --text-primary:#F0EEEA; --text-secondary:#8A8880; --text-muted:#555550;
          --border:#2A2A30; --surface2:#121215; --off-white:#0A0A0C;
          --radius:16px; --radius-sm:10px;
          --shadow:0 2px 16px rgba(0,0,0,.45); --shadow-lg:0 8px 32px rgba(0,0,0,.6);
        }
        html { scroll-behavior:smooth; }
        body { background:var(--off-white); color:var(--text-primary); font-family:var(--font-geist-sans),system-ui,sans-serif; }
        .accent { color:var(--accent); }

        /* Navbar */
        .ie-nav { position:sticky; top:0; z-index:100; display:flex; align-items:center; justify-content:space-between; padding:0 28px; height:60px; background:rgba(10,10,12,.96); backdrop-filter:blur(12px); border-bottom:1px solid var(--border); }
        .ie-nav-brand { display:flex; align-items:center; gap:10px; text-decoration:none; }
        .ie-nav-name { font-size:1rem; font-weight:800; color:var(--text-primary); }
        .ie-nav-name span { color:var(--accent); }
        .ie-nav-links { display:flex; gap:4px; }
        .ie-nav-link { background:none; border:none; padding:6px 14px; border-radius:8px; font-size:.85rem; font-weight:600; color:var(--text-secondary); cursor:pointer; font-family:inherit; transition:all .15s; }
        .ie-nav-link:hover,.ie-nav-link.active { background:var(--surface2); color:var(--text-primary); }
        .ie-btn-steam { display:flex; align-items:center; gap:8px; background:linear-gradient(135deg,#1b2838,#2a475e); color:#fff; border:1px solid #3d6b8c; border-radius:100px; padding:8px 18px; font-size:.85rem; font-weight:700; cursor:pointer; font-family:inherit; transition:opacity .2s; white-space:nowrap; }
        .ie-btn-steam:hover { opacity:.85; }
        @media (max-width:600px) { .ie-nav-links { display:none; } }

        /* Hero */
        .ie-hero { position:relative; overflow:hidden; width:100%; min-height:580px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:80px 20px 60px; }
        .ie-hero-bg-img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0; pointer-events:none; transition:opacity 1s ease-in-out; }
        .ie-hero-bg-img.active { opacity:1; }
        .ie-hero-bg-img.inactive { opacity:0; }
        .ie-hero-video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0; pointer-events:none; display:none; }
        .ie-hero-overlay { position:absolute; inset:0; z-index:1; background:linear-gradient(to bottom,rgba(0,0,0,.82) 0%,rgba(0,0,0,.58) 45%,rgba(0,0,0,.9) 100%); }
        .ie-hero-glow { position:absolute; top:-60px; left:50%; transform:translateX(-50%); width:560px; height:560px; background:radial-gradient(circle,rgba(59,130,246,.22) 0%,transparent 70%); pointer-events:none; z-index:2; }
        .ie-hero-content { position:relative; z-index:3; max-width:700px; width:100%; }
        .ie-hero-logo { margin-bottom:12px; display:flex; justify-content:center; }
        .ie-hero-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(59,130,246,.16); border:1px solid rgba(59,130,246,.38); color:var(--accent-light); font-size:.72rem; font-weight:700; padding:5px 14px; border-radius:100px; margin-bottom:12px; letter-spacing:.06em; text-transform:uppercase; }
        .ie-pulse { width:6px; height:6px; background:var(--accent); border-radius:50%; animation:ie-pulse 1.8s infinite; flex-shrink:0; }
        @keyframes ie-pulse { 0%,100%{opacity:1;} 50%{opacity:.3;} }
        .ie-hero h1 { font-size:clamp(1.7rem,5.5vw,3.6rem); font-weight:900; line-height:1.02; color:#fff; letter-spacing:-.02em; margin-bottom:10px; }
        .ie-hero h1 .accent { color:var(--accent); }
        .ie-hero-sub { font-size:clamp(.82rem,1.8vw,.95rem); color:rgba(255,255,255,.64); line-height:1.7; max-width:520px; margin:0 auto 20px; }
        .ie-hero-cta { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
        .ie-btn-primary { background:linear-gradient(135deg,#1b2838,#2a475e); color:#fff; border:1px solid #3d6b8c; border-radius:100px; padding:13px 28px; font-size:1rem; font-weight:700; cursor:pointer; font-family:inherit; min-height:50px; display:inline-flex; align-items:center; gap:10px; box-shadow:0 4px 22px rgba(27,40,56,.5); transition:opacity .2s,transform .1s; }
        .ie-btn-primary:hover { opacity:.88; }
        .ie-btn-primary:active { transform:scale(.97); }
        .ie-btn-secondary { background:rgba(255,255,255,.08); color:#fff; border:1.5px solid rgba(255,255,255,.25); border-radius:100px; padding:11px 24px; font-size:.9rem; font-weight:600; cursor:pointer; font-family:inherit; min-height:44px; display:inline-flex; align-items:center; gap:8px; text-decoration:none; backdrop-filter:blur(4px); transition:background .2s,border-color .2s; }
        .ie-btn-secondary:hover { border-color:rgba(255,255,255,.5); background:rgba(255,255,255,.14); }
        .ie-hero-stats { position:relative; z-index:3; display:flex; justify-content:center; gap:28px; margin-top:40px; flex-wrap:wrap; }
        .ie-stat { text-align:center; }
        .ie-stat-num { font-size:1.45rem; font-weight:900; color:#fff; display:block; }
        .ie-stat-num span { color:var(--accent); }
        .ie-stat-label { font-size:.65rem; color:rgba(255,255,255,.44); text-transform:uppercase; letter-spacing:.08em; }
        @media (max-width:480px) { .ie-hero { min-height:100svh; padding:60px 18px 50px; } .ie-hero-cta { flex-direction:column; align-items:stretch; } .ie-btn-primary,.ie-btn-secondary { width:100%; justify-content:center; } .ie-hero-stats { gap:16px; margin-top:28px; } }

        /* Trust */
        .ie-trust { background:var(--surface2); border-top:1px solid var(--border); border-bottom:1px solid var(--border); padding:20px; }
        .ie-trust-items { display:flex; justify-content:center; align-items:center; flex-wrap:wrap; gap:22px; max-width:900px; margin:0 auto; }
        .ie-trust-item { display:flex; align-items:center; gap:8px; }
        .ie-trust-text { font-size:.83rem; font-weight:600; color:var(--text-secondary); }

        /* Sections */
        .ie-section { padding:72px 20px; }
        .ie-section-light { background:var(--off-white); }
        .ie-section-white { background:#18181C; }
        .ie-section-title { font-size:clamp(1.75rem,4.5vw,2.7rem); font-weight:900; color:var(--text-primary); letter-spacing:-.02em; }
        .ie-section-title .accent { color:var(--accent); }
        .ie-section-sub { font-size:1rem; color:var(--text-secondary); margin-top:8px; max-width:480px; }
        .ie-section-header { margin-bottom:44px; }
        .ie-container { max-width:1120px; margin:0 auto; }

        /* Games */
        .ie-games-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
        @media (max-width:900px) { .ie-games-grid { grid-template-columns:repeat(2,1fr); } }
        @media (max-width:480px) { .ie-games-grid { grid-template-columns:1fr; } }
        .ie-game-card { border-radius:var(--radius); overflow:hidden; position:relative; aspect-ratio:3/4; cursor:pointer; transition:transform .25s; box-shadow:var(--shadow); }
        .ie-game-card:hover { transform:translateY(-6px); box-shadow:var(--shadow-lg); }
        .ie-game-overlay { position:absolute; inset:0; background:linear-gradient(to top,rgba(0,0,0,.94) 0%,rgba(0,0,0,.1) 55%,transparent 100%); }
        .ie-game-info { position:absolute; bottom:0; left:0; right:0; padding:20px 16px 18px; }
        .ie-game-tag { display:inline-block; background:var(--accent); color:#fff; font-size:.62rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; padding:3px 8px; border-radius:4px; margin-bottom:6px; }
        .ie-game-tag.soon { background:rgba(255,255,255,.14); backdrop-filter:blur(4px); }
        .ie-game-name { font-size:1.25rem; font-weight:900; color:#fff; }
        .ie-game-card-img { transition:transform .45s; }
        .ie-game-card:hover .ie-game-card-img { transform:scale(1.05); }

        /* How It Works */
        .ie-hiw-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; }
        @media (max-width:900px) { .ie-hiw-grid { grid-template-columns:repeat(2,1fr); } }
        @media (max-width:480px) { .ie-hiw-grid { grid-template-columns:1fr; } }
        .ie-hiw-card { background:#18181C; border-radius:20px; overflow:hidden; display:flex; flex-direction:column; box-shadow:var(--shadow); border:1px solid var(--border); }
        .ie-hiw-img-wrap { position:relative; height:130px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .ie-hiw-icon-big { font-size:2.8rem; position:relative; z-index:1; }
        .ie-hiw-body { padding:18px 18px 22px; }
        .ie-hiw-title { font-size:1rem; font-weight:800; color:var(--text-primary); margin-bottom:6px; }
        .ie-hiw-desc { font-size:.83rem; color:var(--text-secondary); line-height:1.6; }

        /* Tournament */
        .ie-tourn-wrap { background:linear-gradient(135deg,#08090c 0%,#10121a 50%,#08090c 100%); border-radius:24px; padding:44px; display:flex; align-items:flex-start; gap:32px; box-shadow:0 16px 48px rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.04); }
        .ie-tourn-left { flex:1; }
        .ie-tourn-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(59,130,246,.15); border:1px solid rgba(59,130,246,.3); color:var(--accent-light); font-size:.68rem; font-weight:700; padding:4px 12px; border-radius:100px; margin-bottom:14px; text-transform:uppercase; letter-spacing:.06em; }
        .ie-tourn-badge.val { background:rgba(255,70,85,.15); border-color:rgba(255,70,85,.3); color:#ff4655; }
        .ie-tourn-title { font-size:clamp(1.3rem,3.5vw,2rem); font-weight:900; color:#fff; line-height:1.1; margin-bottom:8px; }
        .ie-tourn-desc { font-size:.87rem; color:rgba(255,255,255,.42); line-height:1.6; margin-bottom:24px; max-width:480px; }
        .ie-tourn-meta { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:20px; }
        .ie-tourn-chip { background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08); border-radius:100px; padding:6px 14px; font-size:.78rem; color:rgba(255,255,255,.65); display:flex; align-items:center; gap:6px; }
        .ie-tourn-right { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); border-radius:16px; padding:28px 24px; min-width:220px; display:flex; flex-direction:column; align-items:center; gap:4px; }
        .ie-slots-num { font-size:2.6rem; font-weight:900; color:var(--accent); line-height:1; }
        .ie-slots-label { font-size:.78rem; color:rgba(255,255,255,.4); margin-top:4px; }
        .ie-slots-bar { height:5px; border-radius:3px; background:rgba(255,255,255,.08); overflow:hidden; margin-top:12px; width:100%; margin-bottom:16px; }
        .ie-slots-fill { height:100%; border-radius:3px; transition:width .6s; }
        .ie-btn-register { background:linear-gradient(135deg,#1b2838,#2a475e); color:#fff; border:1px solid #3d6b8c; border-radius:100px; padding:15px 36px; font-size:1rem; font-weight:700; cursor:pointer; font-family:inherit; min-height:52px; width:100%; display:flex; align-items:center; justify-content:center; gap:8px; transition:opacity .2s; }
        .ie-btn-register:hover { opacity:.88; }
        .ie-btn-register.val { background:linear-gradient(135deg,#ff4655,#cc2233); border-color:#ff4655; }
        .ie-tourn-detail-link { display:block; text-align:center; margin-top:10px; font-size:.82rem; color:rgba(255,255,255,.32); text-decoration:none; transition:color .2s; }
        .ie-tourn-detail-link:hover { color:rgba(255,255,255,.65); }
        .ie-tourn-grid { display:flex; flex-direction:column; gap:28px; }
        @media (max-width:700px) { .ie-tourn-wrap { padding:36px 24px; flex-direction:column; } .ie-tourn-right { width:100%; } }

        /* Modal overlay */
        @keyframes riot-modal-in { from { opacity:0; transform:scale(.95) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }

        /* Footer */
        .ie-footer { background:#060608; color:rgba(255,255,255,.4); padding:40px 20px; text-align:center; }
        .ie-footer-brand { display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:16px; }
        .ie-footer-name { font-size:1.1rem; font-weight:800; color:#fff; }
        .ie-footer-links { display:flex; gap:20px; justify-content:center; flex-wrap:wrap; margin-bottom:24px; }
        .ie-footer-links a { color:rgba(255,255,255,.38); font-size:.84rem; text-decoration:none; transition:color .2s; }
        .ie-footer-links a:hover { color:var(--accent); }
        .ie-footer-copy { font-size:.77rem; color:rgba(255,255,255,.18); }

      `}</style>

      {/* NAVBAR */}
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
            <button key={id} className={`ie-nav-link${activeSection === id ? " active" : ""}`} onClick={() => scrollTo(id)}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="ie-btn-steam" onClick={loginWithSteam}>
            <SteamIcon size={22} />
            STEAM
          </button>
          <button className="ie-btn-steam" onClick={() => setRiotModalOpen(true)} style={{ background: "linear-gradient(135deg, #ff4655, #cc2233)", borderColor: "#ff4655" }}>
            <img src="/riot-games.png" alt="Riot" width={35} height={22} style={{ display: "block", borderRadius: 3 }} />
            RIOT
          </button>
        </div>
      </nav>

      {/* HERO — rotating background images (video kept hidden for future use) */}
      <section className="ie-hero" id="home">
        {HERO_IMAGES.map((src, i) => (
          <img
            key={src}
            className={`ie-hero-bg-img ${i === heroImageIndex ? "active" : "inactive"}`}
            src={src}
            alt=""
            aria-hidden="true"
          />
        ))}
        {/* Video element kept for future use, hidden via CSS display:none */}
        {/* <video className="ie-hero-video" src="/Dota2teaser.mp4" autoPlay muted loop playsInline preload="auto" poster="/dota2-poster.jpg" aria-hidden="true" /> */}
        <div className="ie-hero-overlay" />
        <div className="ie-hero-glow" />
        <div className="ie-hero-content">
          <div className="ie-hero-logo">
            <Image src="/ielogo.png" alt="Indian Esports" width={144} height={144} priority style={{ borderRadius: 22, filter: "drop-shadow(0 8px 32px rgba(240,90,40,.6))" }} />
          </div>
          <div className="ie-hero-badge"><span className="ie-pulse" /> Now Live – May Championship 2026</div>
          <h1>Compete on<br /><span className="accent">Indian Esports</span></h1>
          <p className="ie-hero-sub">Play what you love. Compete in your rank bracket in totally free community events. Win with skills.</p>
          <div className="ie-hero-cta">
            <button className="ie-btn-primary" onClick={loginWithSteam}>
              <SteamIcon size={20} />
              Sign in with Steam
            </button>
            <button className="ie-btn-primary" onClick={() => setRiotModalOpen(true)} style={{ background: "linear-gradient(135deg, #ff4655, #cc2233)", borderColor: "#ff4655", boxShadow: "0 4px 22px rgba(255,70,85,.4)" }}>
              <img src="/riot-games.png" alt="Riot" width={20} height={20} style={{ display: "block", borderRadius: 3 }} />
              Sign in with Riot
            </button>
            <a href="#how-it-works" className="ie-btn-secondary">
              Learn More
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
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

      {/* TRUST */}
      <div className="ie-trust">
        <div className="ie-trust-items">
          {[
            { icon: "🛡️", text: "Verified & Safe Platform" },
            { icon: "💸", text: "Instant UPI Payouts"      },
            { icon: "🏆", text: "Skill-Based Brackets"     },
            { icon: "📱", text: "100% Free Entry"          },
            { icon: "🇮🇳", text: "Made for India"           },
          ].map(t => (
            <div className="ie-trust-item" key={t.text}><span>{t.icon}</span><span className="ie-trust-text">{t.text}</span></div>
          ))}
        </div>
      </div>

      {/* GAMES */}
      <section className="ie-section ie-section-white" id="games">
        <div className="ie-container">
          <div className="ie-section-header">
            <h2 className="ie-section-title">Available <span className="accent">Games</span></h2>
            <p className="ie-section-sub">Pick your game and compete against players in your skill tier.</p>
          </div>
          <div className="ie-games-grid">
            {[
              { name: "Dota 2",         tag: "Live Now",    src: "/dota2image3.jpeg",   soon: false },
              { name: "Valorant",       tag: "Live Now",    src: "/valorantimage1.jpg", soon: false },
              { name: "Counter Strike", tag: "Coming Soon", src: "/csgoimage3.jpg",     soon: true  },
              { name: "Call of Duty",   tag: "Coming Soon", src: "/codimage1.jpg",      soon: true  },
            ].map(g => (
              <div className="ie-game-card" key={g.name}>
                <Image className="ie-game-card-img" src={g.src} alt={g.name} fill sizes="(max-width:480px) 100vw,(max-width:900px) 50vw,25vw" style={{ objectFit: "cover" }} loading="lazy" />
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

      {/* HOW IT WORKS */}
      <section className="ie-section ie-section-light" id="how-it-works">
        <div className="ie-container">
          <div className="ie-section-header" style={{ textAlign: "center" }}>
            <h2 className="ie-section-title">How It <span className="accent">Works</span></h2>
            <p className="ie-section-sub" style={{ margin: "8px auto 0" }}>From signup to prize money in 4 simple steps.</p>
          </div>
          <div className="ie-hiw-grid">
            {HOW_IT_WORKS.map((item, i) => (
              <div className="ie-hiw-card" key={item.title}>
                <div className="ie-hiw-img-wrap" style={{ background: `linear-gradient(135deg, ${item.color}22 0%, ${item.color}44 100%)` }}>
                  <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0.15 }} viewBox="0 0 300 160" preserveAspectRatio="xMidYMid slice">
                    <circle cx="240" cy="-20" r="100" fill={item.color} />
                    <circle cx="60" cy="180" r="80" fill={item.color} />
                    <circle cx="150" cy="80" r="50" fill={item.color} />
                  </svg>
                  <span className="ie-hiw-icon-big">{item.icon}</span>
                  <span style={{ position:"absolute", top:12, left:14, background:item.color, color:"#fff", fontSize:".7rem", fontWeight:800, padding:"3px 9px", borderRadius:100, letterSpacing:".04em" }}>STEP {i + 1}</span>
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

      {/* FEATURED TOURNAMENTS */}
      <section className="ie-section ie-section-white" id="tournament">
        <div className="ie-container">
          <div className="ie-section-header">
            <h2 className="ie-section-title">Featured <span className="accent">Tournaments</span></h2>
          </div>
          {tournamentLoading ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text-muted)", fontSize:".95rem" }}>Loading tournaments…</div>
          ) : (!featuredTournament && !featuredValTournament) ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text-muted)", fontSize:".95rem" }}>No upcoming tournaments right now. Check back soon!</div>
          ) : (
            <div className="ie-tourn-grid">
              {/* Dota 2 Tournament */}
              {featuredTournament && (
                <div className="ie-tourn-wrap">
                  <div className="ie-tourn-left">
                    <div className="ie-tourn-badge"><span className="ie-pulse" /> Registration Open</div>
                    <div className="ie-tourn-title">{featuredTournament.name}</div>
                    <div className="ie-tourn-desc">{featuredTournament.desc}</div>
                    <div className="ie-tourn-meta">
                      {[
                        { icon: "🎮", label: featuredTournament.game },
                        { icon: "🏆", label: featuredTournament.prizePool },
                        { icon: "🎟️", label: featuredTournament.entry },
                        { icon: "📅", label: featuredTournament.startDate },
                      ].map(c => (
                        <div className="ie-tourn-chip" key={c.label}><span>{c.icon}</span>{c.label}</div>
                      ))}
                    </div>
                  </div>
                  <div className="ie-tourn-right">
                    <div className="ie-slots-num">{slotsLeft}</div>
                    <div className="ie-slots-label">slots remaining</div>
                    <div className="ie-slots-bar">
                      <div className="ie-slots-fill" style={{ width:`${slotPct}%`, background: slotPct > 80 ? "#ef4444" : slotPct > 50 ? "#f59e0b" : "var(--orange)" }} />
                    </div>
                    <button className="ie-btn-register" onClick={loginWithSteam}>
                      <SteamIcon size={18} /> Sign in with Steam to Register
                    </button>
                    <a href={`/tournament/${featuredTournament.id}`} className="ie-tourn-detail-link">View full details & rules →</a>
                  </div>
                </div>
              )}

              {/* Valorant Tournament */}
              {featuredValTournament && (
                <div className="ie-tourn-wrap">
                  <div className="ie-tourn-left">
                    <div className="ie-tourn-badge val"><span className="ie-pulse" style={{ background: "#ff4655" }} /> Registration Open</div>
                    <div className="ie-tourn-title">{featuredValTournament.name}</div>
                    <div className="ie-tourn-desc">{featuredValTournament.desc}</div>
                    <div className="ie-tourn-meta">
                      {[
                        { icon: "🎮", label: featuredValTournament.game || "Valorant" },
                        { icon: "🏆", label: featuredValTournament.prizePool || "TBD" },
                        { icon: "🎟️", label: (featuredValTournament as any).entryFee > 0 ? `₹${(featuredValTournament as any).entryFee}` : featuredValTournament.entry || "Free" },
                        { icon: "📅", label: featuredValTournament.startDate?.includes("T") ? new Date(featuredValTournament.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : featuredValTournament.startDate },
                      ].map(c => (
                        <div className="ie-tourn-chip" key={c.label}><span>{c.icon}</span>{c.label}</div>
                      ))}
                    </div>
                  </div>
                  <div className="ie-tourn-right">
                    <div className="ie-slots-num" style={{ color: "#ff4655" }}>{valSlotsLeft}</div>
                    <div className="ie-slots-label">slots remaining</div>
                    <div className="ie-slots-bar">
                      <div className="ie-slots-fill" style={{ width:`${valSlotPct}%`, background: valSlotPct > 80 ? "#ef4444" : valSlotPct > 50 ? "#f59e0b" : "#ff4655" }} />
                    </div>
                    <button className="ie-btn-register val" onClick={() => setRiotModalOpen(true)}>
                      <img src="/riot-games.png" alt="Riot" width={18} height={18} style={{ display: "block", borderRadius: 3 }} />
                      Sign in with Riot to Register
                    </button>
                    <a href={`/valorant/tournament/${featuredValTournament.id}`} className="ie-tourn-detail-link">View full details & rules →</a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* FOOTER */}
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

      {/* ── RIOT RSO MODAL ── */}
      {riotModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }} onClick={(e) => { if (e.target === e.currentTarget) setRiotModalOpen(false); }}>
          <div style={{
            background: "#fff", borderRadius: 20, padding: "36px 32px",
            maxWidth: 420, width: "100%", position: "relative",
            boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
            animation: "riot-modal-in 0.2s ease",
          }}>
            {/* Close button */}
            <button onClick={() => setRiotModalOpen(false)} style={{
              position: "absolute", top: 14, right: 14,
              background: "#F8F7F4", border: "1px solid #E5E3DF", borderRadius: "50%",
              width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", fontSize: 16, color: "#888",
            }}>✕</button>

            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <img src="/riot-games.png" alt="Riot Games" style={{ width: 56, height: 56, borderRadius: 12, marginBottom: 14 }} />
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111", marginBottom: 6 }}>Riot Sign-On Coming Soon</h2>
              <p style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>
                Direct Riot authentication (RSO) is not available yet. Sign in with Steam or Discord to get started, then link your Riot ID from your profile.
              </p>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "#F2F1EE", margin: "0 -8px 20px" }} />

            {/* Sign in options */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => { setRiotModalOpen(false); loginWithSteam(); }} style={{
                width: "100%", padding: "14px 20px",
                background: "linear-gradient(135deg, #1b2838, #2a475e)",
                border: "1px solid #3d6b8c", borderRadius: 12,
                color: "#fff", fontWeight: 700, fontSize: 15,
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 10, fontFamily: "inherit",
              }}>
                <SteamIcon size={20} />
                Sign in with Steam
              </button>
              <button onClick={() => { setRiotModalOpen(false); window.location.href = "/api/auth/discord-login"; }} style={{
                width: "100%", padding: "14px 20px",
                background: "#5865F2",
                border: "1px solid #4752C4", borderRadius: 12,
                color: "#fff", fontWeight: 700, fontSize: 15,
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 10, fontFamily: "inherit",
              }}>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="white">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.114 18.1.132 18.114a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Sign in with Discord
              </button>
            </div>

            {/* Footer note */}
            <p style={{ fontSize: 14, color: "#1c1919", textAlign: "center", marginTop: 16, lineHeight: 1.5 }}>
              After signing in, you can link your Riot ID manually from profile section to join tournaments.
            </p>
          </div>
        </div>
      )}
    </>
  );
}