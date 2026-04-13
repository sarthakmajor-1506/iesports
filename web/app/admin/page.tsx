"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Navbar from "@/app/components/Navbar";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy, getDocs, getDoc, doc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/app/context/AuthContext";
import { getFirebaseAuth } from "@/lib/firebase";
import { getShuffleDuration } from "@/app/components/remotion/ShuffleReveal";
import type { ShuffleTeam } from "@/app/components/remotion/ShuffleReveal";

const ShuffleVideoPlayer = dynamic(() => import("@/app/components/ShuffleVideoPlayer"), { ssr: false });


// ─── Types ────────────────────────────────────────────────────────────────────
interface TournamentOption { id: string; name: string; status: string; teamCount?: number; slotsBooked?: number; totalSlots?: number; matchesPerRound?: number; bracketBestOf?: number; grandFinalBestOf?: number; lbFinalBestOf?: number; bracketFormat?: string; bracketTeamCount?: number; groupStageRounds?: number; }
interface TeamData { id: string; teamName: string; teamIndex: number; members: any[]; avgSkillLevel: number; }
interface VcMember { discordId: string; name: string; selfMute: boolean; selfDeaf: boolean; serverMute: boolean; serverDeaf: boolean; }
interface MatchData { id: string; matchDay: number; matchIndex: number; team1Id: string; team2Id: string; team1Name: string; team2Name: string; team1Score: number; team2Score: number; status: string; games?: Record<string, any>; scheduledTime?: string; lobbyName?: string; lobbyPassword?: string; isBracket?: boolean; bracketLabel?: string; bracketType?: string; waitingRoomVcId?: string; team1VcId?: string; team2VcId?: string; vcStatus?: { inVc: string[]; notInVc: string[]; checkedAt: string }; vcLiveStatus?: { team1: VcMember[]; team2: VcMember[]; waitingRoom: VcMember[]; updatedAt: string }; vetoState?: { status: string; bo: number; tossWinner: string; actions: { team: string; action: string; map: string }[]; remainingMaps: string[]; sidePickOnDecider?: string; team1Name: string; team2Name: string }; }
interface DiscordConnection { type: string; name: string; id: string; verified: boolean; }
interface PlayerData { uid: string; fullName?: string; phone?: string; riotGameName?: string; riotTagLine?: string; riotRank?: string; riotTier?: string; riotPuuid?: string; riotRegion?: string; riotAccountLevel?: number; riotVerified?: string; riotVerificationNote?: string; riotAvatar?: string; riotScreenshotUrl?: string; riotLinkedAt?: string; steamId?: string; steamName?: string; steamAvatar?: string; steamLinkedAt?: string; dotaRankTier?: number; dotaBracket?: string; dotaMMR?: number; discordId?: string; discordUsername?: string; discordAvatar?: string; discordConnectedAt?: string; discordConnections?: DiscordConnection[]; registeredValorantTournaments?: string[]; registeredTournaments?: string[]; registeredSoloTournaments?: string[]; createdAt?: string; upiId?: string; personalPhoto?: string; }
interface AllTournamentItem { id: string; game: string; collection: string; name: string; format: string; status: string; totalSlots: number; slotsBooked: number; entryFee: number; prizePool: string; startDate: string; isTestTournament: boolean; createdAt: string; ownerId?: string; }

type AdminTab = "tournament" | "players" | "create";

// ─── Game config ──────────────────────────────────────────────────────────────
const GAME_OPTIONS = [
  { value: "valorant", label: "Valorant" },
  { value: "dota2", label: "Dota 2" },
  { value: "cs2", label: "CS2" },
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
  cs2: [
    { value: "standard", label: "Standard" },
    { value: "shuffle", label: "Shuffle" },
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
  const { user } = useAuth();

  // ─── Auth ───────────────────────────────────────────────────────────────────
  const [adminKey, setAdminKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [adminRole, setAdminRole] = useState<"super_admin" | "cafe_admin" | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);
  const isSuperAdmin = adminRole === "super_admin";
  const isCafeAdmin = adminRole === "cafe_admin";

  // Auto-detect cafe admin role from user doc
  useEffect(() => {
    if (!user) { setRoleChecked(true); return; }
    getDoc(doc(db, "users", user.uid)).then(snap => {
      const role = snap.data()?.role;
      if (role === "cafe_admin" || role === "super_admin") {
        getFirebaseAuth().then(({ auth }) => auth.currentUser?.getIdToken()).then(token => {
          if (token) {
            setAdminKey(token);
            setAdminRole(role);
            setAuthenticated(true);
          }
          setRoleChecked(true);
        });
      } else {
        setRoleChecked(true);
      }
    }).catch(() => { setRoleChecked(true); });
  }, [user]);

  const handleAdminAuth = async () => {
    if (!adminKey) return;
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/admin/list-tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey }),
      });
      if (res.ok) {
        setAuthenticated(true);
        setAdminRole("super_admin"); // secret key = super admin
      } else {
        setAuthError("Wrong password. Access denied.");
      }
    } catch {
      setAuthError("Connection error. Try again.");
    } finally {
      setAuthLoading(false);
    }
  };

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
  const [tournamentFilter, setTournamentFilter] = useState<string>("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [playerSort, setPlayerSort] = useState<"newest" | "oldest" | "name" | "status">("newest");
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [verifyingUid, setVerifyingUid] = useState<string | null>(null);
  const [regEditUid, setRegEditUid] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [ratingDelta, setRatingDelta] = useState("");
  const [ratingNote, setRatingNote] = useState("");
  const [ratingAdjusting, setRatingAdjusting] = useState(false);
  const [photoUploadingUid, setPhotoUploadingUid] = useState<string | null>(null);

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

  // ─── Shuffle Video ──────────────────────────────────────────────────────────
  const [shuffleVideoTeams, setShuffleVideoTeams] = useState<ShuffleTeam[] | null>(null);
  const [shuffleVideoMvps, setShuffleVideoMvps] = useState<import("@/app/components/remotion/ShuffleReveal").ShufflePlayer[] | undefined>(undefined);

  // Map: { current tournament id → previous tournament id whose top performers
  // are highlighted as "players to watch" in the shuffle reveal video }
  const PREVIOUS_TOURNAMENT_MAP: Record<string, string> = {
    "league-of-rising-stars-ascension": "league-of-rising-stars-prelims",
  };

  // Build the videoTeams array AND the MVPs array, fetching the previous
  // tournament's leaderboard if one is configured. MVPs are the top 5 players
  // by iesportsRating from the previous tournament who are also playing this
  // one. Each team member is marked with `isMvp` so the team-formation scenes
  // can crown them.
  async function buildShuffleVideoData(): Promise<{
    videoTeams: ShuffleTeam[];
    mvps: import("@/app/components/remotion/ShuffleReveal").ShufflePlayer[] | undefined;
  }> {
    // Collect every UID currently registered for THIS tournament
    const currentUidByName: Record<string, string> = {};
    const currentUidSet = new Set<string>();
    teams.forEach(t => (t.members || []).forEach((m: any) => {
      if (m.uid) currentUidSet.add(m.uid);
      if (m.uid && (m.riotGameName || m.steamName)) {
        currentUidByName[(m.riotGameName || m.steamName)] = m.uid;
      }
    }));

    // Build a lookup of current members by uid so we can enrich MVP entries
    // (which come from the leaderboard and may lack fresh avatar/rank data)
    // with the player's up-to-date profile for this tournament.
    const currentMembersByUid: Record<string, any> = {};
    teams.forEach(t => (t.members || []).forEach((m: any) => {
      if (m.uid) currentMembersByUid[m.uid] = m;
    }));

    // Try to fetch the previous tournament's REAL leaderboard (actual match
    // performance, sorted by ACS) and filter to players still in this league.
    const prevId = PREVIOUS_TOURNAMENT_MAP[tournamentId];
    let mvpUidSet: Set<string> = new Set();
    let mvps: import("@/app/components/remotion/ShuffleReveal").ShufflePlayer[] | undefined;
    if (prevId) {
      try {
        const res = await fetch(`/api/tournaments/detail?id=${encodeURIComponent(prevId)}&game=valorant`);
        if (res.ok) {
          const prev = await res.json();
          const prevLeaderboard: any[] = prev.leaderboard || [];
          // Sort by ACS (canonical Valorant MVP metric), fall back to score.
          // Keep only entries whose uid is in the current registered roster.
          const ranked = prevLeaderboard
            .filter(lb => lb.uid && currentUidSet.has(lb.uid))
            .sort((a, b) => {
              const aAcs = a.acs ?? 0;
              const bAcs = b.acs ?? 0;
              if (bAcs !== aAcs) return bAcs - aAcs;
              return (b.totalScore ?? 0) - (a.totalScore ?? 0);
            })
            .slice(0, 5);

          if (ranked.length > 0) {
            mvpUidSet = new Set(ranked.map(p => p.uid));
            mvps = ranked.map(lb => {
              const cur = currentMembersByUid[lb.uid] || {};
              return {
                uid: lb.uid,
                // Prefer the CURRENT tournament's riot display so avatars stay fresh
                name: cur.riotGameName || lb.name || "Player",
                tag: cur.riotTagLine || lb.tag || undefined,
                avatar: cur.riotAvatar || undefined,
                rank: cur.iesportsRank || cur.riotRank || undefined,
                tier: cur.iesportsTier || cur.riotTier || undefined,
                isMvp: true,
              };
            });
            console.log(`[ShuffleVideo] Loaded ${ranked.length} MVPs from ${prevId} leaderboard (by ACS)`);
          } else {
            console.warn(`[ShuffleVideo] ${prevId} leaderboard had no entries with uids matching the current roster`);
          }
        }
      } catch (e) {
        console.warn("[ShuffleVideo] failed to fetch previous tournament MVPs:", e);
      }
    }

    const videoTeams: ShuffleTeam[] = teams.map(t => ({
      teamName: t.teamName,
      members: (t.members || []).map((m: any) => ({
        uid: m.uid,
        name: m.riotGameName || m.steamName || "Player",
        tag: m.riotTagLine || undefined,
        avatar: m.riotAvatar || m.steamAvatar || undefined,
        rank: m.iesportsRank || m.riotRank || undefined,
        tier: m.iesportsTier || m.riotTier || undefined,
        isMvp: m.uid ? mvpUidSet.has(m.uid) : false,
      })),
      avgSkill: t.avgSkillLevel,
    }));

    return { videoTeams, mvps };
  }

  // ─── Swiss Pairings ─────────────────────────────────────────────────────────
  const [totalRounds, setTotalRounds] = useState("5");
  const [startTime, setStartTime] = useState("18:00");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);

  // ─── Match Operations (unified) ─────────────────────────────────────────────
  const [opsMatchId, setOpsMatchId] = useState("");
  const [selectedMatchForLobby, setSelectedMatchForLobby] = useState("");
  const [selectedGameForLobby, setSelectedGameForLobby] = useState("1");
  const [lobbyName, setLobbyName] = useState("");
  const [lobbyPassword, setLobbyPassword] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

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
    const cafeUid = adminRole === "cafe_admin" && user ? user.uid : null;

    const mapTournament = (d: any, prefix: string) => ({
      id: d.id,
      name: `${prefix} ${d.data?.().name || d.name || d.id}`,
      status: d.data?.().status || d.status || "upcoming",
      teamCount: d.data?.().teamCount || d.teamCount,
      slotsBooked: d.data?.().slotsBooked || d.slotsBooked,
      totalSlots: d.data?.().totalSlots || d.totalSlots,
      matchesPerRound: d.data?.().matchesPerRound || d.matchesPerRound,
      bracketBestOf: d.data?.().bracketBestOf || d.bracketBestOf,
      grandFinalBestOf: d.data?.().grandFinalBestOf || d.grandFinalBestOf,
      lbFinalBestOf: d.data?.().lbFinalBestOf || d.lbFinalBestOf,
      bracketFormat: d.data?.().bracketFormat || d.bracketFormat,
      bracketTeamCount: d.data?.().bracketTeamCount || d.bracketTeamCount,
      groupStageRounds: d.data?.().groupStageRounds || d.groupStageRounds,
    });

    // Try onSnapshot first (works when Firebase user is authenticated)
    let snapshotWorked = false;
    const unsub1 = onSnapshot(collection(db, "valorantTournaments"), (snap) => {
      snapshotWorked = true;
      const valAll = snap.docs
        .filter(d => !cafeUid || d.data().ownerId === cafeUid)
        .map(d => mapTournament(d, "[VAL]"));
      setTournaments(prev => {
        const rest = prev.filter(t => !t.name.startsWith("[VAL]"));
        return [...valAll, ...rest].sort((a, b) => a.name.localeCompare(b.name));
      });
    }, () => {
      // onSnapshot failed (no Firebase auth) — fallback to API
      if (!snapshotWorked) {
        fetch("/api/admin/list-tournaments", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminKey }),
        }).then(r => r.json()).then(data => {
          if (data.tournaments) {
            const gameLabel: Record<string, string> = { dota2: "DOTA2", valorant: "VAL", cs2: "CS2" };
            const mapped = data.tournaments.map((t: any) => ({
              id: t.id, name: `[${gameLabel[t.game] || t.game}] ${t.name}`,
              status: t.status, slotsBooked: t.slotsBooked, totalSlots: t.totalSlots,
            }));
            setTournaments(mapped);
          }
        }).catch(() => {});
      }
    });
    const unsub2 = onSnapshot(collection(db, "tournaments"), (snap) => {
      const dotaAll = snap.docs
        .filter(d => !cafeUid || d.data().ownerId === cafeUid)
        .map(d => mapTournament(d, "[DOTA2]"));
      setTournaments(prev => {
        const rest = prev.filter(t => !t.name.startsWith("[DOTA2]"));
        return [...rest, ...dotaAll].sort((a, b) => a.name.localeCompare(b.name));
      });
      setTournamentId(prev => prev || "");
    }, () => { /* fallback handled above */ });
    // CS2: always use API (no Firestore security rules for cs2Tournaments)
    const fetchCS2 = () => {
      fetch("/api/admin/list-tournaments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey, game: "cs2" }),
      }).then(r => r.json()).then(data => {
        if (data.tournaments) {
          const mapped = data.tournaments.map((t: any) => ({
            id: t.id, name: `[CS2] ${t.name}`,
            status: t.status, slotsBooked: t.slotsBooked, totalSlots: t.totalSlots,
          }));
          setTournaments(prev => {
            const rest = prev.filter(t => !t.name.startsWith("[CS2]"));
            return [...rest, ...mapped].sort((a, b) => a.name.localeCompare(b.name));
          });
        }
      }).catch(() => {});
    };
    if (adminKey) fetchCS2();
    return () => { unsub1(); unsub2(); };
  }, [authenticated, adminRole, adminKey]);

  // ─── Determine collection for selected tournament ────────────────────────────
  const getSelectedCollection = (): string => {
    const t = tournaments.find(t => t.id === tournamentId);
    if (t?.name.startsWith("[DOTA2]")) return "tournaments";
    if (t?.name.startsWith("[CS2]")) return "cs2Tournaments";
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

  // ─── Fetch players ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authenticated || activeTab !== "players") return;
    let cancelled = false;
    const fetchPlayers = async () => {
      try {
        if (isCafeAdmin && tournaments.length > 0) {
          // Cafe admin: fetch all users via API then filter to tournament registrants
          const res = await fetch("/api/valorant/list-users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adminKey }),
          });
          const data = await res.json();
          if (!cancelled && data.users) {
            // Filter to only players registered in cafe admin's tournaments
            const ownedTournamentIds = new Set(tournaments.map(t => t.id));
            const filtered = data.users.filter((p: PlayerData) => {
              const regVal = p.registeredValorantTournaments || [];
              const regDota = p.registeredTournaments || [];
              return [...regVal, ...regDota].some(tId => ownedTournamentIds.has(tId));
            });
            setAllPlayers(filtered);
          }
        } else if (!isCafeAdmin) {
          // Super admin: fetch all users
          const res = await fetch("/api/valorant/list-users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adminKey }),
          });
          const data = await res.json();
          if (!cancelled && data.users) setAllPlayers(data.users);
        }
      } catch (e) { console.error("Failed to fetch players:", e); }
    };
    fetchPlayers();
    return () => { cancelled = true; };
  }, [authenticated, activeTab, adminKey, isCafeAdmin, tournaments]);

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
  const selectedTournament = tournaments.find(t => t.id === tournamentId);
  const isTournamentEnded = selectedTournament?.status === "ended" || selectedTournament?.status === "completed";
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
    if (tournamentFilter !== "all") {
      const inVal = p.registeredValorantTournaments?.includes(tournamentFilter);
      const inDota = p.registeredTournaments?.includes(tournamentFilter);
      const inSolo = p.registeredSoloTournaments?.includes(tournamentFilter);
      if (!inVal && !inDota && !inSolo) return false;
    }
    if (!playerSearch) return true;
    const q = playerSearch.toLowerCase();
    return (
      (p.fullName?.toLowerCase().includes(q)) ||
      (p.riotGameName?.toLowerCase().includes(q)) ||
      (p.discordUsername?.toLowerCase().includes(q)) ||
      (p.steamName?.toLowerCase().includes(q)) ||
      (p.uid?.toLowerCase().includes(q)) ||
      (p.phone?.includes(q)) ||
      (p.discordId?.includes(q)) ||
      (p.steamId?.includes(q))
    );
  }).sort((a, b) => {
    if (playerSort === "newest") {
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    }
    if (playerSort === "oldest") {
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    }
    if (playerSort === "name") {
      const an = (a.fullName || a.riotGameName || a.discordUsername || "zzz").toLowerCase();
      const bn = (b.fullName || b.riotGameName || b.discordUsername || "zzz").toLowerCase();
      return an.localeCompare(bn);
    }
    // status
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

  const startEditPlayer = (p: PlayerData) => {
    setRegEditUid(p.uid);
    setEditFields({
      fullName: p.fullName || "",
      phone: p.phone || "",
      upiId: p.upiId || "",
      riotGameName: p.riotGameName || "",
      riotTagLine: p.riotTagLine || "",
      riotRank: p.riotRank || "",
      steamName: p.steamName || "",
      discordUsername: p.discordUsername || "",
      personalPhoto: p.personalPhoto || "",
    });
  };

  const saveEditPlayer = async (uid: string) => {
    setEditSaving(true);
    try {
      const updates: Record<string, string> = {};
      const orig = allPlayers.find(p => p.uid === uid);
      if (!orig) return;
      for (const [key, val] of Object.entries(editFields)) {
        if (val !== ((orig as any)[key] || "")) updates[key] = val;
      }
      if (Object.keys(updates).length === 0) { setRegEditUid(null); setEditSaving(false); return; }
      const res = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey, uid, updates }),
      });
      if (res.ok) {
        setAllPlayers(prev => prev.map(p => p.uid === uid ? { ...p, ...updates } : p));
        setRegEditUid(null);
      }
    } catch (e) { console.error("Edit player error:", e); }
    setEditSaving(false);
  };

  const adjustRating = async (uid: string) => {
    const delta = parseInt(ratingDelta);
    if (isNaN(delta) || delta === 0) return;
    setRatingAdjusting(true);
    try {
      const res = await fetch("/api/admin/adjust-rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey, uid, delta, note: ratingNote }),
      });
      if (res.ok) {
        const result = await res.json();
        setAllPlayers(prev => prev.map(p => p.uid === uid ? {
          ...p,
          iesportsRating: result.ratingAfter,
          iesportsRank: result.iesportsRank,
        } : p));
        setRatingDelta("");
        setRatingNote("");
      }
    } catch (e) { console.error("Adjust rating error:", e); }
    setRatingAdjusting(false);
  };

  const adminUploadPhoto = async (uid: string, file: File) => {
    if (!file || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return;
    setPhotoUploadingUid(uid);
    try {
      const storage = getStorage();
      const ext = file.name.split(".").pop() || "jpg";
      const storageRef = ref(storage, `personal-photos/${uid}.${ext}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const res = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey, uid, updates: { personalPhoto: url } }),
      });
      if (res.ok) {
        setAllPlayers(prev => prev.map(p => p.uid === uid ? { ...p, personalPhoto: url } : p));
      }
    } catch (e) { console.error("Admin photo upload error:", e); }
    setPhotoUploadingUid(null);
  };

  const filteredTournaments = allTournaments.filter(t => {
    // Cafe admin only sees their own tournaments
    if (isCafeAdmin && user && t.ownerId !== user.uid) return false;
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
            {user && !roleChecked ? (
              <p style={{ fontSize: "0.85rem", color: "#3CCBFF", marginBottom: 24 }}>Checking admin access...</p>
            ) : (
              <>
                <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: 24 }}>Enter the admin key to access tournament management.</p>
                <input type="password" placeholder="Admin Key" value={adminKey}
                  onChange={e => { setAdminKey(e.target.value); setAuthError(""); }}
                  onKeyDown={e => { if (e.key === "Enter" && adminKey) handleAdminAuth(); }}
                  style={{ width: "100%", padding: 12, border: `1.5px solid ${authError ? "#dc2626" : "#2a2a2e"}`, borderRadius: 10, fontSize: "0.95rem", marginBottom: 4, outline: "none", boxSizing: "border-box", background: "#1a1a1e", color: "#e0e0e0", transition: "border-color 0.2s" }}
                />
                {authError && <p style={{ fontSize: "0.8rem", color: "#d07070", marginBottom: 8, textAlign: "left" }}>{authError}</p>}
                <button onClick={handleAdminAuth} disabled={authLoading}
                  style={{ width: "100%", padding: 12, background: "#3CCBFF", color: "#fff", border: "none", borderRadius: 100, fontWeight: 700, fontSize: "0.95rem", cursor: authLoading ? "default" : "pointer", opacity: authLoading ? 0.6 : 1, marginTop: 8 }}>
                  {authLoading ? "Verifying..." : "Authenticate →"}
                </button>
              </>
            )}
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
        .adm-content { max-width: 1200px; margin: 0 auto; padding: 20px 24px 60px; }
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
        .adm-player-row { display: grid; grid-template-columns: 3fr 0.7fr 0.7fr 1fr 0.7fr; gap: 6px; padding: 8px 12px; border-bottom: 1px solid #1e1e22; font-size: 0.76rem; align-items: center; }
        .adm-player-row:hover { background: #1a1a1e; }
        .adm-player-header { font-weight: 800; color: #555; font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase; }
        .adm-check { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; border-radius: 4px; font-size: 10px; }
        .adm-check.yes { background: #0d2a15; color: #22c55e; }
        .adm-check.no { background: #2a1215; color: #ef4444; }
        .adm-tourney-row { display: grid; grid-template-columns: 60px 2fr 0.8fr 0.8fr 0.8fr 60px; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #1e1e22; font-size: 0.76rem; align-items: center; }
        .adm-tourney-row:hover { background: #1a1a1e; }
        .adm-tourney-header { font-weight: 800; color: #555; font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase; }
        .adm-table-scroll { overflow-x: hidden; }
        @media (max-width: 700px) {
          .adm-content { padding: 16px 12px 40px; }
          .adm-player-row { grid-template-columns: 2.5fr 0.6fr 0.6fr 0.8fr 0.6fr; font-size: 0.68rem; }
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
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 900, color: "#f0f0f0", margin: 0 }}>Tournament Admin</h1>
            <span style={{
              fontSize: "0.58rem", fontWeight: 800, padding: "3px 10px", borderRadius: 100, letterSpacing: "0.08em",
              background: isSuperAdmin ? "rgba(60,203,255,0.12)" : "rgba(251,146,60,0.12)",
              color: isSuperAdmin ? "#3CCBFF" : "#fb923c",
              border: `1px solid ${isSuperAdmin ? "rgba(60,203,255,0.3)" : "rgba(251,146,60,0.3)"}`,
            }}>{isSuperAdmin ? "SUPER ADMIN" : "CAFE ADMIN"}</span>
          </div>
          <p style={{ fontSize: "0.82rem", color: "#666", marginBottom: 20 }}>
            {isCafeAdmin ? "Manage your tournaments" : "Manage all esports tournaments"}
          </p>

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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={labelStyle}>Select Tournament</span>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.65rem", color: "#555", cursor: "pointer" }}>
                    <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} style={{ accentColor: "#3CCBFF" }} />
                    Show completed
                  </label>
                </div>
                <select value={tournamentId} onChange={e => setTournamentId(e.target.value)} style={selectStyle}>
                  {tournaments.length === 0 && <option value="">Loading tournaments...</option>}
                  {tournaments.filter(t => showCompleted || (t.status !== "ended" && t.status !== "completed")).map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.status}) — {t.slotsBooked ?? 0}/{t.totalSlots ?? "∞"} players
                    </option>
                  ))}
                </select>
                {isTournamentEnded && tournamentId && (
                  <div style={{ marginTop: 8, padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "1rem" }}>🔒</span>
                    <span style={{ fontSize: "0.72rem", color: "#f87171", fontWeight: 700 }}>This tournament has ended. Destructive actions are disabled to protect historical data.</span>
                  </div>
                )}
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
                          const isEditing = regEditUid === uid;
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

              {/* ═══ TOURNAMENT SETUP (collapsible) ═══ */}
              <div style={{ ...sectionStyle, border: showSetup ? "1.5px solid #3CCBFF33" : "1px solid #2a2a2e", cursor: "pointer" }}>
                <div onClick={() => setShowSetup(!showSetup)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={labelStyle}>Tournament Setup</span>
                  <span style={{ fontSize: "0.72rem", color: "#555", transform: showSetup ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
                </div>
                {showSetup && (
                  <div className="adm-grid" style={{ marginTop: 12 }}>
                    {/* Shuffle */}
                    <div style={{ padding: 16, background: "#0f0f11", borderRadius: 10, border: "1px solid #222" }}>
                      <span style={smallLabel}>Shuffle Teams</span>
                      <input value={teamCount} onChange={e => setTeamCount(e.target.value)} placeholder="Number of teams" style={inputStyle} type="number" min="2" />
                      <button disabled={loading || isTournamentEnded} style={{ ...btnDanger, ...(isTournamentEnded ? { opacity: 0.4, cursor: "not-allowed" } : {}) }} onClick={async () => {
                        if (isTournamentEnded) return;
                        if (!confirm("This will DELETE all existing teams and reshuffle. Continue?")) return;
                        setShuffleVideoTeams(null);
                        setShuffleVideoMvps(undefined);
                        await apiCall("/api/valorant/shuffle-teams", { tournamentId, teamCount: parseInt(teamCount), deleteExisting: true });
                        // Wait a moment for Firestore listener to update teams, then build video data
                        setTimeout(async () => {
                          const { videoTeams, mvps } = await buildShuffleVideoData();
                          if (videoTeams.length > 0) {
                            setShuffleVideoTeams(videoTeams);
                            setShuffleVideoMvps(mvps);
                          }
                        }, 3000);
                      }}>Delete & Reshuffle</button>
                      {teams.length > 0 && <div style={{ marginTop: 8 }}>{teams.map(t => { const avg = t.avgSkillLevel < 100 ? Math.round(t.avgSkillLevel * 100) : Math.round(t.avgSkillLevel); return <div key={t.id} style={{ fontSize: "0.68rem", color: "#777", padding: "2px 0" }}>{t.teamName} — {t.members?.length || 0}p (avg {avg})</div>; })}</div>}
                      {teams.length > 0 && (
                        <button style={{ ...btnStyle, marginTop: 8, fontSize: "0.72rem" }} onClick={async () => {
                          const { videoTeams, mvps } = await buildShuffleVideoData();
                          setShuffleVideoTeams(videoTeams);
                          setShuffleVideoMvps(mvps);
                        }}>{shuffleVideoTeams ? "Regenerate Video" : "Generate Shuffle Video"}</button>
                      )}
                    </div>

                    {/* Shuffle Video Player */}
                    {shuffleVideoTeams && shuffleVideoTeams.length > 0 && (
                      <div style={{ padding: 16, background: "#0a0a0f", borderRadius: 10, border: "1px solid #3CCBFF33", gridColumn: "1 / -1" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                          <span style={{ ...smallLabel, color: "#3CCBFF" }}>Shuffle Reveal Video</span>
                          <button style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14 }} onClick={() => setShuffleVideoTeams(null)}>✕</button>
                        </div>
                        <ShuffleVideoPlayer
                          tournamentName={tournaments.find(t => t.id === tournamentId)?.name || "Tournament"}
                          teams={shuffleVideoTeams}
                          teamCount={shuffleVideoTeams.length}
                          tournamentId={tournamentId}
                          cachedVideoUrl={(tournaments.find(t => t.id === tournamentId) as any)?.shuffleVideoUrl}
                          adminKey={adminKey}
                          mvps={shuffleVideoMvps}
                          onCacheSaved={(url) => {
                            // Mirror the new URL onto the local tournaments state so the
                            // "cached" UI sticks without needing a full refetch.
                            setTournaments(prev => prev.map(t =>
                              t.id === tournamentId ? ({ ...t, shuffleVideoUrl: url } as any) : t
                            ));
                          }}
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <div style={{ fontSize: "0.65rem", color: "#555" }}>
                            {shuffleVideoTeams.length} teams · {Math.round(getShuffleDuration(shuffleVideoTeams.length) / 30)}s · First render uploads to cloud — subsequent downloads are instant
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Swiss Pairings */}
                    <div style={{ padding: 16, background: "#0f0f11", borderRadius: 10, border: "1px solid #222" }}>
                      <span style={smallLabel}>Generate Swiss Pairings</span>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div><label style={smallLabel}>Rounds</label><input value={totalRounds} onChange={e => setTotalRounds(e.target.value)} style={inputStyle} type="number" min="1" max="10" /></div>
                        <div><label style={smallLabel}>Start Time</label><input value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} type="time" /></div>
                      </div>
                      <label style={smallLabel}>Start Date</label>
                      <input value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} type="date" />
                      <button disabled={loading || isTournamentEnded} style={{ ...btnStyle, ...(isTournamentEnded ? { opacity: 0.4, cursor: "not-allowed" } : {}) }} onClick={async () => {
                        if (isTournamentEnded) return;
                        if (!confirm(`Generate ${totalRounds} rounds of fixtures?`)) return;
                        await apiCall("/api/valorant/generate-all-pairings", { tournamentId, totalRounds: parseInt(totalRounds), startTime, startDate });
                      }}>Generate All Fixtures</button>
                    </div>
                    {/* Add/Remove Player */}
                    <div style={{ padding: 16, background: "#0f0f11", borderRadius: 10, border: "1px solid #222" }}>
                      <span style={smallLabel}>Add / Remove Player</span>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div><label style={smallLabel}>Team</label><select value={modTeamId} onChange={e => setModTeamId(e.target.value)} style={selectStyle}><option value="">Select...</option>{teams.map(t => <option key={t.id} value={t.id}>{t.teamName} ({t.members?.length || 0}p)</option>)}</select></div>
                        <div><label style={smallLabel}>Player UID</label><input value={modPlayerUid} onChange={e => setModPlayerUid(e.target.value)} placeholder="Player UID" style={inputStyle} /></div>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                        <button disabled={loading || isTournamentEnded || !modTeamId || !modPlayerUid} style={{ ...btnSuccess, fontSize: "0.72rem", padding: "8px 14px", ...(isTournamentEnded ? { opacity: 0.4, cursor: "not-allowed" } : {}) }} onClick={() => { if (isTournamentEnded) return; apiCall("/api/valorant/modify-roster", { tournamentId, teamId: modTeamId, playerUid: modPlayerUid, action: "add" }); }}>Add</button>
                        <button disabled={loading || isTournamentEnded || !modTeamId || !modPlayerUid} style={{ ...btnDanger, fontSize: "0.72rem", padding: "8px 14px", ...(isTournamentEnded ? { opacity: 0.4, cursor: "not-allowed" } : {}) }} onClick={() => { if (isTournamentEnded) return; apiCall("/api/valorant/modify-roster", { tournamentId, teamId: modTeamId, playerUid: modPlayerUid, action: "remove" }); }}>Remove</button>
                      </div>
                      <select value={modTargetTeamId} onChange={e => setModTargetTeamId(e.target.value)} style={selectStyle}><option value="">Move to team...</option>{teams.filter(t => t.id !== modTeamId).map(t => <option key={t.id} value={t.id}>{t.teamName}</option>)}</select>
                      <button disabled={loading || isTournamentEnded || !modTeamId || !modPlayerUid || !modTargetTeamId} style={{ ...btnWarning, fontSize: "0.72rem", padding: "8px 14px", ...(isTournamentEnded ? { opacity: 0.4, cursor: "not-allowed" } : {}) }} onClick={() => { if (isTournamentEnded) return; apiCall("/api/valorant/modify-roster", { tournamentId, teamId: modTeamId, playerUid: modPlayerUid, targetTeamId: modTargetTeamId, action: "move" }); }}>Move Player</button>
                    </div>
                    {/* Generate Brackets */}
                    <div style={{ padding: 16, background: "#1a1508", borderRadius: 10, border: "1px solid #5c3a14" }}>
                      <span style={{ ...smallLabel, color: "#f59e0b" }}>Generate Brackets (Post Group)</span>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div><label style={smallLabel}>Teams</label><select value={bracketTopTeams} onChange={e => setBracketTopTeams(e.target.value)} style={selectStyle}><option value="2">Top 2</option><option value="4">Top 4</option><option value="8">Top 8</option></select></div>
                        <div><label style={smallLabel}>Date</label><input value={bracketStartDate} onChange={e => setBracketStartDate(e.target.value)} style={inputStyle} type="date" /></div>
                      </div>
                      <label style={smallLabel}>Start Time</label>
                      <input value={bracketStartTime} onChange={e => setBracketStartTime(e.target.value)} style={inputStyle} type="time" />
                      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, cursor: "pointer", fontSize: "0.72rem", color: standingsNotComplete ? "#f59e0b" : "#777" }}>
                        <input type="checkbox" checked={standingsNotComplete} onChange={e => setStandingsNotComplete(e.target.checked)} style={{ accentColor: "#f59e0b" }} />
                        Standings not complete (all TBD)
                      </label>
                      <button disabled={loading || isTournamentEnded} style={{ ...btnWarning, marginTop: 8, ...(isTournamentEnded ? { opacity: 0.4, cursor: "not-allowed" } : {}) }} onClick={async () => {
                        if (isTournamentEnded) return;
                        if (!confirm(`Generate brackets for top ${bracketTopTeams} teams?`)) return;
                        await apiCall("/api/valorant/generate-brackets", { tournamentId, topTeams: parseInt(bracketTopTeams), startTime: bracketStartTime, startDate: bracketStartDate, standingsNotComplete });
                      }}>Generate Brackets</button>
                    </div>
                  </div>
                )}
              </div>

              {/* ═══════════════════════════════════════════════════════════════════ */}
              {/* MATCH OPERATIONS — GUIDED FLOW                                     */}
              {/* ═══════════════════════════════════════════════════════════════════ */}
              <div style={{ ...sectionStyle, border: "1.5px solid #3CCBFF44", padding: "24px 28px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ ...labelStyle, marginBottom: 0, fontSize: "0.72rem", color: "#3CCBFF" }}>Match Operations</span>
                </div>

                {/* ── Match Selector ─────────────────────────────────────────── */}
                <select value={opsMatchId} onChange={e => {
                  const id = e.target.value;
                  setOpsMatchId(id);
                  setSelectedMatchForLobby(id);
                  setFetchMatchDocId(id);
                  setManualMatchId(id);
                  setManualGameMatchId(id);
                  setDeleteGameMatchId(id);
                  const m = matches.find(mm => mm.id === id);
                  resizeGameArrays(getMatchBo(m));
                  resizeManualGameArrays(getMatchBo(m));
                }} style={{ ...selectStyle, fontSize: "0.92rem", padding: 12, border: "1.5px solid #3CCBFF44", marginBottom: 16 }}>
                  <option value="">Select a match to manage...</option>
                  {matches.filter(m => m.status !== "completed").map(m => (
                    <option key={m.id} value={m.id}>
                      {m.isBracket ? "[B] " : ""}R{m.matchDay}-M{m.matchIndex}: {m.team1Name} vs {m.team2Name} (BO{getMatchBo(m)}) — {m.status}
                    </option>
                  ))}
                  {matches.filter(m => m.status === "completed").length > 0 && <option disabled>── Completed ──</option>}
                  {matches.filter(m => m.status === "completed").map(m => (
                    <option key={m.id} value={m.id}>
                      {m.isBracket ? "[B] " : ""}R{m.matchDay}-M{m.matchIndex}: {m.team1Name} vs {m.team2Name} — {m.team1Score}-{m.team2Score}
                    </option>
                  ))}
                </select>

                {(() => {
                  const m = matches.find(mm => mm.id === opsMatchId);
                  if (!m) return <div style={{ textAlign: "center", padding: 40, color: "#444", fontSize: "0.82rem" }}>Select a match above to see the step-by-step flow</div>;
                  const bo = getMatchBo(m);
                  const hasLobby = !!m.lobbyName;
                  const hasVeto = m.vetoState?.status === "complete";
                  const isLive = m.status === "live";
                  const isCompleted = m.status === "completed";
                  const hasWaitingRoom = !!m.waitingRoomVcId;
                  const hasTeamVcs = !!m.team1VcId || !!m.team2VcId;
                  const vetoStatus = m.vetoState?.status;
                  const gameColors = ["#3CCBFF", "#60a5fa", "#4ade80", "#f59e0b", "#c084fc"];
                  const gameBgs = ["#2a1215", "#0d1a2a", "#0d2a18", "#2a2008", "#1d0d2a"];
                  const gameBorders = ["#5c1f28", "#1e3a5f", "#1e5f3a", "#5f4e1e", "#3a1e5f"];

                  const stepDone = (done: boolean) => ({ display: "inline-block", width: 18, height: 18, borderRadius: "50%", background: done ? "#16a34a" : "#2a2a2e", color: done ? "#fff" : "#555", fontSize: "0.62rem", textAlign: "center" as const, lineHeight: "18px", fontWeight: 800, marginRight: 10, flexShrink: 0 });
                  const stepBox = (active: boolean, done: boolean) => ({ padding: "16px 20px", background: done ? "#0a1a0f" : active ? "#141418" : "#0e0e10", borderRadius: 12, border: `1.5px solid ${done ? "#16a34a44" : active ? "#3CCBFF33" : "#1e1e22"}`, marginBottom: 10, opacity: active || done ? 1 : 0.5 });
                  const stepTitle = { fontSize: "0.78rem", fontWeight: 700, color: "#e0e0e0" };
                  const stepHint = (color: string) => ({ fontSize: "0.66rem", color, marginTop: 4, lineHeight: 1.5 });

                  return (
                    <>
                      {/* Match header */}
                      <div style={{ padding: "12px 16px", background: "#1a1a1e", borderRadius: 10, border: "1px solid #2a2a2e", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#fff" }}>{m.team1Name} vs {m.team2Name}</div>
                          <div style={{ fontSize: "0.68rem", color: "#666", marginTop: 2 }}>BO{bo} {m.isBracket ? `— ${m.bracketLabel || "Bracket"}` : `— Round ${m.matchDay}`} {m.scheduledTime ? `— ${new Date(m.scheduledTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })} IST` : ""}</div>
                        </div>
                        <div style={{ padding: "4px 14px", borderRadius: 100, fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const, background: isCompleted ? "#0a200f" : isLive ? "#1a200a" : "#1a1508", color: isCompleted ? "#4ade80" : isLive ? "#eab308" : "#888", border: `1px solid ${isCompleted ? "#16a34a44" : isLive ? "#eab30844" : "#333"}` }}>
                          {m.status}
                        </div>
                      </div>

                      {/* ── Step 1: Set Lobby ──────────────────────────────────── */}
                      <div style={stepBox(true, hasLobby)}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <span style={stepDone(hasLobby)}>{hasLobby ? "✓" : "1"}</span>
                            <span style={stepTitle}>Set Lobby & Notify Discord</span>
                          </div>
                          {hasLobby && !isCompleted && (
                            <button style={{ fontSize: "0.62rem", padding: "3px 12px", background: "transparent", border: "1px solid #444", borderRadius: 6, color: "#888", cursor: "pointer", fontFamily: "inherit" }}
                              onClick={() => { setLobbyName(m.lobbyName || ""); setLobbyPassword(m.lobbyPassword || ""); }}>Redo</button>
                          )}
                        </div>
                        {hasLobby && lobbyName !== m.lobbyName && !isCompleted ? (
                          <div style={{ marginTop: 10 }}>
                            <div style={stepHint("#f59e0b")}>Previous lobby: {m.lobbyName} — set new details below to re-send</div>
                            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginTop: 8 }}>
                              <input value={lobbyName} onChange={e => setLobbyName(e.target.value)} placeholder="Lobby Name" style={inputStyle} />
                              <select value={selectedGameForLobby} onChange={e => setSelectedGameForLobby(e.target.value)} style={selectStyle}>
                                {Array.from({ length: bo }, (_, i) => <option key={i + 1} value={String(i + 1)}>Game {i + 1}</option>)}
                              </select>
                            </div>
                            <input value={lobbyPassword} onChange={e => setLobbyPassword(e.target.value)} placeholder="Password" style={inputStyle} />
                            <button disabled={loading || !lobbyName} style={btnStyle} onClick={() => apiCall("/api/valorant/match-update", {
                              tournamentId, matchId: opsMatchId, gameNumber: parseInt(selectedGameForLobby),
                              action: "set-lobby", lobbyName, lobbyPassword, notifyDiscord: true,
                            })}>Re-send Lobby & Notify</button>
                          </div>
                        ) : hasLobby ? (
                          <div style={stepHint("#4ade80")}>Lobby set: {m.lobbyName}{m.lobbyPassword ? ` / ${m.lobbyPassword}` : ""}</div>
                        ) : null}
                        {!hasLobby && !isCompleted && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
                              <input value={lobbyName} onChange={e => setLobbyName(e.target.value)} placeholder="Lobby Name" style={inputStyle} />
                              <select value={selectedGameForLobby} onChange={e => setSelectedGameForLobby(e.target.value)} style={selectStyle}>
                                {Array.from({ length: bo }, (_, i) => <option key={i + 1} value={String(i + 1)}>Game {i + 1}</option>)}
                              </select>
                            </div>
                            <input value={lobbyPassword} onChange={e => setLobbyPassword(e.target.value)} placeholder="Password" style={inputStyle} />
                            <button disabled={loading || !lobbyName} style={btnStyle} onClick={() => apiCall("/api/valorant/match-update", {
                              tournamentId, matchId: opsMatchId, gameNumber: parseInt(selectedGameForLobby),
                              action: "set-lobby", lobbyName, lobbyPassword, notifyDiscord: true,
                            })}>Set Lobby & Notify</button>
                          </div>
                        )}
                      </div>

                      {/* ── Step 2: Toss & Map Veto ────────────────────────────── */}
                      <div style={stepBox(hasLobby, hasVeto)}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={stepDone(hasVeto)}>{hasVeto ? "✓" : "2"}</span>
                          <span style={stepTitle}>Coin Toss & Map Veto</span>
                        </div>
                        {!hasLobby && !hasVeto && <div style={stepHint("#f59e0b")}>Set lobby first before starting the toss</div>}
                        {hasLobby && !hasVeto && !isCompleted && (
                          <div style={{ marginTop: 10 }}>
                            {vetoStatus === "toss_choice" && <div style={stepHint("#f59e0b")}>Toss posted — waiting for captain to choose in Discord</div>}
                            {vetoStatus === "veto" && <div style={stepHint("#f59e0b")}>Map veto in progress — captains are picking in Discord</div>}
                            {!vetoStatus && (
                              <button disabled={loading} style={btnStyle} onClick={() => apiCall("/api/valorant/match-update", {
                                tournamentId, matchId: opsMatchId, action: "toss", bo,
                              })}>Start Toss (BO{bo})</button>
                            )}
                          </div>
                        )}
                        {hasVeto && m.vetoState && (
                          <div style={{ marginTop: 8 }}>
                            {m.vetoState.actions.filter((a: any) => a.action === "pick").map((a: any, i: number) => (
                              <div key={i} style={{ fontSize: "0.72rem", color: "#aaa", padding: "2px 0" }}>
                                Game {i + 1}: <strong style={{ color: "#e0e0e0" }}>{a.map}</strong> <span style={{ color: "#666" }}>({a.team === "team1" ? m.vetoState!.team1Name : m.vetoState!.team2Name} pick)</span>
                              </div>
                            ))}
                            {m.vetoState.remainingMaps?.length === 1 && (
                              <div style={{ fontSize: "0.72rem", color: "#aaa", padding: "2px 0" }}>
                                Game {m.vetoState.actions.filter((a: any) => a.action === "pick").length + 1}: <strong style={{ color: "#e0e0e0" }}>{m.vetoState.remainingMaps[0]}</strong> <span style={{ color: "#666" }}>(decider)</span>
                              </div>
                            )}
                            <div style={{ fontSize: "0.62rem", color: "#555", marginTop: 4 }}>
                              Bans: {m.vetoState.actions.filter((a: any) => a.action === "ban").map((a: any) => a.map).join(", ")}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ── Step 3: Start Match + VC Status ────────────────────── */}
                      <div style={stepBox(hasLobby, isLive || isCompleted)}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={stepDone(isLive || isCompleted)}>{isLive || isCompleted ? "✓" : "3"}</span>
                          <span style={stepTitle}>Start Match</span>
                        </div>
                        {!hasLobby && <div style={stepHint("#f59e0b")}>Set lobby first</div>}
                        {hasLobby && !isLive && !isCompleted && (
                          <div style={{ marginTop: 10 }}>
                            {!hasVeto && <div style={stepHint("#f59e0b")}>Consider completing toss & veto first (or skip if not needed)</div>}
                            <div style={{ display: "flex", gap: 8 }}>
                              <button disabled={loading} style={btnStyle} onClick={() => apiCall("/api/valorant/match-update", {
                                tournamentId, matchId: opsMatchId, action: "start",
                              })}>Start Match</button>
                              <button disabled={loading} style={{ ...btnSecondary, fontSize: "0.72rem" }} onClick={() => apiCall("/api/valorant/match-update", {
                                tournamentId, matchId: opsMatchId, action: "check-vc",
                              })}>Check VC Status</button>
                            </div>
                          </div>
                        )}
                        {(isLive || isCompleted) && <div style={stepHint("#4ade80")}>Match is {m.status}</div>}

                        {/* ── Team VC Roster — always visible when lobby is set ─── */}
                        {hasLobby && (() => {
                          const team1 = teams.find(t => t.id === m.team1Id);
                          const team2 = teams.find(t => t.id === m.team2Id);
                          const live = m.vcLiveStatus;
                          const liveConnected = new Set<string>();
                          const liveMap = new Map<string, VcMember>();

                          // Build lookup of all connected members by discordId
                          if (live) {
                            for (const arr of [live.waitingRoom || [], live.team1 || [], live.team2 || []]) {
                              for (const vm of arr) { liveConnected.add(vm.discordId); liveMap.set(vm.discordId, vm); }
                            }
                          }

                          const renderTeamRoster = (team: TeamData | undefined, teamLabel: string, vcMembers: VcMember[] | undefined, color: string) => {
                            const members = team?.members || [];
                            return (
                              <div style={{ flex: 1, padding: 12, background: "#0d0d0f", borderRadius: 8, border: "1px solid #1e1e22" }}>
                                <div style={{ fontSize: "0.6rem", fontWeight: 800, color, letterSpacing: "0.08em", marginBottom: 8 }}>
                                  {teamLabel.toUpperCase()} ({members.length})
                                </div>
                                {members.length === 0 && <div style={{ fontSize: "0.66rem", color: "#444" }}>No members loaded</div>}
                                {members.map((member: any, i: number) => {
                                  const discordId = member.uid?.replace("discord_", "") || "";
                                  const name = member.riotGameName || member.uid || `Player ${i + 1}`;
                                  const vcMember = liveMap.get(discordId);
                                  const isConnected = liveConnected.has(discordId);

                                  // Determine status
                                  let icon = "⬜";
                                  let statusColor = "#444";
                                  let statusBg = "#141416";
                                  let statusBorder = "#222";
                                  let statusLabel = "unknown";

                                  if (live) {
                                    if (isConnected && vcMember) {
                                      const deafened = vcMember.selfDeaf || vcMember.serverDeaf;
                                      const muted = vcMember.selfMute || vcMember.serverMute;
                                      if (deafened) { icon = "🔇"; statusColor = "#f87171"; statusBg = "#200a0a"; statusBorder = "#dc262644"; statusLabel = "deafened"; }
                                      else if (muted) { icon = "🔸"; statusColor = "#fbbf24"; statusBg = "#2a2008"; statusBorder = "#f59e0b44"; statusLabel = "muted"; }
                                      else { icon = "🎤"; statusColor = "#4ade80"; statusBg = "#0a200f"; statusBorder = "#16a34a44"; statusLabel = "mic on"; }
                                    } else {
                                      icon = "⭕"; statusColor = "#f87171"; statusBg = "#1a0808"; statusBorder = "#7f1d1d44"; statusLabel = "not in VC";
                                    }
                                  } else if (m.vcStatus) {
                                    // Fallback to move-based check
                                    if (m.vcStatus.inVc.includes(name)) { icon = "✅"; statusColor = "#4ade80"; statusBg = "#0a200f"; statusBorder = "#16a34a44"; statusLabel = "in VC"; }
                                    else if (m.vcStatus.notInVc.includes(name)) { icon = "⭕"; statusColor = "#f87171"; statusBg = "#1a0808"; statusBorder = "#7f1d1d44"; statusLabel = "not in VC"; }
                                  }

                                  return (
                                    <div key={member.uid || i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 10px", marginBottom: 3, background: statusBg, borderRadius: 8, border: `1px solid ${statusBorder}` }}>
                                      <span style={{ fontSize: "0.72rem", color: "#ccc", fontWeight: 600 }}>{name}</span>
                                      <span style={{ fontSize: "0.62rem", color: statusColor, display: "flex", alignItems: "center", gap: 4 }}>
                                        {icon} {statusLabel}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          };

                          return (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#555", letterSpacing: "0.1em" }}>TEAM VC STATUS</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  {live?.updatedAt && <span style={{ fontSize: "0.54rem", color: "#444" }}>Live — {new Date(live.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}</span>}
                                  <button disabled={loading} style={{ fontSize: "0.58rem", padding: "3px 10px", background: "#1a1a1e", border: "1px solid #333", borderRadius: 6, color: "#888", cursor: "pointer", fontFamily: "inherit" }}
                                    onClick={() => apiCall("/api/valorant/match-update", { tournamentId, matchId: opsMatchId, action: "check-vc" })}>Refresh</button>
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 10 }}>
                                {renderTeamRoster(team1, m.team1Name, live?.team1, "#f87171")}
                                {renderTeamRoster(team2, m.team2Name, live?.team2, "#60a5fa")}
                              </div>
                              <div style={{ fontSize: "0.54rem", color: "#444", marginTop: 6, textAlign: "center" as const }}>
                                🎤 mic on · 🔸 muted · 🔇 deafened · ⭕ not in VC — {live ? "updates live from Discord bot" : "click Refresh to check"}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* ── Step 4: Fetch Match Results ────────────────────────── */}
                      <div style={stepBox(isLive, isCompleted)}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={stepDone(isCompleted)}>{isCompleted ? "✓" : "4"}</span>
                          <span style={stepTitle}>Fetch Match Results (Henrik API)</span>
                        </div>
                        {!isLive && !isCompleted && <div style={stepHint("#f59e0b")}>Start match first to fetch results</div>}
                        {(isLive || isCompleted) && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                              <label style={{ ...smallLabel, marginBottom: 0 }}>Region:</label>
                              <select value={fetchRegion} onChange={e => setFetchRegion(e.target.value)} style={{ ...selectStyle, width: 120, marginBottom: 0 }}>
                                <option value="ap">AP (India)</option>
                                <option value="eu">EU</option>
                                <option value="na">NA</option>
                              </select>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(bo, 3)}, 1fr)`, gap: 10 }}>
                              {gameMatchIds.slice(0, bo).map((val, i) => {
                                const gameData = m.games?.[`game${i + 1}`] || (m as any)?.[`game${i + 1}`];
                                const fetched = !!gameData?.mapName;
                                const vetoMap = hasVeto && m.vetoState ? (
                                  m.vetoState.actions.filter((a: any) => a.action === "pick")[i]?.map || m.vetoState.remainingMaps?.[0]
                                ) : null;
                                return (
                                  <div key={i} style={{ padding: 12, background: fetched ? "#0a200f" : gameBgs[i % gameBgs.length], borderRadius: 10, border: `1px solid ${fetched ? "#16a34a44" : gameBorders[i % gameBorders.length]}` }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                      <span style={{ fontSize: "0.68rem", fontWeight: 800, color: fetched ? "#4ade80" : gameColors[i % gameColors.length] }}>GAME {i + 1}{vetoMap ? ` — ${vetoMap}` : ""}</span>
                                      {fetched && <span style={{ fontSize: "0.58rem", color: "#4ade80" }}>Fetched</span>}
                                    </div>
                                    {fetched && gameData && (
                                      <div style={{ fontSize: "0.68rem", color: "#888", marginBottom: 6 }}>{gameData.mapName} — {gameData.team1RoundsWon || 0}-{gameData.team2RoundsWon || 0}</div>
                                    )}
                                    <input value={val} onChange={e => { const arr = [...gameMatchIds]; arr[i] = e.target.value; setGameMatchIds(arr); }} placeholder="Valorant Match UUID" style={inputStyle} />
                                    <input value={gameExcludedPuuids[i] || ""} onChange={e => { const arr = [...gameExcludedPuuids]; arr[i] = e.target.value; setGameExcludedPuuids(arr); }} placeholder="Sub PUUIDs (comma sep)" style={{ ...inputStyle, fontSize: "0.72rem" }} />
                                    <button disabled={loading || !val} style={{ ...(fetched ? btnSuccess : btnStyle), width: "100%", fontSize: "0.72rem" }}
                                      onClick={() => apiCall("/api/valorant/match-fetch", {
                                        tournamentId, matchDocId: opsMatchId, valorantMatchId: val,
                                        gameNumber: i + 1, region: fetchRegion, excludedPuuids: parsePuuids(gameExcludedPuuids[i] || ""),
                                      })}>{fetched ? "Re-fetch" : "Fetch"} Game {i + 1}</button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ── Step 5: Cleanup ─────────────────────────────────────── */}
                      <div style={stepBox(isLive || isCompleted, false)}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <span style={stepDone(!hasWaitingRoom && !hasTeamVcs && (isLive || isCompleted))}>{!hasWaitingRoom && !hasTeamVcs && (isLive || isCompleted) ? "✓" : "5"}</span>
                            <span style={stepTitle}>Cleanup VCs</span>
                          </div>
                          <button disabled={loading || (!hasWaitingRoom && !hasTeamVcs)} style={{ ...btnStyle, background: "#52525b", fontSize: "0.68rem", padding: "6px 14px" }}
                            onClick={() => apiCall("/api/valorant/match-update", { tournamentId, matchId: opsMatchId, action: "cleanup-vcs" })}>Cleanup VCs</button>
                        </div>
                        {(hasWaitingRoom || hasTeamVcs) && <div style={stepHint("#888")}>Active VCs exist for this match</div>}
                        {!hasWaitingRoom && !hasTeamVcs && <div style={stepHint("#555")}>No active VCs</div>}
                      </div>

                      {/* ── Fallback Actions (collapsible) ─────────────────────── */}
                      <div style={{ marginTop: 8 }}>
                        <div onClick={() => setShowFallback(!showFallback)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 0" }}>
                          <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "#555", letterSpacing: "0.1em" }}>FALLBACK ACTIONS</span>
                          <span style={{ fontSize: "0.62rem", color: "#444", transform: showFallback ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
                        </div>
                        {showFallback && (
                          <div className="adm-grid" style={{ gap: 10 }}>
                            {/* Manual Series Result */}
                            <div style={{ padding: 14, background: "#0f0f11", borderRadius: 10, border: "1px solid #222" }}>
                              <span style={smallLabel}>Manual Series Result (BO{bo})</span>
                              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                                <input value={t1Score} onChange={e => setT1Score(e.target.value)} placeholder="T1" style={{ ...inputStyle, textAlign: "center" as const }} type="number" min="0" max={String(bo)} />
                                <span style={{ display: "flex", alignItems: "center", color: "#555", fontWeight: 700 }}>vs</span>
                                <input value={t2Score} onChange={e => setT2Score(e.target.value)} placeholder="T2" style={{ ...inputStyle, textAlign: "center" as const }} type="number" min="0" max={String(bo)} />
                              </div>
                              <button disabled={loading} style={btnStyle} onClick={() => apiCall("/api/valorant/match-result", {
                                tournamentId, matchId: opsMatchId, team1Score: parseInt(t1Score), team2Score: parseInt(t2Score), bestOf: bo,
                              })}>Submit Series Result</button>
                            </div>
                            {/* Manual Game Result */}
                            <div style={{ padding: 14, background: "#0f0f11", borderRadius: 10, border: "1px solid #222" }}>
                              <span style={smallLabel}>Manual Game-Level Result</span>
                              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(bo, 3)}, 1fr)`, gap: 6 }}>
                                {manualGameWinners.slice(0, bo).map((val, i) => (
                                  <div key={i}>
                                    <label style={{ ...smallLabel, fontSize: "0.58rem" }}>Game {i + 1}</label>
                                    <select value={val} onChange={e => { const arr = [...manualGameWinners]; arr[i] = e.target.value; setManualGameWinners(arr); }} style={selectStyle}>
                                      <option value="none">—</option><option value="team1">T1 wins</option><option value="team2">T2 wins</option>
                                    </select>
                                  </div>
                                ))}
                              </div>
                              <input value={manualReason} onChange={e => setManualReason(e.target.value)} placeholder="Reason (e.g. no-show)" style={inputStyle} />
                              <button disabled={loading} style={btnWarning} onClick={() => {
                                const gw: Record<string, string | null> = {};
                                for (let i = 0; i < bo; i++) gw[`game${i + 1}Winner`] = manualGameWinners[i] === "none" ? null : manualGameWinners[i];
                                apiCall("/api/valorant/manual-game-result", { tournamentId, matchDocId: opsMatchId, bestOf: bo, ...gw, reason: manualReason });
                              }}>Set Game Results</button>
                            </div>
                            {/* Delete Game Data */}
                            <div style={{ padding: 14, background: "#1a0808", borderRadius: 10, border: "1px solid #7f1d1d44", gridColumn: "1 / -1" }}>
                              <span style={{ ...smallLabel, color: "#f87171" }}>Delete Game Data (Rollback)</span>
                              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                                <div style={{ flex: 1 }}>
                                  <label style={{ ...smallLabel, fontSize: "0.58rem" }}>Game</label>
                                  <select value={deleteGameNumber} onChange={e => setDeleteGameNumber(e.target.value)} style={selectStyle}>
                                    {Array.from({ length: bo }, (_, i) => {
                                      const gd = m.games?.[`game${i + 1}`] || (m as any)?.[`game${i + 1}`];
                                      return <option key={i + 1} value={String(i + 1)}>Game {i + 1}{gd ? " (has data)" : ""}</option>;
                                    })}
                                  </select>
                                </div>
                                <button disabled={loading} style={{ ...btnDanger, fontSize: "0.72rem" }} onClick={() => {
                                  if (!confirm(`Delete Game ${deleteGameNumber} data? This reverses all stats.`)) return;
                                  apiCall("/api/admin/delete-game-data", { tournamentId, matchDocId: opsMatchId, gameNumber: parseInt(deleteGameNumber) });
                                }}>Delete Game {deleteGameNumber}</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
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

              {/* ── Stats row ── */}
              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                {[
                  { label: "Total", val: allPlayers.length, color: "#3B82F6" },
                  { label: "Riot Verified", val: allPlayers.filter(p => p.riotVerified === "verified").length, color: "#22c55e" },
                  { label: "Pending", val: allPlayers.filter(p => p.riotVerified === "pending").length, color: "#f59e0b" },
                  { label: "Steam", val: allPlayers.filter(p => p.steamId).length, color: "#66c0f4" },
                  { label: "Discord", val: allPlayers.filter(p => p.discordId).length, color: "#818cf8" },
                  { label: "Discord Conns", val: allPlayers.filter(p => p.discordConnections && p.discordConnections.length > 0).length, color: "#a78bfa" },
                  { label: "Phone", val: allPlayers.filter(p => p.phone && p.phone.length > 3).length, color: "#f472b6" },
                  { label: "Photo", val: allPlayers.filter(p => p.personalPhoto).length, color: "#fb923c" },
                ].map(s => (
                  <div key={s.label} style={{ padding: "8px 14px", background: "#111114", border: "1px solid #2a2a2e", borderRadius: 8, textAlign: "center", minWidth: 80 }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 900, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: "0.62rem", color: "#888", fontWeight: 600, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* ── Join timeline ── */}
              {(() => {
                const now = new Date();
                const days: { label: string; count: number }[] = [];
                for (let i = 6; i >= 0; i--) {
                  const d = new Date(now); d.setDate(d.getDate() - i);
                  const ds = d.toISOString().slice(0, 10);
                  const label = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                  const count = allPlayers.filter(p => p.createdAt?.slice(0, 10) === ds).length;
                  days.push({ label, count });
                }
                const max = Math.max(...days.map(d => d.count), 1);
                return (
                  <div style={{ background: "#111114", border: "1px solid #2a2a2e", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
                    <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Joins — Last 7 Days</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 48 }}>
                      {days.map(d => (
                        <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <span style={{ fontSize: "0.58rem", fontWeight: 700, color: d.count > 0 ? "#3B82F6" : "#444" }}>{d.count || ""}</span>
                          <div style={{ width: "100%", height: Math.max(d.count / max * 36, 2), background: d.count > 0 ? "#3B82F6" : "#2a2a2e", borderRadius: 3 }} />
                          <span style={{ fontSize: "0.52rem", color: "#555" }}>{d.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── Search, filter & sort ── */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <input value={playerSearch} onChange={e => setPlayerSearch(e.target.value)}
                  placeholder="Search name, Discord, Riot ID, Steam, UID, phone..." style={{ ...inputStyle, flex: 1, minWidth: 200, marginBottom: 0 }} />
                <select value={tournamentFilter} onChange={e => setTournamentFilter(e.target.value)}
                  style={{ ...inputStyle, width: "auto", minWidth: 160, marginBottom: 0, cursor: "pointer" }}>
                  <option value="all">All Tournaments</option>
                  {tournaments.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <select value={riotFilter} onChange={e => setRiotFilter(e.target.value as any)}
                  style={{ ...inputStyle, width: "auto", minWidth: 130, marginBottom: 0, cursor: "pointer" }}>
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                </select>
                <select value={playerSort} onChange={e => setPlayerSort(e.target.value as any)}
                  style={{ ...inputStyle, width: "auto", minWidth: 130, marginBottom: 0, cursor: "pointer" }}>
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="name">By Name</option>
                  <option value="status">By Status</option>
                </select>
              </div>
              <div style={{ fontSize: "0.68rem", color: "#555", marginBottom: 10 }}>
                Showing {filteredPlayers.length} of {allPlayers.length} players — click any row to expand full details
              </div>

              {/* ── Table header ── */}
              <div className="adm-player-row adm-player-header" style={{ borderBottom: "2px solid #2a2a2e" }}>
                <div>Player</div><div>Joined</div><div>Onboarding</div><div style={{ textAlign: "center" }}>Riot</div>
                <div style={{ textAlign: "center" }}>Connections</div>
              </div>

              {/* ── Player list ── */}
              <div className="adm-table-scroll" style={{ maxHeight: 700, overflowY: "auto" }}>
                {filteredPlayers.map(p => {
                  const onboardSteps = [!!p.fullName, !!p.discordId, !!p.steamId, !!(p.riotGameName), !!(p.phone && p.phone.length > 3)];
                  const onboardDone = onboardSteps.filter(Boolean).length;
                  const onboardTotal = onboardSteps.length;
                  const isExpanded = expandedPlayer === p.uid;
                  return (
                  <div key={p.uid}>
                    <div className="adm-player-row" style={{ cursor: "pointer", background: isExpanded ? "#16161a" : undefined }}
                      onClick={() => setExpandedPlayer(isExpanded ? null : p.uid)}>
                      <div>
                        <div style={{ fontWeight: 700, color: "#e0e0e0", fontSize: "0.82rem" }}>
                          {p.fullName || p.riotGameName || p.steamName || p.discordUsername || "Unknown"}
                        </div>
                        {p.riotGameName && (
                          <div style={{ fontSize: "0.62rem", color: "#888" }}>{p.riotGameName}#{p.riotTagLine}</div>
                        )}
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                          {(p as any).iesportsRank && (
                            <span style={{ fontSize: "0.6rem", fontWeight: 800, color: "#3CCBFF" }}>iE: {(p as any).iesportsRank} ({(p as any).iesportsRating})</span>
                          )}
                          {p.riotRank && (
                            <span style={{ fontSize: "0.58rem", color: "#555" }}>Riot: {p.riotRank}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: "0.62rem", color: "#888" }}>
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                        <div style={{ fontSize: "0.54rem", color: "#555" }}>
                          {p.createdAt ? new Date(p.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }) : ""}
                        </div>
                      </div>
                      <div>
                        <div style={{ display: "flex", gap: 2, marginBottom: 3 }}>
                          {onboardSteps.map((done, i) => (
                            <div key={i} style={{ width: 16, height: 4, borderRadius: 2, background: done ? "#22c55e" : "#2a2a2e" }} />
                          ))}
                        </div>
                        <div style={{ fontSize: "0.6rem", color: onboardDone === onboardTotal ? "#22c55e" : "#888", fontWeight: 600 }}>
                          {onboardDone}/{onboardTotal}
                        </div>
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
                      <div style={{ textAlign: "center", display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}>
                        <span title="Steam" className={`adm-check ${p.steamId ? "yes" : "no"}`} style={{ fontSize: "0.6rem" }}>S</span>
                        <span title="Discord" className={`adm-check ${p.discordId ? "yes" : "no"}`} style={{ fontSize: "0.6rem" }}>D</span>
                        <span title="Phone" className={`adm-check ${p.phone && p.phone.length > 3 ? "yes" : "no"}`} style={{ fontSize: "0.6rem" }}>P</span>
                      </div>
                    </div>

                    {/* ── Expanded detail card ── */}
                    {isExpanded && (
                      <div style={{ padding: "16px 20px 20px", background: "#111114", borderBottom: "1px solid #2a2a2e" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>

                          {/* Identity */}
                          <div style={{ background: "#18181c", border: "1px solid #2a2a2e", borderRadius: 10, padding: 14 }}>
                            <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#3B82F6", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Identity</div>
                            {/* Personal Photo */}
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                              {p.personalPhoto ? (
                                <img src={p.personalPhoto} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", border: "2px solid #2a2a2e" }} />
                              ) : (
                                <div style={{ width: 48, height: 48, borderRadius: 10, background: "#1e1e22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", color: "#555" }}>No Photo</div>
                              )}
                              <label style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #fb923c", background: "rgba(251,146,60,0.1)", color: "#fb923c", fontSize: "0.64rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                                {photoUploadingUid === p.uid ? "Uploading..." : p.personalPhoto ? "Change Photo" : "Upload Photo"}
                                <input type="file" accept="image/*" style={{ display: "none" }}
                                  onChange={e => { const f = e.target.files?.[0]; if (f) adminUploadPhoto(p.uid, f); e.target.value = ""; }}
                                  disabled={photoUploadingUid === p.uid} />
                              </label>
                            </div>
                            {[
                              { label: "Full Name", val: p.fullName },
                              { label: "UID", val: p.uid, mono: true },
                              { label: "Phone", val: p.phone && p.phone.length > 3 ? p.phone : null },
                              { label: "UPI ID", val: p.upiId },
                              { label: "Joined", val: p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null },
                            ].map(r => (
                              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1e1e22" }}>
                                <span style={{ fontSize: "0.72rem", color: "#888" }}>{r.label}</span>
                                <span style={{ fontSize: "0.72rem", color: r.val ? "#e0e0e0" : "#444", fontWeight: r.val ? 600 : 400, fontFamily: r.mono ? "monospace" : "inherit", maxWidth: "60%", textAlign: "right", wordBreak: "break-all" }}>{r.val || "—"}</span>
                              </div>
                            ))}
                          </div>

                          {/* Riot / Valorant */}
                          <div style={{ background: "#18181c", border: "1px solid #2a2a2e", borderRadius: 10, padding: 14 }}>
                            <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#ff4655", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Riot / Valorant</div>
                            {p.riotAvatar && <img src={p.riotAvatar} alt="" style={{ width: 36, height: 36, borderRadius: 6, marginBottom: 8, border: "2px solid #2a2a2e" }} />}
                            {[
                              { label: "Riot ID", val: p.riotGameName ? `${p.riotGameName}#${p.riotTagLine}` : null },
                              { label: "Rank", val: p.riotRank },
                              { label: "Tier", val: p.riotTier },
                              { label: "Region", val: p.riotRegion },
                              { label: "Account Level", val: p.riotAccountLevel != null ? String(p.riotAccountLevel) : null },
                              { label: "Verified", val: p.riotVerified || "unlinked" },
                              { label: "Linked At", val: p.riotLinkedAt ? new Date(p.riotLinkedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null },
                            ].map(r => (
                              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1e1e22" }}>
                                <span style={{ fontSize: "0.72rem", color: "#888" }}>{r.label}</span>
                                <span style={{ fontSize: "0.72rem", color: r.val && r.val !== "unlinked" ? "#e0e0e0" : "#444", fontWeight: 600 }}>{r.val || "—"}</span>
                              </div>
                            ))}
                            {p.riotScreenshotUrl && (
                              <a href={p.riotScreenshotUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 10 }}>
                                <img src={p.riotScreenshotUrl} alt="Screenshot" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 6, border: "1px solid #2a2a2e" }} />
                              </a>
                            )}
                            {p.riotVerified === "pending" && (
                              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                <button onClick={() => handleVerifyRiot(p.uid, "verify")} disabled={verifyingUid === p.uid}
                                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: "#22c55e", color: "#fff", fontSize: "0.76rem", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                                  {verifyingUid === p.uid ? "..." : "Verify"}
                                </button>
                                <button onClick={() => handleVerifyRiot(p.uid, "reject")} disabled={verifyingUid === p.uid}
                                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", fontSize: "0.76rem", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                                  {verifyingUid === p.uid ? "..." : "Reject"}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Steam / Dota */}
                          <div style={{ background: "#18181c", border: "1px solid #2a2a2e", borderRadius: 10, padding: 14 }}>
                            <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#66c0f4", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Steam / Dota 2</div>
                            {p.steamAvatar && <img src={p.steamAvatar} alt="" style={{ width: 36, height: 36, borderRadius: "50%", marginBottom: 8, border: "2px solid #2a2a2e" }} />}
                            {[
                              { label: "Steam Name", val: p.steamName },
                              { label: "Steam ID", val: p.steamId, mono: true },
                              { label: "Dota Rank Tier", val: p.dotaRankTier != null ? String(p.dotaRankTier) : null },
                              { label: "Dota Bracket", val: p.dotaBracket },
                              { label: "Dota MMR", val: p.dotaMMR != null ? String(p.dotaMMR) : null },
                              { label: "Linked At", val: p.steamLinkedAt ? new Date(p.steamLinkedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null },
                            ].map(r => (
                              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1e1e22" }}>
                                <span style={{ fontSize: "0.72rem", color: "#888" }}>{r.label}</span>
                                <span style={{ fontSize: "0.72rem", color: r.val ? "#e0e0e0" : "#444", fontWeight: 600, fontFamily: r.mono ? "monospace" : "inherit" }}>{r.val || "—"}</span>
                              </div>
                            ))}
                          </div>

                          {/* Discord */}
                          <div style={{ background: "#18181c", border: "1px solid #2a2a2e", borderRadius: 10, padding: 14 }}>
                            <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#818cf8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Discord</div>
                            {p.discordAvatar && <img src={p.discordAvatar} alt="" style={{ width: 36, height: 36, borderRadius: "50%", marginBottom: 8, border: "2px solid #2a2a2e" }} />}
                            {[
                              { label: "Username", val: p.discordUsername },
                              { label: "Discord ID", val: p.discordId, mono: true },
                              { label: "Connected At", val: p.discordConnectedAt ? new Date(p.discordConnectedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null },
                            ].map(r => (
                              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1e1e22" }}>
                                <span style={{ fontSize: "0.72rem", color: "#888" }}>{r.label}</span>
                                <span style={{ fontSize: "0.72rem", color: r.val ? "#e0e0e0" : "#444", fontWeight: 600, fontFamily: r.mono ? "monospace" : "inherit" }}>{r.val || "—"}</span>
                              </div>
                            ))}
                            {/* Discord Connected Accounts */}
                            {p.discordConnections && p.discordConnections.length > 0 && (
                              <div style={{ marginTop: 12, borderTop: "1px solid #2a2a2e", paddingTop: 10 }}>
                                <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "#a78bfa", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                  Linked Accounts ({p.discordConnections.length})
                                </div>
                                {p.discordConnections.map((conn, i) => {
                                  const typeLabel: Record<string, string> = { steam: "Steam", riotgames: "Riot Games", twitch: "Twitch", youtube: "YouTube", twitter: "Twitter", github: "GitHub", spotify: "Spotify", xbox: "Xbox", playstation: "PlayStation", epicgames: "Epic Games", battlenet: "Battle.net" };
                                  const typeColor: Record<string, string> = { steam: "#66c0f4", riotgames: "#ff4655", twitch: "#9146ff", youtube: "#ff0000", twitter: "#1da1f2", github: "#e0e0e0", spotify: "#1db954", xbox: "#107c10", playstation: "#003087", epicgames: "#e0e0e0", battlenet: "#00AEFF" };
                                  return (
                                    <div key={`${conn.type}-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #1e1e22" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: "0.66rem", fontWeight: 700, color: typeColor[conn.type] || "#888" }}>{typeLabel[conn.type] || conn.type}</span>
                                        <span style={{ fontSize: "0.66rem", color: "#e0e0e0" }}>{conn.name}</span>
                                      </div>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        {conn.verified && <span style={{ fontSize: "0.56rem", color: "#22c55e", fontWeight: 700 }}>✓ Verified</span>}
                                        <span style={{ fontSize: "0.54rem", color: "#555", fontFamily: "monospace" }}>{conn.id}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {(!p.discordConnections || p.discordConnections.length === 0) && p.discordId && (
                              <div style={{ marginTop: 10, fontSize: "0.62rem", color: "#555", fontStyle: "italic" }}>No linked accounts found on Discord</div>
                            )}
                          </div>

                          {/* Tournaments */}
                          <div style={{ background: "#18181c", border: "1px solid #2a2a2e", borderRadius: 10, padding: 14 }}>
                            <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#f59e0b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Tournaments</div>
                            {[
                              { label: "Valorant", val: p.registeredValorantTournaments?.length || 0 },
                              { label: "Dota 5v5", val: p.registeredTournaments?.length || 0 },
                              { label: "Dota Solo", val: p.registeredSoloTournaments?.length || 0 },
                            ].map(r => (
                              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1e1e22" }}>
                                <span style={{ fontSize: "0.72rem", color: "#888" }}>{r.label}</span>
                                <span style={{ fontSize: "0.72rem", color: r.val > 0 ? "#e0e0e0" : "#444", fontWeight: 600 }}>{r.val}</span>
                              </div>
                            ))}
                            {(p.registeredValorantTournaments?.length || 0) > 0 && (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: "0.62rem", color: "#666", marginBottom: 4 }}>Valorant IDs:</div>
                                {p.registeredValorantTournaments!.map(tid => (
                                  <div key={tid} style={{ fontSize: "0.62rem", color: "#888", fontFamily: "monospace", padding: "2px 0" }}>{tid}</div>
                                ))}
                              </div>
                            )}
                          </div>

                        </div>

                        {/* ── Edit form ── */}
                        {regEditUid === p.uid ? (
                          <div style={{ background: "#18181c", border: "1px solid #3B82F6", borderRadius: 10, padding: 14, marginTop: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                              <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#3B82F6", textTransform: "uppercase", letterSpacing: 1 }}>Edit Player</div>
                              {(p as any).iesportsRating && (
                                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#3CCBFF" }}>
                                  iE Rating: <span style={{ fontWeight: 900, color: "#F0EEEA" }}>{(p as any).iesportsRating}</span> ({(p as any).iesportsRank || "?"})
                                </div>
                              )}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                              {[
                                { key: "fullName", label: "Full Name" },
                                { key: "phone", label: "Phone" },
                                { key: "upiId", label: "UPI ID" },
                                { key: "riotGameName", label: "Riot Game Name" },
                                { key: "riotTagLine", label: "Riot Tag" },
                                { key: "riotRank", label: "Riot Rank" },
                                { key: "steamName", label: "Steam Name" },
                                { key: "discordUsername", label: "Discord Username" },
                                { key: "personalPhoto", label: "Personal Photo URL" },
                              ].map(f => (
                                <div key={f.key}>
                                  <label style={{ fontSize: "0.62rem", color: "#888", display: "block", marginBottom: 3 }}>{f.label}</label>
                                  <input value={editFields[f.key] || ""} onChange={e => setEditFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                                    style={{ width: "100%", padding: "6px 10px", background: "#111114", border: "1px solid #2a2a2e", borderRadius: 6, color: "#e0e0e0", fontSize: "0.76rem", fontFamily: "inherit", outline: "none" }} />
                                </div>
                              ))}
                            </div>
                            {/* ── IEsports Rating ── */}
                            <div style={{ marginTop: 14, padding: 12, background: "rgba(60,203,255,0.04)", border: "1px solid rgba(60,203,255,0.15)", borderRadius: 8 }}>
                              <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#3CCBFF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>IEsports Rating</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: isSuperAdmin ? 10 : 0 }}>
                                <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#F0EEEA" }}>{(p as any).iesportsRating || "Not seeded"}</span>
                                <span style={{ fontSize: "0.72rem", color: "#8A8880" }}>{(p as any).iesportsRank || ""}</span>
                              </div>
                              {isSuperAdmin && (
                                <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                                  <input type="number" placeholder="+/- points" value={ratingDelta} onChange={e => setRatingDelta(e.target.value)}
                                    style={{ width: 100, padding: "6px 10px", background: "#111114", border: "1px solid #2a2a2e", borderRadius: 6, color: "#e0e0e0", fontSize: "0.76rem", fontFamily: "inherit", outline: "none" }} />
                                  <input placeholder="Reason (visible to player)" value={ratingNote} onChange={e => setRatingNote(e.target.value)}
                                    style={{ flex: 1, padding: "6px 10px", background: "#111114", border: "1px solid #2a2a2e", borderRadius: 6, color: "#e0e0e0", fontSize: "0.76rem", fontFamily: "inherit", outline: "none" }} />
                                  <button onClick={() => adjustRating(p.uid)} disabled={ratingAdjusting || !ratingDelta}
                                    style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: ratingDelta && parseInt(ratingDelta) > 0 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.15)", color: ratingDelta && parseInt(ratingDelta) > 0 ? "#6fcf8a" : "#d07070", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                                    {ratingAdjusting ? "..." : "Adjust"}
                                  </button>
                                </div>
                              )}
                            </div>

                            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                              <button onClick={() => saveEditPlayer(p.uid)} disabled={editSaving}
                                style={{ padding: "7px 20px", borderRadius: 8, border: "none", background: "#3B82F6", color: "#fff", fontSize: "0.76rem", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                                {editSaving ? "Saving..." : "Save Changes"}
                              </button>
                              <button onClick={() => { setRegEditUid(null); setRatingDelta(""); setRatingNote(""); }}
                                style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#888", fontSize: "0.76rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
                            {isSuperAdmin && (
                              <button onClick={() => startEditPlayer(p)}
                                style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid #3B82F6", background: "rgba(59,130,246,0.1)", color: "#3B82F6", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                                Edit Profile
                              </button>
                            )}
                            <a href={`/player/${p.uid}`} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: "0.72rem", color: "#888", fontWeight: 600, textDecoration: "none" }}>
                              View Public Profile &rarr;
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
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