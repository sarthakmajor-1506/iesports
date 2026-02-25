// /lib/soloScoring.ts

import { SoloMatchScore } from "./types-addition";

export function scoreMatch(match: any): SoloMatchScore {
  const win = match.radiant_win === (match.player_slot < 128);
  const score =
    (match.kills || 0) * 3 +
    (match.assists || 0) * 1 +
    (match.deaths || 0) * -2 +
    Math.floor((match.last_hits || 0) / 10) +
    Math.floor((match.gold_per_min || 0) / 50) +
    Math.floor((match.xp_per_min || 0) / 50) +
    (win ? 20 : 0);

  return {
    matchId: match.match_id,
    score: Math.max(score, 0), // never go negative
    kills: match.kills || 0,
    deaths: match.deaths || 0,
    assists: match.assists || 0,
    lastHits: match.last_hits || 0,
    gpm: match.gold_per_min || 0,
    xpm: match.xp_per_min || 0,
    win,
    startTime: match.start_time || 0,
    heroId: match.hero_id || 0,
  };
}

export function calculatePlayerScore(
  matches: any[],
  tournamentStartTime: number  // unix timestamp
): { totalScore: number; topMatches: SoloMatchScore[]; matchesPlayed: number } {
  // Filter only matches played after tournament started
  const validMatches = matches.filter(
    (m) => (m.start_time || 0) >= tournamentStartTime
  );

  if (validMatches.length === 0) {
    return { totalScore: 0, topMatches: [], matchesPlayed: 0 };
  }

  // Score each match
  const scored = validMatches.map(scoreMatch);

  // Sort by score descending, take top 3
  const sorted = scored.sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);
  const totalScore = top3.reduce((sum, m) => sum + m.score, 0);

  return {
    totalScore,
    topMatches: top3,
    matchesPlayed: validMatches.length,
  };
}