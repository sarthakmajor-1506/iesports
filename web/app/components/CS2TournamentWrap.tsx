"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * CS2TournamentWrap — full-screen end-of-tournament celebration overlay for a
 * CS2 tournament, opened by default whenever the tournament page is loaded
 * once the final is complete.
 *
 * Deliberately NOT the Valorant TournamentWrap (app/components/TournamentWrap):
 *  - no prize money anywhere, by request — this is about the teams, not the pot
 *  - no rank-tier MVP section; CS2 has no rank data on this platform and the
 *    per-player stats pipeline is not wired up yet
 *  - rosters read CS2's member shape (steamName / steamAvatar), not Riot's
 *
 * Photos are a static per-tournament override rather than a schema field, the
 * same convention TournamentWrap uses for the Ascension champions photo. A
 * tournament with no entry falls back to the team monogram, so this stays
 * correct for every other CS2 tournament without any data being added.
 */

type AnyT = Record<string, any>;

const TOURNAMENT_PHOTOS: Record<string, { champion?: string; runnerUp?: string }> = {
  "cs2-royal-sports-league": {
    champion: "/cs2-royal-champions.jpg",
    runnerUp: "/cs2-royal-runnerup.jpg",
  },
};

export default function CS2TournamentWrap({ tournament, teams, matches, open, onClose, onAvailable }: {
  tournament: AnyT; teams: AnyT[]; matches: AnyT[];
  open: boolean; onClose: () => void; onAvailable?: (available: boolean) => void;
}) {
  const data = useMemo(() => buildWrap({ tournament, teams, matches }), [tournament, teams, matches]);

  // Lets the page show a "recap" button only once there is a recap to show.
  useEffect(() => { onAvailable?.(!!data); }, [data, onAvailable]);

  useEffect(() => {
    if (!open || !data) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, data]);

  if (!data || !open) return null;
  const { champion, runnerUp, tournamentName, finalScore } = data;
  const photos = TOURNAMENT_PHOTOS[tournament?.id] || {};

  return (
    <div className="cw-root" role="dialog" aria-modal="true">
      <style>{styles}</style>

      <div className="cw-backdrop" />
      <div className="cw-rays" />
      <div className="cw-confetti">
        {CONFETTI.map((c, i) => (
          <span key={i} className="cw-conf" style={{ left: c.left, background: c.color, animationDelay: c.delay, animationDuration: c.dur, width: c.size, height: c.size }} />
        ))}
      </div>

      <button className="cw-close" onClick={onClose} aria-label="Close">✕</button>

      <div className="cw-scroll">
        <div className="cw-inner">
          <div className="cw-head">
            <div className="cw-kicker">{tournamentName}</div>
            <h1 className="cw-title">CHAMPIONS</h1>
            <div className="cw-sub">One night, eight teams, one trophy.</div>
          </div>

          <section className="cw-champ-sec">
            <div className="cw-trophy">🏆</div>
            <div className="cw-label cw-gold-text">WINNERS</div>
            {photos.champion && (
              <div className="cw-photo-wrap cw-photo-gold">
                <img className="cw-photo" src={photos.champion} alt={champion.teamName} />
              </div>
            )}
            <h2 className="cw-champ-name cw-gold-text">{champion.teamName}</h2>
            {finalScore && <div className="cw-score">won the final {finalScore}</div>}
            <Roster members={champion.members} accent="#f5c542" />
          </section>

          <section className="cw-runner-sec">
            <div className="cw-medal">🥈</div>
            <div className="cw-label cw-silver-text">RUNNERS-UP</div>
            {photos.runnerUp && (
              <div className="cw-photo-wrap cw-photo-silver">
                <img className="cw-photo" src={photos.runnerUp} alt={runnerUp.teamName} />
              </div>
            )}
            <h3 className="cw-runner-name">{runnerUp.teamName}</h3>
            <Roster members={runnerUp.members} accent="#c9d1d3" />
          </section>

          <div className="cw-foot">
            <span className="cw-wordmark">iesports</span>
            <span className="cw-foot-sub">Thank you to everyone who turned up and played. 🫡</span>
          </div>
          <div style={{ height: 24 }} />
        </div>
      </div>
    </div>
  );
}

function Roster({ members, accent }: { members: AnyT[]; accent: string }) {
  if (!members?.length) return null;
  return (
    <div className="cw-roster">
      {members.map((p, i) => {
        const name = p.steamName || p.fullName || "Player";
        return (
          <div key={p.uid || i} className="cw-player" style={{ animationDelay: `${0.08 * i}s`, borderColor: accent + "44" }}>
            {p.steamAvatar
              ? <img className="cw-player-av" src={p.steamAvatar} alt="" />
              : <div className="cw-player-av cw-av-fallback">{name[0]}</div>}
            <div className="cw-player-name">{name}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── compute from data the tournament page already has ────────────────────────
function buildWrap({ tournament, teams, matches }: { tournament: AnyT; teams: AnyT[]; matches: AnyT[] }) {
  if (!tournament || !teams?.length) return null;

  const final = (matches || []).find((m) => m.id === "cs2-final" || m.bracketType === "grand_final");
  const finalDone = final?.status === "completed";
  // The tournament doc is stamped with the champion by settleCS2Match, so a
  // tournament ended by hand still gets its wrap.
  if (!finalDone && !tournament.championTeamName) return null;

  const byId: Record<string, AnyT> = {};
  teams.forEach((t) => { byId[t.id] = t; });

  let championId = tournament.championTeamId;
  let runnerUpId: string | undefined;
  if (final && finalDone) {
    const winnerIsTeam1 = final.winner ? final.winner === "team1" : (final.team1Score ?? 0) >= (final.team2Score ?? 0);
    championId = championId || (winnerIsTeam1 ? final.team1Id : final.team2Id);
    runnerUpId = winnerIsTeam1 ? final.team2Id : final.team1Id;
  }

  const champTeam = (championId && byId[championId]) || { teamName: tournament.championTeamName, members: [] };
  const runnerTeam = (runnerUpId && byId[runnerUpId]) || null;
  if (!champTeam?.teamName) return null;

  // Round score of the final, not the series score: every match in this format
  // is a BO1, so the series score is 1-0 and says nothing.
  const g1 = final?.game1 || final?.games?.game1;
  const finalScore = g1 && Number.isFinite(g1.team1RoundsWon) && Number.isFinite(g1.team2RoundsWon)
    ? `${Math.max(g1.team1RoundsWon, g1.team2RoundsWon)}-${Math.min(g1.team1RoundsWon, g1.team2RoundsWon)}`
    : "";

  return {
    tournamentName: tournament.name || "iesports",
    champion: { teamName: champTeam.teamName, members: champTeam.members || [] },
    runnerUp: { teamName: runnerTeam?.teamName || "", members: runnerTeam?.members || [] },
    finalScore,
  };
}

const CONFETTI = Array.from({ length: 36 }).map((_, i) => {
  const colors = ["#f5c542", "#f0a500", "#6fcf8a", "#52a3c4", "#ffffff", "#e6b800"];
  // Deterministic pseudo-random so the server and client render the same thing.
  const r = (n: number) => ((Math.sin(i * 9.7 + n) + 1) / 2);
  return {
    left: `${Math.round(r(1) * 100)}%`, color: colors[i % colors.length],
    delay: `${(r(2) * 3).toFixed(2)}s`, dur: `${(2.6 + r(3) * 2.4).toFixed(2)}s`,
    size: `${6 + Math.round(r(4) * 6)}px`,
  };
});

const styles = `
.cw-root{position:fixed;inset:0;z-index:9999;font-family:'Inter',system-ui,sans-serif;color:#f3f1ea;}
.cw-backdrop{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% -10%, #3a2a08 0%, #1a1408 45%, #07060a 100%);backdrop-filter:blur(4px);animation:cw-fade .5s ease both;}
.cw-rays{position:absolute;inset:-20%;background:conic-gradient(from 0deg at 50% 30%, rgba(240,165,0,0.07) 0deg, transparent 26deg, rgba(240,165,0,0.07) 52deg, transparent 78deg, rgba(240,165,0,0.07) 104deg, transparent 130deg, rgba(240,165,0,0.07) 156deg, transparent 182deg, rgba(240,165,0,0.07) 208deg, transparent 234deg, rgba(240,165,0,0.07) 260deg, transparent 286deg, rgba(240,165,0,0.07) 312deg, transparent 338deg);animation:cw-spin 60s linear infinite;pointer-events:none;}
.cw-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none;}
.cw-conf{position:absolute;top:-20px;border-radius:2px;opacity:.9;animation-name:cw-conf-fall;animation-timing-function:linear;animation-iteration-count:infinite;}
@keyframes cw-conf-fall{0%{transform:translateY(-20px) rotate(0deg);opacity:0}10%{opacity:.95}100%{transform:translateY(105vh) rotate(540deg);opacity:.5}}
.cw-close{position:absolute;top:18px;left:18px;z-index:3;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:16px;cursor:pointer;backdrop-filter:blur(6px);transition:all .2s;display:flex;align-items:center;justify-content:center;}
.cw-close:hover{background:rgba(255,255,255,.15);transform:scale(1.08);}
.cw-scroll{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;}
.cw-inner{max-width:820px;margin:0 auto;padding:64px 20px 30px;text-align:center;position:relative;z-index:2;}
.cw-head{animation:cw-up .6s ease both;}
.cw-kicker{font-size:.72rem;letter-spacing:.32em;color:#d0b25e;font-weight:800;text-transform:uppercase;}
.cw-title{font-size:clamp(2.4rem,7vw,4.2rem);font-weight:900;letter-spacing:.02em;margin:8px 0 6px;background:linear-gradient(90deg,#f5c542,#fff,#f0a500,#f5c542);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:cw-grad 6s linear infinite;}
.cw-sub{font-size:.92rem;color:#bcb4a2;}
.cw-gold-text{background:linear-gradient(180deg,#fff4c2,#f5c542 45%,#c8941f);-webkit-background-clip:text;background-clip:text;color:transparent;}
.cw-silver-text{background:linear-gradient(180deg,#fff,#c9d1d3 45%,#8d9598);-webkit-background-clip:text;background-clip:text;color:transparent;}
.cw-champ-sec{margin-top:28px;animation:cw-up .7s ease .15s both;}
.cw-trophy{font-size:3.4rem;animation:cw-float 3.2s ease-in-out infinite;filter:drop-shadow(0 6px 22px rgba(245,197,66,.5));}
.cw-label{font-size:.78rem;font-weight:900;letter-spacing:.34em;margin-top:6px;}
.cw-photo-wrap{margin:16px auto 10px;max-width:560px;width:100%;border-radius:18px;overflow:hidden;animation:cw-pop .6s cubic-bezier(.2,1.3,.4,1) .2s both;}
.cw-photo-gold{border:2px solid rgba(245,197,66,.55);box-shadow:0 8px 34px rgba(245,197,66,.28),0 0 0 6px rgba(245,197,66,.07);}
.cw-photo-silver{border:2px solid rgba(201,209,211,.4);box-shadow:0 8px 30px rgba(201,209,211,.18),0 0 0 6px rgba(201,209,211,.05);}
.cw-photo{width:100%;display:block;object-fit:cover;}
.cw-champ-name{font-size:clamp(1.8rem,5.4vw,3rem);font-weight:900;margin:8px 0 2px;}
.cw-score{font-size:.9rem;font-weight:700;color:#d8cfae;letter-spacing:.04em;}
.cw-runner-sec{margin-top:38px;padding-top:26px;border-top:1px solid rgba(255,255,255,.08);animation:cw-up .7s ease .25s both;}
.cw-medal{font-size:2.4rem;animation:cw-float 3.6s ease-in-out infinite;}
.cw-runner-name{font-size:clamp(1.4rem,4vw,2rem);font-weight:900;color:#e7e9ea;margin:8px 0 0;}
.cw-roster{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:18px auto 0;max-width:700px;}
.cw-player{display:flex;align-items:center;gap:9px;background:rgba(255,255,255,.05);border:1px solid;border-radius:100px;padding:6px 15px 6px 6px;animation:cw-up .5s ease both;}
.cw-player-av{width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;}
.cw-player-name{font-size:.82rem;font-weight:800;white-space:nowrap;}
.cw-av-fallback{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#4a3c1a,#2a2210);font-weight:800;color:#e8d9a8;}
.cw-foot{margin-top:52px;display:flex;flex-direction:column;gap:4px;align-items:center;animation:cw-up .7s ease .45s both;}
.cw-wordmark{font-size:1rem;font-weight:900;letter-spacing:.22em;color:rgba(255,255,255,.55);}
.cw-foot-sub{font-size:.78rem;color:#9b927e;}
@keyframes cw-fade{from{opacity:0}to{opacity:1}}
@keyframes cw-up{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
@keyframes cw-pop{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
@keyframes cw-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes cw-spin{to{transform:rotate(360deg)}}
@keyframes cw-grad{to{background-position:300% 0}}
@media (max-width:520px){
  .cw-inner{padding-top:58px}
  .cw-photo-wrap{max-width:340px}
  .cw-roster{gap:6px}
  .cw-player{padding:4px 11px 4px 4px;gap:6px}
  .cw-player-av{width:26px;height:26px}
  .cw-player-name{font-size:.7rem}
}
`;
