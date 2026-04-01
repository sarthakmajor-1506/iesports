"use client";

import { useState, useEffect, useCallback } from "react";
import Navbar from "@/app/components/Navbar";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TournamentOption { id: string; name: string; status: string; teamCount?: number; slotsBooked?: number; totalSlots?: number; }
interface TeamData { id: string; teamName: string; teamIndex: number; members: any[]; avgSkillLevel: number; }
interface MatchData { id: string; matchDay: number; matchIndex: number; team1Id: string; team2Id: string; team1Name: string; team2Name: string; team1Score: number; team2Score: number; status: string; games?: { game1?: any; game2?: any }; scheduledTime?: string; lobbyName?: string; lobbyPassword?: string; isBracket?: boolean; bracketLabel?: string; }
interface PlayerData { uid: string; riotGameName?: string; riotTagLine?: string; riotRank?: string; riotVerified?: string; steamId?: string; steamName?: string; discordId?: string; discordUsername?: string; phone?: string; registeredValorantTournaments?: string[]; }
interface AllTournamentItem { id: string; game: string; collection: string; name: string; format: string; status: string; totalSlots: number; slotsBooked: number; entryFee: number; prizePool: string; startDate: string; isTestTournament: boolean; createdAt: string; }

type AdminTab = "tournament" | "players" | "create";

// ─── Game config ──────────────────────────────────────────────────────────────
const GAME_OPTIONS = [
  { value: "valorant", label: "Valorant" },
  { value: "dota2", label: "Dota 2" },
];

const FORMAT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  valorant: [
    { value: "standard", label: "Standard" },
    { value: "auction", label: "Auction" },
  ],
  dota2: [
    { value: "standard", label: "Standard" },
    { value: "solo", label: "Solo" },
  ],
};

const STATUS_OPTIONS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

// ─── Helper: convert datetime-local value to IST ISO string ──────────────────
const toISTISOString = (val: string): string => {
  if (!val) return "";
  return `${val}:00+05:30`;
};

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

  // ─── All Players ────────────────────────────────────────────────────────────
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

  // ─── Lobby ──────────────────────────────────────────────────────────────────
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

  // ─── Bracket Generation ─────────────────────────────────────────────────────
  const [bracketTopTeams, setBracketTopTeams] = useState("4");
  const [bracketStartTime, setBracketStartTime] = useState("18:00");
  const [bracketStartDate, setBracketStartDate] = useState(new Date().toISOString().split("T")[0]);

  // ─── Tournament Creation Tab State ──────────────────────────────────────────
  const [allTournaments, setAllTournaments] = useState<AllTournamentItem[]>([]);
  const [createGame, setCreateGame] = useState("valorant");
  const [createName, setCreateName] = useState("");
  const [createId, setCreateId] = useState("");
  const [createFormat, setCreateFormat] = useState("standard");
  const [createStatus, setCreateStatus] = useState("upcoming");
  const [createTotalSlots, setCreateTotalSlots] = useState("50");
  const [createEntryFee, setCreateEntryFee] = useState("0");
  const [createPrizePool, setCreatePrizePool] = useState("TBD");
  const [createRegDeadline, setCreateRegDeadline] = useState("");
  const [createStartDate, setCreateStartDate] = useState("");
  const [createEndDate, setCreateEndDate] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createRules, setCreateRules] = useState("");
  const [createIsTest, setCreateIsTest] = useState(false);
  const [createIsDaily, setCreateIsDaily] = useState(false);

  // ─── Schedule fields ────────────────────────────────────────────────────────
  const [createRegOpens, setCreateRegOpens] = useState("");
  const [createSquadCreation, setCreateSquadCreation] = useState("");
  const [createGroupStageStart, setCreateGroupStageStart] = useState("");
  const [createGroupStageEnd, setCreateGroupStageEnd] = useState("");

  // Auction-specific
  const [createMaxTeams, setCreateMaxTeams] = useState("8");
  const [createSTierCap, setCreateSTierCap] = useState("2");
  const [createFilterGame, setCreateFilterGame] = useState("all");

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

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
  };

  const handleNameChange = (val: string) => {
    setCreateName(val);
    setCreateId(generateSlug(val));
  };

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

  // ─── Fetch teams & matches ──────────────────────────────────────────────────
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

  // ─── Fetch all players ──────────────────────────────────────────────────────
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
        if (!cancelled && data.users) setAllPlayers(data.users);
      } catch (e) { console.error("Failed to fetch players:", e); }
    };
    fetchPlayers();
    return () => { cancelled = true; };
  }, [authenticated, activeTab, adminKey]);

  // ─── Fetch all tournaments ──────────────────────────────────────────────────
  const fetchAllTournaments = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/list-tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey }),
      });
      const data = await res.json();
      if (data.tournaments) setAllTournaments(data.tournaments);
    } catch (e) { console.error("Failed to fetch all tournaments:", e); }
  }, [adminKey]);

  useEffect(() => {
    if (!authenticated || activeTab !== "create") return;
    fetchAllTournaments();
  }, [authenticated, activeTab, fetchAllTournaments]);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const pendingMatches = matches.filter(m => m.status === "pending" || m.status === "live");
  const groupMatches = matches.filter(m => !m.isBracket);
  const bracketMatches = matches.filter(m => m.isBracket);
  const matchDays = [...new Set(groupMatches.map(m => m.matchDay))].sort((a, b) => a - b);
  const bracketDays = [...new Set(bracketMatches.map(m => m.matchDay))].sort((a, b) => a - b);

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

  const filteredTournaments = allTournaments.filter(t => {
    if (createFilterGame === "all") return true;
    return t.game === createFilterGame;
  });

  // ─── Build schedule object (cleaned — only non-empty values) ────────────────
  const buildScheduleObject = () => {
    const schedule: Record<string, string> = {};

    const regOpens = toISTISOString(createRegOpens);
    const regCloses = createRegDeadline ? `${createRegDeadline}T23:00:00+05:30` : "";
    const squadCreation = toISTISOString(createSquadCreation);
    const groupStageStart = toISTISOString(createGroupStageStart);
    const groupStageEnd = toISTISOString(createGroupStageEnd);

    if (regOpens) schedule.registrationOpens = regOpens;
    if (regCloses) schedule.registrationCloses = regCloses;
    if (squadCreation) schedule.squadCreation = squadCreation;
    if (groupStageStart) schedule.groupStageStart = groupStageStart;
    if (groupStageEnd) schedule.groupStageEnd = groupStageEnd;

    return Object.keys(schedule).length > 0 ? schedule : null;
  };

  // ─── Create Tournament Handler ──────────────────────────────────────────────
  const handleCreateTournament = async () => {
    if (!createName || !createId) {
      addLog("❌ Tournament name and ID are required");
      return;
    }

    const schedule = buildScheduleObject();

    const body: any = {
      game: createGame,
      tournamentId: createId,
      name: createName,
      format: createFormat,
      status: createStatus,
      totalSlots: parseInt(createTotalSlots) || 50,
      entryFee: parseInt(createEntryFee) || 0,
      prizePool: createPrizePool || "TBD",
      registrationDeadline: createRegDeadline ? `${createRegDeadline}T23:59:00+05:30` : "",
      startDate: createStartDate ? `${createStartDate}T18:00:00+05:30` : "",
      endDate: createEndDate ? `${createEndDate}T23:00:00+05:30` : "",
      desc: createDesc,
      rules: createRules ? createRules.split("\n").filter(r => r.trim()) : [],
      isTestTournament: createIsTest,
      isDailyTournament: createIsDaily,
    };

    // Only add schedule if it has values
    if (schedule) {
      body.schedule = schedule;
    }

    // Auction-specific fields
    if (createGame === "valorant" && createFormat === "auction") {
      body.maxTeams = parseInt(createMaxTeams) || 8;
      body.sTierCapPerTeam = parseInt(createSTierCap) || 2;
      body.minBidPoints = { S: 150, A: 100, B: 60, C: 30 };
      body.captainBudgets = { S: 600, A: 750, B: 875, C: 1000 };
    }

    try {
      await apiCall("/api/admin/create-tournament", body);
      setCreateName(""); setCreateId(""); setCreateDesc(""); setCreateRules("");
      setCreateRegDeadline(""); setCreateStartDate(""); setCreateEndDate("");
      setCreateIsTest(false); setCreateIsDaily(false);
      setCreateRegOpens(""); setCreateSquadCreation("");
      setCreateGroupStageStart(""); setCreateGroupStageEnd("");
      fetchAllTournaments();
    } catch (e) { /* logged */ }
  };

  // ─── Delete Tournament Handler ──────────────────────────────────────────────
  const handleDeleteTournament = async (t: AllTournamentItem) => {
    if (!confirm(`Delete "${t.name}" (${t.game})?\n\nThis will permanently delete the tournament and ALL its data.\n\nThis cannot be undone.`)) return;
    try {
      await apiCall("/api/admin/delete-tournament", { game: t.game, tournamentId: t.id });
      fetchAllTournaments();
    } catch (e) { /* logged */ }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGIN SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (!authenticated) {
    return (
      <>
        <style>{`
          .admin-login { min-height: 100vh; background: #0a0a0b; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; }
          .admin-login-box { background: #141416; border: 1px solid #2a2a2e; border-radius: 16px; padding: 40px; max-width: 400px; width: 100%; text-align: center; }
        `}</style>
        <div className="admin-login">
          <div className="admin-login-box">
            <h1 style={{ fontSize: "1.4rem", fontWeight: 900, marginBottom: 8, color: "#f0f0f0" }}>Admin Panel</h1>
            <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: 24 }}>Enter the admin key to access tournament management.</p>
            <input type="password" placeholder="Admin Key" value={adminKey}
              onChange={e => setAdminKey(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && adminKey) setAuthenticated(true); }}
              style={{ width: "100%", padding: 12, border: "1.5px solid #2a2a2e", borderRadius: 10, fontSize: "0.95rem", marginBottom: 12, outline: "none", boxSizing: "border-box", background: "#1a1a1e", color: "#e0e0e0" }}
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
  // STYLES — DARK MODE
  // ═══════════════════════════════════════════════════════════════════════════
  const sectionStyle: React.CSSProperties = { background: "#141416", border: "1px solid #2a2a2e", borderRadius: 14, padding: "20px 24px", marginBottom: 16 };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#666", marginBottom: 14 };
  const inputStyle: React.CSSProperties = { width: "100%", padding: 10, border: "1.5px solid #2a2a2e", borderRadius: 8, fontSize: "0.88rem", outline: "none", boxSizing: "border-box" as const, marginBottom: 8, background: "#1a1a1e", color: "#e0e0e0" };
  const btnStyle: React.CSSProperties = { padding: "10px 20px", background: "#ff4655", color: "#fff", border: "none", borderRadius: 100, fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", opacity: loading ? 0.6 : 1 };
  const btnSecondary: React.CSSProperties = { ...btnStyle, background: "#e0e0e0", color: "#111" };
  const btnWarning: React.CSSProperties = { ...btnStyle, background: "#f59e0b" };
  const btnDanger: React.CSSProperties = { ...btnStyle, background: "#dc2626" };
  const btnSuccess: React.CSSProperties = { ...btnStyle, background: "#16a34a" };
  const smallLabel: React.CSSProperties = { fontSize: "0.68rem", fontWeight: 700, color: "#777", display: "block", marginBottom: 4 };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer", colorScheme: "dark" };
  const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 80, resize: "vertical" as const, fontFamily: "inherit" };
  const checkboxRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: "0.82rem", color: "#aaa" };

  const gameBadgeStyle = (game: string): React.CSSProperties => {
    const colors: Record<string, { bg: string; color: string; border: string }> = {
      valorant: { bg: "#2a1215", color: "#ff4655", border: "#5c1f28" },
      dota2: { bg: "#2a1e0d", color: "#ea580c", border: "#5c3a14" },
      cs2: { bg: "#0d1a2a", color: "#3b82f6", border: "#1e3a5f" },
    };
    const c = colors[game] || { bg: "#1a1a1e", color: "#888", border: "#333" };
    return { fontSize: "0.62rem", fontWeight: 800, padding: "2px 10px", borderRadius: 100, background: c.bg, color: c.color, border: `1px solid ${c.border}`, textTransform: "uppercase" as const, letterSpacing: "0.08em" };
  };

  return (
    <>
      <style>{`
        .adm-page { min-height: 100vh; background: #0a0a0b; font-family: var(--font-geist-sans), system-ui, sans-serif; color: #e0e0e0; }
        .adm-content { max-width: 900px; margin: 0 auto; padding: 20px 24px 60px; }
        .adm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 700px) { .adm-grid { grid-template-columns: 1fr; } }
        .adm-log { background: #000; border-radius: 10px; padding: 14px; max-height: 250px; overflow-y: auto; font-family: monospace; font-size: 0.72rem; color: #888; line-height: 1.8; }
        .adm-tab-bar { display: flex; gap: 0; border-bottom: 2px solid #2a2a2e; margin-bottom: 20px; overflow-x: auto; }
        .adm-tab { padding: 10px 24px; font-size: 0.86rem; font-weight: 700; color: #666; cursor: pointer; border-bottom: 2.5px solid transparent; margin-bottom: -2px; transition: all 0.15s; background: none; border-top: none; border-left: none; border-right: none; font-family: inherit; white-space: nowrap; }
        .adm-tab:hover { color: #aaa; }
        .adm-tab.active { color: #ff4655; border-bottom-color: #ff4655; }
        .adm-match-card { background: #1a1a1e; border: 1px solid #2a2a2e; border-radius: 10px; padding: 10px 14px; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; font-size: 0.78rem; }
        .adm-match-day { font-size: 0.6rem; font-weight: 800; letter-spacing: 0.1em; color: #555; text-transform: uppercase; }
        .adm-match-teams { flex: 1; font-weight: 600; color: #ccc; }
        .adm-match-score { font-weight: 800; font-size: 0.82rem; color: #f0f0f0; min-width: 40px; text-align: center; }
        .adm-match-status { font-size: 0.62rem; font-weight: 700; padding: 3px 10px; border-radius: 100; }
        .adm-match-status.pending { background: #2a1e0d; color: #f59e0b; border: 1px solid #5c3a14; }
        .adm-match-status.live { background: #2a1215; color: #ef4444; border: 1px solid #5c1f28; }
        .adm-match-status.completed { background: #0d2a15; color: #22c55e; border: 1px solid #1e5c2a; }
        .adm-player-row { display: grid; grid-template-columns: 2fr 1.2fr 1fr 1fr 1fr 1fr; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #1e1e22; font-size: 0.76rem; align-items: center; }
        .adm-player-row:hover { background: #1a1a1e; }
        .adm-player-header { font-weight: 800; color: #555; font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase; }
        .adm-check { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; border-radius: 4px; font-size: 10px; }
        .adm-check.yes { background: #0d2a15; color: #22c55e; }
        .adm-check.no { background: #2a1215; color: #ef4444; }
        .adm-tourney-row { display: grid; grid-template-columns: 60px 2fr 0.8fr 0.8fr 0.8fr 60px; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #1e1e22; font-size: 0.76rem; align-items: center; }
        .adm-tourney-row:hover { background: #1a1a1e; }
        .adm-tourney-header { font-weight: 800; color: #555; font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase; }
        @media (max-width: 700px) {
          .adm-player-row { grid-template-columns: 1.5fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr; font-size: 0.68rem; }
          .adm-tourney-row { grid-template-columns: 50px 1.5fr 0.7fr 0.7fr 50px; font-size: 0.68rem; }
          .adm-tourney-row > :nth-child(4) { display: none; }
        }
        .schedule-section { background: #0d2a15; border: 1.5px solid #1e5c2a; border-radius: 10px; padding: 14px 16px; margin-top: 12px; }
        .schedule-section-label { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #22c55e; display: block; margin-bottom: 10px; }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(0.8); }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.8); }
        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(0.8); }
      `}</style>
      <div className="adm-page">
        <Navbar />
        <div className="adm-content">
          <h1 style={{ fontSize: "1.4rem", fontWeight: 900, marginBottom: 4, color: "#f0f0f0" }}>Tournament Admin</h1>
          <p style={{ fontSize: "0.82rem", color: "#666", marginBottom: 20 }}>Manage your esports tournaments</p>

          {/* ═══ TAB BAR ═══ */}
          <div className="adm-tab-bar">
            <button className={`adm-tab ${activeTab === "tournament" ? "active" : ""}`} onClick={() => setActiveTab("tournament")}>Tournament Ops</button>
            <button className={`adm-tab ${activeTab === "players" ? "active" : ""}`} onClick={() => setActiveTab("players")}>Player Registry</button>
            <button className={`adm-tab ${activeTab === "create" ? "active" : ""}`} onClick={() => setActiveTab("create")}>Create Tournament</button>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* TAB 1: TOURNAMENT OPS */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === "tournament" && (
            <>
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
                    <span style={{ fontSize: "0.72rem", color: "#aaa", background: "#1a1a1e", padding: "4px 12px", borderRadius: 100, border: "1px solid #2a2a2e" }}>
                      {teams.length} teams
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "#aaa", background: "#1a1a1e", padding: "4px 12px", borderRadius: 100, border: "1px solid #2a2a2e" }}>
                      {matches.length} matches ({pendingMatches.length} pending)
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "#aaa", background: "#1a1a1e", padding: "4px 12px", borderRadius: 100, border: "1px solid #2a2a2e" }}>
                      {matchDays.length} group round(s) · {bracketDays.length} bracket round(s)
                    </span>
                  </div>
                )}
              </div>

              <div className="adm-grid">
                {/* ═══ 1. SHUFFLE TEAMS ═══ */}
                <div style={sectionStyle}>
                  <span style={labelStyle}>1. Shuffle Teams</span>
                  <p style={{ fontSize: "0.68rem", color: "#666", marginBottom: 8 }}>
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
                      <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#555", letterSpacing: "0.1em" }}>CURRENT TEAMS</span>
                      {teams.map(t => (
                        <div key={t.id} style={{ fontSize: "0.72rem", padding: "4px 0", color: "#aaa" }}>
                          {t.teamName} — {t.members?.length || 0} players (avg {t.avgSkillLevel})
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ═══ 2. GENERATE ALL SWISS PAIRINGS ═══ */}
                <div style={sectionStyle}>
                  <span style={labelStyle}>2. Generate Swiss Pairings (All Rounds)</span>
                  <p style={{ fontSize: "0.68rem", color: "#666", marginBottom: 8 }}>
                    Creates all rounds at once. Round 1 = random. Rounds 2+ = "TBD" placeholders that auto-fill as results come in.
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
                    await apiCall("/api/valorant/generate-all-pairings", { tournamentId, totalRounds: parseInt(totalRounds), startTime, startDate });
                  }}>Generate All Fixtures</button>
                </div>

                {/* ═══ 3. SET LOBBY & NOTIFY ═══ */}
                <div style={sectionStyle}>
                  <span style={labelStyle}>3. Set Lobby & Notify Discord</span>
                  <p style={{ fontSize: "0.68rem", color: "#666", marginBottom: 8 }}>
                    Select a match and game. Setting lobby sends a Discord notification pinging all players.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
                    <div>
                      <label style={smallLabel}>Match</label>
                      <select value={selectedMatchForLobby} onChange={e => setSelectedMatchForLobby(e.target.value)} style={selectStyle}>
                        <option value="">Select a match...</option>
                        {pendingMatches.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.isBracket ? `[B] ` : ""}R{m.matchDay}-M{m.matchIndex}: {m.team1Name} vs {m.team2Name}
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
                        tournamentId, matchId: selectedMatchForLobby, gameNumber: parseInt(selectedGameForLobby),
                        action: "set-lobby", lobbyName, lobbyPassword, notifyDiscord: true,
                      })}>Set Lobby & Notify</button>
                    <button disabled={loading || !selectedMatchForLobby} style={btnSecondary}
                      onClick={() => apiCall("/api/valorant/match-update", {
                        tournamentId, matchId: selectedMatchForLobby, action: "start",
                      })}>Start Match</button>
                    <button disabled={loading || !selectedMatchForLobby} style={{ ...btnStyle, background: "#52525b", fontSize: "0.72rem", padding: "8px 14px" }}
                      onClick={() => apiCall("/api/valorant/match-update", {
                        tournamentId, matchId: selectedMatchForLobby, action: "cleanup-vcs",
                      })}>🗑️ Cleanup VCs</button>
                  </div>
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "#1a1a1e", borderRadius: 8, fontSize: "0.62rem", color: "#666", lineHeight: 1.6, border: "1px solid #2a2a2e" }}>
                    <strong style={{ color: "#888" }}>Set Lobby</strong> → Creates waiting room VC + pings all players on Discord<br/>
                    <strong style={{ color: "#888" }}>Start Match</strong> → Creates 2 team VCs, moves players, deletes waiting room<br/>
                    <strong style={{ color: "#888" }}>Cleanup VCs</strong> → Deletes all VCs for this match
                  </div>
                </div>

                {/* ═══ 4. MANUAL SERIES RESULT ═══ */}
                <div style={sectionStyle}>
                  <span style={labelStyle}>4. Manual Series Result (fallback)</span>
                  <p style={{ fontSize: "0.68rem", color: "#666", marginBottom: 8 }}>
                    Directly set the BO2 score. Use when you don't have Valorant match UUIDs.
                  </p>
                  <select value={manualMatchId} onChange={e => setManualMatchId(e.target.value)} style={selectStyle}>
                    <option value="">Select a match...</option>
                    {matches.filter(m => m.status !== "completed").map(m => (
                      <option key={m.id} value={m.id}>
                        {m.isBracket ? `[B] ` : ""}R{m.matchDay}-M{m.matchIndex}: {m.team1Name} vs {m.team2Name}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input value={t1Score} onChange={e => setT1Score(e.target.value)} placeholder="T1" style={{ ...inputStyle, textAlign: "center" as const }} type="number" min="0" max="2" />
                    <span style={{ display: "flex", alignItems: "center", color: "#555", fontWeight: 700 }}>vs</span>
                    <input value={t2Score} onChange={e => setT2Score(e.target.value)} placeholder="T2" style={{ ...inputStyle, textAlign: "center" as const }} type="number" min="0" max="2" />
                  </div>
                  <button disabled={loading || !manualMatchId} style={btnStyle}
                    onClick={() => apiCall("/api/valorant/match-result", {
                      tournamentId, matchId: manualMatchId, team1Score: parseInt(t1Score), team2Score: parseInt(t2Score),
                    })}>Submit Series Result</button>
                </div>

                {/* ═══ 5. ADD/REMOVE PLAYER ═══ */}
                <div style={sectionStyle}>
                  <span style={labelStyle}>5. Add / Remove Player</span>
                  <p style={{ fontSize: "0.68rem", color: "#666", marginBottom: 8 }}>
                    Move players between teams or remove from a team entirely.
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
                        tournamentId, teamId: modTeamId, playerUid: modPlayerUid, action: "add",
                      })}>Add to Team</button>
                    <button disabled={loading || !modTeamId || !modPlayerUid} style={btnDanger}
                      onClick={() => apiCall("/api/valorant/modify-roster", {
                        tournamentId, teamId: modTeamId, playerUid: modPlayerUid, action: "remove",
                      })}>Remove from Team</button>
                  </div>
                  <div style={{ borderTop: "1px solid #2a2a2e", paddingTop: 10, marginTop: 4 }}>
                    <label style={smallLabel}>Move Player to Another Team</label>
                    <select value={modTargetTeamId} onChange={e => setModTargetTeamId(e.target.value)} style={selectStyle}>
                      <option value="">Select target team...</option>
                      {teams.filter(t => t.id !== modTeamId).map(t => (
                        <option key={t.id} value={t.id}>{t.teamName}</option>
                      ))}
                    </select>
                    <button disabled={loading || !modTeamId || !modPlayerUid || !modTargetTeamId} style={btnWarning}
                      onClick={() => apiCall("/api/valorant/modify-roster", {
                        tournamentId, teamId: modTeamId, playerUid: modPlayerUid, targetTeamId: modTargetTeamId, action: "move",
                      })}>Move Player</button>
                  </div>
                </div>

                {/* ═══ 6. MANUAL GAME-LEVEL RESULT ═══ */}
                <div style={sectionStyle}>
                  <span style={labelStyle}>6. Manual Game-Level Result</span>
                  <p style={{ fontSize: "0.68rem", color: "#666", marginBottom: 8 }}>
                    Set individual game winners for walkovers, forfeits, or no-shows.
                  </p>
                  <select value={manualGameMatchId} onChange={e => setManualGameMatchId(e.target.value)} style={selectStyle}>
                    <option value="">Select a match...</option>
                    {matches.filter(m => m.status !== "completed").map(m => (
                      <option key={m.id} value={m.id}>
                        {m.isBracket ? `[B] ` : ""}R{m.matchDay}-M{m.matchIndex}: {m.team1Name} vs {m.team2Name}
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
                      tournamentId, matchDocId: manualGameMatchId,
                      game1Winner: manualGame1 === "none" ? null : manualGame1,
                      game2Winner: manualGame2 === "none" ? null : manualGame2,
                      reason: manualReason,
                    })}>Set Game Results</button>
                </div>

                {/* ═══ 7. BO2 FETCH — FULL WIDTH ═══ */}
                <div style={{ ...sectionStyle, gridColumn: "1 / -1" }}>
                  <span style={labelStyle}>7. BO2 Series — Fetch Match Stats (Henrik API)</span>
                  <p style={{ fontSize: "0.72rem", color: "#777", marginBottom: 12, lineHeight: 1.5 }}>
                    Enter Valorant match UUIDs. System fetches player stats, auto-detects winner, updates series + standings.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={smallLabel}>Match</label>
                      <select value={fetchMatchDocId} onChange={e => setFetchMatchDocId(e.target.value)} style={selectStyle}>
                        <option value="">Select a match...</option>
                        {matches.filter(m => m.status !== "completed").map(m => (
                          <option key={m.id} value={m.id}>
                            {m.isBracket ? `[B] ` : ""}R{m.matchDay}-M{m.matchIndex}: {m.team1Name} vs {m.team2Name}
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
                    <div style={{ padding: 12, background: "#2a1215", borderRadius: 10, border: "1px solid #5c1f28" }}>
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
                    <div style={{ padding: 12, background: "#0d1a2a", borderRadius: 10, border: "1px solid #1e3a5f" }}>
                      <label style={{ fontSize: "0.68rem", fontWeight: 800, color: "#60a5fa", display: "block", marginBottom: 6 }}>GAME 2 (Map 2)</label>
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

                {/* ═══ 8. GENERATE BRACKETS — FULL WIDTH ═══ */}
                <div style={{ ...sectionStyle, gridColumn: "1 / -1", border: "1.5px solid #5c3a14", background: "#1a1508" }}>
                  <span style={{ ...labelStyle, color: "#f59e0b" }}>8. Generate Elimination Brackets (Post Group Stage)</span>
                  <p style={{ fontSize: "0.72rem", color: "#777", marginBottom: 12, lineHeight: 1.5 }}>
                    After all group stage rounds are complete, generate a single-elimination bracket from the top teams.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={smallLabel}>Teams to Advance</label>
                      <select value={bracketTopTeams} onChange={e => setBracketTopTeams(e.target.value)} style={selectStyle}>
                        <option value="2">Top 2 (Final only)</option>
                        <option value="4">Top 4 (Semis + Final)</option>
                        <option value="8">Top 8 (Quarters + Semis + Final)</option>
                      </select>
                    </div>
                    <div>
                      <label style={smallLabel}>Bracket Start Date</label>
                      <input value={bracketStartDate} onChange={e => setBracketStartDate(e.target.value)} style={inputStyle} type="date" />
                    </div>
                    <div>
                      <label style={smallLabel}>Start Time (IST)</label>
                      <input value={bracketStartTime} onChange={e => setBracketStartTime(e.target.value)} style={inputStyle} type="time" />
                    </div>
                  </div>
                  <button disabled={loading} style={{ ...btnWarning, marginTop: 8 }}
                    onClick={async () => {
                      if (!confirm(`Generate elimination bracket for top ${bracketTopTeams} teams?`)) return;
                      await apiCall("/api/valorant/generate-brackets", {
                        tournamentId, topTeams: parseInt(bracketTopTeams), startTime: bracketStartTime, startDate: bracketStartDate,
                      });
                    }}>Generate Brackets</button>
                </div>
              </div>

              {/* ═══ FIXTURES OVERVIEW ═══ */}
              {groupMatches.length > 0 && (
                <div style={{ ...sectionStyle, marginTop: 8 }}>
                  <span style={labelStyle}>Group Stage Fixtures</span>
                  {matchDays.map(day => (
                    <div key={day} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#ff4655", letterSpacing: "0.1em", marginBottom: 8 }}>
                        ROUND {day}
                      </div>
                      {groupMatches.filter(m => m.matchDay === day).map(m => (
                        <div key={m.id} className="adm-match-card">
                          <div className="adm-match-day">M{m.matchIndex}</div>
                          <div className="adm-match-teams">{m.team1Name || "TBD"} vs {m.team2Name || "TBD"}</div>
                          <div className="adm-match-score">{m.status === "completed" ? `${m.team1Score}-${m.team2Score}` : "—"}</div>
                          <div className={`adm-match-status ${m.status}`}>{m.status}</div>
                          {m.scheduledTime && (
                            <div style={{ fontSize: "0.62rem", color: "#555" }}>
                              {new Date(m.scheduledTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {bracketMatches.length > 0 && (
                <div style={{ ...sectionStyle, marginTop: 8, borderColor: "#5c3a14" }}>
                  <span style={{ ...labelStyle, color: "#f59e0b" }}>Bracket Fixtures</span>
                  {bracketDays.map(day => (
                    <div key={day} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#f59e0b", letterSpacing: "0.1em", marginBottom: 8 }}>
                        BRACKET ROUND {day - Math.max(...matchDays, 0)}
                      </div>
                      {bracketMatches.filter(m => m.matchDay === day).map(m => (
                        <div key={m.id} className="adm-match-card" style={{ borderColor: "#5c3a14" }}>
                          <div className="adm-match-day" style={{ color: "#f59e0b" }}>{m.bracketLabel || `M${m.matchIndex}`}</div>
                          <div className="adm-match-teams">{m.team1Name || "TBD"} vs {m.team2Name || "TBD"}</div>
                          <div className="adm-match-score">{m.status === "completed" ? `${m.team1Score}-${m.team2Score}` : "—"}</div>
                          <div className={`adm-match-status ${m.status}`}>{m.status}</div>
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
              <input value={playerSearch} onChange={e => setPlayerSearch(e.target.value)}
                placeholder="Search by name, UID, discord, phone..." style={{ ...inputStyle, marginBottom: 16 }} />
              <div className="adm-player-row adm-player-header" style={{ borderBottom: "2px solid #2a2a2e" }}>
                <div>Player</div><div>UID</div><div style={{ textAlign: "center" }}>Riot</div>
                <div style={{ textAlign: "center" }}>Steam</div><div style={{ textAlign: "center" }}>Discord</div>
                <div style={{ textAlign: "center" }}>Phone</div>
              </div>
              <div style={{ maxHeight: 500, overflowY: "auto" }}>
                {filteredPlayers.map(p => (
                  <div key={p.uid} className="adm-player-row">
                    <div>
                      <div style={{ fontWeight: 700, color: "#e0e0e0" }}>
                        {p.riotGameName || p.steamName || p.discordUsername || "Unknown"}
                      </div>
                      <div style={{ fontSize: "0.62rem", color: "#555" }}>
                        {p.riotRank || "No rank"}
                        {p.riotVerified === "verified" && <span style={{ color: "#22c55e", marginLeft: 4 }}>✓ Verified</span>}
                        {p.riotVerified === "pending" && <span style={{ color: "#f59e0b", marginLeft: 4 }}>⏳ Pending</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: "0.64rem", color: "#666", fontFamily: "monospace", wordBreak: "break-all" }}>
                      {p.uid}
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div className={`adm-check ${p.riotGameName ? "yes" : "no"}`}>{p.riotGameName ? "✓" : "✗"}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div className={`adm-check ${p.steamId ? "yes" : "no"}`}>{p.steamId ? "✓" : "✗"}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div className={`adm-check ${p.discordId ? "yes" : "no"}`}>{p.discordId ? "✓" : "✗"}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div className={`adm-check ${p.phone ? "yes" : "no"}`}>{p.phone ? "✓" : "✗"}</div>
                    </div>
                  </div>
                ))}
                {filteredPlayers.length === 0 && (
                  <div style={{ padding: 20, textAlign: "center", color: "#555", fontSize: "0.82rem" }}>
                    {playerSearch ? "No players match your search." : "No players registered yet."}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* TAB 3: CREATE TOURNAMENT */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === "create" && (
            <>
              <div style={sectionStyle}>
                <span style={labelStyle}>Create New Tournament</span>
                <p style={{ fontSize: "0.72rem", color: "#777", marginBottom: 16, lineHeight: 1.5 }}>
                  Create a tournament for any supported game. The tournament will be written to the correct Firestore collection automatically.
                </p>

                <div className="adm-grid">
                  <div>
                    <label style={smallLabel}>Game</label>
                    <select value={createGame} onChange={e => { setCreateGame(e.target.value); setCreateFormat("standard"); }} style={selectStyle}>
                      {GAME_OPTIONS.map(g => (<option key={g.value} value={g.value}>{g.label}</option>))}
                    </select>

                    <label style={smallLabel}>Tournament Name</label>
                    <input value={createName} onChange={e => handleNameChange(e.target.value)} placeholder="e.g. Valorant Auction Cup — April 2026" style={inputStyle} />

                    <label style={smallLabel}>Tournament ID (slug)</label>
                    <input value={createId} onChange={e => setCreateId(e.target.value)} placeholder="auto-generated from name" style={{ ...inputStyle, fontFamily: "monospace", fontSize: "0.82rem" }} />

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <label style={smallLabel}>Format</label>
                        <select value={createFormat} onChange={e => setCreateFormat(e.target.value)} style={selectStyle}>
                          {(FORMAT_OPTIONS[createGame] || [{ value: "standard", label: "Standard" }]).map(f => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={smallLabel}>Status</label>
                        <select value={createStatus} onChange={e => setCreateStatus(e.target.value)} style={selectStyle}>
                          {STATUS_OPTIONS.map(s => (<option key={s.value} value={s.value}>{s.label}</option>))}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <div>
                        <label style={smallLabel}>Total Slots</label>
                        <input value={createTotalSlots} onChange={e => setCreateTotalSlots(e.target.value)} style={inputStyle} type="number" min="2" />
                      </div>
                      <div>
                        <label style={smallLabel}>Entry Fee (₹)</label>
                        <input value={createEntryFee} onChange={e => setCreateEntryFee(e.target.value)} style={inputStyle} type="number" min="0" />
                      </div>
                      <div>
                        <label style={smallLabel}>Prize Pool</label>
                        <input value={createPrizePool} onChange={e => setCreatePrizePool(e.target.value)} placeholder="TBD" style={inputStyle} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label style={smallLabel}>Registration Deadline</label>
                    <input value={createRegDeadline} onChange={e => setCreateRegDeadline(e.target.value)} style={inputStyle} type="date" />

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <label style={smallLabel}>Start Date</label>
                        <input value={createStartDate} onChange={e => setCreateStartDate(e.target.value)} style={inputStyle} type="date" />
                      </div>
                      <div>
                        <label style={smallLabel}>End Date</label>
                        <input value={createEndDate} onChange={e => setCreateEndDate(e.target.value)} style={inputStyle} type="date" />
                      </div>
                    </div>

                    <label style={smallLabel}>Description</label>
                    <textarea value={createDesc} onChange={e => setCreateDesc(e.target.value)} placeholder="Short description of the tournament..." style={textareaStyle} />

                    <label style={smallLabel}>Rules (one per line)</label>
                    <textarea value={createRules} onChange={e => setCreateRules(e.target.value)} placeholder={"All players must have verified Riot ID\nEach team must have 5 starters\n..."} style={textareaStyle} />

                    <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                      <label style={checkboxRow}>
                        <input type="checkbox" checked={createIsTest} onChange={e => setCreateIsTest(e.target.checked)} />
                        Test tournament (hidden from users)
                      </label>
                      <label style={checkboxRow}>
                        <input type="checkbox" checked={createIsDaily} onChange={e => setCreateIsDaily(e.target.checked)} />
                        Daily tournament
                      </label>
                    </div>
                  </div>
                </div>

                {/* ── Schedule Section ── */}
                <div className="schedule-section">
                  <span className="schedule-section-label">📅 Schedule (all times IST)</span>
                  <p style={{ fontSize: "0.68rem", color: "#8ab896", marginBottom: 12, lineHeight: 1.5 }}>
                    These timestamps populate the <code style={{ background: "#1e5c2a", padding: "1px 5px", borderRadius: 4, fontSize: "0.65rem", color: "#bbf7d0" }}>schedule</code> object in Firestore, used to display timeline info to players.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <label style={{ ...smallLabel, color: "#22c55e" }}>Registration Opens</label>
                      <input value={createRegOpens} onChange={e => setCreateRegOpens(e.target.value)} style={inputStyle} type="datetime-local" />
                    </div>
                    <div>
                      <label style={{ ...smallLabel, color: "#22c55e" }}>
                        Registration Closes
                        <span style={{ fontWeight: 400, color: "#555", marginLeft: 4 }}>(auto from Reg Deadline above)</span>
                      </label>
                      <input value={createRegDeadline ? `${createRegDeadline}T23:00` : ""} readOnly
                        style={{ ...inputStyle, background: "#111", color: "#555", cursor: "not-allowed" }} type="datetime-local" />
                    </div>
                    <div>
                      <label style={{ ...smallLabel, color: "#22c55e" }}>Squad Creation</label>
                      <input value={createSquadCreation} onChange={e => setCreateSquadCreation(e.target.value)} style={inputStyle} type="datetime-local" />
                    </div>
                    <div>{/* Spacer */}</div>
                    <div>
                      <label style={{ ...smallLabel, color: "#22c55e" }}>Group Stage Start</label>
                      <input value={createGroupStageStart} onChange={e => setCreateGroupStageStart(e.target.value)} style={inputStyle} type="datetime-local" />
                    </div>
                    <div>
                      <label style={{ ...smallLabel, color: "#22c55e" }}>Group Stage End</label>
                      <input value={createGroupStageEnd} onChange={e => setCreateGroupStageEnd(e.target.value)} style={inputStyle} type="datetime-local" />
                    </div>
                  </div>

                  {/* Preview */}
                  {(createRegOpens || createSquadCreation || createGroupStageStart || createGroupStageEnd) && (
                    <div style={{ marginTop: 10, padding: "10px 12px", background: "#000", borderRadius: 8, fontFamily: "monospace", fontSize: "0.65rem", color: "#888", lineHeight: 2 }}>
                      <span style={{ color: "#4ade80", display: "block", marginBottom: 4 }}>// Firestore preview</span>
                      <span style={{ color: "#86efac" }}>schedule</span>: {"{"}<br />
                      &nbsp;&nbsp;<span style={{ color: "#fde68a" }}>registrationOpens</span>: <span style={{ color: "#6ee7b7" }}>"{toISTISOString(createRegOpens) || "—"}"</span>,<br />
                      &nbsp;&nbsp;<span style={{ color: "#fde68a" }}>registrationCloses</span>: <span style={{ color: "#6ee7b7" }}>"{createRegDeadline ? `${createRegDeadline}T23:00:00+05:30` : "—"}"</span>,<br />
                      &nbsp;&nbsp;<span style={{ color: "#fde68a" }}>squadCreation</span>: <span style={{ color: "#6ee7b7" }}>"{toISTISOString(createSquadCreation) || "—"}"</span>,<br />
                      &nbsp;&nbsp;<span style={{ color: "#fde68a" }}>groupStageStart</span>: <span style={{ color: "#6ee7b7" }}>"{toISTISOString(createGroupStageStart) || "—"}"</span>,<br />
                      &nbsp;&nbsp;<span style={{ color: "#fde68a" }}>groupStageEnd</span>: <span style={{ color: "#6ee7b7" }}>"{toISTISOString(createGroupStageEnd) || "—"}"</span><br />
                      {"}"}
                    </div>
                  )}
                </div>

                {/* ── Auction-specific fields ── */}
                {createGame === "valorant" && createFormat === "auction" && (
                  <div style={{ marginTop: 12, padding: 16, background: "#2a1215", borderRadius: 10, border: "1px solid #5c1f28" }}>
                    <span style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#ff4655", display: "block", marginBottom: 10 }}>Auction Settings</span>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <label style={smallLabel}>Max Teams</label>
                        <input value={createMaxTeams} onChange={e => setCreateMaxTeams(e.target.value)} style={inputStyle} type="number" min="2" max="16" />
                      </div>
                      <div>
                        <label style={smallLabel}>S-Tier Cap Per Team</label>
                        <input value={createSTierCap} onChange={e => setCreateSTierCap(e.target.value)} style={inputStyle} type="number" min="0" max="5" />
                      </div>
                    </div>
                    <p style={{ fontSize: "0.62rem", color: "#666", marginTop: 4, lineHeight: 1.5 }}>
                      Default bid points: S=150, A=100, B=60, C=30 · Captain budgets: S=600, A=750, B=875, C=1000
                    </p>
                  </div>
                )}

                <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
                  <button disabled={loading || !createName || !createId} style={btnSuccess} onClick={handleCreateTournament}>
                    Create Tournament
                  </button>
                  <button style={{ ...btnSecondary, background: "#52525b", color: "#e0e0e0" }} onClick={() => {
                    setCreateName(""); setCreateId(""); setCreateDesc(""); setCreateRules("");
                    setCreateRegDeadline(""); setCreateStartDate(""); setCreateEndDate("");
                    setCreateIsTest(false); setCreateIsDaily(false);
                    setCreateRegOpens(""); setCreateSquadCreation("");
                    setCreateGroupStageStart(""); setCreateGroupStageEnd("");
                  }}>Clear Form</button>
                </div>
              </div>

              {/* ── Existing Tournaments List ── */}
              <div style={sectionStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>All Tournaments ({filteredTournaments.length})</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select value={createFilterGame} onChange={e => setCreateFilterGame(e.target.value)}
                      style={{ ...selectStyle, width: "auto", marginBottom: 0, fontSize: "0.72rem", padding: "6px 12px" }}>
                      <option value="all">All Games</option>
                      {GAME_OPTIONS.map(g => (<option key={g.value} value={g.value}>{g.label}</option>))}
                    </select>
                    <button style={{ ...btnSecondary, fontSize: "0.72rem", padding: "6px 14px", background: "#52525b", color: "#e0e0e0" }}
                      onClick={fetchAllTournaments} disabled={loading}>Refresh</button>
                  </div>
                </div>

                <div className="adm-tourney-row adm-tourney-header" style={{ borderBottom: "2px solid #2a2a2e" }}>
                  <div>Game</div><div>Name</div><div>Status</div><div>Slots</div><div>Format</div><div></div>
                </div>

                <div style={{ maxHeight: 400, overflowY: "auto" }}>
                  {filteredTournaments.map(t => (
                    <div key={`${t.game}-${t.id}`} className="adm-tourney-row">
                      <div><span style={gameBadgeStyle(t.game)}>{t.game}</span></div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#e0e0e0", fontSize: "0.78rem" }}>
                          {t.name}
                          {t.isTestTournament && (
                            <span style={{ marginLeft: 6, fontSize: "0.58rem", color: "#f59e0b", fontWeight: 800, background: "#2a1e0d", padding: "1px 6px", borderRadius: 4, border: "1px solid #5c3a14" }}>TEST</span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.62rem", color: "#555", fontFamily: "monospace" }}>{t.id}</div>
                      </div>
                      <div><span className={`adm-match-status ${t.status}`}>{t.status}</span></div>
                      <div style={{ fontSize: "0.78rem", color: "#aaa" }}>{t.slotsBooked}/{t.totalSlots}</div>
                      <div style={{ fontSize: "0.72rem", color: "#777", textTransform: "capitalize" }}>{t.format}</div>
                      <div>
                        <button
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.88rem", padding: 4, opacity: loading ? 0.4 : 1 }}
                          title="Delete tournament" disabled={loading}
                          onClick={() => handleDeleteTournament(t)}>🗑️</button>
                      </div>
                    </div>
                  ))}
                  {filteredTournaments.length === 0 && (
                    <div style={{ padding: 24, textAlign: "center", color: "#555", fontSize: "0.82rem" }}>
                      No tournaments found. Create one above.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ═══ ACTIVITY LOG ═══ */}
          <div style={{ ...sectionStyle, marginTop: 8 }}>
            <span style={labelStyle}>Activity Log</span>
            <div className="adm-log">
              {log.length === 0 ? (
                <span style={{ color: "#444" }}>No actions yet. Use the controls above.</span>
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