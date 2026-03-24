"use client";

import { useState } from "react";
import Navbar from "@/app/components/Navbar";

export default function AdminPanel() {
  const [adminKey, setAdminKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [tournamentId, setTournamentId] = useState("valorant-shuffle-test-mar28");
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Manual series result
  const [matchId, setMatchId] = useState("");
  const [t1Score, setT1Score] = useState("0");
  const [t2Score, setT2Score] = useState("0");

  // Lobby form
  const [lobbyMatchId, setLobbyMatchId] = useState("");
  const [lobbyName, setLobbyName] = useState("");
  const [lobbyPassword, setLobbyPassword] = useState("");

  // BO2 Match Fetch
  const [fetchMatchDocId, setFetchMatchDocId] = useState("");
  const [game1MatchId, setGame1MatchId] = useState("");
  const [game2MatchId, setGame2MatchId] = useState("");
  const [fetchRegion, setFetchRegion] = useState("ap");
  const [game1ExcludedPuuids, setGame1ExcludedPuuids] = useState("");
  const [game2ExcludedPuuids, setGame2ExcludedPuuids] = useState("");

  // Manual game-level
  const [manualMatchDocId, setManualMatchDocId] = useState("");
  const [manualGame1, setManualGame1] = useState("none");
  const [manualGame2, setManualGame2] = useState("none");
  const [manualReason, setManualReason] = useState("");

  // Shuffle
  const [teamCount, setTeamCount] = useState("2");

  // Pairings
  const [matchDay, setMatchDay] = useState("1");

  // Substitute
  const [subTeamId, setSubTeamId] = useState("");
  const [subOldUid, setSubOldUid] = useState("");
  const [subNewUid, setSubNewUid] = useState("");

  const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  const parsePuuids = (str: string) => str ? str.split(",").map(s => s.trim()).filter(Boolean) : [];

  const apiCall = async (endpoint: string, body: any) => {
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, adminKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addLog(`✅ ${endpoint}: ${JSON.stringify(data).slice(0, 200)}`);
      return data;
    } catch (e: any) {
      addLog(`❌ ${endpoint}: ${e.message}`);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <>
        <style>{`
          .admin-login { min-height: 100vh; background: #F8F7F4; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; }
          .admin-login-box { background: #fff; border: 1px solid #E5E3DF; border-radius: 16px; padding: 40px; max-width: 400px; width: 100%; text-align: center; }
        `}</style>
        <div className="admin-login">
          <div className="admin-login-box">
            <h1 style={{ fontSize: "1.4rem", fontWeight: 900, marginBottom: 8 }}>Admin Panel</h1>
            <p style={{ fontSize: "0.85rem", color: "#888", marginBottom: 24 }}>Enter the admin key to access tournament management.</p>
            <input type="password" placeholder="Admin Key" value={adminKey}
              onChange={e => setAdminKey(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && adminKey) setAuthenticated(true); }}
              style={{ width: "100%", padding: 12, border: "1.5px solid #E5E3DF", borderRadius: 10, fontSize: "0.95rem", marginBottom: 12, outline: "none", boxSizing: "border-box" }}
            />
            <button onClick={() => { if (adminKey) setAuthenticated(true); }}
              style={{ width: "100%", padding: 12, background: "#ff4655", color: "#fff", border: "none", borderRadius: 100, fontWeight: 700, fontSize: "0.95rem", cursor: "pointer" }}>
              Authenticate →
            </button>
          </div>
        </div>
      </>
    );
  }

  const sectionStyle: React.CSSProperties = { background: "#fff", border: "1px solid #E5E3DF", borderRadius: 14, padding: "20px 24px", marginBottom: 16 };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#bbb", marginBottom: 14 };
  const inputStyle: React.CSSProperties = { width: "100%", padding: 10, border: "1.5px solid #E5E3DF", borderRadius: 8, fontSize: "0.88rem", outline: "none", boxSizing: "border-box" as const, marginBottom: 8 };
  const btnStyle: React.CSSProperties = { padding: "10px 20px", background: "#ff4655", color: "#fff", border: "none", borderRadius: 100, fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", opacity: loading ? 0.6 : 1 };
  const btnSecondary: React.CSSProperties = { ...btnStyle, background: "#111" };
  const btnWarning: React.CSSProperties = { ...btnStyle, background: "#f59e0b" };
  const smallLabel: React.CSSProperties = { fontSize: "0.68rem", fontWeight: 700, color: "#999", display: "block", marginBottom: 4 };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };

  return (
    <>
      <style>{`
        .adm-page { min-height: 100vh; background: #F8F7F4; font-family: var(--font-geist-sans), system-ui, sans-serif; }
        .adm-content { max-width: 800px; margin: 0 auto; padding: 20px 24px 60px; }
        .adm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 700px) { .adm-grid { grid-template-columns: 1fr; } }
        .adm-log { background: #111; border-radius: 10px; padding: 14px; max-height: 250px; overflow-y: auto; font-family: monospace; font-size: 0.72rem; color: #aaa; line-height: 1.8; }
      `}</style>
      <div className="adm-page">
        <Navbar />
        <div className="adm-content">
          <h1 style={{ fontSize: "1.4rem", fontWeight: 900, marginBottom: 4 }}>Tournament Admin</h1>
          <p style={{ fontSize: "0.82rem", color: "#888", marginBottom: 20 }}>Manage your Valorant tournament</p>

          <div style={sectionStyle}>
            <span style={labelStyle}>Tournament ID</span>
            <input value={tournamentId} onChange={e => setTournamentId(e.target.value)} style={inputStyle} />
          </div>

          <div className="adm-grid">
            {/* 1. Shuffle */}
            <div style={sectionStyle}>
              <span style={labelStyle}>1. Shuffle Teams</span>
              <p style={{ fontSize: "0.68rem", color: "#999", marginBottom: 8 }}>Creates balanced teams from registered players using snake draft by skill level. Run once after registration closes.</p>
              <input value={teamCount} onChange={e => setTeamCount(e.target.value)} placeholder="Number of teams" style={inputStyle} type="number" min="2" />
              <button disabled={loading} style={btnStyle} onClick={() => apiCall("/api/valorant/shuffle-teams", { tournamentId, teamCount: parseInt(teamCount) })}>Shuffle Teams</button>
            </div>

            {/* 2. Pairings */}
            <div style={sectionStyle}>
              <span style={labelStyle}>2. Generate Swiss Pairings</span>
              <p style={{ fontSize: "0.68rem", color: "#999", marginBottom: 8 }}>Day 1 = random matchups. Day 2+ = teams with similar points play each other. Creates match docs in Firestore.</p>
              <input value={matchDay} onChange={e => setMatchDay(e.target.value)} placeholder="Match Day (1-5)" style={inputStyle} type="number" min="1" max="5" />
              <button disabled={loading} style={btnStyle} onClick={() => apiCall("/api/valorant/swiss-pairings", { tournamentId, matchDay: parseInt(matchDay) })}>Generate Pairings</button>
            </div>

            {/* 3. Lobby */}
            <div style={sectionStyle}>
              <span style={labelStyle}>3. Set Lobby Info</span>
              <p style={{ fontSize: "0.68rem", color: "#999", marginBottom: 8 }}>Enter custom lobby details. Players see this on the Matches tab. Click "Start Match" when both teams are in lobby.</p>
              <input value={lobbyMatchId} onChange={e => setLobbyMatchId(e.target.value)} placeholder="Match ID (e.g. day1-match1)" style={inputStyle} />
              <input value={lobbyName} onChange={e => setLobbyName(e.target.value)} placeholder="Lobby Name" style={inputStyle} />
              <input value={lobbyPassword} onChange={e => setLobbyPassword(e.target.value)} placeholder="Password" style={inputStyle} />
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={loading} style={btnStyle} onClick={() => apiCall("/api/valorant/match-update", { tournamentId, matchId: lobbyMatchId, action: "set-lobby", lobbyName, lobbyPassword })}>Set Lobby</button>
                <button disabled={loading} style={btnSecondary} onClick={() => apiCall("/api/valorant/match-update", { tournamentId, matchId: lobbyMatchId, action: "start" })}>Start Match</button>
              </div>
            </div>

            {/* 4. Manual series result */}
            <div style={sectionStyle}>
              <span style={labelStyle}>4. Manual Series Result (fallback)</span>
              <p style={{ fontSize: "0.68rem", color: "#999", marginBottom: 8 }}>Directly set the series score (e.g. 2-0, 1-1). Use when you don't have Valorant match UUIDs. Updates standings.</p>
              <input value={matchId} onChange={e => setMatchId(e.target.value)} placeholder="Match ID (e.g. day1-match1)" style={inputStyle} />
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input value={t1Score} onChange={e => setT1Score(e.target.value)} placeholder="T1" style={{ ...inputStyle, textAlign: "center" as const }} type="number" min="0" max="2" />
                <span style={{ display: "flex", alignItems: "center", color: "#999", fontWeight: 700 }}>vs</span>
                <input value={t2Score} onChange={e => setT2Score(e.target.value)} placeholder="T2" style={{ ...inputStyle, textAlign: "center" as const }} type="number" min="0" max="2" />
              </div>
              <button disabled={loading} style={btnStyle} onClick={() => apiCall("/api/valorant/match-result", { tournamentId, matchId, team1Score: parseInt(t1Score), team2Score: parseInt(t2Score) })}>Submit Series Result</button>
            </div>

            {/* 5. Substitute */}
            <div style={sectionStyle}>
              <span style={labelStyle}>5. Substitute Player</span>
              <p style={{ fontSize: "0.68rem", color: "#999", marginBottom: 8 }}>Permanently swap a player on a team. The new player must have a Riot ID linked.</p>
              <input value={subTeamId} onChange={e => setSubTeamId(e.target.value)} placeholder="Team ID (e.g. team-1)" style={inputStyle} />
              <input value={subOldUid} onChange={e => setSubOldUid(e.target.value)} placeholder="Old Player UID" style={inputStyle} />
              <input value={subNewUid} onChange={e => setSubNewUid(e.target.value)} placeholder="New Player UID" style={inputStyle} />
              <button disabled={loading} style={btnStyle} onClick={() => apiCall("/api/valorant/substitute", { tournamentId, teamId: subTeamId, oldPlayerUid: subOldUid, newPlayerUid: subNewUid })}>Substitute</button>
            </div>

            {/* 6. Manual game-level result (walkover/forfeit) */}
            <div style={sectionStyle}>
              <span style={labelStyle}>6. Manual Game-Level Result</span>
              <p style={{ fontSize: "0.68rem", color: "#999", marginBottom: 8 }}>Set individual game winners manually. Use for walkovers, forfeits, or no-shows. Updates standings automatically.</p>
              <input value={manualMatchDocId} onChange={e => setManualMatchDocId(e.target.value)} placeholder="Match ID (e.g. day1-match1)" style={inputStyle} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={smallLabel}>Game 1 Winner</label>
                  <select value={manualGame1} onChange={e => setManualGame1(e.target.value)} style={selectStyle}>
                    <option value="none">Not played</option>
                    <option value="team1">Team 1 wins</option>
                    <option value="team2">Team 2 wins</option>
                  </select>
                </div>
                <div>
                  <label style={smallLabel}>Game 2 Winner</label>
                  <select value={manualGame2} onChange={e => setManualGame2(e.target.value)} style={selectStyle}>
                    <option value="none">Not played</option>
                    <option value="team1">Team 1 wins</option>
                    <option value="team2">Team 2 wins</option>
                  </select>
                </div>
              </div>
              <input value={manualReason} onChange={e => setManualReason(e.target.value)} placeholder="Reason (e.g. Team 2 no-show, forfeit)" style={inputStyle} />
              <button disabled={loading} style={btnWarning} onClick={() => apiCall("/api/valorant/manual-game-result", {
                tournamentId,
                matchDocId: manualMatchDocId,
                game1Winner: manualGame1 === "none" ? null : manualGame1,
                game2Winner: manualGame2 === "none" ? null : manualGame2,
                reason: manualReason,
              })}>Set Game Results</button>
            </div>

            {/* 7. BO2 Fetch — full width */}
            <div style={{ ...sectionStyle, gridColumn: "1 / -1" }}>
              <span style={labelStyle}>7. BO2 Series — Fetch Match Stats (Henrik API)</span>
              <p style={{ fontSize: "0.72rem", color: "#888", marginBottom: 12, lineHeight: 1.5 }}>
                Primary flow: enter Valorant match UUIDs for each game. System fetches player stats (kills, deaths, etc.),
                auto-detects winner, updates series score, standings, and leaderboard. Subs excluded per-game.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={smallLabel}>Match Doc ID</label>
                  <input value={fetchMatchDocId} onChange={e => setFetchMatchDocId(e.target.value)} placeholder="e.g. day1-match1" style={inputStyle} />
                </div>
                <div>
                  <label style={smallLabel}>Region</label>
                  <select value={fetchRegion} onChange={e => setFetchRegion(e.target.value)} style={selectStyle}>
                    <option value="ap">AP (India)</option>
                    <option value="eu">EU</option>
                    <option value="na">NA</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
                <div style={{ padding: 12, background: "#FFF5F5", borderRadius: 10, border: "1px solid #fecdd3" }}>
                  <label style={{ fontSize: "0.68rem", fontWeight: 800, color: "#ff4655", display: "block", marginBottom: 6 }}>GAME 1 (Map 1)</label>
                  <input value={game1MatchId} onChange={e => setGame1MatchId(e.target.value)} placeholder="Valorant Match UUID" style={inputStyle} />
                  <label style={{ ...smallLabel, fontSize: "0.62rem" }}>Game 1 Sub PUUIDs</label>
                  <input value={game1ExcludedPuuids} onChange={e => setGame1ExcludedPuuids(e.target.value)} placeholder="comma separated" style={{ ...inputStyle, fontSize: "0.76rem" }} />
                  <button disabled={loading || !game1MatchId} style={{ ...btnStyle, width: "100%", marginTop: 4 }} onClick={() => apiCall("/api/valorant/match-fetch", {
                    tournamentId, matchDocId: fetchMatchDocId, valorantMatchId: game1MatchId,
                    gameNumber: 1, region: fetchRegion, excludedPuuids: parsePuuids(game1ExcludedPuuids),
                  })}>Fetch Game 1</button>
                </div>
                <div style={{ padding: 12, background: "#F0F4FF", borderRadius: 10, border: "1px solid #c7d0ff" }}>
                  <label style={{ fontSize: "0.68rem", fontWeight: 800, color: "#3b82f6", display: "block", marginBottom: 6 }}>GAME 2 (Map 2)</label>
                  <input value={game2MatchId} onChange={e => setGame2MatchId(e.target.value)} placeholder="Valorant Match UUID" style={inputStyle} />
                  <label style={{ ...smallLabel, fontSize: "0.62rem" }}>Game 2 Sub PUUIDs</label>
                  <input value={game2ExcludedPuuids} onChange={e => setGame2ExcludedPuuids(e.target.value)} placeholder="comma separated" style={{ ...inputStyle, fontSize: "0.76rem" }} />
                  <button disabled={loading || !game2MatchId} style={{ ...btnSecondary, width: "100%", marginTop: 4 }} onClick={() => apiCall("/api/valorant/match-fetch", {
                    tournamentId, matchDocId: fetchMatchDocId, valorantMatchId: game2MatchId,
                    gameNumber: 2, region: fetchRegion, excludedPuuids: parsePuuids(game2ExcludedPuuids),
                  })}>Fetch Game 2</button>
                </div>
              </div>
            </div>
          </div>

          {/* Log */}
          <div style={{ ...sectionStyle, marginTop: 8 }}>
            <span style={labelStyle}>Activity Log</span>
            <div className="adm-log">
              {log.length === 0 ? (
                <span style={{ color: "#555" }}>No actions yet. Use the controls above.</span>
              ) : (
                log.map((l, i) => <div key={i}>{l}</div>)
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}