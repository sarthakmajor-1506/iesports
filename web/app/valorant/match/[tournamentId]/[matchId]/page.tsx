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
  const [activeGame, setActiveGame] = useState<1 | 2>(1);
  const [detailTab, setDetailTab] = useState<"scoreboard" | "duels">("scoreboard");

  useEffect(() => {
    if (!tournamentId || !matchId) return;
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
  }, [tournamentId, matchId]);

  if (!authLoading && !user) return (
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
          <button onClick={() => { try { sessionStorage.setItem("redirectAfterLogin", window.location.pathname); } catch {} window.open("/api/auth/steam", "_blank"); }}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#1b2838,#2a475e)", color: "#fff", border: "1px solid #3d6b8c", borderRadius: 100, padding: "12px 28px", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" alt="" width={18} height={18} style={{ display: "block" }} /> Sign in with Steam
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
  const g1 = match.game1 || match.games?.game1;
  const g2 = match.game2 || match.games?.game2;   
  const activeGameData = activeGame === 1 ? g1 : g2;
  const isComplete = match.status === "completed";

  const t1Players = (activeGameData?.playerStats || []).filter((p: any) =>
    p.tournamentTeam === "team1" || p.teamId === match.team1Id
  );
  const t2Players = (activeGameData?.playerStats || []).filter((p: any) =>
    p.tournamentTeam === "team2" || p.teamId === match.team2Id
  );

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
            <button
              className={`md-game-tab ${activeGame === 1 ? "active" : ""} ${g1?.status === "completed" ? "done" : ""}`}
              onClick={() => setActiveGame(1)}
            >
              <span className="md-game-tab-num">Game 1</span>
              {g1 ? (
                <span className="md-game-tab-info">{g1.mapName} · {g1.team1RoundsWon ?? "?"}-{g1.team2RoundsWon ?? "?"}</span>
              ) : (
                <span className="md-game-tab-info md-game-tab-pending">Pending</span>
              )}
            </button>
            <button
              className={`md-game-tab ${activeGame === 2 ? "active" : ""} ${g2?.status === "completed" ? "done" : ""}`}
              onClick={() => setActiveGame(2)}
            >
              <span className="md-game-tab-num">Game 2</span>
              {g2 ? (
                <span className="md-game-tab-info">{g2.mapName} · {g2.team1RoundsWon ?? "?"}-{g2.team2RoundsWon ?? "?"}</span>
              ) : (
                <span className="md-game-tab-info md-game-tab-pending">Pending</span>
              )}
            </button>
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
                <div style={{ background: "#121215", border: "1px solid #2A2A30", borderRadius: 12, padding: "14px 20px", marginBottom: 12, width: "100%" }}>
                  <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#555550", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 10 }}>Round Timeline</div>
                  {/* Team 1 row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 0, width: "100%", marginBottom: 2 }}>
                    <div style={{ width: 60, flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#8A8880", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 36 }}>{match.team1Name.length > 5 ? match.team1Name.slice(0, 4) + "…" : match.team1Name}</span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 900, color: t1Color }}>{t1Rounds}</span>
                    </div>
                    <div style={{ display: "flex", flex: 1, gap: 2, alignItems: "center" }}>
                      {rounds.map((r: any, ri: number) => {
                        const isT1Win = r.winner === "team1";
                        return (
                          <div key={ri} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
                            {ri === 12 && <div style={{ width: 2, height: 22, background: "#555550", margin: "0 2px", borderRadius: 1, flexShrink: 0 }} />}
                            <div title={`R${r.round}: ${isT1Win ? match.team1Name : match.team2Name} — ${r.endType || ""}`} style={{
                              width: "100%", height: 22,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>{isT1Win ? <span style={{ color: t1Color, fontSize: "0.72rem" }}>{endTypeIcon(r.endType)}</span> : <span style={{ color: "#2A2A30", fontSize: "0.35rem" }}>●</span>}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Team 2 row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 0, width: "100%", marginBottom: 2 }}>
                    <div style={{ width: 60, flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#8A8880", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 36 }}>{match.team2Name.length > 5 ? match.team2Name.slice(0, 4) + "…" : match.team2Name}</span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 900, color: t2Color }}>{t2Rounds}</span>
                    </div>
                    <div style={{ display: "flex", flex: 1, gap: 2, alignItems: "center" }}>
                      {rounds.map((r: any, ri: number) => {
                        const isT2Win = r.winner === "team2";
                        return (
                          <div key={ri} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
                            {ri === 12 && <div style={{ width: 2, height: 22, background: "#555550", margin: "0 2px", borderRadius: 1, flexShrink: 0 }} />}
                            <div title={`R${r.round}: ${isT2Win ? match.team2Name : match.team1Name} — ${r.endType || ""}`} style={{
                              width: "100%", height: 22,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>{isT2Win ? <span style={{ color: t2Color, fontSize: "0.72rem" }}>{endTypeIcon(r.endType)}</span> : <span style={{ color: "#2A2A30", fontSize: "0.35rem" }}>●</span>}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Round numbers */}
                  <div style={{ display: "flex", alignItems: "center", gap: 0, width: "100%" }}>
                    <div style={{ width: 60, flexShrink: 0 }} />
                    <div style={{ display: "flex", flex: 1, gap: 2 }}>
                      {rounds.map((r: any, ri: number) => (
                        <div key={ri} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
                          {ri === 12 && <div style={{ width: 2, margin: "0 2px", flexShrink: 0 }} />}
                          <div style={{ width: "100%", textAlign: "center", fontSize: "0.56rem", color: "#555550", fontWeight: 600 }}>{r.round}</div>
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
                    <div className="md-stats-cell md-stats-player">Player</div>
                    <div className="md-stats-cell">Agent</div>
                    <div className="md-stats-cell md-stats-k">K</div>
                    <div className="md-stats-cell md-stats-d">D</div>
                    <div className="md-stats-cell">A</div>
                    <div className="md-stats-cell md-stats-kd">K/D</div>
                    <div className="md-stats-cell">ADR</div>
                    <div className="md-stats-cell">HS%</div>
                    <div className="md-stats-cell md-stats-fk">FK</div>
                    <div className="md-stats-cell md-stats-fd">FD</div>
                  </div>
                  {t1Players.map((p: any, i: number) => {
                    const kd = Math.round(p.kills / Math.max(1, p.deaths) * 100) / 100;
                    const rounds = activeGameData.roundsPlayed || (activeGameData.redRoundsWon + activeGameData.blueRoundsWon) || 1;
                    const adr = rounds > 0 ? Math.round((p.damageDealt || 0) / rounds) : 0;
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
                    <div className="md-stats-cell md-stats-player">Player</div>
                    <div className="md-stats-cell">Agent</div>
                    <div className="md-stats-cell md-stats-k">K</div>
                    <div className="md-stats-cell md-stats-d">D</div>
                    <div className="md-stats-cell">A</div>
                    <div className="md-stats-cell md-stats-kd">K/D</div>
                    <div className="md-stats-cell">ADR</div>
                    <div className="md-stats-cell">HS%</div>
                    <div className="md-stats-cell md-stats-fk">FK</div>
                    <div className="md-stats-cell md-stats-fd">FD</div>
                  </div>
                  {t2Players.map((p: any, i: number) => {
                    const kd = Math.round(p.kills / Math.max(1, p.deaths) * 100) / 100;
                    const rounds = activeGameData.roundsPlayed || (activeGameData.redRoundsWon + activeGameData.blueRoundsWon) || 1;
                    const adr = rounds > 0 ? Math.round((p.damageDealt || 0) / rounds) : 0;
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
                return (
                  <div style={{ background: "#121215", border: "1px solid #2A2A30", borderRadius: 12, padding: "16px 20px" }}>
                    <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#555550", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 12 }}>Head-to-Head Duels</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 400 }}>
                        <thead>
                          <tr>
                            <th style={{ padding: "6px 8px", fontSize: "0.62rem", fontWeight: 800, color: "#3CCBFF", textAlign: "left", borderBottom: "1.5px solid #2A2A30" }}>{match.team1Name}</th>
                            {t2Players.map((p2: any) => (
                              <th key={p2.puuid} style={{ padding: "6px 4px", fontSize: "0.62rem", fontWeight: 700, color: "#3b82f6", textAlign: "center", borderBottom: "1.5px solid #2A2A30", minWidth: 55 }}>{(p2.name || "?").length > 8 ? (p2.name || "?").slice(0, 6) + "…" : p2.name || "?"}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {t1Players.map((p1: any) => (
                            <tr key={p1.puuid} style={{ borderBottom: "1px solid #1e1e22" }}>
                              <td style={{ padding: "7px 8px", fontSize: "0.72rem", fontWeight: 700, color: "#e0e0da" }}>{p1.name || "?"}</td>
                              {t2Players.map((p2: any) => {
                                const killed = km[p1.puuid]?.[p2.puuid] || 0;
                                const killedBy = km[p2.puuid]?.[p1.puuid] || 0;
                                const diff = killed - killedBy;
                                return (
                                  <td key={p2.puuid} style={{ padding: "5px 4px", textAlign: "center" }}>
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                                      <span style={{ fontSize: "0.78rem", fontWeight: 800, color: diff > 0 ? "#4ade80" : diff < 0 ? "#f87171" : "#8A8880" }}>{killed}</span>
                                      <div style={{ width: 16, height: 1, background: "#2A2A30" }} />
                                      <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "#555550" }}>{killedBy}</span>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ marginTop: 10, fontSize: "0.62rem", color: "#555550", lineHeight: 1.5 }}>
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
  .md-page { min-height: 100vh; background: #0A0A0C; font-family: var(--font-geist-sans), system-ui, sans-serif; }
  .md-content { max-width: 920px; margin: 0 auto; padding: 20px 24px 60px; }
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

  .md-team-section { background: #121215; border: 1px solid #2A2A30; border-radius: 12px; padding: 16px 20px; margin-bottom: 12px; }
  .md-team-label { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .md-team-winner { font-size: 0.56rem; padding: 2px 8px; background: rgba(22,163,74,0.12); color: #4ade80; border-radius: 100px; border: 1px solid rgba(34,197,94,0.3); }

  .md-stats-table { width: 100%; }
  .md-stats-header { display: grid; grid-template-columns: 2fr 1fr 0.5fr 0.5fr 0.5fr 0.7fr 0.6fr 0.5fr 0.5fr 0.5fr; gap: 4px; padding: 6px 0; border-bottom: 1.5px solid #2A2A30; }
  .md-stats-header .md-stats-cell { font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #555550; }
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

  @media (max-width: 700px) {
    .md-header { flex-direction: column; gap: 16px; padding: 20px; }
    .md-header-team { align-items: center !important; }
    .md-header-score { font-size: 1.8rem; }
    .md-stats-header, .md-stats-row { grid-template-columns: 1.5fr 0.8fr 0.4fr 0.4fr 0.4fr 0.6fr 0.5fr 0.4fr 0.4fr 0.4fr; }
    .md-stats-cell { font-size: 0.72rem; }
    .md-stats-agent { font-size: 0.62rem; }
  }
`;