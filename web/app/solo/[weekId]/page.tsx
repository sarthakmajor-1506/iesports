"use client";

import { useAuth } from "../../context/AuthContext";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Navbar from "../../components/Navbar";
import { SoloTournament, SoloPlayer } from "@/lib/types";
import { getTimeUntilDeadline } from "@/lib/soloTournaments";
import { PRIZE_DISTRIBUTION, getPrizeForRank } from "@/lib/soloScoring";

// ── Hero map ─────────────────────────────────────────────────────────────────
const HEROES: Record<number, string> = {
  1:"Anti-Mage",2:"Axe",3:"Bane",4:"Bloodseeker",5:"Crystal Maiden",
  6:"Drow Ranger",7:"Earthshaker",8:"Juggernaut",9:"Mirana",10:"Morphling",
  11:"Shadow Fiend",12:"Phantom Lancer",13:"Puck",14:"Pudge",15:"Razor",
  16:"Sand King",17:"Storm Spirit",18:"Sven",19:"Tiny",20:"Vengeful Spirit",
  21:"Windranger",22:"Zeus",23:"Kunkka",25:"Lina",26:"Lion",
  27:"Shadow Shaman",28:"Slardar",29:"Tidehunter",30:"Witch Doctor",
  31:"Lich",32:"Riki",33:"Enigma",34:"Tinker",35:"Sniper",36:"Necrophos",
  37:"Warlock",38:"Beastmaster",39:"Queen of Pain",40:"Venomancer",
  41:"Faceless Void",42:"Wraith King",43:"Death Prophet",44:"Phantom Assassin",
  45:"Pugna",46:"Templar Assassin",47:"Viper",48:"Luna",49:"Dragon Knight",
  50:"Dazzle",51:"Clockwerk",52:"Leshrac",53:"Nature's Prophet",54:"Lifestealer",
  55:"Dark Seer",56:"Clinkz",57:"Omniknight",58:"Enchantress",59:"Huskar",
  60:"Night Stalker",61:"Broodmother",62:"Bounty Hunter",63:"Weaver",64:"Jakiro",
  65:"Batrider",66:"Chen",67:"Spectre",68:"Ancient Apparition",69:"Doom",
  70:"Ursa",71:"Spirit Breaker",72:"Gyrocopter",73:"Alchemist",74:"Invoker",
  75:"Silencer",76:"Outworld Destroyer",77:"Lycan",78:"Brewmaster",
  79:"Shadow Demon",80:"Lone Druid",81:"Chaos Knight",82:"Meepo",
  83:"Treant Protector",84:"Ogre Magi",85:"Undying",86:"Rubick",
  87:"Disruptor",88:"Nyx Assassin",89:"Naga Siren",90:"Keeper of the Light",
  91:"Io",92:"Visage",93:"Slark",94:"Medusa",95:"Troll Warlord",
  96:"Centaur Warrunner",97:"Magnus",98:"Timbersaw",99:"Bristleback",
  100:"Tusk",101:"Skywrath Mage",102:"Abaddon",103:"Elder Titan",
  104:"Legion Commander",105:"Techies",106:"Ember Spirit",107:"Earth Spirit",
  108:"Underlord",109:"Terrorblade",110:"Phoenix",111:"Oracle",
  112:"Winter Wyvern",113:"Arc Warden",114:"Monkey King",119:"Dark Willow",
  120:"Pangolier",121:"Grimstroke",129:"Mars",135:"Snapfire",136:"Void Spirit",
  137:"Hoodwink",138:"Dawnbreaker",145:"Marci",146:"Primal Beast",
  147:"Muerta",148:"Ringmaster",
};

function heroName(id?: number): string {
  if (!id) return "—";
  return HEROES[id] ?? `Hero #${id}`;
}

function fmtMatchDate(unix: number): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function fmtDuration(secs: number): string {
  if (!secs) return "—";
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function fmtDateTime(unix: number): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

// ── Overview tab ─────────────────────────────────────────────────────────────
function OverviewTab({ tournament, countdown }: { tournament: SoloTournament; countdown: string }) {
  const now = Date.now() / 1000;

  // Build schedule from unix timestamps stored on the doc
  const regOpenUnix  = tournament.createdAtUnix    || (tournament.createdAt  ? Math.floor(new Date(tournament.createdAt as string).getTime()/1000)  : 0);
  const startUnix    = tournament.startTime        || (tournament.weekStart  ? Math.floor(new Date(tournament.weekStart  as string).getTime()/1000)  : 0);
  const regCloseUnix = tournament.registrationDeadlineUnix || (tournament.registrationDeadline ? Math.floor(new Date(tournament.registrationDeadline as string).getTime()/1000) : 0);
  const endUnix      = tournament.endTime          || (tournament.weekEnd    ? Math.floor(new Date(tournament.weekEnd    as string).getTime()/1000)    : 0);

  const steps = [
    { label: "REGISTRATION OPENS", unix: regOpenUnix,  done: true,               active: false,            upNext: false },
    { label: "REGISTRATION CLOSES",unix: regCloseUnix, done: now > regCloseUnix, active: now <= regCloseUnix && now >= startUnix, upNext: now <= regCloseUnix },
    { label: "TOURNAMENT STARTS",   unix: startUnix,   done: now > startUnix,    active: tournament.status === "active",           upNext: now <= startUnix && now > regCloseUnix },
    { label: "TOURNAMENT ENDS",     unix: endUnix,     done: tournament.status === "ended",                 active: false,            upNext: false },
  ];

  return (
    <div className="solo-overview-grid" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>
      {/* About */}
      <div style={{ background: "#fff", border: "1px solid #E5E3DF", borderRadius: 14, padding: "26px 28px" }}>
        <SectionLabel icon="📋" text="About" />
        <h2 style={{ fontSize: "1.35rem", fontWeight: 900, color: "#111", margin: "12px 0 8px", lineHeight: 1.2 }}>
          {tournament.name}
        </h2>
        <p style={{ fontSize: "0.88rem", color: "#666", lineHeight: 1.7, marginBottom: 20 }}>
          {(tournament as any).description ||
            "Play your normal ranked Dota 2 games — your top 5 match scores during the tournament window count toward the leaderboard. No special lobbies. No scheduling. Just play and climb."}
        </p>
        <div style={{ borderTop: "1px solid #F2F1EE", paddingTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <InfoRow icon="🎮" label="Game"        value="Dota 2 — Ranked Matches" />
          <InfoRow icon="📊" label="Format"      value="Solo — Top 5 matches scored" />
          <InfoRow icon="🏆" label="Prize Pool"  value={tournament.prizePool as string} highlight />
          <InfoRow icon="🎟️" label="Entry"       value={tournament.type === "paid" ? String((tournament as any).entryFee || "") : "Free"} />
          <InfoRow icon="👥" label="Slots"       value={`${tournament.totalSlots} players`} />
          <InfoRow icon="⚙️" label="Scoring"     value="Kills ×3 · Assists ×1 · Deaths ×−2 · Win +20 · LH/GPM/XPM bonuses" />
        </div>
        {(tournament as any).rules && (
          <div style={{ marginTop: 20, background: "#F8F7F4", border: "1px solid #E5E3DF", borderRadius: 10, padding: "14px 18px" }}>
            <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#bbb", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Rules</div>
            <p style={{ fontSize: "0.84rem", color: "#555", lineHeight: 1.7, whiteSpace: "pre-line" }}>{(tournament as any).rules}</p>
          </div>
        )}
      </div>

      {/* Schedule */}
      <div style={{ background: "#fff", border: "1px solid #E5E3DF", borderRadius: 14, padding: "26px 24px" }}>
        <SectionLabel icon="🕐" text="Schedule" />
        <div style={{ marginTop: 18 }}>
          {steps.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 14, flexShrink: 0, paddingTop: 2 }}>
                <div style={{
                  width: 13, height: 13, borderRadius: "50%", flexShrink: 0,
                  background: step.done ? "#22c55e" : step.active ? "#F05A28" : "#E5E3DF",
                  border: `2px solid ${step.done ? "#16a34a" : step.active ? "#D44A1A" : "#bbb"}`,
                  boxShadow: step.active ? "0 0 0 3px rgba(240,90,40,0.15)" : "none",
                  zIndex: 1,
                }} />
                {i < steps.length - 1 && (
                  <div style={{ width: 2, flex: 1, minHeight: 32, background: step.done ? "#22c55e" : "#E5E3DF", margin: "2px 0" }} />
                )}
              </div>
              <div style={{ paddingBottom: i < steps.length - 1 ? 18 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: "0.63rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
                    color: step.active ? "#F05A28" : step.done ? "#16a34a" : "#888",
                  }}>
                    {step.label}
                  </span>
                  {step.active && (
                    <span style={{ fontSize: "0.58rem", fontWeight: 800, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 100, padding: "1px 7px" }}>ACTIVE</span>
                  )}
                  {step.upNext && !step.active && !step.done && (
                    <span style={{ fontSize: "0.58rem", fontWeight: 800, background: "#fefce8", color: "#ca8a04", border: "1px solid #fde68a", borderRadius: 100, padding: "1px 7px" }}>UP NEXT</span>
                  )}
                </div>
                <div style={{ fontSize: "0.82rem", color: "#555" }}>{step.unix ? fmtDateTime(step.unix) : "—"}</div>
              </div>
            </div>
          ))}
        </div>
        {countdown && countdown !== "Registration Closed" && (
          <div style={{ marginTop: 20, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "11px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", color: "#555" }}>Registration closes in</span>
            <span style={{ fontSize: "0.88rem", fontWeight: 800, color: "#16a34a" }}>{countdown}</span>
          </div>
        )}
        {countdown === "Registration Closed" && (
          <div style={{ marginTop: 20, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "11px 16px", textAlign: "center", fontSize: "0.82rem", color: "#ea580c", fontWeight: 700 }}>
            🔒 Registration Closed
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#bbb", display: "flex", alignItems: "center", gap: 6 }}>
      <span>{icon}</span>{text}
    </div>
  );
}

function InfoRow({ icon, label, value, highlight }: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div>
        <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: "0.86rem", fontWeight: highlight ? 800 : 500, color: highlight ? "#F05A28" : "#333" }}>{value}</div>
      </div>
    </div>
  );
}

// ── Scoring tab ───────────────────────────────────────────────────────────────
function ScoringTab({ prizePool }: { prizePool: string }) {
  return (
    <div className="solo-scoring-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div style={{ background: "#fff", border: "1px solid #E5E3DF", borderRadius: 14, padding: "26px 26px" }}>
        <SectionLabel icon="📐" text="How Score Is Computed" />
        <p style={{ fontSize: "0.84rem", color: "#888", margin: "14px 0 18px", lineHeight: 1.6 }}>
          Every ranked game you play counts. After the window closes, your <strong style={{ color: "#111" }}>top 5 matches</strong> by score are summed. Score never goes below 0.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { event: "Win the match",    pts: "+20", color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0", note:"Flat bonus" },
            { event: "Each Kill",        pts: "+3",  color:"#F05A28", bg:"#fff7ed", border:"#fed7aa", note:"Per kill" },
            { event: "Each Assist",      pts: "+1",  color:"#f59e0b", bg:"#fefce8", border:"#fde68a", note:"Per assist" },
            { event: "Each Death",       pts: "−2",  color:"#dc2626", bg:"#fff0f0", border:"#fecaca", note:"Penalty" },
            { event: "Last Hits ÷ 10",  pts: "+1",  color:"#3b82f6", bg:"#eff6ff", border:"#bfdbfe", note:"Per 10 LH" },
            { event: "GPM ÷ 50",        pts: "+1",  color:"#8b5cf6", bg:"#faf5ff", border:"#e9d5ff", note:"Per 50 GPM" },
            { event: "XPM ÷ 50",        pts: "+1",  color:"#06b6d4", bg:"#ecfeff", border:"#a5f3fc", note:"Per 50 XPM" },
          ].map(row => (
            <div key={row.event} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:row.bg, border:`1px solid ${row.border}`, borderRadius:9, padding:"9px 14px" }}>
              <span style={{ fontSize:"0.84rem", fontWeight:600, color:"#333" }}>{row.event}</span>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:"0.68rem", color:"#aaa" }}>{row.note}</span>
                <span style={{ fontSize:"1rem", fontWeight:900, color:row.color, minWidth:32, textAlign:"right" }}>{row.pts}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:16, background:"#F8F7F4", borderRadius:10, padding:"13px 16px", fontSize:"0.8rem", color:"#888", lineHeight:1.7 }}>
          <strong style={{ color:"#111" }}>Example:</strong> Win, 8K/2D/5A, 120LH, 600GPM, 650XPM<br />
          <span style={{color:"#16a34a"}}>+20</span> + <span style={{color:"#F05A28"}}>+24</span> + <span style={{color:"#dc2626"}}>−4</span> + <span style={{color:"#f59e0b"}}>+5</span> + <span style={{color:"#3b82f6"}}>+12</span> + <span style={{color:"#8b5cf6"}}>+12</span> + <span style={{color:"#06b6d4"}}>+13</span> = <strong style={{color:"#111"}}>82 pts</strong>
        </div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #E5E3DF", borderRadius:14, padding:"26px 26px" }}>
        <SectionLabel icon="🏆" text="Prize Distribution" />
        <p style={{ fontSize:"0.76rem", color:"#bbb", margin:"10px 0 14px" }}>Top 50 players earn. Fixed % regardless of participant count.</p>
        <div style={{ maxHeight:480, overflowY:"auto", paddingRight:2 }}>
          {Object.entries(PRIZE_DISTRIBUTION).map(([rankStr, pct]) => {
            const rank  = Number(rankStr);
            const prize = getPrizeForRank(prizePool, rank);
            const isTop = rank <= 3;
            return (
              <div key={rank} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 12px", borderRadius:7, background: isTop?(rank===1?"#fffbeb":rank===2?"#f9fafb":"#fafafa"):"transparent", border:`1px solid ${isTop?(rank===1?"#fde68a":"#E5E3DF"):"transparent"}`, marginBottom:3 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:rank<=3?15:"0.76rem", minWidth:22, textAlign:"center" }}>
                    {rank===1?"🥇":rank===2?"🥈":rank===3?"🥉":`#${rank}`}
                  </span>
                  <span style={{ fontSize:"0.76rem", color:"#aaa" }}>{pct}%</span>
                </div>
                <span style={{ fontWeight:700, fontSize:isTop?"0.9rem":"0.8rem", color:prize?"#16a34a":"#ddd" }}>{prize??"—"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Match row ─────────────────────────────────────────────────────────────────
function MatchRow({ match, rank }: { match: any; rank: number }) {
  const won  = match.win;
  const kills    = match.kills    || 0;
  const deaths   = match.deaths   || 0;
  const assists  = match.assists  || 0;
  const lastHits = match.lastHits || match.last_hits || 0;
  const gpm      = match.gpm      || match.gold_per_min || 0;
  const xpm      = match.xpm      || match.xp_per_min  || 0;

  // Rebuild breakdown if not stored
  const bd = match.breakdown || {
    winBonus:   won ? 20 : 0,
    killPts:    kills  * 3,
    assistPts:  assists * 1,
    deathPts:   deaths * -2,
    lastHitPts: Math.floor(lastHits / 10),
    gpmPts:     Math.floor(gpm / 50),
    xpmPts:     Math.floor(xpm / 50),
  };

  const pills = [
    bd.winBonus    ? { label: `+${bd.winBonus} win`,                     pos: true  } : null,
    bd.killPts     ? { label: `+${bd.killPts} kills (${kills}×3)`,       pos: true  } : null,
    bd.assistPts   ? { label: `+${bd.assistPts} ast (${assists}×1)`,     pos: true  } : null,
    bd.deathPts    ? { label: `${bd.deathPts} deaths (${deaths}×−2)`,    pos: false } : null,
    bd.lastHitPts  ? { label: `+${bd.lastHitPts} LH (${lastHits}÷10)`,  pos: true  } : null,
    bd.gpmPts      ? { label: `+${bd.gpmPts} GPM (${gpm}÷50)`,          pos: true  } : null,
    bd.xpmPts      ? { label: `+${bd.xpmPts} XPM (${xpm}÷50)`,          pos: true  } : null,
  ].filter(Boolean) as { label: string; pos: boolean }[];

  return (
    <div style={{ background: won ? "#f0fdf4" : "#fff8f8", border: `1px solid ${won?"#bbf7d0":"#fecaca"}`, borderRadius: 9, padding: "9px 12px", marginBottom: 5 }}>
      <div style={{ display:"grid", gridTemplateColumns:"18px 22px 1fr 60px 56px 86px 76px 50px 68px", alignItems:"center", gap:7, fontSize:"0.8rem" }}>
        <span style={{ color:"#bbb", fontWeight:700, fontSize:"0.66rem" }}>#{rank}</span>
        <div style={{ width:19, height:19, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.54rem", fontWeight:800, background:won?"#dcfce7":"#fee2e2", color:won?"#16a34a":"#dc2626" }}>
          {won?"W":"L"}
        </div>
        <span style={{ fontWeight:700, color:"#111", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
          {heroName(match.heroId)}
        </span>
        <span style={{ color:"#888", fontSize:"0.7rem", whiteSpace:"nowrap" }}>{fmtMatchDate(match.startTime)}</span>
        <span style={{ color:"#888", fontSize:"0.7rem" }}>{fmtDuration(match.duration)}</span>
        <span style={{ fontWeight:600 }}>
          <span style={{color:"#16a34a"}}>{kills}</span>
          <span style={{color:"#ddd"}}>/</span>
          <span style={{color:"#dc2626"}}>{deaths}</span>
          <span style={{color:"#ddd"}}>/</span>
          <span style={{color:"#f59e0b"}}>{assists}</span>
        </span>
        <span style={{ color:"#888", fontSize:"0.7rem" }}>{gpm}/{xpm}</span>
        <span style={{ color:"#888", fontSize:"0.7rem" }}>{lastHits} LH</span>
        <span style={{ fontWeight:800, color:"#F05A28" }}>{match.score} pts</span>
      </div>
      {/* Score breakdown pills — always shown, fix #3 */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:7 }}>
        {pills.map((p, i) => (
          <span key={i} style={{ fontSize:"0.6rem", fontWeight:700, background:p.pos?"#f0fdf4":"#fff0f0", color:p.pos?"#16a34a":"#dc2626", border:`1px solid ${p.pos?"#bbf7d0":"#fecaca"}`, borderRadius:4, padding:"2px 6px", whiteSpace:"nowrap" }}>
            {p.label}
          </span>
        ))}
        {match.matchId && (
          <a href={`https://www.opendota.com/matches/${match.matchId}`} target="_blank" rel="noreferrer" style={{ fontSize:"0.6rem", fontWeight:700, color:"#2563eb", marginLeft:4, alignSelf:"center" }}>↗</a>
        )}
      </div>
    </div>
  );
}

// ── Leaderboard tab ───────────────────────────────────────────────────────────
function LeaderboardTab({ players, user, prizePool, myScore, myRank, refreshing, isRegistered, handleRefresh }: {
  players: SoloPlayer[]; user: any; prizePool: string;
  myScore: SoloPlayer | null; myRank: number;
  refreshing: boolean; isRegistered: boolean; handleRefresh: () => void;
}) {
  // Fix #2: own uid seeded into initial state — guaranteed open from first render
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(user?.uid ? [user.uid] : []));

  useEffect(() => {
    if (user?.uid) setExpanded(prev => new Set([...prev, user.uid]));
  }, [user?.uid]);

  const toggle = (uid: string) => {
    if (uid === user?.uid) return;
    setExpanded(prev => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <span style={{ fontSize:"0.66rem", fontWeight:800, letterSpacing:"0.1em", textTransform:"uppercase", color:"#bbb" }}>
          {players.length} Players
        </span>
        {isRegistered && (
          <button onClick={handleRefresh} disabled={refreshing} style={{ background:"#fff", border:"1px solid #E5E3DF", borderRadius:100, color:"#555", fontSize:"0.78rem", fontWeight:600, padding:"5px 14px", cursor:refreshing?"default":"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:6, opacity:refreshing?.5:1 }}>
            <span style={{ display:"inline-block", animation:refreshing?"spin 0.8s linear infinite":"none" }}>↻</span>
            {refreshing ? "Refreshing…" : "Refresh My Score"}
          </button>
        )}
      </div>

      {players.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 0", color:"#bbb" }}>
          <div style={{ fontSize:44, marginBottom:16 }}>🏆</div>
          <p>No players yet. Be the first to register!</p>
        </div>
      ) : (
        <div className="solo-table-scroll" style={{ background:"#fff", border:"1px solid #E5E3DF", borderRadius:14, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.05)" }}>
          {/* Table header */}
          <div style={{ display:"grid", gridTemplateColumns:"52px 1fr 90px 80px 120px 32px", padding:"10px 20px", borderBottom:"1px solid #F2F1EE", background:"#F8F7F4", minWidth:480 }}>
            {["Rank","Player","Score","Matches","Prize",""].map((h,i)=>(
              <span key={i} style={{ fontSize:"0.58rem", fontWeight:800, letterSpacing:"0.1em", textTransform:"uppercase", color:"#bbb" }}>{h}</span>
            ))}
          </div>

          {players.map((p, i) => {
            const rank       = i + 1;
            const isMe       = user?.uid === p.uid;
            const isExp      = expanded.has(p.uid);
            const topMatches = (p.cachedTopMatches || []) as any[];
            const prize      = getPrizeForRank(prizePool, rank);

            const rankEl = rank===1?<span style={{fontSize:18}}>🥇</span>:rank===2?<span style={{fontSize:18}}>🥈</span>:rank===3?<span style={{fontSize:18}}>🥉</span>:<span style={{fontSize:"0.86rem",fontWeight:700,color:"#bbb"}}>#{rank}</span>;

            return (
              <div key={p.uid} style={{ borderBottom:"1px solid #F8F7F4" }}>
                <div
                  onClick={() => toggle(p.uid)}
                  style={{ display:"grid", gridTemplateColumns:"52px 1fr 90px 80px 120px 32px", padding:"12px 20px", alignItems:"center", cursor:isMe?"default":"pointer", background:isMe?"#f0fdf4":"transparent", borderLeft:`3px solid ${isMe?"#22c55e":"transparent"}`, minWidth:480 }}
                  onMouseEnter={e=>{ if(!isMe)(e.currentTarget as HTMLElement).style.background="#F8F7F4"; }}
                  onMouseLeave={e=>{ if(!isMe)(e.currentTarget as HTMLElement).style.background="transparent"; }}
                >
                  <div>{rankEl}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
                    <img src={p.steamAvatar||""} alt="" style={{ width:32, height:32, borderRadius:"50%", border:`2px solid ${isMe?"#22c55e":"#E5E3DF"}`, flexShrink:0 }} />
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:"0.88rem", fontWeight:600, color:isMe?"#16a34a":"#111", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {p.steamName}{isMe&&<span style={{fontSize:"0.7rem",color:"#86efac",marginLeft:6}}>(you)</span>}
                      </div>
                      {p.disqualified && <div style={{fontSize:"0.7rem",color:"#dc2626"}}>⚠️ Disqualified</div>}
                    </div>
                  </div>
                  <div>{p.cachedScore>0?<span style={{fontSize:"1rem",fontWeight:800,color:"#111"}}>{p.cachedScore}</span>:<span style={{color:"#ddd"}}>—</span>}</div>
                  <div style={{fontSize:"0.84rem",color:"#555",fontWeight:500}}>{p.matchesPlayed}</div>
                  <div style={{fontSize:"0.78rem",fontWeight:700,color:prize?"#16a34a":"#ddd"}}>
                    {prize?<>{prize}<span style={{fontSize:"0.62rem",color:"#bbb",marginLeft:3,fontWeight:400}}>({PRIZE_DISTRIBUTION[rank]}%)</span></>:"—"}
                  </div>
                  <div style={{ fontSize:"0.7rem", color:"#bbb", display:"flex", alignItems:"center", justifyContent:"center", transform:isExp?"rotate(180deg)":"none", transition:"transform 0.2s" }}>
                    {isMe?"📌":"▼"}
                  </div>
                </div>

                {isExp && (
                  <div style={{ padding:"6px 20px 14px", background:"#FAFAF9", borderTop:"1px solid #F2F1EE" }}>
                    <div style={{ fontSize:"0.58rem", fontWeight:800, letterSpacing:"0.1em", textTransform:"uppercase", color:"#bbb", padding:"8px 0", display:"flex", alignItems:"center", gap:8 }}>
                      Top {Math.min(topMatches.length,5)} counted matches
                      <span style={{fontWeight:400}}>· {p.matchesPlayed} total played</span>
                      {isMe&&refreshing&&<span style={{color:"#F05A28",fontWeight:700}}>↻ updating…</span>}
                    </div>
                    {topMatches.length===0?(
                      <div style={{fontSize:"0.84rem",color:"#bbb",padding:"10px 0",textAlign:"center"}}>
                        No matches yet.{isMe&&" Play ranked games and refresh your score."}
                      </div>
                    ):(
                      <>
                        <div style={{ display:"grid", gridTemplateColumns:"18px 22px 1fr 60px 56px 86px 76px 50px 68px", gap:7, padding:"3px 0 6px", fontSize:"0.56rem", fontWeight:800, letterSpacing:"0.09em", textTransform:"uppercase", color:"#bbb" }}>
                          {["#","","Hero","Date","Time","K/D/A","GPM/XPM","LH","Score"].map((h,i)=><span key={i}>{h}</span>)}
                        </div>
                        {topMatches.slice(0,5).map((m,mi)=><MatchRow key={m.matchId||mi} match={m} rank={mi+1} />)}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Inner page (needs useSearchParams) ───────────────────────────────────────
function SoloPageInner() {
  const { user, loading, steamLinked } = useAuth();
  const router       = useRouter();
  const params       = useParams();
  const searchParams = useSearchParams();
  const id           = params.weekId as string;

  // Fix #1: read ?tab= from URL — default "overview"
  const initialTab = (searchParams.get("tab") as "overview"|"scoring"|"leaderboard") || "overview";
  const [activeTab, setActiveTab] = useState<"overview"|"scoring"|"leaderboard">(initialTab);

  const [tournament,   setTournament]   = useState<SoloTournament | null>(null);
  const [players,      setPlayers]      = useState<SoloPlayer[]>([]);
  const [isRegistered, setIsRegistered] = useState(false);
  const [registering,  setRegistering]  = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState("");
  const [tLoading,     setTLoading]     = useState(true);
  const [countdown,    setCountdown]    = useState("");
  const [myScore,      setMyScore]      = useState<SoloPlayer | null>(null);

  useEffect(() => {
    if (!loading && !user)                router.push("/");
    if (!loading && user && !steamLinked) router.push("/connect-steam");
  }, [user, loading, steamLinked]);

  const fetchSoloData = async () => {
    if (!id) return;
    const [tSnap, pSnap] = await Promise.all([
      getDoc(doc(db, "soloTournaments", id)),
      getDocs(collection(db, "soloTournaments", id, "players")),
    ]);
    if (tSnap.exists()) setTournament({ id: tSnap.id, ...tSnap.data() } as SoloTournament);
    const all = pSnap.docs.map(d => d.data() as SoloPlayer).sort((a, b) => b.cachedScore - a.cachedScore);
    setPlayers(all);
    if (user) {
      const mine = all.find(p => p.uid === user.uid);
      setMyScore(mine || null);
      setIsRegistered(!!mine);
    }
    setTLoading(false);
  };

  useEffect(() => {
    fetchSoloData();
    // 60s polling, paused when tab is hidden. Refetches on visibility change.
    const tick = () => { if (!document.hidden) fetchSoloData(); };
    const interval = setInterval(tick, 60_000);
    const onVis = () => { if (!document.hidden) fetchSoloData(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVis); };
  }, [id, user]);

  useEffect(() => {
    if (!tournament) return;
    const tick = () => setCountdown(getTimeUntilDeadline(tournament.registrationDeadline));
    tick();
    const i = setInterval(tick, 60000);
    return () => clearInterval(i);
  }, [tournament]);


  // Auto-refresh on page load when registered
useEffect(() => {
  if (!user || !id || !isRegistered) return;
  let cancelled = false;
  (async () => {
    setRefreshing(true);
    try {
      await fetch("/api/solo/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: id, uid: user.uid }),
      });
    } catch {}
    if (!cancelled) setRefreshing(false);
  })();
  return () => { cancelled = true; };
}, [user?.uid, id, isRegistered]);


  const handleRegister = async () => {
    if (!user) return;
    setRegistering(true); setError("");
    try {
      const res  = await fetch("/api/solo/register", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ tournamentId:id, uid:user.uid }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIsRegistered(true);
    } catch (e: any) { setError(e.message||"Registration failed"); }
    finally { setRegistering(false); }
  };

  const handleRefresh = async () => {
    if (!user || refreshing) return;
    setRefreshing(true);
    try { await fetch("/api/solo/refresh", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ tournamentId:id, uid:user.uid }) }); }
    catch {}
    setRefreshing(false);
  };

  if (loading || tLoading) return (
    <div style={{ minHeight:"100vh", background:"#F8F7F4", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"system-ui,sans-serif" }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
        <div style={{ width:32, height:32, border:"3px solid #E5E3DF", borderTopColor:"#F05A28", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
        <span style={{ color:"#bbb", fontSize:"0.84rem" }}>Loading…</span>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );

  if (!tournament) return (
    <div style={{ minHeight:"100vh", background:"#F8F7F4", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <p style={{ color:"#bbb" }}>Tournament not found.</p>
    </div>
  );

  const nowDate     = new Date();
  const weekEnd     = new Date(tournament.weekEnd);
  const deadline    = new Date(tournament.registrationDeadline);
  const weekStart   = new Date(tournament.weekStart);
  const isEnded     = nowDate > weekEnd;
  const isUpcoming  = nowDate < weekStart;
  const regClosed   = nowDate > deadline;
  const canRegister = !isEnded && !regClosed && !isRegistered;
  const slotsLeft   = tournament.totalSlots - (tournament.slotsBooked || 0);
  const myRank      = user ? players.findIndex(p => p.uid === user.uid) + 1 : 0;
  const prizePool   = tournament.prizePool as string;

  const TABS = [
    { key:"overview",    label:"Overview",    icon:"📋" },
    { key:"scoring",     label:"Scoring",     icon:"📐" },
    { key:"leaderboard", label:"Leaderboard", icon:"🏆" },
  ] as const;

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        @keyframes spin{to{transform:rotate(360deg);}}
        .solo-hero-wrap { padding: 26px 40px; }
        .solo-content-wrap { padding: 0 40px; }
        .solo-tabs { display: flex; gap: 4px; margin-top: 22px; overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; }
        .solo-tabs::-webkit-scrollbar { display: none; }
        .solo-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        @media (max-width: 768px) {
          .solo-hero-wrap { padding: 20px 16px; }
          .solo-content-wrap { padding: 0 16px; }
          .solo-hero-right { min-width: unset !important; width: 100% !important; align-items: stretch !important; }
          .solo-hero-right > div { text-align: left !important; }
          .solo-overview-grid { grid-template-columns: 1fr !important; }
          .solo-scoring-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .solo-hero-wrap { padding: 16px 12px; }
          .solo-content-wrap { padding: 0 12px; }
          .solo-hero-title { font-size: 1.3rem !important; }
        }
      `}</style>
      <div style={{ minHeight:"100vh", background:"#F8F7F4", color:"#111", fontFamily:"var(--font-geist-sans),system-ui,sans-serif" }}>
        <Navbar />

        {/* Hero */}
        <div className="solo-hero-wrap" style={{ background:"#fff", borderBottom:"1px solid #E5E3DF" }}>
          <div style={{ maxWidth:1100, margin:"0 auto" }}>
            {/* Top row */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:20 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                  {/* Fix: back goes to /dota2?tab=solo so the solo tab is pre-selected */}
                  <button
                    onClick={() => router.push("/dota2?tab=solo")}
                    style={{ background:"#F8F7F4", border:"1px solid #E5E3DF", borderRadius:100, color:"#555", fontSize:".76rem", fontWeight:600, padding:"5px 13px", cursor:"pointer", fontFamily:"inherit" }}
                  >
                    ← Solo Tournaments
                  </button>
                  <span style={{ fontSize:".63rem", fontWeight:800, padding:"3px 10px", borderRadius:100, background:isEnded?"#F2F1EE":isUpcoming?"#eff6ff":"#f0fdf4", color:isEnded?"#888":isUpcoming?"#2563eb":"#16a34a", border:`1px solid ${isEnded?"#E5E3DF":isUpcoming?"#bfdbfe":"#bbf7d0"}` }}>
                    {isEnded?"Ended":isUpcoming?"Upcoming":"🟢 Active"}
                  </span>
                  <span style={{ fontSize:".63rem", fontWeight:800, padding:"3px 10px", borderRadius:100, background:"#fff7ed", color:"#ea580c", border:"1px solid #fed7aa" }}>FREE</span>
                </div>
                <h1 className="solo-hero-title" style={{ fontSize:"1.7rem", fontWeight:900, color:"#111", letterSpacing:"-.02em", marginBottom:5 }}>{tournament.name}</h1>
                <p style={{ fontSize:".82rem", color:"#888", lineHeight:1.5 }}>
                  Play ranked Dota 2 — your <strong>top 5</strong> matches during the tournament window are scored.
                </p>
              </div>

              {/* Right: prize + score + CTA */}
              <div className="solo-hero-right" style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:10, minWidth:210 }}>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:".63rem", fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:"#bbb", marginBottom:3 }}>Prize Pool</div>
                  <div style={{ fontSize:"1.9rem", fontWeight:900, color:"#F05A28", lineHeight:1 }}>{prizePool}</div>
                  <div style={{ fontSize:".73rem", color:"#aaa", marginTop:3 }}>{slotsLeft}/{tournament.totalSlots} slots left</div>
                </div>
                {isRegistered && myScore && (
                  <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:11, padding:"12px 16px", textAlign:"right", width:"100%" }}>
                    <div style={{ fontSize:".63rem", fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:"#86efac", marginBottom:3 }}>My Score</div>
                    <div style={{ fontSize:"1.8rem", fontWeight:900, color:"#16a34a", lineHeight:1 }}>{myScore.cachedScore}</div>
                    <div style={{ fontSize:".72rem", color:"#86efac", marginTop:3 }}>
                      Rank #{myRank}{myRank>0&&getPrizeForRank(prizePool,myRank)&&<span style={{marginLeft:6,color:"#F05A28",fontWeight:800}}>· {getPrizeForRank(prizePool,myRank)}</span>} · {myScore.matchesPlayed} matches
                      {refreshing&&<span style={{marginLeft:5,opacity:.6}}>↻</span>}
                    </div>
                  </div>
                )}
                {canRegister && (
                  <button onClick={handleRegister} disabled={registering} style={{ width:"100%", padding:"11px 0", background:"#F05A28", border:"none", borderRadius:100, color:"#fff", fontWeight:700, fontSize:".88rem", cursor:"pointer", fontFamily:"inherit", opacity:registering?.6:1, boxShadow:"0 3px 14px rgba(240,90,40,.3)" }}>
                    {registering?"Registering…":"Register Free →"}
                  </button>
                )}
                {isRegistered&&<div style={{width:"100%",padding:"11px 0",textAlign:"center",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:100,color:"#16a34a",fontWeight:700,fontSize:".86rem"}}>✓ Registered</div>}
                {error&&<p style={{fontSize:".78rem",color:"#dc2626"}}>{error}</p>}
              </div>
            </div>

            {/* Tabs */}
            <div className="solo-tabs">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 18px", background:activeTab===t.key?"#F05A28":"transparent", color:activeTab===t.key?"#fff":"#888", border:activeTab===t.key?"1px solid #F05A28":"1px solid #E5E3DF", borderRadius:100, fontWeight:700, fontSize:".78rem", cursor:"pointer", fontFamily:"inherit", transition:"all .15s" }}>
                  <span>{t.icon}</span><span>{t.label}</span>
                  {t.key==="leaderboard"&&players.length>0&&(
                    <span style={{ background:activeTab==="leaderboard"?"rgba(255,255,255,0.25)":"#F8F7F4", color:activeTab==="leaderboard"?"#fff":"#888", fontSize:".62rem", fontWeight:800, borderRadius:100, padding:"1px 6px" }}>{players.length}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab content */}
        <div className="solo-content-wrap" style={{ maxWidth:1100, margin:"24px auto 60px" }}>
          {activeTab==="overview"    && <OverviewTab   tournament={tournament} countdown={countdown} />}
          {activeTab==="scoring"     && <ScoringTab    prizePool={prizePool} />}
          {activeTab==="leaderboard" && <LeaderboardTab players={players} user={user} prizePool={prizePool} myScore={myScore} myRank={myRank} refreshing={refreshing} isRegistered={isRegistered} handleRefresh={handleRefresh} />}
        </div>
      </div>
    </>
  );
}

// ── Default export wraps in Suspense (required for useSearchParams) ───────────
export default function SoloTournamentPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:"100vh", background:"#F8F7F4", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"system-ui,sans-serif" }}>
        <div style={{ width:32, height:32, border:"3px solid #E5E3DF", borderTopColor:"#F05A28", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
      </div>
    }>
      <SoloPageInner />
    </Suspense>
  );
}