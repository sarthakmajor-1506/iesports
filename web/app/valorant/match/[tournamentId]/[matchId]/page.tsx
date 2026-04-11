"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import { useAuth } from "@/app/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";

import type { SwissMatch } from "@/lib/types";

export default function MatchDetail() {
  const params = useParams();
  const tournamentId = params.tournamentId as string;
  const matchId = params.matchId as string;
  const { user, loading: authLoading } = useAuth();

  const [match, setMatch] = useState<any>(null);
  const [tournament, setTournament] = useState<any>(null);
  const [teams, setTeams] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [activeGame, setActiveGame] = useState<number>(1);
  const [detailTab, setDetailTab] = useState<"scoreboard" | "duels">("scoreboard");
  const [sortCol, setSortCol] = useState<string>("kills");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (!tournamentId || !matchId || authLoading || !user) return;
    const load = async () => {
      setLoading(true);
      try {
        const [tDoc, mDoc] = await Promise.all([
          getDoc(doc(db, "valorantTournaments", tournamentId)),
          getDoc(doc(db, "valorantTournaments", tournamentId, "matches", matchId)),
        ]);

        if (tDoc.exists()) setTournament({ id: tDoc.id, ...tDoc.data() });
        if (mDoc.exists()) {
          const mData = { id: mDoc.id, ...mDoc.data() } as SwissMatch;
          setMatch(mData);

          const teamsMap: Record<string, any> = {};
          for (const teamId of [mData.team1Id, mData.team2Id]) {
            if (teamId && teamId !== "TBD") {
              const tDoc = await getDoc(doc(db, "valorantTournaments", tournamentId, "teams", teamId));
              if (tDoc.exists()) teamsMap[teamId] = { id: tDoc.id, ...tDoc.data() };
            }
          }
          setTeams(teamsMap);
        }
      } catch (e) {
        console.error("Failed to load match:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tournamentId, matchId, authLoading, user]);

  if (authLoading) return (
    <><style>{styles}</style><div className="md-page"><Navbar /><div className="md-content"><div className="md-loading">Loading...</div></div></div></>
  );

  if (!user) return (
    <div style={{ minHeight: "100vh", background: "#0A0F2A", fontFamily: "var(--font-geist-sans),system-ui,sans-serif", display: "flex", flexDirection: "column" }}>
      <Navbar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚔️</div>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 900, color: "#F0EEEA", marginBottom: 8 }}>Sign in to view match details</h2>
        <p style={{ fontSize: "0.88rem", color: "#8A8880", marginBottom: 28, maxWidth: 400, lineHeight: 1.6 }}>Create an account or sign in to see match scorecards, player stats and game results.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={() => { try { sessionStorage.setItem("redirectAfterLogin", window.location.pathname); } catch {} window.open("/api/auth/discord-login", "_blank"); }}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(88,101,242,0.15)", color: "#818cf8", border: "1px solid rgba(88,101,242,0.35)", borderRadius: 100, padding: "12px 28px", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Sign in with Discord
          </button>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <><style>{styles}</style><div className="md-page"><Navbar /><div className="md-content"><div className="md-loading">Loading match details...</div></div></div></>
    );
  }

  if (!match) {
    return (
      <><style>{styles}</style><div className="md-page"><Navbar /><div className="md-content"><div className="md-loading">Match not found.</div></div></div></>
    );
  }
  const bestOf = match.isBracket
    ? (match.bracketType === "grand_final" ? (tournament?.grandFinalBestOf || 3) : (tournament?.bracketBestOf || 2))
    : (tournament?.matchesPerRound || 2);
  const games: any[] = [];
  for (let i = 1; i <= bestOf; i++) {
    games.push(match[`game${i}`] || match.games?.[`game${i}`] || null);
  }
  const activeGameData = games[activeGame - 1] || null;
  const isComplete = match.status === "completed";

  const roundsPlayed = activeGameData?.roundsPlayed || ((activeGameData?.redRoundsWon || 0) + (activeGameData?.blueRoundsWon || 0)) || 1;
  const getSortValue = (p: any, col: string) => {
    const kd = Math.round(p.kills / Math.max(1, p.deaths) * 100) / 100;
    const adr = roundsPlayed > 0 ? Math.round((p.damageDealt || 0) / roundsPlayed) : 0;
    const hs = Math.round((p.headshots || 0) / Math.max(1, (p.headshots || 0) + (p.bodyshots || 0) + (p.legshots || 0)) * 100);
    switch (col) {
      case "player": return (p.name || "").toLowerCase();
      case "agent": return (p.agent || "").toLowerCase();
      case "kills": return p.kills || 0;
      case "deaths": return p.deaths || 0;
      case "assists": return p.assists || 0;
      case "kd": return kd;
      case "adr": return adr;
      case "hs": return hs;
      case "fk": return p.firstKills ?? 0;
      case "fd": return p.firstDeaths ?? 0;
      default: return 0;
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
  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  };
  const sortArrow = (col: string) => sortCol === col ? (sortDir === "desc" ? " ▼" : " ▲") : "";
  const thSortStyle = (col: string): React.CSSProperties => ({ cursor: "pointer", color: sortCol === col ? "#3CCBFF" : undefined });

  const t1Players = sortPlayers((activeGameData?.playerStats || []).filter((p: any) =>
    p.tournamentTeam === "team1" || p.teamId === match.team1Id
  ));
  const t2Players = sortPlayers((activeGameData?.playerStats || []).filter((p: any) =>
    p.tournamentTeam === "team2" || p.teamId === match.team2Id
  ));

  return (
    <>
      <style>{styles}</style>
      <div className="md-page">
        <Navbar />
        <div className="md-content">

          {/* ═══ BREADCRUMB ═══ */}
          <div className="md-breadcrumb">
            <Link href={`/valorant/tournament/${tournamentId}?tab=${match.isBracket ? "brackets" : "matches"}&match=${matchId}`} className="md-breadcrumb-link">
              ← {tournament?.name || "Tournament"}
            </Link>
            <span className="md-breadcrumb-sep">›</span>
            <span>Round {match.matchDay} · Match {match.matchIndex}</span>
          </div>

          {/* ═══ MATCH HEADER ═══ */}
          <div className="md-header">
            <div className="md-header-team md-header-team-left">
              <div className="md-header-team-logo">{getInitials(match.team1Name)}</div>
              <div className="md-header-team-name">{match.team1Name}</div>
            </div>

            <div className="md-header-center">
              <div className="md-header-score">
                <span className={match.team1Score > match.team2Score ? "md-score-win" : ""}>{match.team1Score ?? "–"}</span>
                <span className="md-header-score-sep">:</span>
                <span className={match.team2Score > match.team1Score ? "md-score-win" : ""}>{match.team2Score ?? "–"}</span>
              </div>
              <div className={`md-header-status ${match.status}`}>
                {match.status === "completed" ? "Completed" : match.status === "live" ? "Live" : "Pending"}
              </div>
              {match.completedAt && (
                <div className="md-header-date">
                  {new Date(match.completedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </div>
              )}
            </div>

            <div className="md-header-team md-header-team-right">
              <div className="md-header-team-logo">{getInitials(match.team2Name)}</div>
              <div className="md-header-team-name">{match.team2Name}</div>
            </div>
          </div>

          {/* ═══ GAME TABS ═══ */}
          <div className="md-game-tabs">
            {games.map((g, i) => (
              <button
                key={i}
                className={`md-game-tab ${activeGame === i + 1 ? "active" : ""} ${g?.status === "completed" ? "done" : ""}`}
                onClick={() => setActiveGame(i + 1)}
              >
                <span className="md-game-tab-num">Game {i + 1}</span>
                {g ? (
                  <span className="md-game-tab-info">{g.mapName} · {g.team1RoundsWon ?? "?"}-{g.team2RoundsWon ?? "?"}</span>
                ) : (
                  <span className="md-game-tab-info md-game-tab-pending">Pending</span>
                )}
              </button>
            ))}
          </div>

          {/* ═══ GAME SCOREBOARD ═══ */}
          {activeGameData ? (
            <div className="md-scoreboard">
              {/* Map + Round Score Banner */}
              <div className="md-map-banner">
                <span className="md-map-name">{activeGameData.mapName}</span>
                <div className="md-round-score">
                  <span className={activeGameData.winner === "team1" ? "md-rs-win" : "md-rs-loss"}>
                    {activeGameData.team1RoundsWon ?? "?"}
                  </span>
                  <span className="md-rs-sep">–</span>
                  <span className={activeGameData.winner === "team2" ? "md-rs-win" : "md-rs-loss"}>
                    {activeGameData.team2RoundsWon ?? "?"}
                  </span>
                </div>
              </div>

              {/* Round Timeline — two-row layout */}
              {(activeGameData.roundResults || []).length > 0 && (() => {
                const endTypeIcon = (et: string) => {
                  const e = (et || "").toLowerCase();
                  if (e.includes("detonate") || e.includes("bomb")) return "💣";
                  if (e.includes("defuse")) return "🛡";
                  if (e.includes("elim")) return "☠";
                  if (e.includes("timer") || e.includes("time")) return "⏱";
                  return "⚔";
                };
                const rounds = activeGameData.roundResults as any[];
                const t1Color = "#3CCBFF";
                const t2Color = "#f87171";
                const t1Rounds = activeGameData.team1RoundsWon ?? "?";
                const t2Rounds = activeGameData.team2RoundsWon ?? "?";
                return (
                <div style={{ background: "#121215", border: "1px solid #2A2A30", borderRadius: 12, padding: "16px 20px", marginBottom: 12, width: "100%" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#8A8880", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 12 }}>Round Timeline</div>
                  {/* Team 1 row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 0, width: "100%", marginBottom: 3 }}>
                    <div style={{ width: 120, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: t1Color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 88 }}>{match.team1Name}</span>
                      <span style={{ fontSize: "0.92rem", fontWeight: 900, color: t1Color, textShadow: `0 0 8px ${t1Color}44` }}>{t1Rounds}</span>
                    </div>
                    <div style={{ display: "flex", flex: 1, gap: 2, alignItems: "center" }}>
                      {rounds.map((r: any, ri: number) => {
                        const isT1Win = r.winner === "team1";
                        return (
                          <div key={ri} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
                            {ri === 12 && <div style={{ width: 2, height: 26, background: "linear-gradient(180deg, transparent, #555550, transparent)", margin: "0 3px", borderRadius: 1, flexShrink: 0 }} />}
                            <div title={`R${r.round}: ${isT1Win ? match.team1Name : match.team2Name} — ${r.endType || ""}`} style={{
                              width: "100%", height: 26,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>{isT1Win ? <span style={{ color: t1Color, fontSize: "0.82rem", filter: `drop-shadow(0 0 4px ${t1Color}66)` }}>{endTypeIcon(r.endType)}</span> : <span style={{ color: "#1e1e22", fontSize: "0.4rem" }}>●</span>}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Team 2 row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 0, width: "100%", marginBottom: 3 }}>
                    <div style={{ width: 120, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: t2Color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 88 }}>{match.team2Name}</span>
                      <span style={{ fontSize: "0.92rem", fontWeight: 900, color: t2Color, textShadow: `0 0 8px ${t2Color}44` }}>{t2Rounds}</span>
                    </div>
                    <div style={{ display: "flex", flex: 1, gap: 2, alignItems: "center" }}>
                      {rounds.map((r: any, ri: number) => {
                        const isT2Win = r.winner === "team2";
                        return (
                          <div key={ri} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
                            {ri === 12 && <div style={{ width: 2, height: 26, background: "linear-gradient(180deg, transparent, #555550, transparent)", margin: "0 3px", borderRadius: 1, flexShrink: 0 }} />}
                            <div title={`R${r.round}: ${isT2Win ? match.team2Name : match.team1Name} — ${r.endType || ""}`} style={{
                              width: "100%", height: 26,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>{isT2Win ? <span style={{ color: t2Color, fontSize: "0.82rem", filter: `drop-shadow(0 0 4px ${t2Color}66)` }}>{endTypeIcon(r.endType)}</span> : <span style={{ color: "#1e1e22", fontSize: "0.4rem" }}>●</span>}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Round numbers */}
                  <div style={{ display: "flex", alignItems: "center", gap: 0, width: "100%" }}>
                    <div style={{ width: 120, flexShrink: 0 }} />
                    <div style={{ display: "flex", flex: 1, gap: 2 }}>
                      {rounds.map((r: any, ri: number) => (
                        <div key={ri} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
                          {ri === 12 && <div style={{ width: 2, margin: "0 3px", flexShrink: 0 }} />}
                          <div style={{ width: "100%", textAlign: "center", fontSize: "0.58rem", color: "#6b7280", fontWeight: 600 }}>{r.round}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* Detail sub-tabs: Scoreboard / Duels */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <button onClick={() => setDetailTab("scoreboard")} style={{ padding: "6px 18px", borderRadius: 8, border: detailTab === "scoreboard" ? "1px solid #3CCBFF" : "1px solid #2A2A30", background: detailTab === "scoreboard" ? "rgba(60,203,255,0.08)" : "#121215", color: detailTab === "scoreboard" ? "#3CCBFF" : "#8A8880", fontSize: "0.76rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Scoreboard</button>
                <button onClick={() => setDetailTab("duels")} style={{ padding: "6px 18px", borderRadius: 8, border: detailTab === "duels" ? "1px solid #f59e0b" : "1px solid #2A2A30", background: detailTab === "duels" ? "rgba(245,158,11,0.08)" : "#121215", color: detailTab === "duels" ? "#f59e0b" : "#8A8880", fontSize: "0.76rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Duels</button>
              </div>

              {detailTab === "scoreboard" && (<>
              {/* Team 1 Scoreboard */}
              <div className="md-team-section">
                <div className="md-team-label" style={{ color: "#3CCBFF" }}>
                  {match.team1Name}
                  {activeGameData.winner === "team1" && <span className="md-team-winner">WINNER</span>}
                </div>
                <div className="md-stats-table">
                  <div className="md-stats-header">
                    <div className="md-stats-cell md-stats-player" style={thSortStyle("player")} onClick={() => handleSort("player")}>Player{sortArrow("player")}</div>
                    <div className="md-stats-cell" style={thSortStyle("agent")} onClick={() => handleSort("agent")}>Agent{sortArrow("agent")}</div>
                    <div className="md-stats-cell md-stats-k" style={thSortStyle("kills")} onClick={() => handleSort("kills")}>K{sortArrow("kills")}</div>
                    <div className="md-stats-cell md-stats-d" style={thSortStyle("deaths")} onClick={() => handleSort("deaths")}>D{sortArrow("deaths")}</div>
                    <div className="md-stats-cell" style={thSortStyle("assists")} onClick={() => handleSort("assists")}>A{sortArrow("assists")}</div>
                    <div className="md-stats-cell md-stats-kd" style={thSortStyle("kd")} onClick={() => handleSort("kd")}>K/D{sortArrow("kd")}</div>
                    <div className="md-stats-cell" style={thSortStyle("adr")} onClick={() => handleSort("adr")}>ADR{sortArrow("adr")}</div>
                    <div className="md-stats-cell" style={thSortStyle("hs")} onClick={() => handleSort("hs")}>HS%{sortArrow("hs")}</div>
                    <div className="md-stats-cell md-stats-fk" style={thSortStyle("fk")} onClick={() => handleSort("fk")}>FK{sortArrow("fk")}</div>
                    <div className="md-stats-cell md-stats-fd" style={thSortStyle("fd")} onClick={() => handleSort("fd")}>FD{sortArrow("fd")}</div>
                  </div>
                  {t1Players.map((p: any, i: number) => {
                    const kd = Math.round(p.kills / Math.max(1, p.deaths) * 100) / 100;
                    const adr = roundsPlayed > 0 ? Math.round((p.damageDealt || 0) / roundsPlayed) : 0;
                    const hs = Math.round(p.headshots / Math.max(1, p.headshots + p.bodyshots + p.legshots) * 100);
                    return (
                      <div key={i} className="md-stats-row">
                        <div className="md-stats-cell md-stats-player">
                          <Link href={`/player/${findUidByPuuid(p.puuid, p.name, teams, match) || "_"}`} className="md-player-link">{p.name || "Unknown"}</Link>
                        </div>
                        <div className="md-stats-cell md-stats-agent">{p.agent}</div>
                        <div className="md-stats-cell md-stats-k">{p.kills}</div>
                        <div className="md-stats-cell md-stats-d">{p.deaths}</div>
                        <div className="md-stats-cell">{p.assists}</div>
                        <div className="md-stats-cell md-stats-kd" style={{ color: kd >= 1.0 ? "#4ade80" : "#f87171" }}>{kd}</div>
                        <div className="md-stats-cell" style={{ fontWeight: 600 }}>{adr}</div>
                        <div className="md-stats-cell">{hs}%</div>
                        <div className="md-stats-cell md-stats-fk">{p.firstKills ?? 0}</div>
                        <div className="md-stats-cell md-stats-fd">{p.firstDeaths ?? 0}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team 2 Scoreboard */}
              <div className="md-team-section">
                <div className="md-team-label" style={{ color: "#3b82f6" }}>
                  {match.team2Name}
                  {activeGameData.winner === "team2" && <span className="md-team-winner">WINNER</span>}
                </div>
                <div className="md-stats-table">
                  <div className="md-stats-header">
                    <div className="md-stats-cell md-stats-player" style={thSortStyle("player")} onClick={() => handleSort("player")}>Player{sortArrow("player")}</div>
                    <div className="md-stats-cell" style={thSortStyle("agent")} onClick={() => handleSort("agent")}>Agent{sortArrow("agent")}</div>
                    <div className="md-stats-cell md-stats-k" style={thSortStyle("kills")} onClick={() => handleSort("kills")}>K{sortArrow("kills")}</div>
                    <div className="md-stats-cell md-stats-d" style={thSortStyle("deaths")} onClick={() => handleSort("deaths")}>D{sortArrow("deaths")}</div>
                    <div className="md-stats-cell" style={thSortStyle("assists")} onClick={() => handleSort("assists")}>A{sortArrow("assists")}</div>
                    <div className="md-stats-cell md-stats-kd" style={thSortStyle("kd")} onClick={() => handleSort("kd")}>K/D{sortArrow("kd")}</div>
                    <div className="md-stats-cell" style={thSortStyle("adr")} onClick={() => handleSort("adr")}>ADR{sortArrow("adr")}</div>
                    <div className="md-stats-cell" style={thSortStyle("hs")} onClick={() => handleSort("hs")}>HS%{sortArrow("hs")}</div>
                    <div className="md-stats-cell md-stats-fk" style={thSortStyle("fk")} onClick={() => handleSort("fk")}>FK{sortArrow("fk")}</div>
                    <div className="md-stats-cell md-stats-fd" style={thSortStyle("fd")} onClick={() => handleSort("fd")}>FD{sortArrow("fd")}</div>
                  </div>
                  {t2Players.map((p: any, i: number) => {
                    const kd = Math.round(p.kills / Math.max(1, p.deaths) * 100) / 100;
                    const adr = roundsPlayed > 0 ? Math.round((p.damageDealt || 0) / roundsPlayed) : 0;
                    const hs = Math.round(p.headshots / Math.max(1, p.headshots + p.bodyshots + p.legshots) * 100);
                    return (
                      <div key={i} className="md-stats-row">
                        <div className="md-stats-cell md-stats-player">
                          <Link href={`/player/${findUidByPuuid(p.puuid, p.name, teams, match) || "_"}`} className="md-player-link">{p.name || "Unknown"}</Link>
                        </div>
                        <div className="md-stats-cell md-stats-agent">{p.agent}</div>
                        <div className="md-stats-cell md-stats-k">{p.kills}</div>
                        <div className="md-stats-cell md-stats-d">{p.deaths}</div>
                        <div className="md-stats-cell">{p.assists}</div>
                        <div className="md-stats-cell md-stats-kd" style={{ color: kd >= 1.0 ? "#4ade80" : "#f87171" }}>{kd}</div>
                        <div className="md-stats-cell" style={{ fontWeight: 600 }}>{adr}</div>
                        <div className="md-stats-cell">{hs}%</div>
                        <div className="md-stats-cell md-stats-fk">{p.firstKills ?? 0}</div>
                        <div className="md-stats-cell md-stats-fd">{p.firstDeaths ?? 0}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </>)}

              {/* ═══ DUELS TAB ═══ */}
              {detailTab === "duels" && (() => {
                const km: Record<string, Record<string, number>> = activeGameData.killMatrix || {};
                if (t1Players.length === 0 || t2Players.length === 0 || Object.keys(km).length === 0) {
                  return (
                    <div style={{ background: "#121215", border: "1px solid #2A2A30", borderRadius: 12, padding: "40px 20px", textAlign: "center" }}>
                      <div style={{ fontSize: "1.4rem", marginBottom: 8 }}>⚔️</div>
                      <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#8A8880", marginBottom: 4 }}>No duel data available</div>
                      <div style={{ fontSize: "0.76rem", color: "#555550" }}>Duel data will be available for matches fetched after this update.</div>
                    </div>
                  );
                }
                // Helper to find riot avatar from teams by puuid
                const findRiotAvatar = (puuid: string, name: string) => {
                  for (const tid of [match.team1Id, match.team2Id]) {
                    const team = teams[tid];
                    if (!team) continue;
                    for (const m of team.members || []) {
                      if ((m.riotPuuid && m.riotPuuid === puuid) || (m.riotGameName && name && m.riotGameName.toLowerCase() === name.toLowerCase()))
                        return m.riotAvatar || "";
                    }
                  }
                  return "";
                };
                return (
                  <div style={{ background: "#121215", border: "1px solid #2A2A30", borderRadius: 12, padding: "18px 22px" }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#8A8880", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 14 }}>Head-to-Head Duels</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
                        <thead>
                          <tr>
                            <th style={{ padding: "10px 10px", fontSize: "0.68rem", fontWeight: 800, color: "#3CCBFF", textAlign: "left", borderBottom: "2px solid #2A2A30" }}>{match.team1Name}</th>
                            {t2Players.map((p2: any) => {
                              const avatar = findRiotAvatar(p2.puuid, p2.name);
                              return (
                              <th key={p2.puuid} style={{ padding: "10px 6px", textAlign: "center", borderBottom: "2px solid #2A2A30", minWidth: 90 }}>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                  {avatar ? (
                                    <img src={avatar} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(59,130,246,0.35)", boxShadow: "0 0 8px rgba(59,130,246,0.15)" }} />
                                  ) : (
                                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 800, color: "#fff", boxShadow: "0 0 8px rgba(59,130,246,0.15)" }}>{(p2.name || "?")[0]}</div>
                                  )}
                                  <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#3b82f6", whiteSpace: "nowrap" }}>{p2.name || "?"}</span>
                                  <span style={{ fontSize: "0.58rem", fontWeight: 600, color: "#6b7280" }}>{p2.agent || ""}</span>
                                </div>
                              </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {t1Players.map((p1: any, p1i: number) => {
                            const avatar = findRiotAvatar(p1.puuid, p1.name);
                            return (
                            <tr key={p1.puuid} style={{ borderBottom: "1px solid #1e1e22" }}>
                              <td style={{ padding: "10px 10px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  {avatar ? (
                                    <img src={avatar} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(60,203,255,0.35)", boxShadow: "0 0 8px rgba(60,203,255,0.15)", flexShrink: 0 }} />
                                  ) : (
                                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #3CCBFF, #2563eb)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 800, color: "#fff", flexShrink: 0, boxShadow: "0 0 8px rgba(60,203,255,0.15)" }}>{(p1.name || "?")[0]}</div>
                                  )}
                                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#e0e0da", whiteSpace: "nowrap" }}>{p1.name || "?"}</span>
                                    <span style={{ fontSize: "0.58rem", fontWeight: 600, color: "#6b7280" }}>{p1.agent || ""}</span>
                                  </div>
                                </div>
                              </td>
                              {t2Players.map((p2: any, p2i: number) => {
                                const killed = km[p1.puuid]?.[p2.puuid] || 0;
                                const killedBy = km[p2.puuid]?.[p1.puuid] || 0;
                                const diff = killed - killedBy;
                                const cellBg = diff > 0 ? "rgba(74,222,128,0.06)" : diff < 0 ? "rgba(248,113,113,0.06)" : "transparent";
                                return (
                                  <td key={p2.puuid} style={{ padding: "8px 6px", textAlign: "center", background: cellBg, transition: "background 0.2s" }}>
                                    <div className="md-duel-cell" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                      <span style={{
                                        fontSize: "1.05rem", fontWeight: 900, lineHeight: 1,
                                        color: diff > 0 ? "#4ade80" : diff < 0 ? "#f87171" : "#8A8880",
                                        textShadow: diff > 0 ? "0 0 8px rgba(74,222,128,0.3)" : diff < 0 ? "0 0 8px rgba(248,113,113,0.3)" : "none",
                                        animation: `md-duel-pop 0.4s cubic-bezier(0.16,1,0.3,1) ${(p1i * t2Players.length + p2i) * 0.04}s both`,
                                      }}>{killed}</span>
                                      <div style={{ width: 20, height: 1.5, background: diff > 0 ? "rgba(74,222,128,0.25)" : diff < 0 ? "rgba(248,113,113,0.25)" : "#2A2A30", borderRadius: 1 }} />
                                      <span style={{
                                        fontSize: "0.82rem", fontWeight: 700, color: "#555550", lineHeight: 1,
                                        animation: `md-duel-pop 0.4s cubic-bezier(0.16,1,0.3,1) ${(p1i * t2Players.length + p2i) * 0.04 + 0.1}s both`,
                                      }}>{killedBy}</span>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ marginTop: 12, fontSize: "0.65rem", color: "#6b7280", lineHeight: 1.6 }}>
                      <span style={{ color: "#4ade80", fontWeight: 700 }}>Green</span> = won matchup · <span style={{ color: "#f87171", fontWeight: 700 }}>Red</span> = lost matchup. Top number = kills on opponent, bottom = deaths to opponent.
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="md-pending-game">
              <span className="md-pending-icon">⏳</span>
              <span className="md-pending-text">Game {activeGame} hasn't been played yet.</span>
              <span className="md-pending-sub">Match data will appear once the admin fetches results from the Valorant API.</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function getInitials(name: string): string {
  const clean = name?.replace(/\[.*?\]\s*/, "") || "?";
  return clean.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 3);
}
function findUidByPuuid(puuid: string, playerName: string, teams: Record<string, any>, match: any): string {
  for (const teamId of [match.team1Id, match.team2Id]) {
    const team = teams[teamId];
    if (!team) continue;
    for (const m of team.members || []) {
      if (m.riotPuuid && m.riotPuuid === puuid) return m.uid;
      if (m.riotGameName && playerName && m.riotGameName.toLowerCase() === playerName.toLowerCase()) return m.uid;
    }
  }
  return "";
}
const styles = `
  .md-page { min-height: 100vh; background: #0A0A0C; font-family: var(--font-geist-sans), system-ui, sans-serif; overflow-x: hidden; }
  .md-content { max-width: 1400px; margin: 0 auto; padding: 20px 48px 60px; }
  .md-loading { text-align: center; padding: 80px 20px; color: #555550; }

  .md-breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 0.76rem; color: #555550; margin-bottom: 20px; }
  .md-breadcrumb-link { color: #3CCBFF; text-decoration: none; font-weight: 600; }
  .md-breadcrumb-link:hover { text-decoration: underline; }
  .md-breadcrumb-sep { color: #2A2A30; }

  .md-header { display: flex; align-items: center; justify-content: space-between; background: #121215; border: 1px solid #2A2A30; border-radius: 16px; padding: 28px 32px; margin-bottom: 20px; }
  .md-header-team { display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 120px; }
  .md-header-team-left { align-items: flex-start; }
  .md-header-team-right { align-items: flex-end; }
  .md-header-team-logo { width: 52px; height: 52px; border-radius: 12px; background: linear-gradient(135deg, #3CCBFF, #2A9FCC); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 900; color: #fff; }
  .md-header-team-right .md-header-team-logo { background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
  .md-header-team-name { font-size: 0.88rem; font-weight: 800; color: #e0e0da; text-align: center; max-width: 160px; }
  .md-header-center { text-align: center; }
  .md-header-score { display: flex; align-items: center; gap: 8px; font-size: 2.2rem; font-weight: 900; color: #3a3a42; }
  .md-score-win { color: #F0EEEA; }
  .md-header-score-sep { color: #3a3a42; font-weight: 400; }
  .md-header-status { font-size: 0.62rem; font-weight: 800; padding: 3px 14px; border-radius: 100px; display: inline-block; margin-top: 6px; }
  .md-header-status.completed { background: rgba(22,163,74,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
  .md-header-status.live { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.25); }
  .md-header-status.pending { background: rgba(245,158,11,0.1); color: #fbbf24; border: 1px solid rgba(245,158,11,0.25); }
  .md-header-date { font-size: 0.68rem; color: #555550; margin-top: 4px; }

  .md-game-tabs { display: flex; gap: 12px; margin-bottom: 20px; }
  .md-game-tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px; background: #121215; border: 1.5px solid #2A2A30; border-radius: 12px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
  .md-game-tab.active { border-color: #3CCBFF; background: rgba(60,203,255,0.06); }
  .md-game-tab.done .md-game-tab-num::after { content: " ✓"; color: #4ade80; }
  .md-game-tab-num { font-size: 0.72rem; font-weight: 800; color: #e0e0da; text-transform: uppercase; letter-spacing: 0.08em; }
  .md-game-tab-info { font-size: 0.78rem; font-weight: 600; color: #8A8880; }
  .md-game-tab-pending { color: #3a3a42; }

  .md-scoreboard { }
  .md-map-banner { display: flex; align-items: center; justify-content: space-between; background: #18181C; color: #F0EEEA; padding: 16px 24px; border-radius: 12px; margin-bottom: 16px; border: 1px solid #2A2A30; }
  .md-map-name { font-size: 1rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; }
  .md-round-score { display: flex; align-items: center; gap: 8px; font-size: 1.6rem; font-weight: 900; }
  .md-rs-win { color: #4ade80; }
  .md-rs-loss { color: #8A8880; }
  .md-rs-sep { color: #555550; font-weight: 400; }

  .md-team-section { background: #121215; border: 1px solid #2A2A30; border-radius: 12px; padding: 16px 20px; margin-bottom: 12px; overflow-x: auto; }
  .md-team-label { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .md-team-winner { font-size: 0.56rem; padding: 2px 8px; background: rgba(22,163,74,0.12); color: #4ade80; border-radius: 100px; border: 1px solid rgba(34,197,94,0.3); }

  .md-stats-table { width: 100%; min-width: 520px; }
  .md-stats-header { display: grid; grid-template-columns: 2fr 1fr 0.5fr 0.5fr 0.5fr 0.7fr 0.6fr 0.5fr 0.5fr 0.5fr; gap: 4px; padding: 6px 0; border-bottom: 1.5px solid #2A2A30; }
  .md-stats-header .md-stats-cell { font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #555550; cursor: pointer; user-select: none; transition: color 0.15s; }
  .md-stats-header .md-stats-cell:hover { color: #3CCBFF; }
  .md-stats-row { display: grid; grid-template-columns: 2fr 1fr 0.5fr 0.5fr 0.5fr 0.7fr 0.6fr 0.5fr 0.5fr 0.5fr; gap: 4px; padding: 8px 0; border-bottom: 1px solid #1e1e22; align-items: center; }
  .md-stats-row:last-child { border-bottom: none; }
  .md-stats-cell { font-size: 0.82rem; color: #e0e0da; }
  .md-stats-player { font-weight: 700; }
  .md-player-link { color: #e0e0da; text-decoration: none; }
  .md-player-link:hover { color: #3CCBFF; }
  .md-player-tag { color: #3a3a42; font-weight: 400; font-size: 0.72rem; }
  .md-stats-agent { font-size: 0.72rem; color: #8A8880; }
  .md-stats-k { color: #4ade80; font-weight: 700; }
  .md-stats-d { color: #f87171; }
  .md-stats-kd { font-weight: 800; }
  .md-stats-fk { color: #f59e0b; font-weight: 700; }
  .md-stats-fd { color: #f87171; }

  .md-pending-game { text-align: center; padding: 60px 20px; background: #121215; border: 1px solid #2A2A30; border-radius: 14px; }
  .md-pending-icon { font-size: 2rem; display: block; margin-bottom: 12px; }
  .md-pending-text { display: block; font-size: 0.92rem; font-weight: 700; color: #8A8880; margin-bottom: 6px; }
  .md-pending-sub { display: block; font-size: 0.76rem; color: #555550; }

  @keyframes md-duel-pop { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
  .md-duel-cell:hover span { transform: scale(1.15); transition: transform 0.15s ease; }

  @media (max-width: 700px) {
    .md-header { flex-direction: column; gap: 16px; padding: 20px; }
    .md-header-team { align-items: center !important; min-width: auto !important; }
    .md-header-score { font-size: 1.8rem; }
    .md-stats-header, .md-stats-row { grid-template-columns: 1.5fr 0.8fr 0.4fr 0.4fr 0.4fr 0.6fr 0.5fr 0.4fr 0.4fr 0.4fr; }
    .md-stats-cell { font-size: 0.72rem; }
    .md-stats-agent { font-size: 0.62rem; }
    .md-content { padding: 20px 16px 60px; }
    .md-header-team-name { font-size: 0.78rem; max-width: 120px; }
    .md-header-team-logo { width: 42px; height: 42px; }
    .md-map-banner { padding: 12px 16px; flex-wrap: wrap; gap: 8px; }
    .md-round-score { font-size: 1.3rem; }
    .md-team-section { padding: 12px 14px; }
    .md-game-tabs { gap: 8px; }
    .md-game-tab { padding: 10px 8px; }
  }
  @media (max-width: 400px) {
    .md-content { padding: 16px 10px 48px; }
    .md-header { padding: 16px; }
    .md-header-score { font-size: 1.5rem; gap: 6px; }
    .md-header-team-logo { width: 36px; height: 36px; font-size: 13px; }
    .md-header-team-name { font-size: 0.72rem; max-width: 100px; }
    .md-game-tab-num { font-size: 0.64rem; }
    .md-game-tab-info { font-size: 0.68rem; }
    .md-map-banner { padding: 10px 12px; border-radius: 10px; }
    .md-map-name { font-size: 0.86rem; }
    .md-round-score { font-size: 1.1rem; }
  }
`;