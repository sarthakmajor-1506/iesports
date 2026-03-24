// ══════════════════════════════════════════════════════════════════════════════
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
