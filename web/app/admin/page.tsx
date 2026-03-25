"use client";

import { useState, useEffect, useCallback } from "react";
import Navbar from "@/app/components/Navbar";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TournamentOption { id: string; name: string; status: string; teamCount?: number; slotsBooked?: number; totalSlots?: number; }
interface TeamData { id: string; teamName: string; teamIndex: number; members: any[]; avgSkillLevel: number; }
interface MatchData { id: string; matchDay: number; matchIndex: number; team1Id: string; team2Id: string; team1Name: string; team2Name: string; team1Score: number; team2Score: number; status: string; games?: { game1?: any; game2?: any }; scheduledTime?: string; lobbyName?: string; lobbyPassword?: string; }
interface PlayerData { uid: string; riotGameName?: string; riotTagLine?: string; riotRank?: string; riotVerified?: string; steamId?: string; steamName?: string; discordId?: string; discordUsername?: string; phone?: string; registeredValorantTournaments?: string[]; }

type AdminTab = "tournament" | "players";

export default function AdminPanel() {
  // ─── Auth ───────────────────────────────────────────────────────────────────
  const [adminKey, setAdminKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);

  // ─── Active tab ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<AdminTab>("tournament");

  // ─── Tournament selection ───────────────────────────────────────────────────
  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [tournamentId, setTournamentId] = useState("");

  // ─── Teams, Matches ─────────────────────────────────────────────────────────
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [matches, setMatches] = useState<MatchData[]>([]);

  // ─── All Players (for registry tab) ─────────────────────────────────────────
  const [allPlayers, setAllPlayers] = useState<PlayerData[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");

  // ─── Log ────────────────────────────────────────────────────────────────────
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // ─── Shuffle ────────────────────────────────────────────────────────────────
  const [teamCount, setTeamCount] = useState("2");

  // ─── Swiss Pairings ─────────────────────────────────────────────────────────
  const [totalRounds, setTotalRounds] = useState("5");
  const [startTime, setStartTime] = useState("18:00");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);

  // ─── Lobby (from match/game dropdown) ───────────────────────────────────────
  const [selectedMatchForLobby, setSelectedMatchForLobby] = useState("");
  const [selectedGameForLobby, setSelectedGameForLobby] = useState("1");
  const [lobbyName, setLobbyName] = useState("");
  const [lobbyPassword, setLobbyPassword] = useState("");

  // ─── Manual series result ───────────────────────────────────────────────────
  const [manualMatchId, setManualMatchId] = useState("");
  const [t1Score, setT1Score] = useState("0");
  const [t2Score, setT2Score] = useState("0");

  // ─── Manual game-level result ───────────────────────────────────────────────
  const [manualGameMatchId, setManualGameMatchId] = useState("");
  const [manualGame1, setManualGame1] = useState("none");
  const [manualGame2, setManualGame2] = useState("none");
  const [manualReason, setManualReason] = useState("");

  // ─── BO2 Fetch ──────────────────────────────────────────────────────────────
  const [fetchMatchDocId, setFetchMatchDocId] = useState("");
  const [game1MatchId, setGame1MatchId] = useState("");
  const [game2MatchId, setGame2MatchId] = useState("");
  const [fetchRegion, setFetchRegion] = useState("ap");
  const [game1ExcludedPuuids, setGame1ExcludedPuuids] = useState("");
  const [game2ExcludedPuuids, setGame2ExcludedPuuids] = useState("");

  // ─── Add/Remove Player ─────────────────────────────────────────────────────
  const [modTeamId, setModTeamId] = useState("");
  const [modPlayerUid, setModPlayerUid] = useState("");
  const [modTargetTeamId, setModTargetTeamId] = useState("");

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  const parsePuuids = (str: string) => str ? str.split(",").map(s => s.trim()).filter(Boolean) : [];

  const apiCall = useCallback(async (endpoint: string, body: any) => {
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, adminKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addLog(`✅ ${endpoint.split("/api/")[1] || endpoint}: ${JSON.stringify(data).slice(0, 300)}`);
      return data;
    } catch (e: any) {
      addLog(`❌ ${endpoint.split("/api/")[1] || endpoint}: ${e.message}`);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  // ─── Fetch tournaments ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!authenticated) return;
    const unsub = onSnapshot(collection(db, "valorantTournaments"), (snap) => {
      const all = snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.id,
        status: d.data().status || "upcoming",
        teamCount: d.data().teamCount,
        slotsBooked: d.data().slotsBooked,
        totalSlots: d.data().totalSlots,
      }));
      setTournaments(all.sort((a, b) => a.name.localeCompare(b.name)));
      if (!tournamentId && all.length > 0) setTournamentId(all[0].id);
    });
    return () => unsub();
  }, [authenticated]);

  // ─── Fetch teams & matches when tournament changes ──────────────────────────
  useEffect(() => {
    if (!tournamentId || !authenticated) { setTeams([]); setMatches([]); return; }

    const unsub1 = onSnapshot(
      query(collection(db, "valorantTournaments", tournamentId, "teams"), orderBy("teamIndex")),
      (snap) => setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as TeamData)))
    );

    const unsub2 = onSnapshot(
      collection(db, "valorantTournaments", tournamentId, "matches"),
      (snap) => {
        const m = snap.docs.map(d => ({ id: d.id, ...d.data() } as MatchData));
        setMatches(m.sort((a, b) => {
          if (a.matchDay !== b.matchDay) return a.matchDay - b.matchDay;
          return a.matchIndex - b.matchIndex;
        }));
      }
    );

    return () => { unsub1(); unsub2(); };
  }, [tournamentId, authenticated]);

  // ─── Fetch all players for registry tab (via admin API, not client Firestore) ─
  useEffect(() => {
    if (!authenticated || activeTab !== "players") return;
    let cancelled = false;
    const fetchPlayers = async () => {
      try {
        const res = await fetch("/api/valorant/list-users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminKey }),
        });
        const data = await res.json();
        if (!cancelled && data.users) {
          setAllPlayers(data.users);
        }
      } catch (e) {
        console.error("Failed to fetch players:", e);
      }
    };
    fetchPlayers();
    return () => { cancelled = true; };
  }, [authenticated, activeTab, adminKey]);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const pendingMatches = matches.filter(m => m.status === "pending" || m.status === "live");
  const matchDays = [...new Set(matches.map(m => m.matchDay))].sort((a, b) => a - b);

  const filteredPlayers = allPlayers.filter(p => {
    if (!playerSearch) return true;
    const q = playerSearch.toLowerCase();
    return (
      (p.riotGameName?.toLowerCase().includes(q)) ||
      (p.discordUsername?.toLowerCase().includes(q)) ||
      (p.steamName?.toLowerCase().includes(q)) ||
      (p.uid?.toLowerCase().includes(q)) ||
      (p.phone?.includes(q))
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGIN SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════════════════
  const sectionStyle: React.CSSProperties = { background: "#fff", border: "1px solid #E5E3DF", borderRadius: 14, padding: "20px 24px", marginBottom: 16 };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#bbb", marginBottom: 14 };
  const inputStyle: React.CSSProperties = { width: "100%", padding: 10, border: "1.5px solid #E5E3DF", borderRadius: 8, fontSize: "0.88rem", outline: "none", boxSizing: "border-box" as const, marginBottom: 8 };
  const btnStyle: React.CSSProperties = { padding: "10px 20px", background: "#ff4655", color: "#fff", border: "none", borderRadius: 100, fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", opacity: loading ? 0.6 : 1 };
  const btnSecondary: React.CSSProperties = { ...btnStyle, background: "#111" };
  const btnWarning: React.CSSProperties = { ...btnStyle, background: "#f59e0b" };
  const btnDanger: React.CSSProperties = { ...btnStyle, background: "#dc2626" };
  const btnSuccess: React.CSSProperties = { ...btnStyle, background: "#16a34a" };
  const smallLabel: React.CSSProperties = { fontSize: "0.68rem", fontWeight: 700, color: "#999", display: "block", marginBottom: 4 };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 16px", borderRadius: 100, border: "1.5px solid", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer",
    background: active ? "#ff4655" : "#fff", color: active ? "#fff" : "#666",
    borderColor: active ? "#ff4655" : "#E5E3DF", transition: "all 0.15s",
  });

  return (
    <>
      <style>{`
        .adm-page { min-height: 100vh; background: #F8F7F4; font-family: var(--font-geist-sans), system-ui, sans-serif; }
        .adm-content { max-width: 900px; margin: 0 auto; padding: 20px 24px 60px; }
        .adm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 700px) { .adm-grid { grid-template-columns: 1fr; } }
        .adm-log { background: #111; border-radius: 10px; padding: 14px; max-height: 250px; overflow-y: auto; font-family: monospace; font-size: 0.72rem; color: #aaa; line-height: 1.8; }
        .adm-tab-bar { display: flex; gap: 0; border-bottom: 2px solid #E5E3DF; margin-bottom: 20px; }
        .adm-tab { padding: 10px 24px; font-size: 0.86rem; font-weight: 700; color: #999; cursor: pointer; border-bottom: 2.5px solid transparent; margin-bottom: -2px; transition: all 0.15s; background: none; border-top: none; border-left: none; border-right: none; font-family: inherit; }
        .adm-tab.active { color: #ff4655; border-bottom-color: #ff4655; }
        .adm-match-card { background: #fafaf8; border: 1px solid #E5E3DF; border-radius: 10px; padding: 10px 14px; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; font-size: 0.78rem; }
        .adm-match-day { font-size: 0.6rem; font-weight: 800; letter-spacing: 0.1em; color: #bbb; text-transform: uppercase; }
        .adm-match-teams { flex: 1; font-weight: 600; color: #333; }
        .adm-match-score { font-weight: 800; font-size: 0.82rem; color: #111; min-width: 40px; text-align: center; }
        .adm-match-status { font-size: 0.62rem; font-weight: 700; padding: 3px 10px; border-radius: 100; }
        .adm-match-status.pending { background: #FFF7ED; color: #f59e0b; border: 1px solid #fde68a; }
        .adm-match-status.live { background: #FEF2F2; color: #dc2626; border: 1px solid #fecaca; }
        .adm-match-status.completed { background: #F0FDF4; color: #16a34a; border: 1px solid #bbf7d0; }
        .adm-player-row { display: grid; grid-template-columns: 2fr 1.2fr 1fr 1fr 1fr 1fr; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #f0efe9; font-size: 0.76rem; align-items: center; }
        .adm-player-row:hover { background: #fafaf8; }
        .adm-player-header { font-weight: 800; color: #999; font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase; }
        .adm-check { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; border-radius: 4px; font-size: 10px; }
        .adm-check.yes { background: #dcfce7; color: #16a34a; }
        .adm-check.no { background: #fef2f2; color: #dc2626; }
        @media (max-width: 700px) { .adm-player-row { grid-template-columns: 1.5fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr; font-size: 0.68rem; } }
      `}</style>
      <div className="adm-page">
        <Navbar />
        <div className="adm-content">
          <h1 style={{ fontSize: "1.4rem", fontWeight: 900, marginBottom: 4 }}>Tournament Admin</h1>
          <p style={{ fontSize: "0.82rem", color: "#888", marginBottom: 20 }}>Manage your Valorant tournament</p>

          {/* ═══ TAB BAR ═══ */}
          <div className="adm-tab-bar">
            <button className={`adm-tab ${activeTab === "tournament" ? "active" : ""}`} onClick={() => setActiveTab("tournament")}>Tournament Ops</button>
            <button className={`adm-tab ${activeTab === "players" ? "active" : ""}`} onClick={() => setActiveTab("players")}>Player Registry</button>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* TAB 1: TOURNAMENT OPS */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === "tournament" && (
            <>
              {/* ── Tournament Selector ── */}
              <div style={sectionStyle}>
                <span style={labelStyle}>Select Tournament</span>
                <select value={tournamentId} onChange={e => setTournamentId(e.target.value)} style={selectStyle}>
                  {tournaments.length === 0 && <option value="">Loading tournaments...</option>}
                  {tournaments.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.status}) — {t.slotsBooked ?? 0}/{t.totalSlots ?? "∞"} players
                    </option>
                  ))}
                </select>
                {tournamentId && (
                  <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.72rem", color: "#666", background: "#F2F1EE", padding: "4px 12px", borderRadius: 100 }}>
                      {teams.length} teams
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "#666", background: "#F2F1EE", padding: "4px 12px", borderRadius: 100 }}>
                      {matches.length} matches ({pendingMatches.length} pending)
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "#666", background: "#F2F1EE", padding: "4px 12px", borderRadius: 100 }}>
                      {matchDays.length} round(s)
                    </span>
                  </div>
                )}
              </div>

              <div className="adm-grid">
                {/* ═══ 1. SHUFFLE TEAMS ═══ */}
                <div style={sectionStyle}>
                  <span style={labelStyle}>1. Shuffle Teams</span>
                  <p style={{ fontSize: "0.68rem", color: "#999", marginBottom: 8 }}>
                    Deletes all existing teams first, then creates balanced teams via snake draft by skill level.
                  </p>
                  <input value={teamCount} onChange={e => setTeamCount(e.target.value)} placeholder="Number of teams" style={inputStyle} type="number" min="2" />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button disabled={loading} style={btnDanger} onClick={async () => {
                      if (!confirm("This will DELETE all existing teams and reshuffle. Continue?")) return;
                      await apiCall("/api/valorant/shuffle-teams", { tournamentId, teamCount: parseInt(teamCount), deleteExisting: true });
                    }}>Delete & Reshuffle</button>
                  </div>
                  {teams.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#bbb", letterSpacing: "0.1em" }}>CURRENT TEAMS</span>
                      {teams.map(t => (
                        <div key={t.id} style={{ fontSize: "0.72rem", padding: "4px 0", color: "#555" }}>
                          {t.teamName} — {t.members?.length || 0} players (avg {t.avgSkillLevel})
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ═══ 2. GENERATE ALL SWISS PAIRINGS ═══ */}
                <div style={sectionStyle}>
                  <span style={labelStyle}>2. Generate Swiss Pairings (All Rounds)</span>
                  <p style={{ fontSize: "0.68rem", color: "#999", marginBottom: 8 }}>
                    Creates all rounds at once. Round 1 = random. Rounds 2+ = "TBD" placeholders that auto-fill as results come in.
                    Each match scheduled 1.5h apart.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <label style={smallLabel}>Total Rounds</label>
                      <input value={totalRounds} onChange={e => setTotalRounds(e.target.value)} style={inputStyle} type="number" min="1" max="10" />
                    </div>
                    <div>
                      <label style={smallLabel}>Start Time (IST)</label>
                      <input value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} type="time" />
                    </div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={smallLabel}>Start Date</label>
                    <input value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} type="date" />
                  </div>
                  <button disabled={loading} style={btnStyle} onClick={async () => {
                    if (!confirm(`Generate ${totalRounds} rounds of fixtures? This will delete existing matches.`)) return;
                    await apiCall("/api/valorant/generate-all-pairings", {
                      tournamentId,
                      totalRounds: parseInt(totalRounds),
                      startTime,
                      startDate,
                    });
                  }}>Generate All Fixtures</button>
                </div>

                {/* ═══ 3. SET LOBBY (from match/game dropdown) ═══ */}
                <div style={sectionStyle}>
                  <span style={labelStyle}>3. Set Lobby & Notify Discord</span>
                  <p style={{ fontSize: "0.68rem", color: "#999", marginBottom: 8 }}>
                    Select a match and game. Setting lobby sends a Discord notification pinging all players in the match.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
                    <div>
                      <label style={smallLabel}>Match</label>
                      <select value={selectedMatchForLobby} onChange={e => setSelectedMatchForLobby(e.target.value)} style={selectStyle}>
                        <option value="">Select a match...</option>
                        {pendingMatches.map(m => (
                          <option key={m.id} value={m.id}>
                            R{m.matchDay}-M{m.matchIndex}: {m.team1Name} vs {m.team2Name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={smallLabel}>Game</label>
                      <select value={selectedGameForLobby} onChange={e => setSelectedGameForLobby(e.target.value)} style={selectStyle}>
                        <option value="1">Game 1</option>
                        <option value="2">Game 2</option>
                      </select>
                    </div>
                  </div>
                  <input value={lobbyName} onChange={e => setLobbyName(e.target.value)} placeholder="Lobby Name" style={inputStyle} />
                  <input value={lobbyPassword} onChange={e => setLobbyPassword(e.target.value)} placeholder="Password" style={inputStyle} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button disabled={loading || !selectedMatchForLobby} style={btnStyle}
                      onClick={() => apiCall("/api/valorant/match-update", {
                        tournamentId,
                        matchId: selectedMatchForLobby,
                        gameNumber: parseInt(selectedGameForLobby),
                        action: "set-lobby",
                        lobbyName,
                        lobbyPassword,
                        notifyDiscord: true,
                      })}>Set Lobby & Notify</button>
                    <button disabled={loading || !selectedMatchForLobby} style={btnSecondary}
                      onClick={() => apiCall("/api/valorant/match-update", {
                        tournamentId,
                        matchId: selectedMatchForLobby,
                        action: "start",
                      })}>Start Match</button>
                    <button disabled={loading || !selectedMatchForLobby} style={{ ...btnStyle, background: "#6b7280", fontSize: "0.72rem", padding: "8px 14px" }}
                      onClick={() => apiCall("/api/valorant/match-update", {
                        tournamentId,
                        matchId: selectedMatchForLobby,
                        action: "cleanup-vcs",
                      })}>🗑️ Cleanup VCs</button>
                  </div>
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "#f8f7f4", borderRadius: 8, fontSize: "0.62rem", color: "#999", lineHeight: 1.6 }}>
                    <strong>Set Lobby</strong> → Creates waiting room VC + pings all players on Discord<br/>
                    <strong>Start Match</strong> → Creates 2 team VCs, moves players, deletes waiting room<br/>
                    <strong>Cleanup VCs</strong> → Deletes all VCs for this match (use after match ends)
                  </div>
                </div>

                {/* ═══ 4. MANUAL SERIES RESULT ═══ */}
                <div style={sectionStyle}>
                  <span style={labelStyle}>4. Manual Series Result (fallback)</span>
                  <p style={{ fontSize: "0.68rem", color: "#999", marginBottom: 8 }}>
                    Directly set the BO2 score. Use when you don't have Valorant match UUIDs. Updates standings.
                  </p>
                  <select value={manualMatchId} onChange={e => setManualMatchId(e.target.value)} style={selectStyle}>
                    <option value="">Select a match...</option>
                    {matches.filter(m => m.status !== "completed").map(m => (
                      <option key={m.id} value={m.id}>
                        R{m.matchDay}-M{m.matchIndex}: {m.team1Name} vs {m.team2Name}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input value={t1Score} onChange={e => setT1Score(e.target.value)} placeholder="T1" style={{ ...inputStyle, textAlign: "center" as const }} type="number" min="0" max="2" />
                    <span style={{ display: "flex", alignItems: "center", color: "#999", fontWeight: 700 }}>vs</span>
                    <input value={t2Score} onChange={e => setT2Score(e.target.value)} placeholder="T2" style={{ ...inputStyle, textAlign: "center" as const }} type="number" min="0" max="2" />
                  </div>
                  <button disabled={loading || !manualMatchId} style={btnStyle}
                    onClick={() => apiCall("/api/valorant/match-result", {
                      tournamentId,
                      matchId: manualMatchId,
                      team1Score: parseInt(t1Score),
                      team2Score: parseInt(t2Score),
                    })}>Submit Series Result</button>
                </div>

                {/* ═══ 5. ADD/REMOVE PLAYER ═══ */}
                <div style={sectionStyle}>
                  <span style={labelStyle}>5. Add / Remove Player</span>
                  <p style={{ fontSize: "0.68rem", color: "#999", marginBottom: 8 }}>
                    Move players between teams or remove from a team entirely. Add a player to any team by UID.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <label style={smallLabel}>Team</label>
                      <select value={modTeamId} onChange={e => setModTeamId(e.target.value)} style={selectStyle}>
                        <option value="">Select team...</option>
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.teamName} ({t.members?.length || 0}p)</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={smallLabel}>Player UID</label>
                      <input value={modPlayerUid} onChange={e => setModPlayerUid(e.target.value)} placeholder="Player UID" style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <button disabled={loading || !modTeamId || !modPlayerUid} style={btnSuccess}
                      onClick={() => apiCall("/api/valorant/modify-roster", {
                        tournamentId,
                        teamId: modTeamId,
                        playerUid: modPlayerUid,
                        action: "add",
                      })}>Add to Team</button>
                    <button disabled={loading || !modTeamId || !modPlayerUid} style={btnDanger}
                      onClick={() => apiCall("/api/valorant/modify-roster", {
                        tournamentId,
                        teamId: modTeamId,
                        playerUid: modPlayerUid,
                        action: "remove",
                      })}>Remove from Team</button>
                  </div>
                  <div style={{ borderTop: "1px solid #f0efe9", paddingTop: 10, marginTop: 4 }}>
                    <label style={smallLabel}>Move Player to Another Team</label>
                    <select value={modTargetTeamId} onChange={e => setModTargetTeamId(e.target.value)} style={selectStyle}>
                      <option value="">Select target team...</option>
                      {teams.filter(t => t.id !== modTeamId).map(t => (
                        <option key={t.id} value={t.id}>{t.teamName}</option>
                      ))}
                    </select>
                    <button disabled={loading || !modTeamId || !modPlayerUid || !modTargetTeamId} style={btnWarning}
                      onClick={() => apiCall("/api/valorant/modify-roster", {
                        tournamentId,
                        teamId: modTeamId,
                        playerUid: modPlayerUid,
                        targetTeamId: modTargetTeamId,
                        action: "move",
                      })}>Move Player</button>
                  </div>
                </div>

                {/* ═══ 6. MANUAL GAME-LEVEL RESULT ═══ */}
                <div style={sectionStyle}>
                  <span style={labelStyle}>6. Manual Game-Level Result</span>
                  <p style={{ fontSize: "0.68rem", color: "#999", marginBottom: 8 }}>
                    Set individual game winners for walkovers, forfeits, or no-shows.
                  </p>
                  <select value={manualGameMatchId} onChange={e => setManualGameMatchId(e.target.value)} style={selectStyle}>
                    <option value="">Select a match...</option>
                    {matches.filter(m => m.status !== "completed").map(m => (
                      <option key={m.id} value={m.id}>
                        R{m.matchDay}-M{m.matchIndex}: {m.team1Name} vs {m.team2Name}
                      </option>
                    ))}
                  </select>
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
                  <input value={manualReason} onChange={e => setManualReason(e.target.value)} placeholder="Reason (e.g. Team 2 no-show)" style={inputStyle} />
                  <button disabled={loading || !manualGameMatchId} style={btnWarning}
                    onClick={() => apiCall("/api/valorant/manual-game-result", {
                      tournamentId,
                      matchDocId: manualGameMatchId,
                      game1Winner: manualGame1 === "none" ? null : manualGame1,
                      game2Winner: manualGame2 === "none" ? null : manualGame2,
                      reason: manualReason,
                    })}>Set Game Results</button>
                </div>

                {/* ═══ 7. BO2 FETCH — FULL WIDTH ═══ */}
                <div style={{ ...sectionStyle, gridColumn: "1 / -1" }}>
                  <span style={labelStyle}>7. BO2 Series — Fetch Match Stats (Henrik API)</span>
                  <p style={{ fontSize: "0.72rem", color: "#888", marginBottom: 12, lineHeight: 1.5 }}>
                    Enter Valorant match UUIDs. System fetches player stats, auto-detects winner, updates series + standings.
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={smallLabel}>Match</label>
                      <select value={fetchMatchDocId} onChange={e => setFetchMatchDocId(e.target.value)} style={selectStyle}>
                        <option value="">Select a match...</option>
                        {matches.filter(m => m.status !== "completed").map(m => (
                          <option key={m.id} value={m.id}>
                            R{m.matchDay}-M{m.matchIndex}: {m.team1Name} vs {m.team2Name}
                          </option>
                        ))}
                      </select>
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
                      <button disabled={loading || !game1MatchId || !fetchMatchDocId} style={{ ...btnStyle, width: "100%", marginTop: 4 }}
                        onClick={() => apiCall("/api/valorant/match-fetch", {
                          tournamentId, matchDocId: fetchMatchDocId, valorantMatchId: game1MatchId,
                          gameNumber: 1, region: fetchRegion, excludedPuuids: parsePuuids(game1ExcludedPuuids),
                        })}>Fetch Game 1</button>
                    </div>
                    <div style={{ padding: 12, background: "#F0F4FF", borderRadius: 10, border: "1px solid #c7d0ff" }}>
                      <label style={{ fontSize: "0.68rem", fontWeight: 800, color: "#3b82f6", display: "block", marginBottom: 6 }}>GAME 2 (Map 2)</label>
                      <input value={game2MatchId} onChange={e => setGame2MatchId(e.target.value)} placeholder="Valorant Match UUID" style={inputStyle} />
                      <label style={{ ...smallLabel, fontSize: "0.62rem" }}>Game 2 Sub PUUIDs</label>
                      <input value={game2ExcludedPuuids} onChange={e => setGame2ExcludedPuuids(e.target.value)} placeholder="comma separated" style={{ ...inputStyle, fontSize: "0.76rem" }} />
                      <button disabled={loading || !game2MatchId || !fetchMatchDocId} style={{ ...btnSecondary, width: "100%", marginTop: 4 }}
                        onClick={() => apiCall("/api/valorant/match-fetch", {
                          tournamentId, matchDocId: fetchMatchDocId, valorantMatchId: game2MatchId,
                          gameNumber: 2, region: fetchRegion, excludedPuuids: parsePuuids(game2ExcludedPuuids),
                        })}>Fetch Game 2</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ═══ FIXTURES OVERVIEW ═══ */}
              {matches.length > 0 && (
                <div style={{ ...sectionStyle, marginTop: 8 }}>
                  <span style={labelStyle}>Fixtures Overview</span>
                  {matchDays.map(day => (
                    <div key={day} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#ff4655", letterSpacing: "0.1em", marginBottom: 8 }}>
                        ROUND {day}
                      </div>
                      {matches.filter(m => m.matchDay === day).map(m => (
                        <div key={m.id} className="adm-match-card">
                          <div className="adm-match-day">M{m.matchIndex}</div>
                          <div className="adm-match-teams">
                            {m.team1Name || "TBD"} vs {m.team2Name || "TBD"}
                          </div>
                          <div className="adm-match-score">
                            {m.status === "completed" ? `${m.team1Score}-${m.team2Score}` : "—"}
                          </div>
                          <div className={`adm-match-status ${m.status}`}>{m.status}</div>
                          {m.scheduledTime && (
                            <div style={{ fontSize: "0.62rem", color: "#aaa" }}>
                              {new Date(m.scheduledTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* TAB 2: PLAYER REGISTRY */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === "players" && (
            <div style={sectionStyle}>
              <span style={labelStyle}>All Registered Players ({allPlayers.length})</span>
              <input
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                placeholder="Search by name, UID, discord, phone..."
                style={{ ...inputStyle, marginBottom: 16 }}
              />

              {/* Header */}
              <div className="adm-player-row adm-player-header" style={{ borderBottom: "2px solid #E5E3DF" }}>
                <div>Player</div>
                <div>UID</div>
                <div style={{ textAlign: "center" }}>Riot</div>
                <div style={{ textAlign: "center" }}>Steam</div>
                <div style={{ textAlign: "center" }}>Discord</div>
                <div style={{ textAlign: "center" }}>Phone</div>
              </div>

              {/* Rows */}
              <div style={{ maxHeight: 500, overflowY: "auto" }}>
                {filteredPlayers.map(p => (
                  <div key={p.uid} className="adm-player-row">
                    <div>
                      <div style={{ fontWeight: 700, color: "#222" }}>
                        {p.riotGameName || p.steamName || p.discordUsername || "Unknown"}
                      </div>
                      <div style={{ fontSize: "0.62rem", color: "#aaa" }}>
                        {p.riotRank || "No rank"}
                        {p.riotVerified === "verified" && <span style={{ color: "#16a34a", marginLeft: 4 }}>✓ Verified</span>}
                        {p.riotVerified === "pending" && <span style={{ color: "#f59e0b", marginLeft: 4 }}>⏳ Pending</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: "0.64rem", color: "#999", fontFamily: "monospace", wordBreak: "break-all" }}>
                      {p.uid.slice(0, 16)}...
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div className={`adm-check ${p.riotGameName ? "yes" : "no"}`}>
                        {p.riotGameName ? "✓" : "✗"}
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div className={`adm-check ${p.steamId ? "yes" : "no"}`}>
                        {p.steamId ? "✓" : "✗"}
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div className={`adm-check ${p.discordId ? "yes" : "no"}`}>
                        {p.discordId ? "✓" : "✗"}
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div className={`adm-check ${p.phone ? "yes" : "no"}`}>
                        {p.phone ? "✓" : "✗"}
                      </div>
                    </div>
                  </div>
                ))}
                {filteredPlayers.length === 0 && (
                  <div style={{ padding: 20, textAlign: "center", color: "#bbb", fontSize: "0.82rem" }}>
                    {playerSearch ? "No players match your search." : "No players registered yet."}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ ACTIVITY LOG ═══ */}
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