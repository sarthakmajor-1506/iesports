"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Navbar from "@/app/components/Navbar";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy, getDocs, getDoc, doc } from "firebase/firestore";


// ─── Types ────────────────────────────────────────────────────────────────────
interface TournamentOption { id: string; name: string; status: string; teamCount?: number; slotsBooked?: number; totalSlots?: number; matchesPerRound?: number; bracketBestOf?: number; grandFinalBestOf?: number; lbFinalBestOf?: number; bracketFormat?: string; bracketTeamCount?: number; groupStageRounds?: number; }
interface TeamData { id: string; teamName: string; teamIndex: number; members: any[]; avgSkillLevel: number; }
interface MatchData { id: string; matchDay: number; matchIndex: number; team1Id: string; team2Id: string; team1Name: string; team2Name: string; team1Score: number; team2Score: number; status: string; games?: Record<string, any>; scheduledTime?: string; lobbyName?: string; lobbyPassword?: string; isBracket?: boolean; bracketLabel?: string; bracketType?: string; }
interface PlayerData { uid: string; riotGameName?: string; riotTagLine?: string; riotRank?: string; riotVerified?: string; riotScreenshotUrl?: string; steamId?: string; steamName?: string; discordId?: string; discordUsername?: string; phone?: string; registeredValorantTournaments?: string[]; }
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
    { value: "shuffle", label: "Shuffle" },
    { value: "auction", label: "Auction" },
  ],
  dota2: [
    { value: "standard", label: "Standard" },
    { value: "shuffle", label: "Shuffle" },
    { value: "auction", label: "Auction" },
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
  const [riotFilter, setRiotFilter] = useState<"all" | "pending" | "verified" | "rejected">("all");
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [verifyingUid, setVerifyingUid] = useState<string | null>(null);

  // ─── Log ────────────────────────────────────────────────────────────────────
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // ─── Shuffle ────────────────────────────────────────────────────────────────
  const [teamCount, setTeamCount] = useState("2");

  // ─── Registered Players (pre-shuffle) ──────────────────────────────────────
  const [regPlayers, setRegPlayers] = useState<any[]>([]);
  const [regPlayersLoading, setRegPlayersLoading] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [savingPlayer, setSavingPlayer] = useState<string | null>(null);
  const [playerSortBy, setPlayerSortBy] = useState<"rank" | "name" | "skill">("rank");

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
  const [manualGameWinners, setManualGameWinners] = useState<string[]>(["none", "none"]);
  const [manualReason, setManualReason] = useState("");

  // ─── Match Fetch (dynamic BO) ──────────────────────────────────────────────
  const [fetchMatchDocId, setFetchMatchDocId] = useState("");
  const [gameMatchIds, setGameMatchIds] = useState<string[]>(["", ""]);
  const [fetchRegion, setFetchRegion] = useState("ap");
  const [gameExcludedPuuids, setGameExcludedPuuids] = useState<string[]>(["", ""]);

  // ─── Delete Game Data ───────────────────────────────────────────────────────
  const [deleteGameMatchId, setDeleteGameMatchId] = useState("");
  const [deleteGameNumber, setDeleteGameNumber] = useState("1");

  // ─── Add/Remove Player ─────────────────────────────────────────────────────
  const [modTeamId, setModTeamId] = useState("");
  const [modPlayerUid, setModPlayerUid] = useState("");
  const [modTargetTeamId, setModTargetTeamId] = useState("");

  // ─── Bracket Generation ─────────────────────────────────────────────────────
  const [bracketTopTeams, setBracketTopTeams] = useState("4");
  const [bracketStartTime, setBracketStartTime] = useState("18:00");
  const [bracketStartDate, setBracketStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [standingsNotComplete, setStandingsNotComplete] = useState(false);

  // ─── Match Time Editing ─────────────────────────────────────────────────────
  const [editingMatchTime, setEditingMatchTime] = useState<string | null>(null);
  const [editMatchTimeVal, setEditMatchTimeVal] = useState("");

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

  // ─── Tournament Design / Structure fields ───────────────────────────────────
  const [createGroupRounds, setCreateGroupRounds] = useState("3");
  const [createMatchesPerRound, setCreateMatchesPerRound] = useState("2");
  const [createBracketFormat, setCreateBracketFormat] = useState("double_elimination");
  const [createBracketBestOf, setCreateBracketBestOf] = useState("2");
  const [createGrandFinalBestOf, setCreateGrandFinalBestOf] = useState("3");
  const [createLbFinalBestOf, setCreateLbFinalBestOf] = useState("");
  const [createEliminationBestOf, setCreateEliminationBestOf] = useState("2");
  const [createBracketTeamCount, setCreateBracketTeamCount] = useState("");
  const [createBannerImage, setCreateBannerImage] = useState("");
  const [createTagline, setCreateTagline] = useState("");
  const [createHighlightText, setCreateHighlightText] = useState("");
  const [createTourneyStageStart, setCreateTourneyStageStart] = useState("");
  const [createTourneyStageEnd, setCreateTourneyStageEnd] = useState("");

  // ─── Tournament Structure fields (teams / players) ──────────────────────────
  const [createTotalTeams, setCreateTotalTeams] = useState("8");
  const [createPlayersPerTeam, setCreatePlayersPerTeam] = useState("5");
  const [createUpperBracketTeams, setCreateUpperBracketTeams] = useState("4");
  const [createLowerBracketTeams, setCreateLowerBracketTeams] = useState("4");

  // ─── Share image background fields ──────────────────────────────────────────
  const [shareDefaultBg, setShareDefaultBg] = useState("");
  const [shareOverviewBg, setShareOverviewBg] = useState("");
  const [shareRegisterBg, setShareRegisterBg] = useState("");
  const [shareTeamsBg, setShareTeamsBg] = useState("");
  const [shareScheduleBg, setShareScheduleBg] = useState("");
  const [shareFormatBg, setShareFormatBg] = useState("");
  const [shareBgUploading, setShareBgUploading] = useState<Record<string, boolean>>({});

  // ─── Collapsible section state ───────────────────────────────────────────────
  const [showDesignSection, setShowDesignSection] = useState(false);
  const [showShareSection, setShowShareSection] = useState(false);
  const [showStructureSection, setShowStructureSection] = useState(false);
  const [createFilterGame, setCreateFilterGame] = useState("all");

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  const parsePuuids = (str: string) => str ? str.split(",").map(s => s.trim()).filter(Boolean) : [];

  // ── Helper: get BO for a specific match based on tournament settings ──
  const getMatchBo = (match?: MatchData | null): number => {
    const t = tournaments.find(t => t.id === tournamentId) as any;
    if (!match || !t) return 2;
    if (match.bracketType === "grand_final") return t.grandFinalBestOf || 3;
    if (match.id === "lb-final" && t.lbFinalBestOf) return t.lbFinalBestOf;
    if (match.isBracket) return t.bracketBestOf || 2;
    return t.matchesPerRound || 2;
  };

  // ── Resize game arrays when match selection or BO changes ──
  const resizeGameArrays = (bo: number) => {
    setGameMatchIds(prev => {
      const arr = [...prev];
      while (arr.length < bo) arr.push("");
      return arr.slice(0, bo);
    });
    setGameExcludedPuuids(prev => {
      const arr = [...prev];
      while (arr.length < bo) arr.push("");
      return arr.slice(0, bo);
    });
  };

  const resizeManualGameArrays = (bo: number) => {
    setManualGameWinners(prev => {
      const arr = [...prev];
      while (arr.length < bo) arr.push("none");
      return arr.slice(0, bo);
    });
  };

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

  // ─── Fetch registered players for selected tournament ─────────────────────
  const fetchRegPlayers = useCallback(async () => {
    if (!tournamentId) return;
    setRegPlayersLoading(true);
    try {
      const col = getSelectedCollection();
      const subCol = col === "tournaments" ? "players" : "soloPlayers";
      const snap = await getDocs(collection(db, col, tournamentId, subCol));
      const players = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Batch-fetch user docs for full details
      const enriched = await Promise.all(players.map(async (p: any) => {
        try {
          const uSnap = await getDoc(doc(db, "users", p.uid || p.id));
          const u = uSnap.data() || {};
          return { ...p, _user: u };
        } catch { return { ...p, _user: {} }; }
      }));

      enriched.sort((a: any, b: any) => (b.riotTier || b._user?.riotTier || 0) - (a.riotTier || a._user?.riotTier || 0));
      setRegPlayers(enriched);
    } catch (e: any) {
      addLog(`❌ Fetch players: ${e.message}`);
    } finally { setRegPlayersLoading(false); }
  }, [tournamentId]);

  const savePlayerEdit = async (uid: string) => {
    if (!tournamentId || !editValues[uid]) return;
    setSavingPlayer(uid);
    try {
      const col = getSelectedCollection();
      const res = await fetch("/api/admin/update-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey, tournamentId, collection: col, uid, updates: editValues[uid] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addLog(`✅ Updated ${uid}: ${JSON.stringify(data.updated)}`);
      setEditingPlayer(null);
      setEditValues(prev => { const copy = { ...prev }; delete copy[uid]; return copy; });
      await fetchRegPlayers(); // refresh
    } catch (e: any) {
      addLog(`❌ Update player: ${e.message}`);
    } finally { setSavingPlayer(null); }
  };

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
    const unsub1 = onSnapshot(collection(db, "valorantTournaments"), (snap) => {
      const valAll = snap.docs.map(d => ({
        id: d.id,
        name: `[VAL] ${d.data().name || d.id}`,
        status: d.data().status || "upcoming",
        teamCount: d.data().teamCount,
        slotsBooked: d.data().slotsBooked,
        totalSlots: d.data().totalSlots,
        matchesPerRound: d.data().matchesPerRound,
        bracketBestOf: d.data().bracketBestOf,
        grandFinalBestOf: d.data().grandFinalBestOf,
        lbFinalBestOf: d.data().lbFinalBestOf,
        bracketFormat: d.data().bracketFormat,
        bracketTeamCount: d.data().bracketTeamCount,
        groupStageRounds: d.data().groupStageRounds,
      }));
      setTournaments(prev => {
        const dota = prev.filter(t => t.name.startsWith("[DOTA2]"));
        const merged = [...valAll, ...dota].sort((a, b) => a.name.localeCompare(b.name));
        return merged;
      });
    });
    const unsub2 = onSnapshot(collection(db, "tournaments"), (snap) => {
      const dotaAll = snap.docs.map(d => ({
        id: d.id,
        name: `[DOTA2] ${d.data().name || d.id}`,
        status: d.data().status || "upcoming",
        teamCount: d.data().teamCount,
        slotsBooked: d.data().slotsBooked,
        totalSlots: d.data().totalSlots,
        matchesPerRound: d.data().matchesPerRound,
        bracketBestOf: d.data().bracketBestOf,
        grandFinalBestOf: d.data().grandFinalBestOf,
        lbFinalBestOf: d.data().lbFinalBestOf,
        bracketFormat: d.data().bracketFormat,
        bracketTeamCount: d.data().bracketTeamCount,
        groupStageRounds: d.data().groupStageRounds,
      }));
      setTournaments(prev => {
        const val = prev.filter(t => t.name.startsWith("[VAL]"));
        const merged = [...val, ...dotaAll].sort((a, b) => a.name.localeCompare(b.name));
        return merged;
      });
      setTournamentId(prev => prev || "");
    });
    return () => { unsub1(); unsub2(); };
  }, [authenticated]);

  // ─── Determine collection for selected tournament ────────────────────────────
  const getSelectedCollection = (): string => {
    const t = tournaments.find(t => t.id === tournamentId);
    if (t?.name.startsWith("[DOTA2]")) return "tournaments";
    return "valorantTournaments";
  };

  // ─── Fetch teams & matches ──────────────────────────────────────────────────
  useEffect(() => {
    if (!tournamentId || !authenticated) { setTeams([]); setMatches([]); return; }
    const col = getSelectedCollection();
    const unsub1 = onSnapshot(
      query(collection(db, col, tournamentId, "teams"), orderBy("teamIndex")),
      (snap) => setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() } as TeamData)))
    );
    const unsub2 = onSnapshot(
      collection(db, col, tournamentId, "matches"),
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
    if (riotFilter !== "all") {
      if (riotFilter === "pending" && p.riotVerified !== "pending") return false;
      if (riotFilter === "verified" && p.riotVerified !== "verified") return false;
      if (riotFilter === "rejected" && p.riotVerified !== "rejected") return false;
    }
    if (!playerSearch) return true;
    const q = playerSearch.toLowerCase();
    return (
      (p.riotGameName?.toLowerCase().includes(q)) ||
      (p.discordUsername?.toLowerCase().includes(q)) ||
      (p.steamName?.toLowerCase().includes(q)) ||
      (p.uid?.toLowerCase().includes(q)) ||
      (p.phone?.includes(q))
    );
  }).sort((a, b) => {
    const order: Record<string, number> = { pending: 0, verified: 2, rejected: 3 };
    const av = order[a.riotVerified || ""] ?? 1;
    const bv = order[b.riotVerified || ""] ?? 1;
    return av - bv;
  });

  const handleVerifyRiot = async (uid: string, action: "verify" | "reject") => {
    setVerifyingUid(uid);
    try {
      const res = await fetch("/api/admin/verify-riot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey, uid, action }),
      });
      if (res.ok) {
        setAllPlayers(prev => prev.map(p =>
          p.uid === uid ? { ...p, riotVerified: action === "verify" ? "verified" : "rejected" } : p
        ));
      }
    } catch (e) { console.error("Verify riot error:", e); }
    setVerifyingUid(null);
  };

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
    const tourneyStageStart = toISTISOString(createTourneyStageStart);
    const tourneyStageEnd = toISTISOString(createTourneyStageEnd);

    if (regOpens) schedule.registrationOpens = regOpens;
    if (regCloses) schedule.registrationCloses = regCloses;
    if (squadCreation) schedule.squadCreation = squadCreation;
    if (groupStageStart) schedule.groupStageStart = groupStageStart;
    if (groupStageEnd) schedule.groupStageEnd = groupStageEnd;
    if (tourneyStageStart) schedule.tourneyStageStart = tourneyStageStart;
    if (tourneyStageEnd) schedule.tourneyStageEnd = tourneyStageEnd;

    return Object.keys(schedule).length > 0 ? schedule : null;
  };

  // ─── Create Tournament Handler ──────────────────────────────────────────────
  const handleCreateTournament = async () => {
    if (!createName || !createId) {
      addLog("❌ Tournament name and ID are required");
      return;
    }
    addLog(`⏳ Creating tournament "${createName}" (${createId})...`);

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

    // Tournament structure / design fields
    if (createGroupRounds) body.groupStageRounds = parseInt(createGroupRounds) || 3;
    if (createMatchesPerRound) body.matchesPerRound = parseInt(createMatchesPerRound) || 2;
    body.bracketFormat = createBracketFormat || "double_elimination";
    if (createBracketBestOf) body.bracketBestOf = parseInt(createBracketBestOf) || 2;
    if (createGrandFinalBestOf) body.grandFinalBestOf = parseInt(createGrandFinalBestOf) || 3;
    if (createLbFinalBestOf) body.lbFinalBestOf = parseInt(createLbFinalBestOf);
    if (createEliminationBestOf) body.eliminationBestOf = parseInt(createEliminationBestOf) || 2;
    if (createBracketTeamCount) body.bracketTeamCount = parseInt(createBracketTeamCount);
    if (createBannerImage) body.bannerImage = createBannerImage;

    // Share image metadata
    const shareImagesObj: Record<string, string> = {};
    if (createTagline) shareImagesObj.tagline = createTagline;
    if (createHighlightText) shareImagesObj.highlightText = createHighlightText;
    if (shareDefaultBg) shareImagesObj.defaultBg = shareDefaultBg;
    if (shareOverviewBg) shareImagesObj.overviewBg = shareOverviewBg;
    if (shareRegisterBg) shareImagesObj.registerBg = shareRegisterBg;
    if (shareTeamsBg) shareImagesObj.teamsBg = shareTeamsBg;
    if (shareScheduleBg) shareImagesObj.scheduleBg = shareScheduleBg;
    if (shareFormatBg) shareImagesObj.formatBg = shareFormatBg;
    if (Object.keys(shareImagesObj).length > 0) body.shareImages = shareImagesObj;

    // Tournament structure
    body.totalTeams = parseInt(createTotalTeams) || 8;
    body.playersPerTeam = parseInt(createPlayersPerTeam) || 5;
    body.upperBracketTeams = parseInt(createUpperBracketTeams) || Math.ceil(body.totalTeams / 2);
    body.lowerBracketTeams = parseInt(createLowerBracketTeams) || Math.floor(body.totalTeams / 2);

    const createdId = createId;
    try {
      await apiCall("/api/admin/create-tournament", body);

      // Auto-seed dummy preview data (Valorant only)
      if (createGame === "valorant") {
        try {
          await fetch("/api/valorant/seed-dummy-data", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-secret": adminKey },
            body: JSON.stringify({ tournamentId: createdId }),
          });
          addLog(`✅ seed-dummy-data: Preview data generated for ${createdId}`);
        } catch (e) {
          addLog(`⚠️ seed-dummy-data: Could not auto-seed preview data (tournament was created)`);
        }
      }

      setCreateName(""); setCreateId(""); setCreateDesc(""); setCreateRules("");
      setCreateRegDeadline(""); setCreateStartDate(""); setCreateEndDate("");
      setCreateIsTest(false); setCreateIsDaily(false);
      setCreateRegOpens(""); setCreateSquadCreation("");
      setCreateGroupStageStart(""); setCreateGroupStageEnd("");
      setCreateTourneyStageStart(""); setCreateTourneyStageEnd("");
      setCreateGroupRounds("3"); setCreateMatchesPerRound("2");
      setCreateBracketFormat("double_elimination"); setCreateBracketBestOf("2");
      setCreateGrandFinalBestOf("3"); setCreateEliminationBestOf("2");
      setCreateBracketTeamCount(""); setCreateBannerImage("");
      setCreateTagline(""); setCreateHighlightText("");
      setCreateTotalTeams("8"); setCreatePlayersPerTeam("5");
      setCreateUpperBracketTeams("4"); setCreateLowerBracketTeams("4");
      setShareDefaultBg(""); setShareOverviewBg(""); setShareRegisterBg("");
      setShareTeamsBg(""); setShareScheduleBg(""); setShareFormatBg("");
      fetchAllTournaments();
    } catch (e: any) { addLog(`❌ Create tournament failed: ${e.message}`); }
  };

  // ─── Share BG Image Upload (via Admin API) ─────────────────────────────────
  const handleShareBgUpload = async (type: string, file: File, setter: (url: string) => void) => {
    setShareBgUploading(prev => ({ ...prev, [type]: true }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      fd.append("tournamentId", createId || "tmp");
      const res = await fetch("/api/admin/upload-share-bg", {
        method: "POST",
        headers: { "x-admin-secret": adminKey },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setter(data.url);
      addLog(`✅ Uploaded ${type} background image`);
    } catch (e: any) {
      addLog(`❌ Upload failed for ${type}: ${e.message}`);
    } finally {
      setShareBgUploading(prev => ({ ...prev, [type]: false }));
    }
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
              style={{ width: "100%", padding: 12, background: "#3CCBFF", color: "#fff", border: "none", borderRadius: 100, fontWeight: 700, fontSize: "0.95rem", cursor: "pointer" }}>
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
  const btnStyle: React.CSSProperties = { padding: "10px 20px", background: "#3CCBFF", color: "#fff", border: "none", borderRadius: 100, fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", opacity: loading ? 0.6 : 1 };
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
      valorant: { bg: "#2a1215", color: "#3CCBFF", border: "#5c1f28" },
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
        .adm-tab.active { color: #3CCBFF; border-bottom-color: #3CCBFF; }
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
        .adm-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        @media (max-width: 700px) {
          .adm-content { padding: 16px 12px 40px; }
          .adm-player-row { grid-template-columns: 1.5fr 1fr 1.2fr 0.6fr 0.6fr 0.6fr; font-size: 0.68rem; min-width: 520px; }
          .adm-tourney-row { grid-template-columns: 50px 1.5fr 0.7fr 0.7fr 50px; font-size: 0.68rem; }
          .adm-tourney-row > :nth-child(4) { display: none; }
          .adm-tab { padding: 8px 16px; font-size: 0.8rem; }
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
            {loading && <span style={{ marginLeft: 12, fontSize: "0.7rem", color: "#f59e0b", fontWeight: 700, animation: "pulse 1s infinite" }}>LOADING...</span>}
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

              {/* ═══ TOURNAMENT BLUEPRINT ═══ */}
              {tournamentId && (() => {
                const t = tournaments.find(t => t.id === tournamentId) as any;
                if (!t) return null;
                const gRounds = t.groupStageRounds || "?";
                const bo = t.matchesPerRound || 2;
                const advance = t.bracketTeamCount || "Top 50%";
                const bFormat = t.bracketFormat === "single_elimination" ? "Single Elim" : "Double Elim";
                const bBo = t.bracketBestOf || 2;
                const gfBo = t.grandFinalBestOf || 3;
                return (
                  <div style={{ marginBottom: 12, padding: "14px 18px", background: "linear-gradient(135deg, #0a1820, #080e18)", border: "1px solid #1e3a5f", borderRadius: 12 }}>
                    <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#60a5fa", marginBottom: 12 }}>Tournament Blueprint</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
                      {[
                        { label: "Group Stage", sub: `${gRounds} rounds · BO${bo}`, color: "#3b82f6" },
                        { arrow: `→ ${advance} advance` },
                        { label: "Bracket", sub: `${bFormat} · BO${bBo}`, color: "#f59e0b" },
                        { arrow: "→ Finals" },
                        { label: "Grand Final", sub: `BO${gfBo}`, color: "#3CCBFF" },
                      ].map((s: any, i: number) => s.arrow ? (
                        <div key={i} style={{ fontSize: "0.6rem", color: "#555", fontWeight: 700, padding: "0 4px" }}>{s.arrow}</div>
                      ) : (
                        <div key={i} style={{ background: `${s.color}12`, border: `1px solid ${s.color}30`, borderRadius: 8, padding: "8px 14px" }}>
                          <div style={{ fontSize: "0.72rem", fontWeight: 900, color: s.color }}>{s.label}</div>
                          <div style={{ fontSize: "0.6rem", color: "#8A8880", marginTop: 2 }}>{s.sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ═══ PREVIEW DATA CONTROLS ═══ */}
              {tournamentId && (
                <div style={{ marginBottom: 12, padding: "12px 16px", background: "#14100a", border: "1px solid #3a2a10", borderRadius: 10 }}>
                  <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#f59e0b", marginBottom: 8 }}>Preview Data Controls</div>
                  <p style={{ fontSize: "0.65rem", color: "#777", marginBottom: 10, lineHeight: 1.5 }}>
                    Preview data (isDummy=true) is auto-generated on tournament creation. Real operations (shuffle, generate fixtures) will replace it automatically.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button disabled={loading} style={{ padding: "7px 14px", background: "#1a1200", border: "1px solid #f59e0b44", color: "#f59e0b", borderRadius: 8, fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                      onClick={async () => {
                        if (!confirm("This will delete existing dummy data and regenerate preview data. Real data will not be affected.")) return;
                        setLoading(true);
                        try {
                          const res = await fetch("/api/valorant/seed-dummy-data", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "x-admin-secret": adminKey },
                            body: JSON.stringify({ tournamentId }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error);
                          addLog(`✅ Regenerated preview data: ${data.teams} teams, ${data.groupMatches} group matches, ${data.bracketMatches} bracket matches`);
                        } catch (e: any) {
                          addLog(`❌ Regenerate preview data: ${e.message}`);
                        } finally { setLoading(false); }
                      }}>
                      Regenerate Preview Data
                    </button>
                    <button disabled={loading} style={{ padding: "7px 14px", background: "#1a0505", border: "1px solid #3CCBFF44", color: "#3CCBFF", borderRadius: 8, fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                      onClick={async () => {
                        if (!confirm("This will delete ALL dummy (isDummy=true) teams, matches, and leaderboard entries. Continue?")) return;
                        setLoading(true);
                        try {
                          const res = await fetch("/api/valorant/seed-dummy-data", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "x-admin-secret": adminKey },
                            body: JSON.stringify({ tournamentId, clearOnly: true }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error);
                          addLog(`✅ Cleared ${data.cleared} dummy documents`);
                        } catch (e: any) {
                          addLog(`❌ Clear dummy data: ${e.message}`);
                        } finally { setLoading(false); }
                      }}>
                      Clear Dummy Data
                    </button>
                  </div>
                </div>
              )}

              {/* ═══ REGISTERED PLAYERS (pre-shuffle) ═══ */}
              <div style={{ ...sectionStyle, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>Registered Players {regPlayers.length > 0 && <span style={{ color: "#3CCBFF" }}>({regPlayers.length})</span>}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select
                      value={playerSortBy}
                      onChange={e => {
                        const sort = e.target.value as "rank" | "name" | "skill";
                        setPlayerSortBy(sort);
                        setRegPlayers(prev => [...prev].sort((a: any, b: any) => {
                          if (sort === "rank") return (b.riotTier || b._user?.riotTier || 0) - (a.riotTier || a._user?.riotTier || 0);
                          if (sort === "skill") return (a.skillLevel || 99) - (b.skillLevel || 99);
                          return (a.riotGameName || a._user?.riotGameName || "").localeCompare(b.riotGameName || b._user?.riotGameName || "");
                        }));
                      }}
                      style={{ ...inputStyle, width: "auto", marginBottom: 0, padding: "6px 10px", fontSize: "0.72rem" }}
                    >
                      <option value="rank">Sort: Rank</option>
                      <option value="skill">Sort: Skill Tier</option>
                      <option value="name">Sort: Name</option>
                    </select>
                    <button onClick={fetchRegPlayers} disabled={regPlayersLoading || !tournamentId} style={{ ...btnStyle, padding: "6px 14px", fontSize: "0.72rem" }}>
                      {regPlayersLoading ? "Loading..." : "Load Players"}
                    </button>
                  </div>
                </div>

                {regPlayers.length > 0 && (
                  <div style={{ maxHeight: 500, overflowY: "auto", border: "1px solid #2a2a2e", borderRadius: 10 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
                      <thead>
                        <tr style={{ background: "#1a1a1e", position: "sticky", top: 0, zIndex: 1 }}>
                          <th style={{ padding: "8px 10px", textAlign: "left", color: "#666", fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.08em" }}>#</th>
                          <th style={{ padding: "8px 10px", textAlign: "left", color: "#666", fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.08em" }}>PLAYER</th>
                          <th style={{ padding: "8px 10px", textAlign: "left", color: "#666", fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.08em" }}>RANK</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", color: "#666", fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.08em" }}>TIER</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", color: "#666", fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.08em" }}>SKILL</th>
                          <th style={{ padding: "8px 10px", textAlign: "left", color: "#666", fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.08em" }}>DISCORD</th>
                          <th style={{ padding: "8px 10px", textAlign: "left", color: "#666", fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.08em" }}>PHONE</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", color: "#666", fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.08em" }}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {regPlayers.map((p: any, idx: number) => {
                          const uid = p.uid || p.id;
                          const isEditing = editingPlayer === uid;
                          const ev = editValues[uid] || {};
                          const riotName = p.riotGameName || p._user?.riotGameName || "—";
                          const riotTag = p.riotTagLine || p._user?.riotTagLine || "";
                          const riotRank = p.riotRank || p._user?.riotRank || "Unranked";
                          const riotTier = p.riotTier ?? p._user?.riotTier ?? 0;
                          const skillLevel = p.skillLevel ?? "—";
                          const discord = p._user?.discordUsername || "—";
                          const phone = p._user?.phone || "—";
                          const fullName = p._user?.fullName || "—";
                          const isSaving = savingPlayer === uid;
                          const tierColor = riotTier >= 21 ? "#ff4654" : riotTier >= 15 ? "#b388ff" : riotTier >= 9 ? "#ffd740" : "#888";

                          return (
                            <tr key={uid} style={{ borderBottom: "1px solid #222", background: isEditing ? "rgba(60,203,255,0.04)" : "transparent" }}>
                              <td style={{ padding: "8px 10px", color: "#555" }}>{idx + 1}</td>
                              <td style={{ padding: "8px 10px" }}>
                                <div style={{ color: "#e0e0e0", fontWeight: 700 }}>{riotName}<span style={{ color: "#666" }}>#{riotTag}</span></div>
                                <div style={{ fontSize: "0.65rem", color: "#555" }}>{fullName} · {uid.slice(0, 12)}...</div>
                              </td>
                              <td style={{ padding: "8px 10px" }}>
                                {isEditing ? (
                                  <input
                                    value={ev.riotRank ?? riotRank}
                                    onChange={e => setEditValues(prev => ({ ...prev, [uid]: { ...prev[uid], riotRank: e.target.value } }))}
                                    style={{ ...inputStyle, marginBottom: 0, padding: "4px 8px", fontSize: "0.74rem", width: 120 }}
                                  />
                                ) : (
                                  <span style={{ color: tierColor, fontWeight: 700 }}>{riotRank}</span>
                                )}
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    value={ev.riotTier ?? riotTier}
                                    onChange={e => setEditValues(prev => ({ ...prev, [uid]: { ...prev[uid], riotTier: parseInt(e.target.value) || 0 } }))}
                                    style={{ ...inputStyle, marginBottom: 0, padding: "4px 6px", fontSize: "0.74rem", width: 55, textAlign: "center" }}
                                    min={0} max={27}
                                  />
                                ) : (
                                  <span style={{ color: tierColor, fontWeight: 800 }}>{riotTier}</span>
                                )}
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                <span style={{
                                  display: "inline-block", padding: "2px 8px", borderRadius: 100, fontSize: "0.68rem", fontWeight: 800,
                                  background: skillLevel === 1 ? "rgba(255,70,84,0.12)" : skillLevel === 2 ? "rgba(179,136,255,0.12)" : skillLevel === 3 ? "rgba(255,215,64,0.12)" : "rgba(136,136,136,0.12)",
                                  color: skillLevel === 1 ? "#ff4654" : skillLevel === 2 ? "#b388ff" : skillLevel === 3 ? "#ffd740" : "#888",
                                  border: `1px solid ${skillLevel === 1 ? "rgba(255,70,84,0.3)" : skillLevel === 2 ? "rgba(179,136,255,0.3)" : skillLevel === 3 ? "rgba(255,215,64,0.3)" : "rgba(136,136,136,0.2)"}`,
                                }}>T{skillLevel}</span>
                              </td>
                              <td style={{ padding: "8px 10px", color: "#888", fontSize: "0.7rem" }}>{discord}</td>
                              <td style={{ padding: "8px 10px", color: "#888", fontSize: "0.7rem" }}>{phone}</td>
                              <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                {isEditing ? (
                                  <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                                    <button
                                      onClick={() => savePlayerEdit(uid)}
                                      disabled={isSaving}
                                      style={{ padding: "4px 10px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.68rem", fontWeight: 700, cursor: "pointer", opacity: isSaving ? 0.6 : 1 }}
                                    >{isSaving ? "..." : "Save"}</button>
                                    <button
                                      onClick={() => { setEditingPlayer(null); setEditValues(prev => { const c = { ...prev }; delete c[uid]; return c; }); }}
                                      style={{ padding: "4px 8px", background: "#333", color: "#aaa", border: "none", borderRadius: 6, fontSize: "0.68rem", cursor: "pointer" }}
                                    >Cancel</button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setEditingPlayer(uid)}
                                    style={{ padding: "4px 10px", background: "rgba(60,203,255,0.1)", color: "#3CCBFF", border: "1px solid rgba(60,203,255,0.25)", borderRadius: 6, fontSize: "0.68rem", fontWeight: 700, cursor: "pointer" }}
                                  >Edit</button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {regPlayers.length === 0 && !regPlayersLoading && (
                  <p style={{ fontSize: "0.72rem", color: "#555", textAlign: "center", padding: "16px 0" }}>
                    Select a tournament and click "Load Players" to see registered players.
                  </p>
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
                  {(() => {
                    const lobbyMatch = matches.find(m => m.id === selectedMatchForLobby);
                    const lobbyBo = getMatchBo(lobbyMatch);
                    return (<>
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
                      <label style={smallLabel}>Game (BO{lobbyBo})</label>
                      <select value={selectedGameForLobby} onChange={e => setSelectedGameForLobby(e.target.value)} style={selectStyle}>
                        {Array.from({ length: lobbyBo }, (_, i) => (
                          <option key={i + 1} value={String(i + 1)}>Game {i + 1}</option>
                        ))}
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
                    </>);
                  })()}
                </div>

                {/* ═══ 4. MANUAL SERIES RESULT ═══ */}
                <div style={sectionStyle}>
                  {(() => {
                    const selMatch = matches.find(m => m.id === manualMatchId);
                    const bo = getMatchBo(selMatch);
                    return (<>
                      <span style={labelStyle}>4. Manual Series Result (fallback)</span>
                      <p style={{ fontSize: "0.68rem", color: "#666", marginBottom: 8 }}>
                        Directly set the BO{bo} score. Use when you don't have Valorant match UUIDs.
                      </p>
                      <select value={manualMatchId} onChange={e => setManualMatchId(e.target.value)} style={selectStyle}>
                        <option value="">Select a match...</option>
                        {matches.filter(m => m.status !== "completed").map(m => (
                          <option key={m.id} value={m.id}>
                            {m.isBracket ? `[B] ` : ""}R{m.matchDay}-M{m.matchIndex}: {m.team1Name} vs {m.team2Name} (BO{getMatchBo(m)})
                          </option>
                        ))}
                      </select>
                      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <input value={t1Score} onChange={e => setT1Score(e.target.value)} placeholder="T1" style={{ ...inputStyle, textAlign: "center" as const }} type="number" min="0" max={String(bo)} />
                        <span style={{ display: "flex", alignItems: "center", color: "#555", fontWeight: 700 }}>vs</span>
                        <input value={t2Score} onChange={e => setT2Score(e.target.value)} placeholder="T2" style={{ ...inputStyle, textAlign: "center" as const }} type="number" min="0" max={String(bo)} />
                      </div>
                      <button disabled={loading || !manualMatchId} style={btnStyle}
                        onClick={() => apiCall("/api/valorant/match-result", {
                          tournamentId, matchId: manualMatchId, team1Score: parseInt(t1Score), team2Score: parseInt(t2Score), bestOf: bo,
                        })}>Submit Series Result</button>
                    </>);
                  })()}
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

                {/* ═══ 6. MANUAL GAME-LEVEL RESULT (dynamic BO) ═══ */}
                <div style={sectionStyle}>
                  {(() => {
                    const selMatch = matches.find(m => m.id === manualGameMatchId);
                    const bo = getMatchBo(selMatch);
                    return (<>
                      <span style={labelStyle}>6. Manual Game-Level Result (BO{bo})</span>
                      <p style={{ fontSize: "0.68rem", color: "#666", marginBottom: 8 }}>
                        Set individual game winners for walkovers, forfeits, or no-shows.
                      </p>
                      <select value={manualGameMatchId} onChange={e => {
                        setManualGameMatchId(e.target.value);
                        const m = matches.find(mm => mm.id === e.target.value);
                        resizeManualGameArrays(getMatchBo(m));
                      }} style={selectStyle}>
                        <option value="">Select a match...</option>
                        {matches.filter(m => m.status !== "completed").map(m => (
                          <option key={m.id} value={m.id}>
                            {m.isBracket ? `[B] ` : ""}R{m.matchDay}-M{m.matchIndex}: {m.team1Name} vs {m.team2Name} (BO{getMatchBo(m)})
                          </option>
                        ))}
                      </select>
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(bo, 3)}, 1fr)`, gap: 8 }}>
                        {manualGameWinners.slice(0, bo).map((val, i) => (
                          <div key={i}>
                            <label style={smallLabel}>Game {i + 1} Winner</label>
                            <select value={val} onChange={e => {
                              const arr = [...manualGameWinners];
                              arr[i] = e.target.value;
                              setManualGameWinners(arr);
                            }} style={selectStyle}>
                              <option value="none">Not played</option>
                              <option value="team1">Team 1 wins</option>
                              <option value="team2">Team 2 wins</option>
                            </select>
                          </div>
                        ))}
                      </div>
                      <input value={manualReason} onChange={e => setManualReason(e.target.value)} placeholder="Reason (e.g. Team 2 no-show)" style={inputStyle} />
                      <button disabled={loading || !manualGameMatchId} style={btnWarning}
                        onClick={() => {
                          const gameWinners: Record<string, string | null> = {};
                          for (let i = 0; i < bo; i++) {
                            gameWinners[`game${i + 1}Winner`] = manualGameWinners[i] === "none" ? null : manualGameWinners[i];
                          }
                          apiCall("/api/valorant/manual-game-result", {
                            tournamentId, matchDocId: manualGameMatchId, bestOf: bo,
                            ...gameWinners,
                            reason: manualReason,
                          });
                        }}>Set Game Results</button>
                    </>);
                  })()}
                </div>

                {/* ═══ 7. MATCH FETCH — DYNAMIC BO — FULL WIDTH ═══ */}
                <div style={{ ...sectionStyle, gridColumn: "1 / -1" }}>
                  {(() => {
                    const selMatch = matches.find(m => m.id === fetchMatchDocId);
                    const bo = getMatchBo(selMatch);
                    const gameColors = ["#3CCBFF", "#60a5fa", "#4ade80", "#f59e0b", "#c084fc"];
                    const gameBgs = ["#2a1215", "#0d1a2a", "#0d2a18", "#2a2008", "#1d0d2a"];
                    const gameBorders = ["#5c1f28", "#1e3a5f", "#1e5f3a", "#5f4e1e", "#3a1e5f"];
                    return (<>
                      <span style={labelStyle}>7. BO{bo} Series — Fetch Match Stats (Henrik API)</span>
                      <p style={{ fontSize: "0.72rem", color: "#777", marginBottom: 12, lineHeight: 1.5 }}>
                        Enter Valorant match UUIDs. System fetches player stats, auto-detects winner, updates series + standings.
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={smallLabel}>Match</label>
                          <select value={fetchMatchDocId} onChange={e => {
                            setFetchMatchDocId(e.target.value);
                            const m = matches.find(mm => mm.id === e.target.value);
                            resizeGameArrays(getMatchBo(m));
                          }} style={selectStyle}>
                            <option value="">Select a match...</option>
                            {matches.filter(m => m.status !== "completed").map(m => (
                              <option key={m.id} value={m.id}>
                                {m.isBracket ? `[B] ` : ""}R{m.matchDay}-M{m.matchIndex}: {m.team1Name} vs {m.team2Name} (BO{getMatchBo(m)})
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
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(bo, 3)}, 1fr)`, gap: 12, marginTop: 4 }}>
                        {gameMatchIds.slice(0, bo).map((val, i) => (
                          <div key={i} style={{ padding: 12, background: gameBgs[i % gameBgs.length], borderRadius: 10, border: `1px solid ${gameBorders[i % gameBorders.length]}` }}>
                            <label style={{ fontSize: "0.68rem", fontWeight: 800, color: gameColors[i % gameColors.length], display: "block", marginBottom: 6 }}>GAME {i + 1} (Map {i + 1})</label>
                            <input value={val} onChange={e => {
                              const arr = [...gameMatchIds];
                              arr[i] = e.target.value;
                              setGameMatchIds(arr);
                            }} placeholder="Valorant Match UUID" style={inputStyle} />
                            <label style={{ ...smallLabel, fontSize: "0.62rem" }}>Game {i + 1} Sub PUUIDs</label>
                            <input value={gameExcludedPuuids[i] || ""} onChange={e => {
                              const arr = [...gameExcludedPuuids];
                              arr[i] = e.target.value;
                              setGameExcludedPuuids(arr);
                            }} placeholder="comma separated" style={{ ...inputStyle, fontSize: "0.76rem" }} />
                            <button disabled={loading || !val || !fetchMatchDocId} style={{ ...(i === 0 ? btnStyle : btnSecondary), width: "100%", marginTop: 4 }}
                              onClick={() => apiCall("/api/valorant/match-fetch", {
                                tournamentId, matchDocId: fetchMatchDocId, valorantMatchId: val,
                                gameNumber: i + 1, region: fetchRegion, excludedPuuids: parsePuuids(gameExcludedPuuids[i] || ""),
                              })}>Fetch Game {i + 1}</button>
                          </div>
                        ))}
                      </div>
                    </>);
                  })()}
                </div>

                {/* ═══ 7b. DELETE GAME DATA ═══ */}
                <div style={{ ...sectionStyle, gridColumn: "1 / -1", border: "1.5px solid #7f1d1d", background: "#1a0808" }}>
                  {(() => {
                    const selMatch = matches.find(m => m.id === deleteGameMatchId);
                    const bo = getMatchBo(selMatch);
                    return (<>
                      <span style={{ ...labelStyle, color: "#f87171" }}>7b. Delete Game Data (Rollback)</span>
                      <p style={{ fontSize: "0.72rem", color: "#777", marginBottom: 12, lineHeight: 1.5 }}>
                        Reverses leaderboard stats, standings (group stage), and clears game data from match. Use this to re-fetch correct data.
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={smallLabel}>Match</label>
                          <select value={deleteGameMatchId} onChange={e => setDeleteGameMatchId(e.target.value)} style={selectStyle}>
                            <option value="">Select a match...</option>
                            {matches.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.isBracket ? `[B] ` : ""}R{m.matchDay}-M{m.matchIndex}: {m.team1Name} vs {m.team2Name} ({m.status})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={smallLabel}>Game Number</label>
                          <select value={deleteGameNumber} onChange={e => setDeleteGameNumber(e.target.value)} style={selectStyle}>
                            {Array.from({ length: bo }, (_, i) => (
                              <option key={i + 1} value={String(i + 1)}>Game {i + 1}{selMatch?.games?.[`game${i + 1}`] || (selMatch as any)?.[`game${i + 1}`] ? " (has data)" : ""}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-end" }}>
                          <button disabled={loading || !deleteGameMatchId} style={{ ...btnStyle, background: "#dc2626", width: "100%" }}
                            onClick={() => {
                              if (!confirm(`Delete Game ${deleteGameNumber} data from ${selMatch?.team1Name} vs ${selMatch?.team2Name}? This will reverse all stats.`)) return;
                              apiCall("/api/admin/delete-game-data", {
                                tournamentId, matchDocId: deleteGameMatchId,
                                gameNumber: parseInt(deleteGameNumber),
                              });
                            }}>Delete Game {deleteGameNumber} Data</button>
                        </div>
                      </div>
                    </>);
                  })()}
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
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer", fontSize: "0.78rem", color: standingsNotComplete ? "#f59e0b" : "#999" }}>
                    <input type="checkbox" checked={standingsNotComplete} onChange={e => setStandingsNotComplete(e.target.checked)} style={{ accentColor: "#f59e0b", width: 16, height: 16, cursor: "pointer" }} />
                    <span style={{ fontWeight: 700 }}>Standings not complete</span>
                    <span style={{ fontWeight: 400, color: "#666" }}> — fills all team slots with TBD</span>
                  </label>
                  <button disabled={loading} style={{ ...btnWarning, marginTop: 8 }}
                    onClick={async () => {
                      if (!confirm(`Generate elimination bracket for top ${bracketTopTeams} teams${standingsNotComplete ? " (all TBD)" : ""}?`)) return;
                      await apiCall("/api/valorant/generate-brackets", {
                        tournamentId, topTeams: parseInt(bracketTopTeams), startTime: bracketStartTime, startDate: bracketStartDate, standingsNotComplete,
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
                      <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#3CCBFF", letterSpacing: "0.1em", marginBottom: 8 }}>
                        ROUND {day}
                      </div>
                      {groupMatches.filter(m => m.matchDay === day).map(m => (
                        <div key={m.id} className="adm-match-card">
                          <div className="adm-match-day">M{m.matchIndex}</div>
                          <div className="adm-match-teams">{m.team1Name || "TBD"} vs {m.team2Name || "TBD"}</div>
                          <div className="adm-match-score">{m.status === "completed" ? `${m.team1Score}-${m.team2Score}` : "—"}</div>
                          <div className={`adm-match-status ${m.status}`}>{m.status}</div>
                          {editingMatchTime === m.id ? (
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              <input type="datetime-local" value={editMatchTimeVal} onChange={e => setEditMatchTimeVal(e.target.value)} style={{ fontSize: "0.62rem", padding: "2px 6px", background: "#1a1a1e", border: "1px solid #3a3a3e", borderRadius: 4, color: "#e0e0e0", fontFamily: "inherit" }} />
                              <button style={{ fontSize: "0.58rem", padding: "2px 8px", background: "#0a2010", border: "1px solid #22c55e44", color: "#4ade80", borderRadius: 4, cursor: "pointer", fontFamily: "inherit" }} onClick={async () => {
                                try {
                                  await apiCall("/api/valorant/match-update", { tournamentId, matchId: m.id, action: "set-time", scheduledTime: editMatchTimeVal ? toISTISOString(editMatchTimeVal) : null });
                                  setEditingMatchTime(null);
                                } catch {}
                              }}>Save</button>
                              <button style={{ fontSize: "0.58rem", padding: "2px 8px", background: "#1a1a1e", border: "1px solid #3a3a3e", color: "#888", borderRadius: 4, cursor: "pointer", fontFamily: "inherit" }} onClick={() => setEditingMatchTime(null)}>Cancel</button>
                            </div>
                          ) : (
                            <div style={{ fontSize: "0.62rem", color: m.scheduledTime ? "#555" : "#333", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }} onClick={() => {
                              setEditingMatchTime(m.id);
                              setEditMatchTimeVal(m.scheduledTime ? new Date(m.scheduledTime).toISOString().slice(0, 16) : "");
                            }}>
                              {m.scheduledTime ? new Date(m.scheduledTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "No time set"}
                              <span style={{ fontSize: "0.5rem", color: "#555" }}>✏️</span>
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
                          {editingMatchTime === m.id ? (
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              <input type="datetime-local" value={editMatchTimeVal} onChange={e => setEditMatchTimeVal(e.target.value)} style={{ fontSize: "0.62rem", padding: "2px 6px", background: "#1a1a1e", border: "1px solid #3a3a3e", borderRadius: 4, color: "#e0e0e0", fontFamily: "inherit" }} />
                              <button style={{ fontSize: "0.58rem", padding: "2px 8px", background: "#0a2010", border: "1px solid #22c55e44", color: "#4ade80", borderRadius: 4, cursor: "pointer", fontFamily: "inherit" }} onClick={async () => {
                                try {
                                  await apiCall("/api/valorant/match-update", { tournamentId, matchId: m.id, action: "set-time", scheduledTime: editMatchTimeVal ? toISTISOString(editMatchTimeVal) : null });
                                  setEditingMatchTime(null);
                                } catch {}
                              }}>Save</button>
                              <button style={{ fontSize: "0.58rem", padding: "2px 8px", background: "#1a1a1e", border: "1px solid #3a3a3e", color: "#888", borderRadius: 4, cursor: "pointer", fontFamily: "inherit" }} onClick={() => setEditingMatchTime(null)}>Cancel</button>
                            </div>
                          ) : (
                            <div style={{ fontSize: "0.62rem", color: m.scheduledTime ? "#555" : "#333", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }} onClick={() => {
                              setEditingMatchTime(m.id);
                              setEditMatchTimeVal(m.scheduledTime ? new Date(m.scheduledTime).toISOString().slice(0, 16) : "");
                            }}>
                              {m.scheduledTime ? new Date(m.scheduledTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "No time set"}
                              <span style={{ fontSize: "0.5rem", color: "#555" }}>✏️</span>
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
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <input value={playerSearch} onChange={e => setPlayerSearch(e.target.value)}
                  placeholder="Search by name, UID, discord, phone..." style={{ ...inputStyle, flex: 1, minWidth: 200, marginBottom: 0 }} />
                <select value={riotFilter} onChange={e => setRiotFilter(e.target.value as any)}
                  style={{ ...inputStyle, width: "auto", minWidth: 140, marginBottom: 0, cursor: "pointer" }}>
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div className="adm-player-row adm-player-header" style={{ borderBottom: "2px solid #2a2a2e" }}>
                <div>Player</div><div>UID</div><div style={{ textAlign: "center" }}>Riot Verification</div>
                <div style={{ textAlign: "center" }}>Steam</div><div style={{ textAlign: "center" }}>Discord</div>
                <div style={{ textAlign: "center" }}>Phone</div>
              </div>
              <div className="adm-table-scroll" style={{ maxHeight: 600, overflowY: "auto" }}>
                {filteredPlayers.map(p => (
                  <div key={p.uid}>
                    <div className="adm-player-row" style={{ cursor: p.riotVerified === "pending" ? "pointer" : undefined }}
                      onClick={() => p.riotVerified === "pending" && setExpandedPlayer(expandedPlayer === p.uid ? null : p.uid)}>
                      <div>
                        <div style={{ fontWeight: 700, color: "#e0e0e0" }}>
                          {p.riotGameName || p.steamName || p.discordUsername || "Unknown"}
                        </div>
                        <div style={{ fontSize: "0.62rem", color: "#555" }}>
                          {p.riotRank || "No rank"}
                        </div>
                      </div>
                      <div style={{ fontSize: "0.64rem", color: "#666", fontFamily: "monospace", wordBreak: "break-all" }}>
                        {p.uid}
                      </div>
                      <div style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                        {p.riotVerified === "verified" && (
                          <span style={{ color: "#22c55e", fontSize: "0.72rem", fontWeight: 700 }}>&#10003; Verified</span>
                        )}
                        {p.riotVerified === "pending" && (
                          <>
                            <span style={{ color: "#f59e0b", fontSize: "0.72rem", fontWeight: 700 }}>&#9203; Pending</span>
                            <button onClick={e => { e.stopPropagation(); handleVerifyRiot(p.uid, "verify"); }}
                              disabled={verifyingUid === p.uid}
                              style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #22c55e", background: "rgba(34,197,94,0.1)", color: "#22c55e", fontSize: "0.64rem", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                              &#10003;
                            </button>
                            <button onClick={e => { e.stopPropagation(); handleVerifyRiot(p.uid, "reject"); }}
                              disabled={verifyingUid === p.uid}
                              style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #ef4444", background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: "0.64rem", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                              &#10007;
                            </button>
                          </>
                        )}
                        {p.riotVerified === "rejected" && (
                          <span style={{ color: "#ef4444", fontSize: "0.72rem", fontWeight: 700 }}>&#10007; Rejected</span>
                        )}
                        {!p.riotVerified && !p.riotGameName && (
                          <span style={{ color: "#555", fontSize: "0.72rem" }}>&#10007;</span>
                        )}
                        {!p.riotVerified && p.riotGameName && (
                          <span style={{ color: "#888", fontSize: "0.72rem" }}>Linked</span>
                        )}
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
                    {/* Expanded screenshot preview for pending players */}
                    {expandedPlayer === p.uid && p.riotVerified === "pending" && (
                      <div style={{ padding: "12px 16px 16px", background: "#16161a", borderBottom: "1px solid #2a2a2e" }}>
                        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                          <div style={{ flex: "0 0 auto" }}>
                            {p.riotScreenshotUrl ? (
                              <a href={p.riotScreenshotUrl} target="_blank" rel="noopener noreferrer">
                                <img src={p.riotScreenshotUrl} alt="Riot screenshot" style={{ maxWidth: 320, maxHeight: 240, borderRadius: 8, border: "1px solid #2a2a2e", cursor: "pointer" }} />
                              </a>
                            ) : (
                              <div style={{ padding: "20px 32px", background: "#1a1a1e", borderRadius: 8, border: "1px solid #2a2a2e", color: "#555", fontSize: "0.78rem" }}>No screenshot uploaded</div>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ fontSize: "0.72rem", color: "#888", marginBottom: 4 }}>Riot ID</div>
                            <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#e0e0e0", marginBottom: 10 }}>{p.riotGameName}#{p.riotTagLine}</div>
                            <div style={{ fontSize: "0.72rem", color: "#888", marginBottom: 4 }}>Rank</div>
                            <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#e0e0e0", marginBottom: 16 }}>{p.riotRank || "Unknown"}</div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => handleVerifyRiot(p.uid, "verify")}
                                disabled={verifyingUid === p.uid}
                                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#22c55e", color: "#fff", fontSize: "0.78rem", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                                {verifyingUid === p.uid ? "..." : "Verify"}
                              </button>
                              <button onClick={() => handleVerifyRiot(p.uid, "reject")}
                                disabled={verifyingUid === p.uid}
                                style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", fontSize: "0.78rem", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                                {verifyingUid === p.uid ? "..." : "Reject"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
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
                      <label style={{ ...smallLabel, color: "#22c55e" }}>Team Formation</label>
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
                    <div>
                      <label style={{ ...smallLabel, color: "#22c55e" }}>Bracket Stage Start</label>
                      <input value={createTourneyStageStart} onChange={e => setCreateTourneyStageStart(e.target.value)} style={inputStyle} type="datetime-local" />
                    </div>
                    <div>
                      <label style={{ ...smallLabel, color: "#22c55e" }}>Bracket Stage End</label>
                      <input value={createTourneyStageEnd} onChange={e => setCreateTourneyStageEnd(e.target.value)} style={inputStyle} type="datetime-local" />
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

                {/* ── Tournament Design Section (collapsible) ── */}
                <div style={{ marginTop: 12, border: "1px solid #2a3a4a", borderRadius: 10, overflow: "hidden" }}>
                  <button onClick={() => setShowDesignSection(v => !v)}
                    style={{ width: "100%", padding: "12px 16px", background: "#0e1a24", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#60a5fa" }}>🏗 Tournament Design {showDesignSection ? "▲" : "▼"}</span>
                    <span style={{ fontSize: "0.62rem", color: "#555", fontWeight: 400 }}>Group/bracket structure, format per stage</span>
                  </button>
                  {showDesignSection && (
                    <div style={{ padding: 16, borderTop: "1px solid #1e3a5f" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div>
                          <label style={smallLabel}>Group Stage Rounds</label>
                          <input value={createGroupRounds} onChange={e => setCreateGroupRounds(e.target.value)} style={inputStyle} type="number" min="1" max="10" placeholder="3" />
                        </div>
                        <div>
                          <label style={smallLabel}>Matches Per Round (BO?)</label>
                          <input value={createMatchesPerRound} onChange={e => setCreateMatchesPerRound(e.target.value)} style={inputStyle} type="number" min="1" max="5" placeholder="2 (BO2)" />
                        </div>
                        <div>
                          <label style={smallLabel}>Teams to Bracket</label>
                          <input value={createBracketTeamCount} onChange={e => setCreateBracketTeamCount(e.target.value)} style={inputStyle} type="number" min="2" placeholder="e.g. 8" />
                        </div>
                        <div>
                          <label style={smallLabel}>Bracket Format</label>
                          <select value={createBracketFormat} onChange={e => setCreateBracketFormat(e.target.value)} style={selectStyle}>
                            <option value="double_elimination">Double Elimination</option>
                            <option value="single_elimination">Single Elimination</option>
                          </select>
                        </div>
                        <div>
                          <label style={smallLabel}>Bracket BO (each match)</label>
                          <input value={createBracketBestOf} onChange={e => setCreateBracketBestOf(e.target.value)} style={inputStyle} type="number" min="1" max="5" placeholder="2" />
                        </div>
                        <div>
                          <label style={smallLabel}>LB Final BO</label>
                          <input value={createLbFinalBestOf} onChange={e => setCreateLbFinalBestOf(e.target.value)} style={inputStyle} type="number" min="1" max="5" placeholder="Same as bracket" />
                        </div>
                        <div>
                          <label style={smallLabel}>Grand Final BO</label>
                          <input value={createGrandFinalBestOf} onChange={e => setCreateGrandFinalBestOf(e.target.value)} style={inputStyle} type="number" min="1" max="7" placeholder="3" />
                        </div>
                      </div>
                      <div>
                        <label style={smallLabel}>Banner Image (optional)</label>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input value={createBannerImage} onChange={e => setCreateBannerImage(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} placeholder="https://... or /public/..." />
                          <label style={{ padding: "7px 12px", background: "#1a1a1e", border: "1px solid #2a2a30", borderRadius: 8, fontSize: "0.68rem", color: "#ccc", cursor: shareBgUploading["banner"] ? "wait" : "pointer", whiteSpace: "nowrap" as const, fontFamily: "inherit", fontWeight: 600 }}>
                            {shareBgUploading["banner"] ? "Uploading…" : "Upload"}
                            <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handleShareBgUpload("banner", file, setCreateBannerImage);
                            }} />
                          </label>
                          {createBannerImage && <img src={createBannerImage} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", border: "1px solid #333", flexShrink: 0 }} />}
                        </div>
                      </div>
                      {/* Live preview */}
                      {(createGroupRounds || createBracketFormat) && (
                        <div style={{ marginTop: 10, padding: "10px 14px", background: "#000", borderRadius: 8, fontSize: "0.72rem", color: "#888", lineHeight: 2, fontFamily: "monospace" }}>
                          <span style={{ color: "#4ade80" }}>// Tournament Flow Preview</span><br />
                          Group Stage: <span style={{ color: "#60a5fa" }}>{createGroupRounds || 3} rounds</span> · BO<span style={{ color: "#60a5fa" }}>{createMatchesPerRound || 2}</span><br />
                          → Top <span style={{ color: "#f59e0b" }}>{createBracketTeamCount || "50%"}</span> teams advance<br />
                          Bracket: <span style={{ color: "#f59e0b" }}>{createBracketFormat === "single_elimination" ? "Single Elim" : "Double Elim"}</span> · BO<span style={{ color: "#f59e0b" }}>{createBracketBestOf || 2}</span><br />
                          LB Final: BO<span style={{ color: "#f59e0b" }}>{createLbFinalBestOf || createBracketBestOf || 2}</span><br />
                          Grand Final: BO<span style={{ color: "#3CCBFF" }}>{createGrandFinalBestOf || 3}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Tournament Structure (collapsible) ── */}
                <div style={{ marginTop: 8, border: "1px solid #1e3a1e", borderRadius: 10, overflow: "hidden" }}>
                  <button onClick={() => setShowStructureSection(v => !v)}
                    style={{ width: "100%", padding: "12px 16px", background: "#0a180a", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#86efac" }}>👥 Tournament Structure {showStructureSection ? "▲" : "▼"}</span>
                    <span style={{ fontSize: "0.62rem", color: "#555", fontWeight: 400 }}>Teams, players, bracket seeding</span>
                  </button>
                  {showStructureSection && (
                    <div style={{ padding: 16, borderTop: "1px solid #1e4a1e" }}>
                      <p style={{ fontSize: "0.65rem", color: "#666", marginBottom: 10, lineHeight: 1.5 }}>
                        These values are used to auto-generate preview data on creation and to render the tournament structure diagram.
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <label style={smallLabel}>Total Teams</label>
                          <input value={createTotalTeams} onChange={e => {
                            setCreateTotalTeams(e.target.value);
                            const n = parseInt(e.target.value) || 8;
                            setCreateUpperBracketTeams(String(Math.ceil(n / 2)));
                            setCreateLowerBracketTeams(String(Math.floor(n / 2)));
                          }} style={inputStyle} type="number" min="2" max="32" placeholder="8" />
                        </div>
                        <div>
                          <label style={smallLabel}>Players Per Team</label>
                          <input value={createPlayersPerTeam} onChange={e => setCreatePlayersPerTeam(e.target.value)} style={inputStyle} type="number" min="1" max="10" placeholder="5" />
                        </div>
                        <div>
                          <label style={smallLabel}>Upper Bracket Seeds</label>
                          <input value={createUpperBracketTeams} onChange={e => setCreateUpperBracketTeams(e.target.value)} style={inputStyle} type="number" min="1" placeholder="4" />
                        </div>
                        <div>
                          <label style={smallLabel}>Lower Bracket Seeds</label>
                          <input value={createLowerBracketTeams} onChange={e => setCreateLowerBracketTeams(e.target.value)} style={inputStyle} type="number" min="1" placeholder="4" />
                        </div>
                      </div>
                      <div style={{ marginTop: 8, padding: "8px 12px", background: "#000", borderRadius: 8, fontSize: "0.65rem", color: "#666", fontFamily: "monospace", lineHeight: 1.8 }}>
                        <span style={{ color: "#86efac" }}>// Structure preview</span><br />
                        {createTotalTeams || 8} teams × {createPlayersPerTeam || 5} players = <span style={{ color: "#86efac" }}>{(parseInt(createTotalTeams) || 8) * (parseInt(createPlayersPerTeam) || 5)} total players</span><br />
                        UB seeds: <span style={{ color: "#60a5fa" }}>{createUpperBracketTeams || "4"}</span> · LB seeds: <span style={{ color: "#60a5fa" }}>{createLowerBracketTeams || "4"}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Share Image Config (collapsible) ── */}
                <div style={{ marginTop: 8, border: "1px solid #2a3a2a", borderRadius: 10, overflow: "hidden" }}>
                  <button onClick={() => setShowShareSection(v => !v)}
                    style={{ width: "100%", padding: "12px 16px", background: "#0e1a0e", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#4ade80" }}>🖼 Share Image Customization {showShareSection ? "▲" : "▼"}</span>
                    <span style={{ fontSize: "0.62rem", color: "#555", fontWeight: 400 }}>Backgrounds for share cards</span>
                  </button>
                  {showShareSection && (
                    <div style={{ padding: 16, borderTop: "1px solid #1e5c1e" }}>
                      <p style={{ fontSize: "0.65rem", color: "#666", marginBottom: 12, lineHeight: 1.5 }}>
                        Set custom backgrounds for tournament share images. Leave blank to use the default theme.
                      </p>
                      <div>
                        <label style={smallLabel}>Tagline (appears on overview cards)</label>
                        <input value={createTagline} onChange={e => setCreateTagline(e.target.value)} style={inputStyle} placeholder="e.g. India's Premier Valorant Tournament" />
                      </div>
                      <div>
                        <label style={smallLabel}>Highlight Text (key stat on visual card)</label>
                        <input value={createHighlightText} onChange={e => setCreateHighlightText(e.target.value)} style={inputStyle} placeholder="e.g. ₹10,000 Prize Pool" />
                      </div>
                      {/* Per-image background fields */}
                      {([
                        { key: "default", label: "Default Background (fallback for all)", val: shareDefaultBg, set: setShareDefaultBg },
                        { key: "overview", label: "Overview Image Background", val: shareOverviewBg, set: setShareOverviewBg },
                        { key: "register", label: "Register Image Background", val: shareRegisterBg, set: setShareRegisterBg },
                        { key: "teams", label: "Teams Image Background", val: shareTeamsBg, set: setShareTeamsBg },
                        { key: "schedule", label: "Schedule Image Background", val: shareScheduleBg, set: setShareScheduleBg },
                        { key: "format", label: "Format Image Background", val: shareFormatBg, set: setShareFormatBg },
                      ] as { key: string; label: string; val: string; set: (v: string) => void }[]).map(({ key, label, val, set }) => (
                        <div key={key} style={{ marginTop: 10 }}>
                          <label style={smallLabel}>{label}</label>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input value={val} onChange={e => set(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} placeholder="URL or /public/path" />
                            <label style={{ padding: "7px 12px", background: "#1a1a1e", border: "1px solid #2a2a30", borderRadius: 8, fontSize: "0.68rem", color: "#ccc", cursor: shareBgUploading[key] ? "wait" : "pointer", whiteSpace: "nowrap" as const, fontFamily: "inherit", fontWeight: 600 }}>
                              {shareBgUploading[key] ? "Uploading…" : "Upload"}
                              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleShareBgUpload(key, file, set);
                              }} />
                            </label>
                            {val && <img src={val} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", border: "1px solid #333", flexShrink: 0 }} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Auction-specific fields ── */}
                {createGame === "valorant" && createFormat === "auction" && (
                  <div style={{ marginTop: 12, padding: 16, background: "#2a1215", borderRadius: 10, border: "1px solid #5c1f28" }}>
                    <span style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#3CCBFF", display: "block", marginBottom: 10 }}>Auction Settings</span>
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

                <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
                  <button style={btnSuccess} onClick={() => {
                    if (loading) { addLog(`⚠️ Button blocked: loading=${loading}`); alert("Loading is stuck. Click 'Unstick Loading' in the Activity Log."); setLoading(false); return; }
                    if (!createName) { addLog("❌ Tournament name is empty"); alert("Tournament name is required"); return; }
                    if (!createId) { addLog("❌ Tournament ID is empty"); alert("Tournament ID is required"); return; }
                    handleCreateTournament();
                  }}>
                    {loading ? "Creating..." : "Create Tournament"}
                  </button>
                  <button style={{ ...btnSecondary, background: "#52525b", color: "#e0e0e0" }} onClick={() => {
                    setCreateName(""); setCreateId(""); setCreateDesc(""); setCreateRules("");
                    setCreateRegDeadline(""); setCreateStartDate(""); setCreateEndDate("");
                    setCreateIsTest(false); setCreateIsDaily(false);
                    setCreateRegOpens(""); setCreateSquadCreation("");
                    setCreateGroupStageStart(""); setCreateGroupStageEnd("");
                    setCreateTourneyStageStart(""); setCreateTourneyStageEnd("");
                    setCreateGroupRounds("3"); setCreateMatchesPerRound("2");
                    setCreateBracketFormat("double_elimination"); setCreateBracketBestOf("2");
                    setCreateGrandFinalBestOf("3"); setCreateEliminationBestOf("2");
                    setCreateBracketTeamCount(""); setCreateBannerImage("");
                    setCreateTagline(""); setCreateHighlightText("");
                    setCreateTotalTeams("8"); setCreatePlayersPerTeam("5");
                    setCreateUpperBracketTeams("4"); setCreateLowerBracketTeams("4");
                    setShareDefaultBg(""); setShareOverviewBg(""); setShareRegisterBg("");
                    setShareTeamsBg(""); setShareScheduleBg(""); setShareFormatBg("");
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={labelStyle}>Activity Log</span>
              {loading && <button style={{ fontSize: "0.65rem", padding: "3px 10px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700 }} onClick={() => setLoading(false)}>Unstick Loading</button>}
            </div>
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