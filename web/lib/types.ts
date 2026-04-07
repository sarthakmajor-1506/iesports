export type Bracket = "herald_guardian" | "crusader_archon" | "legend_ancient" | "divine_immortal";

// Add these to your existing /lib/types.ts

export type SoloTournamentType = "free" | "paid";

export type BracketData = {
  slotsTotal: number;
  slotsBooked: number;
};

export type Tournament = {
  id: string;
  name: string;
  game: string;
  month: string;
  status: "upcoming" | "ongoing" | "ended";
  prizePool: string;
  entry: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
  totalSlots: number;
  slotsBooked: number;
  brackets: Record<Bracket, BracketData>;
  desc: string;
  rules: string[];
  format?: "shuffle" | "auction" | "standard";
  entryFee?: number;
  bannerImage?: string;
  schedule?: {
    registrationOpens?: string;
    registrationCloses?: string;
    squadCreation?: string;
    groupStageStart?: string;
    tourneyStageStart?: string;
  };
};

export type Team = {
  id: string;
  tournamentId: string;
  captainUid: string;
  members: string[];
  memberBrackets: Record<string, Bracket>;
  teamCode: string;
  status: "forming" | "full" | "confirmed";
  averageMMR?: number;
  bracket?: Bracket;
  createdAt: Date;
};

export type UserProfile = {
  uid: string;
  phone: string;
  steamId?: string;
  steamName?: string;
  steamAvatar?: string;
  dotaRankTier?: number;
  dotaBracket?: Bracket;
  dotaMMR?: number;
  smurfRiskScore?: number;
  rankFetchedAt?: Date;
};


export type SoloTournament = {
  id: string;
  weekId: string;
  name: string;
  type: SoloTournamentType;
  game: string;
  status: "upcoming" | "active" | "ended";
  prizePool: string;
  entry: string;
  entryFee: number;
  totalSlots: number;
  slotsBooked: number;
  weekStart: string;
  weekEnd: string;
  registrationDeadline: string;
  createdAt: string;
  // Add these 4 lines:
  createdAtUnix?: number;
  startTime?: number;
  registrationDeadlineUnix?: number;
  endTime?: number;
};

export type SoloPlayer = {
  uid: string;
  steamId: string;
  steamName: string;
  steamAvatar: string;
  cachedScore: number;
  cachedTopMatches: SoloMatchScore[];
  matchesPlayed: number;
  lastUpdated: string;
  smurfRiskScore: number;
  disqualified: boolean;
  disqualifyReason?: string;
};


export type SoloMatchScore = {
  matchId: number;
  score: number;
  kills: number;
  deaths: number;
  assists: number;
  lastHits: number;
  gpm: number;
  xpm: number;
  win: boolean;
  startTime: number;
  heroId: number;
  duration?: number;
  breakdown?: {          // ADD THIS
    killPts: number;
    assistPts: number;
    deathPts: number;
    lastHitPts: number;
    gpmPts: number;
    xpmPts: number;
    winBonus: number;
  };
};


// ══════════════════════════════════════════════════════════════════════════════
// VALORANT / RIOT TYPES
// Append everything below to the bottom of your existing web/lib/types.ts
//
// NAMING CONVENTION — all Valorant entities use different names from Dota 2:
//   Dota 2:   Bracket, Tournament, Team, SoloPlayer
//   Valorant: RiotBracket, ValorantTournament, ValorantTeam, ValorantSoloPlayer
//
// FIRESTORE COLLECTIONS — completely separate from Dota 2:
//   Dota 2:   "tournaments", "teams", "soloPool"
//   Valorant: "valorantTournaments", "valorantTeams",
//             "valorantTournaments/{id}/soloPlayers" (subcollection)
//
// USER DOC FIELDS — different prefix from Dota 2:
//   Dota 2:   steamId, dotaRankTier, dotaBracket, registeredTournaments
//   Valorant: riotGameName, riotTier, riotVerified, registeredValorantTournaments
//
// BRACKET SYSTEM — fundamentally different from Dota 2:
//   Dota 2:   Static bracket from rank tier (herald_guardian, crusader_archon, etc.)
//   Valorant: Dynamic quartile-based brackets computed POST-registration from
//             the actual distribution of registered players' riotTier values.
//             No bracket is assigned at registration time.
// ══════════════════════════════════════════════════════════════════════════════


// ── Riot user profile fields (stored on users/{uid} doc) ─────────────────────
export interface RiotProfile {
  riotGameName: string;
  riotTagLine: string;
  riotAvatar: string;           // card.small URL from Henrik API
  riotRank: string;             // e.g. "Diamond 3" — human-readable
  riotTier: number;             // Henrik API currenttier: 0=unranked, 3=Iron1 ... 27=Radiant
  riotVerified: "unlinked" | "pending" | "verified";
  riotScreenshotUrl?: string;   // Firebase Storage path for manual verification
  riotLinkedAt?: string;        // ISO timestamp
  riotPuuid?: string;           // Riot PUUID for future API calls
  riotPeakRank?: string;        // highest rank ever seen from Henrik API
  riotPeakTier?: number;        // highest tier ever seen (0-27)
  iesportsRating?: number;      // internal ELO rating (tier*100 scale, 300-2700)
  iesportsRank?: string;        // derived display rank (e.g. "Diamond 3")
  iesportsTier?: number;        // derived integer tier (0-27)
  iesportsMatchesPlayed?: number; // count of rated matches played
}


// ── Valorant bracket (S/A/B/C) — NOT the same as Dota Bracket type ──────────
// These are assigned POST-registration via quantile computation,
// never at registration time.
export type RiotBracket = "S" | "A" | "B" | "C";

/**
 * Computes quartile-based brackets from an array of registered players' riotTier values.
 *
 * How it works:
 * 1. Sort all players by riotTier descending (highest rank first)
 * 2. Split into 4 equal quartiles
 * 3. Top 25% = S, next 25% = A, next 25% = B, bottom 25% = C
 * 4. If players tie at a quartile boundary, they go into the higher bracket
 *
 * Returns a Map of uid → RiotBracket for every player.
 *
 * This is called AFTER registration closes, BEFORE the auction begins.
 * During registration, players have no bracket — only their raw riotTier is stored.
 */
export function computeValorantBrackets(
  players: { uid: string; riotTier: number }[]
): Map<string, RiotBracket> {
  const result = new Map<string, RiotBracket>();

  if (players.length === 0) return result;

  // Sort descending by riotTier (highest rank first)
  const sorted = [...players].sort((a, b) => b.riotTier - a.riotTier);

  const total = sorted.length;
  const q1 = Math.ceil(total * 0.25);   // top 25% cutoff index
  const q2 = Math.ceil(total * 0.50);   // top 50% cutoff index
  const q3 = Math.ceil(total * 0.75);   // top 75% cutoff index

  for (let i = 0; i < sorted.length; i++) {
    let bracket: RiotBracket;
    if (i < q1)      bracket = "S";
    else if (i < q2) bracket = "A";
    else if (i < q3) bracket = "B";
    else              bracket = "C";

    result.set(sorted[i].uid, bracket);
  }

  return result;
}

/**
 * Captain budget for the auction format, keyed by RiotBracket.
 * Higher bracket (better rank) → lower budget (balancing mechanism).
 * Applied AFTER brackets are computed post-registration.
 */
export const VALORANT_CAPTAIN_BUDGETS: Record<RiotBracket, number> = {
  S: 600,
  A: 750,
  B: 875,
  C: 1000,
};

/**
 * Minimum bid points by bracket for auction format.
 */
export const VALORANT_MIN_BID_POINTS: Record<RiotBracket, number> = {
  S: 150,
  A: 100,
  B: 60,
  C: 30,
};


// ── Valorant tournament (Firestore: "valorantTournaments/{id}") ──────────────
// NOT the same as the Dota `Tournament` type — different fields, different collection
export interface ValorantTournament {
  id: string;
  name: string;
  game: "valorant";                         // always "valorant"
  format: "auction" | "standard" | "shuffle";           // Dota doesn't have this
  status: "upcoming" | "active" | "ended";
  bracketsComputed: boolean;                // false during registration, true after admin computes
  isTestTournament?: boolean;               // admin-only visibility flag
  isDailyTournament?: boolean;
  registrationDeadline: string;             // ISO string
  startDate: string;
  endDate: string;
  totalSlots: number;
  slotsBooked: number;
  entryFee: number;
  prizePool: string;
  maxTeams?: number;                        // auction format: max team count
  minBidPoints?: Record<RiotBracket, number>;
  captainBudgets?: Record<RiotBracket, number>;
  sTierCapPerTeam?: number;                 // max S-tier players per team
  rules: string[];
  desc: string;
  // Populated AFTER bracket computation:
  bracketCutoffs?: {                        // stored for transparency / display
    sMinTier: number;                       // minimum riotTier to be in S
    aMinTier: number;                       // minimum riotTier to be in A
    bMinTier: number;                       // minimum riotTier to be in B
  };
  teamsGenerated?: boolean;
  teamCount?: number;
  swissRounds?: number;
  currentMatchDay?: number;
  schedule?: {
    registrationOpens: string;
    registrationCloses: string;
    squadCreation: string;
    groupStageStart: string;
    groupStageEnd: string;
    tourneyStageStart?: string;
    tourneyStageEnd?: string;
  };
  // Tournament structure / design fields (set at creation time)
  description?: string;
  bannerImage?: string;
  groupStageRounds?: number;
  matchesPerRound?: number;
  bracketFormat?: "double_elimination" | "single_elimination";
  bracketBestOf?: number;
  grandFinalBestOf?: number;
  eliminationBestOf?: number;
  bracketTeamCount?: number;
  shareImages?: {
    tagline?: string;
    highlightText?: string;
    defaultBg?: string;
    overviewBg?: string;
    registerBg?: string;
    teamsBg?: string;
    scheduleBg?: string;
    formatBg?: string;
  };
  // Preview / structure fields
  totalTeams?: number;
  playersPerTeam?: number;
  upperBracketTeams?: number;
  lowerBracketTeams?: number;
  dummyDataSeeded?: boolean;
  championTeamId?: string;
  championTeamName?: string;
}


// ── Valorant team (Firestore: "valorantTeams/{id}") ──────────────────────────
// NOT the same as the Dota `Team` type — uses RiotBracket, not Bracket
export interface ValorantTeam {
  id: string;
  tournamentId: string;                     // references valorantTournaments/{id}
  captainUid: string;
  captainRiotGameName: string;
  captainRiotTagLine: string;
  captainBracket: RiotBracket;              // assigned post-registration
  captainBudget: number;                    // derived from captainBracket
  members: string[];                        // array of UIDs
  memberBrackets: Record<string, RiotBracket>;  // assigned post-registration
  teamCode: string;
  status: "forming" | "full" | "confirmed";
  sTierCount: number;                       // how many S-tier players on this team
  createdAt: Date;
}


// ── Valorant solo/registered player ──────────────────────────────────────────
// Firestore: "valorantTournaments/{id}/soloPlayers/{uid}"
// NOT the same as Dota `SoloPlayer` — uses Riot fields, not Steam fields
//
// NOTE: `bracket` is null/undefined at registration time.
// It is populated AFTER registration closes via computeValorantBrackets().
export interface ValorantSoloPlayer {
  uid: string;
  riotGameName: string;
  riotTagLine: string;
  riotAvatar: string;
  riotRank: string;                         // human-readable, e.g. "Diamond 3"
  riotTier: number;                         // raw tier number for sorting/quartile computation
  bracket?: RiotBracket | null;             // null during registration, assigned post-reg
  registeredAt: string;                     // ISO timestamp
}// ══════════════════════════════════════════════════════════════════════════════
// SHUFFLE TOURNAMENT TYPES
// Append everything below to the bottom of your existing web/lib/types.ts
// ══════════════════════════════════════════════════════════════════════════════

// ── Skill level mapping for Valorant shuffle format ──────────────────────────
// Used by keamk-style balanced team generation
export const VALORANT_SKILL_LEVELS: Record<string, number> = {
  "Iron": 1,
  "Bronze": 1,
  "Silver": 1,
  "Gold": 1,
  "Platinum": 2,
  "Diamond": 3,
  "Ascendant": 4,
  "Immortal": 5,
  "Radiant": 5,
};

/**
 * Extracts skill level (1-5) from a human-readable rank string like "Diamond 3".
 * Falls back to 1 if rank is unrecognized.
 */
export function getSkillLevel(riotRank: string): number {
  if (!riotRank) return 1;
  const baseTier = riotRank.split(" ")[0]; // "Diamond 3" → "Diamond"
  return VALORANT_SKILL_LEVELS[baseTier] ?? 1;
}

/**
 * Balanced shuffle algorithm — snake draft by skill level.
 *
 * How it works:
 * 1. Sort all players by skillLevel descending (best first)
 * 2. Distribute via snake draft: round 1 → teams 1,2,3,...N
 *    round 2 → teams N,...,3,2,1 (reversed), round 3 → forward again, etc.
 * 3. This ensures each team gets a fair mix of skill levels.
 *
 * Same approach as keamk.com "Skill Level" mode.
 */
export function shuffleTeams(
  players: { uid: string; riotGameName: string; riotTagLine: string; riotAvatar: string; riotRank: string; riotTier: number; skillLevel: number }[],
  teamCount: number
): ShuffleTeamResult[] {
  if (players.length === 0 || teamCount <= 0) return [];

  // Sort by skill level descending (ties broken by riotTier descending)
  const sorted = [...players].sort((a, b) => {
    if (b.skillLevel !== a.skillLevel) return b.skillLevel - a.skillLevel;
    return b.riotTier - a.riotTier;
  });

  // Initialize teams
  const teams: ShuffleTeamResult[] = Array.from({ length: teamCount }, (_, i) => ({
    teamIndex: i + 1,
    teamName: `Team ${i + 1}`,
    members: [],
    avgSkillLevel: 0,
    totalSkillLevel: 0,
  }));

  // Snake draft
  let forward = true;
  let teamIdx = 0;

  for (const player of sorted) {
    teams[teamIdx].members.push(player);
    teams[teamIdx].totalSkillLevel += player.skillLevel;

    if (forward) {
      teamIdx++;
      if (teamIdx >= teamCount) { teamIdx = teamCount - 1; forward = false; }
    } else {
      teamIdx--;
      if (teamIdx < 0) { teamIdx = 0; forward = true; }
    }
  }

  // Compute averages
  for (const team of teams) {
    team.avgSkillLevel = team.members.length > 0
      ? Math.round((team.totalSkillLevel / team.members.length) * 100) / 100
      : 0;
  }

  return teams;
}

export interface ShuffleTeamResult {
  teamIndex: number;
  teamName: string;
  members: {
    uid: string;
    riotGameName: string;
    riotTagLine: string;
    riotAvatar: string;
    riotRank: string;
    riotTier: number;
    skillLevel: number;
  }[];
  avgSkillLevel: number;
  totalSkillLevel: number;
}

// ── Swiss format types ───────────────────────────────────────────────────────

export interface SwissMatch {
  id: string;
  tournamentId: string;
  matchDay: number;              // 1, 2, 3, 4, 5
  team1Id: string;
  team2Id: string;
  team1Name: string;
  team2Name: string;
  team1Score: number;            // 0, 1, or 2 (BO2: maps won)
  team2Score: number;
  status: "pending" | "live" | "completed";
  lobbyName?: string;
  lobbyPassword?: string;
  matchId?: string;              // Valorant match ID for API fetch
  completedAt?: string;
  createdAt: string;
}

export interface SwissStanding {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;                  // 2-0 results
  draws: number;                 // 1-1 results
  losses: number;                // 0-2 results
  points: number;                // W=2, D=1, L=0
  buchholz: number;              // sum of opponents' points (tiebreaker)
  mapsWon: number;
  mapsLost: number;
}

// ── Shuffle tournament team (stored in Firestore) ────────────────────────────
export interface ShuffleTeam {
  id: string;
  tournamentId: string;
  teamIndex: number;
  teamName: string;
  members: {
    uid: string;
    riotGameName: string;
    riotTagLine: string;
    riotAvatar: string;
    riotRank: string;
    riotTier: number;
    skillLevel: number;
  }[];
  avgSkillLevel: number;
  createdAt: string;
}

// Update ValorantTournament format to include "shuffle"
// In your existing ValorantTournament interface, change:
//   format: "auction" | "standard";
// to:
//   format: "auction" | "standard" | "shuffle";
//
// Also add these optional fields:
//   teamsGenerated?: boolean;
//   teamCount?: number;
//   swissRounds?: number;
//   currentMatchDay?: number;
//   schedule?: {
//     registrationOpens: string;
//     registrationCloses: string;
//     squadCreation: string;
//     groupStageStart: string;
//     groupStageEnd: string;
//     tourneyStageStart?: string;
//     tourneyStageEnd?: string;
//   };


// ══════════════════════════════════════════════════════════════════════════════
// IESPORTS RANKING SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

/** A single entry in a player's rank history (users/{uid}/rankHistory/{autoId}) */
export interface RankHistoryEntry {
  timestamp: string;           // ISO timestamp
  type: "seed" | "match" | "riot_refresh" | "admin_override";
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  // match details (type === "match")
  matchId?: string;
  tournamentId?: string;
  tournamentName?: string;
  teamName?: string;
  opponentTeamName?: string;
  result?: "win" | "draw" | "loss";
  mapScore?: string;           // e.g. "2-0"
  opponentAvgRating?: number;
  // riot refresh details (type === "riot_refresh")
  riotRankBefore?: string;
  riotRankAfter?: string;
  riotTierBefore?: number;
  riotTierAfter?: number;
  // admin override details (type === "admin_override")
  adminNote?: string;
}
