"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/app/components/Navbar";
import { Swords, Trophy, Clock, ExternalLink } from "lucide-react";

type SortCol = "player" | "hero" | "kills" | "deaths" | "assists" | "kda" | "netWorth" | "gpm" | "xpm" | "lh" | "dn" | "heroDamage" | "towerDamage" | "heroHealing";

function fmtDur(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
}

export default function DotaMatchDetail() {
  const params = useParams();
  const tournamentId = params.id as string;
  const matchId = params.matchId as string;

  const [match, setMatch] = useState<any>(null);
  const [tournament, setTournament] = useState<any>(null);
  const [teams, setTeams] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState<SortCol>("netWorth");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (!tournamentId || !matchId) return;
    setLoading(true);
    fetch(`/api/tournaments/detail?id=${tournamentId}&game=dota2`)
      .then(r => r.json())
      .then(data => {
        if (data.tournament) setTournament(data.tournament);
        if (data.matches) {
          const m = data.matches.find((x: any) => x.id === matchId);
          if (m) setMatch(m);
        }
        if (data.teams) {
          const tmap: Record<string, any> = {};
          for (const t of data.teams) tmap[t.id] = t;
          setTeams(tmap);
        }
      })
      .catch(e => console.error("load match", e))
      .finally(() => setLoading(false));
  }, [tournamentId, matchId]);

  if (loading) return (<><style>{styles}</style><div className="dmd-page"><Navbar /><div className="dmd-content"><div className="dmd-loading">Loading match details…</div></div></div></>);
  if (!match)   return (<><style>{styles}</style><div className="dmd-page"><Navbar /><div className="dmd-content"><div className="dmd-loading">Match not found.</div></div></div></>);

  const g1 = match.game1 || {};
  const playerStats: any[] = Array.isArray(g1.playerStats) ? g1.playerStats : [];
  const isComplete = match.status === "completed";

  const team1Name = teams[match.team1Id]?.teamName || teams[match.team1Id]?.name || match.team1Name || "Team 1";
  const team2Name = teams[match.team2Id]?.teamName || teams[match.team2Id]?.name || match.team2Name || "Team 2";
  const radiantName = g1.radiantTeamId ? (teams[g1.radiantTeamId]?.teamName || teams[g1.radiantTeamId]?.name || "Radiant") : "Radiant";
  const direName = g1.direTeamId ? (teams[g1.direTeamId]?.teamName || teams[g1.direTeamId]?.name || "Dire") : "Dire";
  const radWon = g1.winner === "radiant";
  const winnerName = radWon ? radiantName : direName;

  const getSortValue = (p: any, col: SortCol): number | string => {
    switch (col) {
      case "player": return (p.steamName || p.name || "").toLowerCase();
      case "hero":   return (p.hero || "").toLowerCase();
      case "kills":  return p.kills || 0;
      case "deaths": return p.deaths || 0;
      case "assists":return p.assists || 0;
      case "kda":    return (p.kills + 0.2 * p.assists) / Math.max(1, p.deaths || 1);
      case "netWorth": return p.netWorth || 0;
      case "gpm":    return p.gpm || 0;
      case "xpm":    return p.xpm || 0;
      case "lh":     return p.lastHits || 0;
      case "dn":     return p.denies || 0;
      case "heroDamage": return p.heroDamage || 0;
      case "towerDamage":return p.towerDamage || 0;
      case "heroHealing":return p.heroHealing || 0;
    }
  };
  const sortPlayers = (arr: any[]) => {
    return [...arr].sort((a, b) => {
      const va = getSortValue(a, sortCol);
      const vb = getSortValue(b, sortCol);
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  };
  const handleSort = (c: SortCol) => {
    if (sortCol === c) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(c); setSortDir("desc"); }
  };
  const arrow = (c: SortCol) => sortCol === c ? (sortDir === "desc" ? " ▼" : " ▲") : "";
  const th = (c: SortCol): React.CSSProperties => ({ cursor: "pointer", color: sortCol === c ? "#A12B1F" : undefined });

  const radiantPlayers = sortPlayers(playerStats.filter(p => p.side === "radiant"));
  const direPlayers = sortPlayers(playerStats.filter(p => p.side === "dire"));

  // ── MATCH MVP: highest-impact player across both sides, winner ties broken ──
  const mvpScore = (p: any) => {
    const won = p.side === g1.winner;
    return (
      (p.kills || 0) * 4 +
      (p.assists || 0) * 1.5 +
      -(p.deaths || 0) * 2 +
      (p.gpm || 0) / 100 +
      (p.heroDamage || 0) / 2500 +
      (p.towerDamage || 0) / 2500 +
      (p.heroHealing || 0) / 3000 +
      (won ? 30 : 0) +
      ((p.kills || 0) >= 15 ? 25 : 0)
    );
  };
  const mvp = playerStats.length > 0
    ? [...playerStats].sort((a, b) => mvpScore(b) - mvpScore(a))[0]
    : null;
  const mvpIsRadiant = mvp?.side === "radiant";
  const mvpKda = mvp ? (mvp.kills + 0.2 * mvp.assists) / Math.max(1, mvp.deaths || 1) : 0;

  const renderHeader = () => (
    <div className="dmd-thead">
      <div className="dmd-th player" style={th("player")} onClick={() => handleSort("player")}>Player{arrow("player")}</div>
      <div className="dmd-th hero" style={th("hero")} onClick={() => handleSort("hero")}>Hero{arrow("hero")}</div>
      <div className="dmd-th num" style={th("kills")} onClick={() => handleSort("kills")}>K{arrow("kills")}</div>
      <div className="dmd-th num" style={th("deaths")} onClick={() => handleSort("deaths")}>D{arrow("deaths")}</div>
      <div className="dmd-th num" style={th("assists")} onClick={() => handleSort("assists")}>A{arrow("assists")}</div>
      <div className="dmd-th num" style={th("kda")} onClick={() => handleSort("kda")}>KDA{arrow("kda")}</div>
      <div className="dmd-th num" style={th("netWorth")} onClick={() => handleSort("netWorth")}>Net{arrow("netWorth")}</div>
      <div className="dmd-th num" style={th("gpm")} onClick={() => handleSort("gpm")}>GPM{arrow("gpm")}</div>
      <div className="dmd-th num" style={th("xpm")} onClick={() => handleSort("xpm")}>XPM{arrow("xpm")}</div>
      <div className="dmd-th num" style={th("lh")} onClick={() => handleSort("lh")}>LH{arrow("lh")}</div>
      <div className="dmd-th num" style={th("dn")} onClick={() => handleSort("dn")}>DN{arrow("dn")}</div>
      <div className="dmd-th num" style={th("heroDamage")} onClick={() => handleSort("heroDamage")}>Hero Dmg{arrow("heroDamage")}</div>
      <div className="dmd-th num" style={th("towerDamage")} onClick={() => handleSort("towerDamage")}>Twr Dmg{arrow("towerDamage")}</div>
      <div className="dmd-th num" style={th("heroHealing")} onClick={() => handleSort("heroHealing")}>Heal{arrow("heroHealing")}</div>
    </div>
  );

  const renderRow = (p: any, i: number) => {
    const kda = (p.kills + 0.2 * p.assists) / Math.max(1, p.deaths || 1);
    return (
      <div key={(p.uid || p.name) + i} className="dmd-trow">
        <div className="dmd-td player">
          {p.uid ? (
            <Link href={`/player/${p.uid}?tab=dota`} style={{ color: "inherit", textDecoration: "none" }}>{p.steamName || p.name}</Link>
          ) : (p.steamName || p.name)}
        </div>
        <div className="dmd-td hero">{p.hero || "?"}</div>
        <div className="dmd-td num" style={{ color: "#4ade80", fontWeight: 800 }}>{p.kills || 0}</div>
        <div className="dmd-td num" style={{ color: "#ef4444", fontWeight: 800 }}>{p.deaths || 0}</div>
        <div className="dmd-td num" style={{ color: "#3CCBFF", fontWeight: 800 }}>{p.assists || 0}</div>
        <div className="dmd-td num" style={{ fontWeight: 800 }}>{kda.toFixed(2)}</div>
        <div className="dmd-td num" style={{ color: "#fbbf24", fontWeight: 700 }}>{(p.netWorth || 0).toLocaleString()}</div>
        <div className="dmd-td num">{p.gpm || 0}</div>
        <div className="dmd-td num">{p.xpm || 0}</div>
        <div className="dmd-td num">{p.lastHits || 0}</div>
        <div className="dmd-td num">{p.denies || 0}</div>
        <div className="dmd-td num">{(p.heroDamage || 0).toLocaleString()}</div>
        <div className="dmd-td num">{(p.towerDamage || 0).toLocaleString()}</div>
        <div className="dmd-td num">{(p.heroHealing || 0).toLocaleString()}</div>
      </div>
    );
  };

  return (
    <>
      <style>{styles}</style>
      <div className="dmd-page">
        <Navbar />
        <div className="dmd-content">
          <Link href={`/tournament/${tournamentId}?tab=matches`} className="dmd-back">← Back to {tournament?.name || "tournament"}</Link>

          {/* Header */}
          <div className="dmd-header">
            <div className="dmd-team-block radiant">
              <span className="dmd-side-tag">Radiant</span>
              <div className="dmd-team-name">{radiantName}</div>
              <div className="dmd-team-score" style={{ color: radWon ? "#4ade80" : "#8A8880" }}>{g1.radiantScore ?? "—"}</div>
              {radWon && <span className="dmd-winner-badge">👑 VICTORY</span>}
            </div>
            <div className="dmd-mid-block">
              <div className="dmd-vs">VS</div>
              {match.dataQuality === "low" && (
                <div className="dmd-quality-warn">⚠ Numbers transcribed from a phone photo of the monitor — some fields are approximate.</div>
              )}
              <div className="dmd-meta">
                <span><Clock size={12} /> {fmtDur(match.durationSec || 0)}</span>
                <span>{(match.gameMode || "").replace(/_/g, " ")}</span>
                {match.dotaMatchId && (
                  <a href={`https://stratz.com/matches/${match.dotaMatchId}`} target="_blank" rel="noopener" className="dmd-match-link">
                    {match.dotaMatchId} <ExternalLink size={10} />
                  </a>
                )}
              </div>
              {match.completedAt && <div className="dmd-meta-date">{new Date(match.completedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })} IST</div>}
            </div>
            <div className="dmd-team-block dire">
              <span className="dmd-side-tag">Dire</span>
              <div className="dmd-team-name">{direName}</div>
              <div className="dmd-team-score" style={{ color: !radWon ? "#4ade80" : "#8A8880" }}>{g1.direScore ?? "—"}</div>
              {!radWon && <span className="dmd-winner-badge">👑 VICTORY</span>}
            </div>
          </div>

          {/* ── MATCH MVP ── */}
          {mvp && (
            <div className="dmd-mvp" style={{ borderColor: mvpIsRadiant ? "rgba(74,222,128,0.35)" : "rgba(239,68,68,0.35)", background: mvpIsRadiant ? "linear-gradient(135deg, rgba(74,222,128,0.08) 0%, rgba(251,191,36,0.06) 100%)" : "linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(251,191,36,0.06) 100%)" }}>
              <div className="dmd-mvp-badge">👑 MATCH MVP</div>
              <div className="dmd-mvp-body">
                <div className="dmd-mvp-name-block">
                  <div className="dmd-mvp-hero" style={{ color: mvpIsRadiant ? "#4ade80" : "#ef4444" }}>{mvp.hero || "—"}</div>
                  {mvp.uid ? (
                    <Link href={`/player/${mvp.uid}?tab=dota`} className="dmd-mvp-name">{mvp.steamName || mvp.name}</Link>
                  ) : (
                    <span className="dmd-mvp-name">{mvp.steamName || mvp.name}</span>
                  )}
                  <div className="dmd-mvp-side" style={{ color: mvpIsRadiant ? "#4ade80" : "#ef4444" }}>{mvpIsRadiant ? "Radiant" : "Dire"}{mvp.side === g1.winner ? " · WINNER" : ""}</div>
                </div>
                <div className="dmd-mvp-stats">
                  <div className="dmd-mvp-stat"><div className="dmd-mvp-stat-val" style={{ color: "#4ade80" }}>{mvp.kills}</div><div className="dmd-mvp-stat-lbl">Kills</div></div>
                  <div className="dmd-mvp-stat"><div className="dmd-mvp-stat-val" style={{ color: "#ef4444" }}>{mvp.deaths}</div><div className="dmd-mvp-stat-lbl">Deaths</div></div>
                  <div className="dmd-mvp-stat"><div className="dmd-mvp-stat-val" style={{ color: "#3CCBFF" }}>{mvp.assists}</div><div className="dmd-mvp-stat-lbl">Assists</div></div>
                  <div className="dmd-mvp-stat"><div className="dmd-mvp-stat-val" style={{ color: "#fbbf24" }}>{mvpKda.toFixed(2)}</div><div className="dmd-mvp-stat-lbl">KDA</div></div>
                  <div className="dmd-mvp-stat"><div className="dmd-mvp-stat-val">{mvp.gpm || 0}</div><div className="dmd-mvp-stat-lbl">GPM</div></div>
                  <div className="dmd-mvp-stat"><div className="dmd-mvp-stat-val" style={{ color: "#fbbf24" }}>{(mvp.netWorth || 0).toLocaleString()}</div><div className="dmd-mvp-stat-lbl">Net Worth</div></div>
                </div>
              </div>
            </div>
          )}

          {/* Radiant table */}
          <div className="dmd-table-wrap" style={{ borderColor: radWon ? "rgba(74,222,128,0.35)" : "rgba(74,222,128,0.12)" }}>
            <div className="dmd-table-head" style={{ background: radWon ? "linear-gradient(90deg, rgba(74,222,128,0.10), transparent)" : "transparent" }}>
              <span style={{ color: "#4ade80", fontWeight: 800 }}>Radiant</span>
              <span style={{ color: "#E6E6E6", fontWeight: 700, marginLeft: 12 }}>{radiantName}</span>
              <span className="dmd-table-kills">{g1.radiantScore ?? 0} kills</span>
              {radWon && <Trophy size={14} style={{ color: "#fbbf24" }} />}
            </div>
            <div className="dmd-table">
              {renderHeader()}
              {radiantPlayers.map(renderRow)}
            </div>
          </div>

          {/* Dire table */}
          <div className="dmd-table-wrap" style={{ borderColor: !radWon ? "rgba(239,68,68,0.35)" : "rgba(239,68,68,0.12)", marginTop: 18 }}>
            <div className="dmd-table-head" style={{ background: !radWon ? "linear-gradient(90deg, rgba(239,68,68,0.10), transparent)" : "transparent" }}>
              <span style={{ color: "#ef4444", fontWeight: 800 }}>Dire</span>
              <span style={{ color: "#E6E6E6", fontWeight: 700, marginLeft: 12 }}>{direName}</span>
              <span className="dmd-table-kills">{g1.direScore ?? 0} kills</span>
              {!radWon && <Trophy size={14} style={{ color: "#fbbf24" }} />}
            </div>
            <div className="dmd-table">
              {renderHeader()}
              {direPlayers.map(renderRow)}
            </div>
          </div>

          {/* Bottom action row */}
          <div className="dmd-actions">
            <Link href={`/tournament/${tournamentId}?tab=matches`} className="dmd-action-btn">← All matches</Link>
            {match.dotaMatchId && (
              <a href={`https://stratz.com/matches/${match.dotaMatchId}`} target="_blank" rel="noopener" className="dmd-action-btn">Open on Stratz <ExternalLink size={12} /></a>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const styles = `
  .dmd-page { min-height: 100vh; background: #0A0F2A; color: #E6E6E6; font-family: inherit; padding-bottom: 60px; }
  .dmd-content { max-width: 1280px; margin: 0 auto; padding: 90px 24px 24px; }
  .dmd-loading { text-align: center; padding: 80px 0; color: #8A8880; }
  .dmd-back { display: inline-block; color: #A12B1F; text-decoration: none; font-size: 0.85rem; font-weight: 700; margin-bottom: 18px; }
  .dmd-back:hover { color: #BE3A25; }

  .dmd-header { display: grid; grid-template-columns: 1fr 1.2fr 1fr; gap: 20px; align-items: center; background: rgba(18,18,21,0.85); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 24px 22px; margin-bottom: 22px; backdrop-filter: blur(8px); }
  .dmd-team-block { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
  .dmd-team-block.radiant { color: #4ade80; }
  .dmd-team-block.dire { color: #ef4444; }
  .dmd-side-tag { font-size: 0.6rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.7; }
  .dmd-team-name { font-size: 1.15rem; font-weight: 900; color: #E6E6E6; text-align: center; word-break: break-word; }
  .dmd-team-score { font-size: 2.6rem; font-weight: 900; line-height: 1; margin-top: 2px; }
  .dmd-winner-badge { font-size: 0.6rem; font-weight: 800; color: #fbbf24; letter-spacing: 0.1em; }
  .dmd-mid-block { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .dmd-vs { font-size: 0.95rem; font-weight: 900; color: #A12B1F; letter-spacing: 0.1em; }
  .dmd-quality-warn { font-size: 0.6rem; color: #fbbf24; background: rgba(251,191,36,0.07); padding: 4px 10px; border-radius: 100px; border: 1px solid rgba(251,191,36,0.25); text-align: center; }
  .dmd-meta { display: flex; gap: 12px; font-size: 0.7rem; color: #8A8880; align-items: center; flex-wrap: wrap; justify-content: center; }
  .dmd-meta span { display: inline-flex; align-items: center; gap: 4px; }
  .dmd-meta-date { font-size: 0.65rem; color: #555550; }
  .dmd-match-link { color: #A12B1F; text-decoration: none; display: inline-flex; align-items: center; gap: 3px; }
  .dmd-match-link:hover { color: #BE3A25; }

  /* ── MVP card ── */
  .dmd-mvp { background: rgba(18,18,21,0.85); border: 1px solid; border-radius: 14px; padding: 18px 22px; margin-bottom: 18px; position: relative; overflow: hidden; }
  .dmd-mvp::before { content: ""; position: absolute; top: -40%; right: -10%; width: 60%; height: 200%; background: radial-gradient(circle, rgba(251,191,36,0.10) 0%, transparent 60%); pointer-events: none; }
  .dmd-mvp-badge { display: inline-block; font-size: 0.65rem; font-weight: 900; letter-spacing: 0.18em; color: #fbbf24; background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.35); padding: 4px 12px; border-radius: 100px; margin-bottom: 14px; }
  .dmd-mvp-body { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; position: relative; }
  .dmd-mvp-name-block { display: flex; flex-direction: column; gap: 2px; min-width: 160px; }
  .dmd-mvp-hero { font-size: 0.78rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; }
  .dmd-mvp-name { font-size: 1.5rem; font-weight: 900; color: #E6E6E6; text-decoration: none; line-height: 1.1; }
  .dmd-mvp-name:hover { color: #fbbf24; }
  .dmd-mvp-side { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 4px; }
  .dmd-mvp-stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; flex: 1; min-width: 320px; }
  .dmd-mvp-stat { text-align: center; }
  .dmd-mvp-stat-val { font-size: 1.25rem; font-weight: 900; line-height: 1.1; font-variant-numeric: tabular-nums; color: #E6E6E6; }
  .dmd-mvp-stat-lbl { font-size: 0.55rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #555550; margin-top: 3px; }
  @media (max-width: 600px) {
    .dmd-mvp { padding: 14px; }
    .dmd-mvp-name { font-size: 1.15rem; }
    .dmd-mvp-stats { grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .dmd-mvp-stat-val { font-size: 1.05rem; }
  }

  .dmd-table-wrap { background: rgba(18,18,21,0.85); border: 1px solid; border-radius: 12px; overflow: hidden; }
  .dmd-table-head { display: flex; align-items: center; gap: 8px; padding: 10px 18px; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .dmd-table-head .dmd-table-kills { margin-left: auto; font-size: 0.7rem; color: #8A8880; font-weight: 700; }
  .dmd-table { overflow-x: auto; }
  .dmd-thead, .dmd-trow {
    display: grid;
    grid-template-columns: 1.4fr 1.2fr 0.5fr 0.5fr 0.5fr 0.7fr 0.9fr 0.7fr 0.7fr 0.6fr 0.5fr 1fr 0.9fr 0.8fr;
    gap: 4px;
    padding: 8px 14px;
    align-items: center;
    min-width: 1180px;
  }
  .dmd-thead { background: rgba(0,0,0,0.25); font-size: 0.62rem; font-weight: 800; color: #555550; letter-spacing: 0.08em; text-transform: uppercase; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .dmd-trow { border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.78rem; }
  .dmd-trow:last-child { border-bottom: none; }
  .dmd-trow:hover { background: rgba(255,255,255,0.02); }
  .dmd-th { user-select: none; }
  .dmd-th.num, .dmd-td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .dmd-td.player { font-weight: 700; color: #E6E6E6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dmd-td.hero { color: #A12B1F; font-weight: 700; }

  .dmd-actions { display: flex; gap: 12px; justify-content: center; margin-top: 24px; flex-wrap: wrap; }
  .dmd-action-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: 100px; background: rgba(161,43,31,0.10); color: #A12B1F; text-decoration: none; font-size: 0.78rem; font-weight: 800; border: 1px solid rgba(161,43,31,0.30); }
  .dmd-action-btn:hover { background: rgba(161,43,31,0.18); border-color: rgba(161,43,31,0.5); }

  @media (max-width: 760px) {
    .dmd-content { padding: 78px 12px 24px; }
    .dmd-header { grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 16px 12px; }
    .dmd-team-name { font-size: 0.85rem; }
    .dmd-team-score { font-size: 1.8rem; }
    .dmd-vs { font-size: 0.8rem; }
    .dmd-meta { font-size: 0.62rem; gap: 7px; }
  }
`;
