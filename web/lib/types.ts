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
  duration?: number;  // ADD THIS
};