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
  weekId: string;           // e.g. "2026-W09"
  name: string;
  type: SoloTournamentType;
  game: string;
  status: "upcoming" | "active" | "ended";
  prizePool: string;
  entry: string;            // "Free" or "₹199"
  entryFee: number;         // 0 or 199
  totalSlots: number;       // 50
  slotsBooked: number;
  weekStart: string;        // ISO string — Monday 00:00
  weekEnd: string;          // ISO string — Sunday 23:59
  registrationDeadline: string; // ISO string — Saturday 23:59
  createdAt: string;
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
  startTime: number;        // unix timestamp
  heroId: number;
};