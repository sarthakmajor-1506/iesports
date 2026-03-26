"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";

export default function MatchDetail() {
  const params = useParams();
  const tournamentId = params.tournamentId as string;
  const matchId = params.matchId as string;

  const [match, setMatch] = useState<any>(null);
  const [tournament, setTournament] = useState<any>(null);
  const [teams, setTeams] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [activeGame, setActiveGame] = useState<1 | 2>(1);

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
          const mData = { id: mDoc.id, ...mDoc.data() };
          setMatch(mData);

          // Load team docs for member info
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

  const g1 = match.game1;
  const g2 = match.game2;
  const activeGameData = activeGame === 1 ? g1 : g2;
  const isComplete = match.status === "completed";

  // Split players by team for the active game
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
            <Link href={`/valorant/tournament/${tournamentId}`} className="md-breadcrumb-link">
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

              {/* Team 1 Scoreboard */}
              <div className="md-team-section">
                <div className="md-team-label" style={{ color: "#ff4655" }}>
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
                    <div className="md-stats-cell">ACS</div>
                    <div className="md-stats-cell">HS%</div>
                    <div className="md-stats-cell">DMG</div>
                  </div>
                  {t1Players.map((p: any, i: number) => {
                    const kd = Math.round(p.kills / Math.max(1, p.deaths) * 100) / 100;
                    const acs = (activeGameData.roundsPlayed || 1) > 0 ? Math.round(p.score / activeGameData.roundsPlayed) : 0;
                    const hs = Math.round(p.headshots / Math.max(1, p.headshots + p.bodyshots + p.legshots) * 100);
                    return (
                      <div key={i} className="md-stats-row">
                        <div className="md-stats-cell md-stats-player">
                          <Link href={`/player/${p.teamId ? findUidByPuuid(p.puuid, teams, match) : ""}`} className="md-player-link">
                            {p.name}<span className="md-player-tag">#{p.tag}</span>
                          </Link>
                        </div>
                        <div className="md-stats-cell md-stats-agent">{p.agent}</div>
                        <div className="md-stats-cell md-stats-k">{p.kills}</div>
                        <div className="md-stats-cell md-stats-d">{p.deaths}</div>
                        <div className="md-stats-cell">{p.assists}</div>
                        <div className="md-stats-cell md-stats-kd" style={{ color: kd >= 1.0 ? "#16a34a" : "#dc2626" }}>{kd}</div>
                        <div className="md-stats-cell" style={{ fontWeight: 700 }}>{acs}</div>
                        <div className="md-stats-cell">{hs}%</div>
                        <div className="md-stats-cell">{p.damageDealt?.toLocaleString() || 0}</div>
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
                    <div className="md-stats-cell">ACS</div>
                    <div className="md-stats-cell">HS%</div>
                    <div className="md-stats-cell">DMG</div>
                  </div>
                  {t2Players.map((p: any, i: number) => {
                    const kd = Math.round(p.kills / Math.max(1, p.deaths) * 100) / 100;
                    const acs = (activeGameData.roundsPlayed || 1) > 0 ? Math.round(p.score / activeGameData.roundsPlayed) : 0;
                    const hs = Math.round(p.headshots / Math.max(1, p.headshots + p.bodyshots + p.legshots) * 100);
                    return (
                      <div key={i} className="md-stats-row">
                        <div className="md-stats-cell md-stats-player">
                          <Link href={`/player/${p.teamId ? findUidByPuuid(p.puuid, teams, match) : ""}`} className="md-player-link">
                            {p.name}<span className="md-player-tag">#{p.tag}</span>
                          </Link>
                        </div>
                        <div className="md-stats-cell md-stats-agent">{p.agent}</div>
                        <div className="md-stats-cell md-stats-k">{p.kills}</div>
                        <div className="md-stats-cell md-stats-d">{p.deaths}</div>
                        <div className="md-stats-cell">{p.assists}</div>
                        <div className="md-stats-cell md-stats-kd" style={{ color: kd >= 1.0 ? "#16a34a" : "#dc2626" }}>{kd}</div>
                        <div className="md-stats-cell" style={{ fontWeight: 700 }}>{acs}</div>
                        <div className="md-stats-cell">{hs}%</div>
                        <div className="md-stats-cell">{p.damageDealt?.toLocaleString() || 0}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
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

function findUidByPuuid(puuid: string, teams: Record<string, any>, match: any): string {
  // Search team members for this puuid's uid
  for (const teamId of [match.team1Id, match.team2Id]) {
    const team = teams[teamId];
    if (!team) continue;
    for (const m of team.members || []) {
      // Try matching by puuid if stored, otherwise won't link
      if (m.riotPuuid === puuid) return m.uid;
    }
  }
  return "";
}

const styles = `
  .md-page { min-height: 100vh; background: #F8F7F4; font-family: var(--font-geist-sans), system-ui, sans-serif; }
  .md-content { max-width: 920px; margin: 0 auto; padding: 20px 24px 60px; }
  .md-loading { text-align: center; padding: 80px 20px; color: #999; }

  .md-breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 0.76rem; color: #999; margin-bottom: 20px; }
  .md-breadcrumb-link { color: #ff4655; text-decoration: none; font-weight: 600; }
  .md-breadcrumb-link:hover { text-decoration: underline; }
  .md-breadcrumb-sep { color: #ddd; }

  .md-header { display: flex; align-items: center; justify-content: space-between; background: #fff; border: 1px solid #E5E3DF; border-radius: 16px; padding: 28px 32px; margin-bottom: 20px; }
  .md-header-team { display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 120px; }
  .md-header-team-left { align-items: flex-start; }
  .md-header-team-right { align-items: flex-end; }
  .md-header-team-logo { width: 52px; height: 52px; border-radius: 12px; background: linear-gradient(135deg, #ff4655, #c62c3a); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 900; color: #fff; }
  .md-header-team-right .md-header-team-logo { background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
  .md-header-team-name { font-size: 0.88rem; font-weight: 800; color: #333; text-align: center; max-width: 160px; }
  .md-header-center { text-align: center; }
  .md-header-score { display: flex; align-items: center; gap: 8px; font-size: 2.2rem; font-weight: 900; color: #ddd; }
  .md-score-win { color: #111; }
  .md-header-score-sep { color: #ddd; font-weight: 400; }
  .md-header-status { font-size: 0.62rem; font-weight: 800; padding: 3px 14px; border-radius: 100px; display: inline-block; margin-top: 6px; }
  .md-header-status.completed { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
  .md-header-status.live { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
  .md-header-status.pending { background: #FFF7ED; color: #f59e0b; border: 1px solid #fde68a; }
  .md-header-date { font-size: 0.68rem; color: #bbb; margin-top: 4px; }

  .md-game-tabs { display: flex; gap: 12px; margin-bottom: 20px; }
  .md-game-tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px; background: #fff; border: 1.5px solid #E5E3DF; border-radius: 12px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
  .md-game-tab.active { border-color: #ff4655; background: #FFFBFB; }
  .md-game-tab.done .md-game-tab-num::after { content: " ✓"; color: #16a34a; }
  .md-game-tab-num { font-size: 0.72rem; font-weight: 800; color: #333; text-transform: uppercase; letter-spacing: 0.08em; }
  .md-game-tab-info { font-size: 0.78rem; font-weight: 600; color: #666; }
  .md-game-tab-pending { color: #ccc; }

  .md-scoreboard { }
  .md-map-banner { display: flex; align-items: center; justify-content: space-between; background: #111; color: #fff; padding: 16px 24px; border-radius: 12px; margin-bottom: 16px; }
  .md-map-name { font-size: 1rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; }
  .md-round-score { display: flex; align-items: center; gap: 8px; font-size: 1.6rem; font-weight: 900; }
  .md-rs-win { color: #4ade80; }
  .md-rs-loss { color: #888; }
  .md-rs-sep { color: #555; font-weight: 400; }

  .md-team-section { background: #fff; border: 1px solid #E5E3DF; border-radius: 12px; padding: 16px 20px; margin-bottom: 12px; }
  .md-team-label { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .md-team-winner { font-size: 0.56rem; padding: 2px 8px; background: #dcfce7; color: #16a34a; border-radius: 100px; border: 1px solid #bbf7d0; }

  .md-stats-table { width: 100%; }
  .md-stats-header { display: grid; grid-template-columns: 2fr 1fr 0.5fr 0.5fr 0.5fr 0.7fr 0.7fr 0.6fr 0.8fr; gap: 4px; padding: 6px 0; border-bottom: 1.5px solid #E5E3DF; }
  .md-stats-header .md-stats-cell { font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #bbb; }
  .md-stats-row { display: grid; grid-template-columns: 2fr 1fr 0.5fr 0.5fr 0.5fr 0.7fr 0.7fr 0.6fr 0.8fr; gap: 4px; padding: 8px 0; border-bottom: 1px solid #f5f4f0; align-items: center; }
  .md-stats-row:last-child { border-bottom: none; }
  .md-stats-cell { font-size: 0.82rem; color: #333; }
  .md-stats-player { font-weight: 700; }
  .md-player-link { color: #333; text-decoration: none; }
  .md-player-link:hover { color: #ff4655; }
  .md-player-tag { color: #ccc; font-weight: 400; font-size: 0.72rem; }
  .md-stats-agent { font-size: 0.72rem; color: #888; }
  .md-stats-k { color: #16a34a; font-weight: 700; }
  .md-stats-d { color: #dc2626; }
  .md-stats-kd { font-weight: 800; }

  .md-pending-game { text-align: center; padding: 60px 20px; background: #fff; border: 1px solid #E5E3DF; border-radius: 14px; }
  .md-pending-icon { font-size: 2rem; display: block; margin-bottom: 12px; }
  .md-pending-text { display: block; font-size: 0.92rem; font-weight: 700; color: #666; margin-bottom: 6px; }
  .md-pending-sub { display: block; font-size: 0.76rem; color: #bbb; }

  @media (max-width: 700px) {
    .md-header { flex-direction: column; gap: 16px; padding: 20px; }
    .md-header-team { align-items: center !important; }
    .md-header-score { font-size: 1.8rem; }
    .md-stats-header, .md-stats-row { grid-template-columns: 1.5fr 0.8fr 0.4fr 0.4fr 0.4fr 0.6fr 0.6fr 0.5fr 0.7fr; }
    .md-stats-cell { font-size: 0.72rem; }
    .md-stats-agent { font-size: 0.62rem; }
  }
`;