"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Navbar from "@/app/components/Navbar";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, query, where, orderBy } from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────
type ProfileTab = "valorant" | "dota";

interface GlobalStats {
  puuid?: string;
  uid?: string;
  name?: string;
  tag?: string;
  valorant?: {
    totalKills: number; totalDeaths: number; totalAssists: number;
    totalScore: number; totalHeadshots: number; totalBodyshots: number; totalLegshots: number;
    totalDamageDealt: number; totalDamageReceived: number;
    matchesPlayed: number; totalRoundsPlayed: number; gamesWon: number;
    kd: number; acs: number; hsPercent: number;
    agents: string[]; tournaments: string[];
  };
  dota?: any;
}

interface UserProfile {
  uid: string;
  riotGameName?: string; riotTagLine?: string; riotAvatar?: string;
  riotRank?: string; riotTier?: number; riotPuuid?: string;
  discordUsername?: string; steamName?: string;
}

interface MatchHistoryItem {
  tournamentId: string; tournamentName: string;
  matchDocId: string; matchDay: number; matchIndex: number;
  team1Name: string; team2Name: string;
  team1Score: number; team2Score: number;
  games: { gameNum: number; mapName: string; winner: string; team1Rounds: number; team2Rounds: number; playerTeam: string;
    kills: number; deaths: number; assists: number; agent: string; score: number; acs: number; }[];
  completedAt?: string;
}

export default function PlayerProfile() {
  const params = useParams();
  const uid = params.uid as string;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>("valorant");
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const load = async () => {
      setLoading(true);
      try {
        // 1. Fetch user profile
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
          const d = userDoc.data();
          setProfile({
            uid,
            riotGameName: d.riotGameName, riotTagLine: d.riotTagLine,
            riotAvatar: d.riotAvatar, riotRank: d.riotRank,
            riotTier: d.riotTier, riotPuuid: d.riotPuuid,
            discordUsername: d.discordUsername, steamName: d.steamName,
          });

          // 2. Fetch global leaderboard by puuid
          if (d.riotPuuid) {
            const glDoc = await getDoc(doc(db, "globalLeaderboard", d.riotPuuid));
            if (glDoc.exists()) {
              setGlobalStats(glDoc.data() as GlobalStats);
            }
          }

          // 3. Fetch match history from tournaments the user participated in
          if (d.registeredValorantTournaments?.length > 0) {
            const history: MatchHistoryItem[] = [];

            for (const tId of d.registeredValorantTournaments.slice(0, 10)) {
              try {
                const tDoc = await getDoc(doc(db, "valorantTournaments", tId));
                const tName = tDoc.exists() ? tDoc.data().name : tId;

                const matchesSnap = await getDocs(
                  query(collection(db, "valorantTournaments", tId, "matches"), orderBy("matchDay"))
                );

                for (const mDoc of matchesSnap.docs) {
                  const m = mDoc.data();
                  if (m.status !== "completed") continue;

                  // Check if this player was in this match
                  const games: MatchHistoryItem["games"] = [];
                  let playerInMatch = false;

                  for (const gKey of ["game1", "game2"]) {
                    const g = m[gKey];
                    if (!g || !g.playerStats) continue;
                    const ps = g.playerStats.find((p: any) => {
                      if (d.riotPuuid && p.puuid === d.riotPuuid) return true;
                      if (p.name?.toLowerCase() === d.riotGameName?.toLowerCase()) return true;
                      return false;
                    });
                    if (ps) {
                      playerInMatch = true;
                      const roundsInGame = g.roundsPlayed || (g.redRoundsWon + g.blueRoundsWon) || 1;
                      games.push({
                        gameNum: gKey === "game1" ? 1 : 2,
                        mapName: g.mapName || "Unknown",
                        winner: g.winner || "",
                        team1Rounds: g.team1RoundsWon ?? 0,
                        team2Rounds: g.team2RoundsWon ?? 0,
                        playerTeam: ps.tournamentTeam || ps.teamId || "",
                        kills: ps.kills || 0,
                        deaths: ps.deaths || 0,
                        assists: ps.assists || 0,
                        agent: ps.agent || "Unknown",
                        score: ps.score || 0,
                        acs: roundsInGame > 0 ? Math.round(ps.score / roundsInGame) : 0,
                      });
                    }
                  }

                  if (playerInMatch) {
                    history.push({
                      tournamentId: tId,
                      tournamentName: tName,
                      matchDocId: mDoc.id,
                      matchDay: m.matchDay,
                      matchIndex: m.matchIndex,
                      team1Name: m.team1Name,
                      team2Name: m.team2Name,
                      team1Score: m.team1Score,
                      team2Score: m.team2Score,
                      games,
                      completedAt: m.completedAt,
                    });
                  }
                }
              } catch (e) {
                console.error(`Failed to load tournament ${tId}:`, e);
              }
            }

            history.sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
            setMatchHistory(history);
          }
        }
      } catch (e) {
        console.error("Failed to load player profile:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [uid]);

  const displayName = profile?.riotGameName || profile?.discordUsername || profile?.steamName || "Unknown";
  const displayTag = profile?.riotTagLine || "";
  const vStats = globalStats?.valorant;

  const totalGames = vStats?.matchesPlayed || 0;
  const gamesWon = vStats?.gamesWon || 0;
  const gamesLost = totalGames - gamesWon;
  const winRate = totalGames > 0 ? Math.round((gamesWon / totalGames) * 1000) / 10 : 0;

  // Agent frequency
  const agentCounts: Record<string, number> = {};
  for (const mh of matchHistory) {
    for (const g of mh.games) {
      agentCounts[g.agent] = (agentCounts[g.agent] || 0) + 1;
    }
  }
  const topAgents = Object.entries(agentCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  if (loading) {
    return (
      <>
        <style>{baseStyles}</style>
        <div className="pp-page"><Navbar /><div className="pp-content"><div className="pp-loading">Loading player profile...</div></div></div>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <style>{baseStyles}</style>
        <div className="pp-page"><Navbar /><div className="pp-content"><div className="pp-loading">Player not found.</div></div></div>
      </>
    );
  }

  return (
    <>
      <style>{baseStyles}</style>
      <div className="pp-page">
        <Navbar />
        <div className="pp-content">

          {/* ═══ HEADER ═══ */}
          <div className="pp-header">
            <div className="pp-header-left">
              {profile.riotAvatar ? (
                <img src={profile.riotAvatar} alt={displayName} className="pp-avatar" />
              ) : (
                <div className="pp-avatar-init">{displayName[0]?.toUpperCase()}</div>
              )}
              <div className="pp-header-info">
                <h1 className="pp-name">{displayName}{displayTag && <span className="pp-tag">#{displayTag}</span>}</h1>
                <div className="pp-rank">{profile.riotRank || "Unranked"}</div>
              </div>
            </div>
          </div>

          {/* ═══ STATS CARDS ═══ */}
          {vStats && (
            <div className="pp-stats-row">
              <div className="pp-stat-card pp-stat-primary">
                <div className="pp-stat-value">{vStats.acs}</div>
                <div className="pp-stat-label">ACS</div>
              </div>
              <div className="pp-stat-card">
                <div className="pp-stat-value">{totalGames}</div>
                <div className="pp-stat-label">Games Played</div>
              </div>
              <div className="pp-stat-card">
                <div className="pp-stat-value pp-stat-green">{gamesWon}</div>
                <div className="pp-stat-label">Wins</div>
              </div>
              <div className="pp-stat-card">
                <div className="pp-stat-value pp-stat-red">{gamesLost}</div>
                <div className="pp-stat-label">Losses</div>
              </div>
              <div className="pp-stat-card">
                <div className="pp-stat-value" style={{ color: winRate >= 50 ? "#16a34a" : "#dc2626" }}>{winRate}%</div>
                <div className="pp-stat-label">Win Rate</div>
              </div>
            </div>
          )}

          {/* ═══ TAB BAR ═══ */}
          <div className="pp-tab-bar">
            <button className={`pp-tab ${activeTab === "valorant" ? "active" : ""}`} onClick={() => setActiveTab("valorant")}>Valorant</button>
            <button className={`pp-tab ${activeTab === "dota" ? "active" : ""}`} onClick={() => setActiveTab("dota")}>Dota 2</button>
          </div>

          {/* ═══ VALORANT TAB ═══ */}
          {activeTab === "valorant" && (
            <>
              {/* ── Detailed Stats ── */}
              {vStats && (
                <div className="pp-section">
                  <span className="pp-section-label">Performance Breakdown</span>
                  <div className="pp-detail-grid">
                    <div className="pp-detail-item">
                      <span className="pp-detail-num" style={{ color: "#16a34a" }}>{vStats.totalKills}</span>
                      <span className="pp-detail-lbl">Total Kills</span>
                    </div>
                    <div className="pp-detail-item">
                      <span className="pp-detail-num" style={{ color: "#dc2626" }}>{vStats.totalDeaths}</span>
                      <span className="pp-detail-lbl">Total Deaths</span>
                    </div>
                    <div className="pp-detail-item">
                      <span className="pp-detail-num">{vStats.totalAssists}</span>
                      <span className="pp-detail-lbl">Total Assists</span>
                    </div>
                    <div className="pp-detail-item">
                      <span className="pp-detail-num" style={{ color: vStats.kd >= 1.0 ? "#16a34a" : "#dc2626", fontWeight: 900 }}>{vStats.kd}</span>
                      <span className="pp-detail-lbl">K/D Ratio</span>
                    </div>
                    <div className="pp-detail-item">
                      <span className="pp-detail-num">{vStats.hsPercent}%</span>
                      <span className="pp-detail-lbl">HS%</span>
                    </div>
                    <div className="pp-detail-item">
                      <span className="pp-detail-num">{vStats.totalDamageDealt?.toLocaleString()}</span>
                      <span className="pp-detail-lbl">Damage Dealt</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Top Agents ── */}
              {topAgents.length > 0 && (
                <div className="pp-section">
                  <span className="pp-section-label">Most Played Agents</span>
                  <div className="pp-agents-row">
                    {topAgents.map(([agent, count]) => (
                      <div key={agent} className="pp-agent-chip">
                        <span className="pp-agent-name">{agent}</span>
                        <span className="pp-agent-count">{count} game{count > 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Match History ── */}
              <div className="pp-section">
                <span className="pp-section-label">Match History ({matchHistory.length})</span>
                {matchHistory.length === 0 ? (
                  <div className="pp-empty">No match data yet. Stats appear after tournament matches are fetched.</div>
                ) : (
                  <div className="pp-matches">
                    {matchHistory.map((mh) => {
                      const isExpanded = expandedMatch === `${mh.tournamentId}-${mh.matchDocId}`;
                      return (
                        <div key={`${mh.tournamentId}-${mh.matchDocId}`} className="pp-match-card">
                          <div className="pp-match-header" onClick={() => setExpandedMatch(isExpanded ? null : `${mh.tournamentId}-${mh.matchDocId}`)}>
                            <div className="pp-match-meta">
                              <span className="pp-match-tournament">{mh.tournamentName}</span>
                              <span className="pp-match-round">R{mh.matchDay} M{mh.matchIndex}</span>
                            </div>
                            <div className="pp-match-teams">
                              <span className="pp-match-team">{mh.team1Name}</span>
                              <span className="pp-match-score">{mh.team1Score} - {mh.team2Score}</span>
                              <span className="pp-match-team">{mh.team2Name}</span>
                            </div>
                            <span className={`pp-match-expand ${isExpanded ? "open" : ""}`}>▼</span>
                          </div>

                          {isExpanded && (
                            <div className="pp-match-detail">
                              {mh.games.map(g => {
                                const won = g.winner === g.playerTeam;
                                return (
                                  <div key={g.gameNum} className={`pp-game-row ${won ? "won" : "lost"}`}>
                                    <div className="pp-game-map">
                                      <span className="pp-game-num">Game {g.gameNum}</span>
                                      <span className="pp-game-map-name">{g.mapName}</span>
                                      <span className="pp-game-rounds">{g.team1Rounds}-{g.team2Rounds}</span>
                                    </div>
                                    <div className="pp-game-stats">
                                      <span className="pp-game-agent">{g.agent}</span>
                                      <span className="pp-game-kda">{g.kills}/{g.deaths}/{g.assists}</span>
                                      <span className="pp-game-acs">ACS {g.acs}</span>
                                      <span className={`pp-game-result ${won ? "win" : "loss"}`}>{won ? "WIN" : "LOSS"}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═══ DOTA TAB (placeholder) ═══ */}
          {activeTab === "dota" && (
            <div className="pp-section">
              <span className="pp-section-label">Dota 2 Stats</span>
              <div className="pp-empty">
                Dota 2 tournament stats coming soon. This will show match history, win/loss record, and performance from official IEsports Dota 2 tournaments.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const baseStyles = `
  .pp-page { min-height: 100vh; background: #F8F7F4; font-family: var(--font-geist-sans), system-ui, sans-serif; }
  .pp-content { max-width: 860px; margin: 0 auto; padding: 20px 24px 60px; }
  .pp-loading { text-align: center; padding: 80px 20px; color: #999; font-size: 0.9rem; }

  .pp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
  .pp-header-left { display: flex; align-items: center; gap: 16px; }
  .pp-avatar { width: 72px; height: 72px; border-radius: 14px; object-fit: cover; border: 2px solid #E5E3DF; }
  .pp-avatar-init { width: 72px; height: 72px; border-radius: 14px; background: linear-gradient(135deg, #ff4655 0%, #c62c3a 100%); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 900; color: #fff; }
  .pp-header-info { }
  .pp-name { font-size: 1.5rem; font-weight: 900; color: #111; margin: 0; }
  .pp-tag { color: #bbb; font-weight: 400; font-size: 1.1rem; }
  .pp-rank { font-size: 0.82rem; color: #ff4655; font-weight: 700; margin-top: 2px; }

  .pp-stats-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
  .pp-stat-card { background: #fff; border: 1px solid #E5E3DF; border-radius: 14px; padding: 20px 16px; text-align: center; }
  .pp-stat-primary { border-color: #ff4655; background: #FFFBFB; }
  .pp-stat-value { font-size: 1.6rem; font-weight: 900; color: #111; }
  .pp-stat-green { color: #16a34a; }
  .pp-stat-red { color: #dc2626; }
  .pp-stat-label { font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin-top: 4px; }

  .pp-tab-bar { display: flex; gap: 0; border-bottom: 2px solid #E5E3DF; margin-bottom: 24px; }
  .pp-tab { padding: 10px 24px; font-size: 0.86rem; font-weight: 700; color: #999; cursor: pointer; border-bottom: 2.5px solid transparent; margin-bottom: -2px; transition: all 0.15s; background: none; border-top: none; border-left: none; border-right: none; font-family: inherit; }
  .pp-tab.active { color: #ff4655; border-bottom-color: #ff4655; }

  .pp-section { background: #fff; border: 1px solid #E5E3DF; border-radius: 14px; padding: 20px 24px; margin-bottom: 16px; }
  .pp-section-label { display: block; font-size: 0.62rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #bbb; margin-bottom: 16px; }

  .pp-detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .pp-detail-item { text-align: center; padding: 12px; background: #FAFAF8; border-radius: 10px; }
  .pp-detail-num { display: block; font-size: 1.4rem; font-weight: 800; color: #111; }
  .pp-detail-lbl { display: block; font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #999; margin-top: 4px; }

  .pp-agents-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .pp-agent-chip { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #FAFAF8; border: 1px solid #E5E3DF; border-radius: 100px; }
  .pp-agent-name { font-size: 0.82rem; font-weight: 700; color: #333; }
  .pp-agent-count { font-size: 0.68rem; color: #999; }

  .pp-empty { text-align: center; padding: 40px 20px; color: #bbb; font-size: 0.85rem; }

  .pp-matches { display: flex; flex-direction: column; gap: 8px; }
  .pp-match-card { border: 1px solid #E5E3DF; border-radius: 10px; overflow: hidden; }
  .pp-match-header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; transition: background 0.1s; }
  .pp-match-header:hover { background: #FAFAF8; }
  .pp-match-meta { display: flex; flex-direction: column; min-width: 120px; }
  .pp-match-tournament { font-size: 0.62rem; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
  .pp-match-round { font-size: 0.72rem; font-weight: 800; color: #ff4655; }
  .pp-match-teams { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px; }
  .pp-match-team { font-size: 0.82rem; font-weight: 700; color: #333; max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pp-match-score { font-size: 0.92rem; font-weight: 900; color: #111; min-width: 50px; text-align: center; }
  .pp-match-expand { font-size: 10px; color: #ccc; transition: transform 0.2s; }
  .pp-match-expand.open { transform: rotate(180deg); color: #ff4655; }

  .pp-match-detail { padding: 0 16px 12px; }
  .pp-game-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 8px; margin-bottom: 4px; }
  .pp-game-row.won { background: #f0fdf4; }
  .pp-game-row.lost { background: #fef2f2; }
  .pp-game-map { display: flex; align-items: center; gap: 10px; }
  .pp-game-num { font-size: 0.62rem; font-weight: 800; color: #bbb; text-transform: uppercase; }
  .pp-game-map-name { font-size: 0.82rem; font-weight: 700; color: #333; }
  .pp-game-rounds { font-size: 0.78rem; font-weight: 800; color: #666; }
  .pp-game-stats { display: flex; align-items: center; gap: 12px; }
  .pp-game-agent { font-size: 0.72rem; color: #888; }
  .pp-game-kda { font-size: 0.82rem; font-weight: 800; color: #333; }
  .pp-game-acs { font-size: 0.72rem; font-weight: 700; color: #666; }
  .pp-game-result { font-size: 0.58rem; font-weight: 800; padding: 2px 10px; border-radius: 100px; }
  .pp-game-result.win { background: #dcfce7; color: #16a34a; }
  .pp-game-result.loss { background: #fee2e2; color: #dc2626; }

  @media (max-width: 700px) {
    .pp-stats-row { grid-template-columns: repeat(3, 1fr); }
    .pp-detail-grid { grid-template-columns: repeat(2, 1fr); }
    .pp-match-meta { min-width: 80px; }
    .pp-match-team { max-width: 80px; font-size: 0.72rem; }
    .pp-game-row { flex-direction: column; align-items: flex-start; gap: 6px; }
    .pp-name { font-size: 1.2rem; }
    .pp-avatar { width: 56px; height: 56px; }
    .pp-avatar-init { width: 56px; height: 56px; font-size: 22px; }
  }
`;