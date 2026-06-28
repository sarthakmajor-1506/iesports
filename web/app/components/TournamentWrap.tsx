"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * TournamentWrap — a full-screen, animated end-of-tournament celebration overlay.
 *
 * Shows once the Grand Final is COMPLETE: champion + prize, runner-up + prize,
 * both rosters, and per-rank-tier MVPs (same "bracket MVP" logic as the leaderboard
 * page: top KDA in each base rank). Computed entirely from data the tournament page
 * already loads (tournament, teams, matches, leaderboard, players). Renders on every
 * open of the tournament page; closeable via the top-left button.
 */

type AnyT = Record<string, any>;

const RANK_ORDER = ["Radiant", "Immortal", "Ascendant", "Diamond", "Platinum", "Gold", "Silver", "Bronze", "Iron", "Unranked"];
const TIER_COLOR: Record<string, string> = {
  Radiant: "#fff4c2", Immortal: "#e6477a", Ascendant: "#27a567", Diamond: "#c08ad6",
  Platinum: "#52a3c4", Gold: "#e7c24b", Silver: "#c9d1d3", Bronze: "#b07a4e", Iron: "#8a8a8a", Unranked: "#777",
};
const baseRank = (s: string) => { const b = String(s || "").split(" ")[0]; return RANK_ORDER.includes(b) ? b : "Unranked"; };
const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");

export default function TournamentWrap({ tournament, teams, matches, leaderboard, players }: {
  tournament: AnyT; teams: AnyT[]; matches: AnyT[]; leaderboard: AnyT[]; players: AnyT[];
}) {
  const [open, setOpen] = useState(true);

  const data = useMemo(() => buildWrap({ tournament, teams, matches, leaderboard, players }), [tournament, teams, matches, leaderboard, players]);

  // Lock background scroll while open
  useEffect(() => {
    if (!open || !data) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, data]);

  if (!data || !open) return null;
  const { champion, runnerUp, mvps, prizeWinner, prizeRunnerUp, tournamentName } = data;

  return (
    <div className="tw-root" role="dialog" aria-modal="true">
      <style>{styles}</style>

      {/* animated backdrop */}
      <div className="tw-backdrop" />
      <div className="tw-rays" />
      {/* confetti */}
      <div className="tw-confetti">
        {CONFETTI.map((c, i) => (
          <span key={i} className="tw-conf" style={{ left: c.left, background: c.color, animationDelay: c.delay, animationDuration: c.dur, width: c.size, height: c.size }} />
        ))}
      </div>

      {/* close — top LEFT */}
      <button className="tw-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>

      <div className="tw-scroll">
        <div className="tw-inner">
          {/* header */}
          <div className="tw-head">
            <div className="tw-kicker">{tournamentName}</div>
            <h1 className="tw-title">TOURNAMENT WRAP</h1>
            <div className="tw-sub">A season for the ages — here's how it ended.</div>
          </div>

          {/* CHAMPION */}
          <section className="tw-champ-sec">
            <div className="tw-trophy">🏆</div>
            <div className="tw-label tw-gold-text">CHAMPIONS</div>
            <div className="tw-champ-logo-wrap">
              <div className="tw-glow-ring" />
              <TeamLogo team={champion.team} gold />
            </div>
            <h2 className="tw-champ-name tw-gold-text">{champion.team.teamName}</h2>
            <CountUp className="tw-prize tw-gold-text" value={prizeWinner} prefix="₹" />
            <div className="tw-prize-label">PRIZE</div>
            <Roster members={champion.team.members} accent="#f5c542" />
          </section>

          {/* RUNNER-UP */}
          <section className="tw-runner-sec">
            <div className="tw-medal">🥈</div>
            <div className="tw-label tw-silver-text">RUNNER-UP</div>
            <div className="tw-runner-logo-wrap"><TeamLogo team={runnerUp.team} /></div>
            <h3 className="tw-runner-name">{runnerUp.team.teamName}</h3>
            <CountUp className="tw-prize-sm tw-silver-text" value={prizeRunnerUp} prefix="₹" />
            <div className="tw-prize-label">PRIZE</div>
            <Roster members={runnerUp.team.members} accent="#c9d1d3" />
          </section>

          {/* MVPs per bracket (rank tier) */}
          {mvps.length > 0 && (
            <section className="tw-mvp-sec">
              <div className="tw-label" style={{ color: "#9aa" }}>TIER MVPs</div>
              <h3 className="tw-mvp-head">Best of every bracket</h3>
              <div className="tw-mvp-grid">
                {mvps.map((m, i) => (
                  <div key={m.tier} className="tw-mvp-card" style={{ animationDelay: `${0.1 * i}s`, borderColor: (TIER_COLOR[m.tier] || "#888") + "55" }}>
                    <div className="tw-mvp-shine" />
                    <div className="tw-mvp-tier" style={{ color: TIER_COLOR[m.tier] || "#aaa" }}>{m.tier}</div>
                    <div className="tw-mvp-av-wrap">
                      {m.avatar ? <img className="tw-mvp-av" src={m.avatar} alt="" style={{ boxShadow: `0 0 14px ${(TIER_COLOR[m.tier] || "#888")}66` }} /> : <div className="tw-mvp-av tw-av-fallback">{(m.name || "?")[0]}</div>}
                    </div>
                    <div className="tw-mvp-name">{m.name}</div>
                    <div className="tw-mvp-team">{m.teamName}</div>
                    <div className="tw-mvp-stats">
                      <span><b>{m.k}</b>/<b style={{ color: "#ef6a6a" }}>{m.d}</b>/<b>{m.a}</b></span>
                      <span className="tw-mvp-kda" style={{ color: TIER_COLOR[m.tier] || "#aaa" }}>{m.kda.toFixed(2)} KDA</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="tw-foot">
            <span className="tw-wordmark">iesports</span>
            <span className="tw-foot-sub">Thank you to every player. See you next season. 🫡</span>
          </div>
          <div style={{ height: 24 }} />
        </div>
      </div>
    </div>
  );
}

function TeamLogo({ team, gold }: { team: AnyT; gold?: boolean }) {
  const initials = (team.teamName || "?").split(/\s+/).map((w: string) => w[0]).join("").slice(0, 3).toUpperCase();
  const size = gold ? 132 : 88;
  return team.teamLogo
    ? <img className="tw-team-logo" src={team.teamLogo} alt={team.teamName} style={{ width: size, height: size }} />
    : <div className="tw-team-logo tw-logo-fallback" style={{ width: size, height: size, fontSize: gold ? 40 : 26, background: gold ? "linear-gradient(135deg,#f5c542,#b8860b)" : "linear-gradient(135deg,#c9d1d3,#7c8487)" }}>{initials}</div>;
}

function Roster({ members, accent }: { members: AnyT[]; accent: string }) {
  return (
    <div className="tw-roster">
      {(members || []).map((p, i) => (
        <div key={p.uid || i} className="tw-player" style={{ animationDelay: `${0.08 * i}s`, borderColor: accent + "44" }}>
          {p.riotAvatar ? <img className="tw-player-av" src={p.riotAvatar} alt="" /> : <div className="tw-player-av tw-av-fallback">{(p.riotGameName || p.fullName || "?")[0]}</div>}
          <div className="tw-player-info">
            <div className="tw-player-name">{p.riotGameName || p.fullName || "Player"}</div>
            {p.riotRank && <div className="tw-player-rank" style={{ color: (TIER_COLOR[baseRank(p.riotRank)] || "#9aa") }}>{p.riotRank}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function CountUp({ value, prefix = "", className }: { value: number; prefix?: string; className?: string }) {
  const [v, setV] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    const dur = 1400, t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(value * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);
  return <div className={className}>{prefix}{v.toLocaleString("en-IN")}</div>;
}

// ── compute wrap data from already-loaded page data ───────────────────────────
function buildWrap({ tournament, teams, matches, leaderboard, players }: { tournament: AnyT; teams: AnyT[]; matches: AnyT[]; leaderboard: AnyT[]; players: AnyT[] }) {
  if (!tournament || !teams?.length || !matches?.length) return null;
  const gf = matches.find((m) => m.id === "grand-final" || m.bracketType === "grand_final" || /grand final/i.test(m.bracketLabel || ""));
  if (!gf || gf.status !== "completed") return null; // only after the GF is done

  const teamById: Record<string, AnyT> = {}; teams.forEach((t) => { teamById[t.id] = t; });
  // winner = higher series score (winnerId fallback)
  let winnerId = gf.winnerId;
  if (!winnerId) winnerId = (gf.team1Score ?? 0) >= (gf.team2Score ?? 0) ? gf.team1Id : gf.team2Id;
  const loserId = winnerId === gf.team1Id ? gf.team2Id : gf.team1Id;
  const champTeam = teamById[winnerId]; const runnerTeam = teamById[loserId];
  if (!champTeam || !runnerTeam) return null;

  // prizes: explicit fields, else split the total 60/40
  const totalNum = Number(String(tournament.prizePool || "0").replace(/[^0-9]/g, "")) || 0;
  const prizeWinner = tournament.prizeWinner != null ? Number(tournament.prizeWinner) : Math.round(totalNum * 0.6);
  const prizeRunnerUp = tournament.prizeRunnerUp != null ? Number(tournament.prizeRunnerUp) : Math.round(totalNum * 0.4);

  // tier MVPs: rank per uid from soloPlayers/team members; top KDA in each tier
  const rankByUid: Record<string, string> = {};
  (players || []).forEach((p) => { const uid = p.uid || p.id; if (uid) rankByUid[uid] = p.iesportsRank || p.riotRank || ""; });
  teams.forEach((t) => (t.members || []).forEach((m: AnyT) => { if (m.uid && !rankByUid[m.uid]) rankByUid[m.uid] = m.riotRank || ""; }));
  const avatarByUid: Record<string, string> = {}; const teamNameByUid: Record<string, string> = {};
  teams.forEach((t) => (t.members || []).forEach((m: AnyT) => { if (m.uid) { avatarByUid[m.uid] = m.riotAvatar; teamNameByUid[m.uid] = t.teamName; } }));

  const grouped: Record<string, AnyT[]> = {};
  (leaderboard || []).forEach((lb) => {
    const uid = lb.uid || lb.id; if (!uid) return;
    const tier = baseRank(rankByUid[uid] || "");
    (grouped[tier] = grouped[tier] || []).push(lb);
  });
  const kda = (lb: AnyT) => (((lb.totalKills || 0) + 0.5 * (lb.totalAssists || 0)) / Math.max(1, lb.totalDeaths || 1));
  const mvps = Object.keys(grouped)
    .sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b))
    .map((tier) => {
      const best = grouped[tier].slice().sort((a, b) => { const d = kda(b) - kda(a); return Math.abs(d) > 0.01 ? d : (b.totalKills || 0) - (a.totalKills || 0); })[0];
      if (!best) return null;
      const uid = best.uid || best.id;
      return {
        tier, name: best.name || best.riotGameName || "Player", teamName: teamNameByUid[uid] || "",
        avatar: avatarByUid[uid] || "", k: best.totalKills || 0, d: best.totalDeaths || 0, a: best.totalAssists || 0, kda: kda(best),
      };
    })
    .filter(Boolean) as AnyT[];

  return {
    tournamentName: tournament.name || "iesports",
    champion: { team: champTeam }, runnerUp: { team: runnerTeam },
    prizeWinner, prizeRunnerUp, mvps,
  };
}

const CONFETTI = Array.from({ length: 36 }).map((_, i) => {
  const colors = ["#f5c542", "#e6477a", "#27a567", "#52a3c4", "#c08ad6", "#ffffff"];
  // deterministic pseudo-random so SSR/CSR match
  const r = (n: number) => ((Math.sin(i * 9.7 + n) + 1) / 2);
  return {
    left: `${Math.round(r(1) * 100)}%`, color: colors[i % colors.length],
    delay: `${(r(2) * 3).toFixed(2)}s`, dur: `${(2.6 + r(3) * 2.4).toFixed(2)}s`,
    size: `${6 + Math.round(r(4) * 6)}px`,
  };
});

const styles = `
.tw-root{position:fixed;inset:0;z-index:9999;font-family:'Inter',system-ui,sans-serif;color:#f3f1ea;}
.tw-backdrop{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% -10%, #2a1d4d 0%, #140f2b 45%, #07060f 100%);backdrop-filter:blur(4px);animation:tw-fade .5s ease both;}
.tw-rays{position:absolute;inset:-20% ;background:conic-gradient(from 0deg at 50% 30%, rgba(245,197,66,0.06) 0deg, transparent 26deg, rgba(245,197,66,0.06) 52deg, transparent 78deg, rgba(245,197,66,0.06) 104deg, transparent 130deg, rgba(245,197,66,0.06) 156deg, transparent 182deg, rgba(245,197,66,0.06) 208deg, transparent 234deg, rgba(245,197,66,0.06) 260deg, transparent 286deg, rgba(245,197,66,0.06) 312deg, transparent 338deg);animation:tw-spin 60s linear infinite;pointer-events:none;}
.tw-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none;}
.tw-conf{position:absolute;top:-20px;border-radius:2px;opacity:.9;animation-name:tw-conf-fall;animation-timing-function:linear;animation-iteration-count:infinite;}
@keyframes tw-conf-fall{0%{transform:translateY(-20px) rotate(0deg);opacity:0}10%{opacity:.95}100%{transform:translateY(105vh) rotate(540deg);opacity:.5}}
.tw-close{position:absolute;top:18px;left:18px;z-index:3;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:16px;cursor:pointer;backdrop-filter:blur(6px);transition:all .2s;display:flex;align-items:center;justify-content:center;}
.tw-close:hover{background:rgba(255,255,255,.15);transform:scale(1.08);}
.tw-scroll{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;}
.tw-inner{max-width:920px;margin:0 auto;padding:64px 20px 30px;text-align:center;position:relative;z-index:2;}
.tw-head{animation:tw-up .6s ease both;}
.tw-kicker{font-size:.72rem;letter-spacing:.32em;color:#9b8fd1;font-weight:800;text-transform:uppercase;}
.tw-title{font-size:clamp(2.4rem,7vw,4.2rem);font-weight:900;letter-spacing:.02em;margin:8px 0 6px;background:linear-gradient(90deg,#f5c542,#fff,#e6477a,#f5c542);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:tw-grad 6s linear infinite;}
.tw-sub{font-size:.92rem;color:#b6b1c8;}
.tw-gold-text{background:linear-gradient(180deg,#fff4c2,#f5c542 45%,#c8941f);-webkit-background-clip:text;background-clip:text;color:transparent;}
.tw-silver-text{background:linear-gradient(180deg,#fff,#c9d1d3 45%,#8d9598);-webkit-background-clip:text;background-clip:text;color:transparent;}
.tw-champ-sec{margin-top:46px;animation:tw-up .7s ease .15s both;}
.tw-trophy{font-size:3.4rem;animation:tw-float 3.2s ease-in-out infinite;filter:drop-shadow(0 6px 22px rgba(245,197,66,.5));}
.tw-label{font-size:.78rem;font-weight:900;letter-spacing:.34em;margin-top:6px;}
.tw-champ-logo-wrap{position:relative;width:160px;height:160px;margin:18px auto 4px;display:flex;align-items:center;justify-content:center;}
.tw-glow-ring{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle, rgba(245,197,66,.5),transparent 65%);animation:tw-pulse 2.4s ease-in-out infinite;}
.tw-team-logo{border-radius:50%;object-fit:cover;position:relative;z-index:1;animation:tw-pop .6s cubic-bezier(.2,1.3,.4,1) .25s both;}
.tw-logo-fallback{display:flex;align-items:center;justify-content:center;font-weight:900;color:#1a1407;border-radius:50%;}
.tw-champ-name{font-size:clamp(1.8rem,5.4vw,3rem);font-weight:900;margin:6px 0 2px;}
.tw-prize{font-size:clamp(1.7rem,5vw,2.6rem);font-weight:900;margin-top:4px;}
.tw-prize-sm{font-size:clamp(1.3rem,4vw,1.9rem);font-weight:900;margin-top:2px;}
.tw-prize-label{font-size:.62rem;letter-spacing:.3em;color:#8e88a3;font-weight:800;margin-top:2px;}
.tw-runner-sec{margin-top:52px;padding-top:34px;border-top:1px solid rgba(255,255,255,.08);animation:tw-up .7s ease .25s both;}
.tw-medal{font-size:2.4rem;animation:tw-float 3.6s ease-in-out infinite;}
.tw-runner-logo-wrap{margin:14px auto 4px;}
.tw-runner-name{font-size:clamp(1.4rem,4vw,2rem);font-weight:900;color:#e7e9ea;margin:4px 0 0;}
.tw-roster{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:20px auto 0;max-width:760px;}
.tw-player{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.05);border:1px solid;border-radius:100px;padding:7px 16px 7px 7px;animation:tw-up .5s ease both;}
.tw-player-av{width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;}
.tw-player-info{text-align:left;min-width:0;}
.tw-player-name{font-size:.86rem;font-weight:800;white-space:nowrap;}
.tw-player-rank{font-size:.66rem;font-weight:700;}
.tw-av-fallback{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#3a3358,#221d3c);font-weight:800;color:#cfc8ea;}
.tw-mvp-sec{margin-top:54px;padding-top:34px;border-top:1px solid rgba(255,255,255,.08);animation:tw-up .7s ease .35s both;}
.tw-mvp-head{font-size:clamp(1.3rem,4vw,1.8rem);font-weight:900;margin:4px 0 22px;}
.tw-mvp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;}
.tw-mvp-card{position:relative;overflow:hidden;background:rgba(20,18,34,.7);border:1px solid;border-radius:16px;padding:18px 12px 16px;animation:tw-pop .55s cubic-bezier(.2,1.2,.4,1) both;}
.tw-mvp-shine{position:absolute;top:0;left:-60%;width:50%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.13),transparent);animation:tw-shine 3.4s ease-in-out infinite;}
.tw-mvp-tier{font-size:.66rem;font-weight:900;letter-spacing:.18em;text-transform:uppercase;}
.tw-mvp-av-wrap{margin:10px auto 8px;}
.tw-mvp-av{width:60px;height:60px;border-radius:50%;object-fit:cover;}
.tw-mvp-name{font-size:.92rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.tw-mvp-team{font-size:.66rem;color:#9b95ac;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:8px;}
.tw-mvp-stats{display:flex;flex-direction:column;gap:2px;font-size:.74rem;color:#cfcad8;}
.tw-mvp-kda{font-weight:900;font-size:.82rem;}
.tw-foot{margin-top:54px;display:flex;flex-direction:column;gap:4px;align-items:center;animation:tw-up .7s ease .5s both;}
.tw-wordmark{font-size:1rem;font-weight:900;letter-spacing:.22em;color:rgba(255,255,255,.55);}
.tw-foot-sub{font-size:.78rem;color:#8b86a0;}
@keyframes tw-fade{from{opacity:0}to{opacity:1}}
@keyframes tw-up{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
@keyframes tw-pop{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
@keyframes tw-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes tw-pulse{0%,100%{transform:scale(.92);opacity:.55}50%{transform:scale(1.12);opacity:.9}}
@keyframes tw-spin{to{transform:rotate(360deg)}}
@keyframes tw-grad{to{background-position:300% 0}}
@keyframes tw-shine{0%{left:-60%}55%,100%{left:130%}}
@media (max-width:520px){.tw-inner{padding-top:58px}.tw-champ-logo-wrap{width:130px;height:130px}}
`;
