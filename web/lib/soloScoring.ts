// /lib/soloScoring.ts

import { SoloMatchScore } from "./types";

// ── Prize distribution (% of total prize pool per rank) ─────────────────────
// Ranks 1–50. Total sums to 100%.
// Structured as: top earners get meaningful prizes, tail gets participation amounts.
export const PRIZE_DISTRIBUTION: Record<number, number> = {
  1:  10.0,
  2:  7.0,
  3:  5.0,
  4:  4.0,
  5:  3.5,
  6:  3.0,
  7:  2.5,
  8:  2.0,
  9:  1.8,
  10: 1.6,
  11: 1.5,
  12: 1.4,
  13: 1.3,
  14: 1.2,
  15: 1.1,
  16: 1.0,
  17: 1.0,
  18: 1.0,
  19: 0.9,
  20: 0.9,
  21: 0.8,
  22: 0.8,
  23: 0.8,
  24: 0.7,
  25: 0.7,
  26: 0.7,
  27: 0.6,
  28: 0.6,
  29: 0.6,
  30: 0.6,
  31: 0.5,
  32: 0.5,
  33: 0.5,
  34: 0.5,
  35: 0.5,
  36: 0.4,
  37: 0.4,
  38: 0.4,
  39: 0.4,
  40: 0.4,
  41: 0.3,
  42: 0.3,
  43: 0.3,
  44: 0.3,
  45: 0.3,
  46: 0.2,
  47: 0.2,
  48: 0.2,
  49: 0.2,
  50: 0.2,
};
// Sum = 10+7+5+4+3.5+3+2.5+2+1.8+1.6 + (1.5+1.4+1.3+1.2+1.1+1+1+1+0.9+0.9)
//     + (0.8*3+0.7*2+0.7+0.6*4) + (0.5*5+0.4*5+0.3*5+0.2*5) = 100%

/**
 * Given the raw prize pool string (e.g. "₹10,000") and a rank (1-based),
 * returns a formatted prize string like "₹1,000" or null if rank > 50.
 */
export function getPrizeForRank(prizePoolStr: string, rank: number): string | null {
  const pct = PRIZE_DISTRIBUTION[rank];
  if (!pct) return null;

  // Extract numeric value — strip currency symbols, commas, spaces
  const numeric = parseFloat(prizePoolStr.replace(/[^0-9.]/g, ""));
  if (isNaN(numeric)) return null;

  const amount = Math.round((numeric * pct) / 100);

  // Detect currency prefix (₹, $, etc.)
  const prefix = prizePoolStr.match(/^[^0-9]*/)?.[0] || "₹";

  return `${prefix}${amount.toLocaleString("en-IN")}`;
}

// ── Match scoring ─────────────────────────────────────────────────────────────
export function scoreMatch(match: any): SoloMatchScore {
  const win = match.radiant_win === (match.player_slot < 128);

  const killPts      = (match.kills || 0) * 3;
  const assistPts    = (match.assists || 0) * 1;
  const deathPts     = (match.deaths || 0) * -2;
  const lastHitPts   = Math.floor((match.last_hits || 0) / 10);
  const gpmPts       = Math.floor((match.gold_per_min || 0) / 50);
  const xpmPts       = Math.floor((match.xp_per_min || 0) / 50);
  const winBonus     = win ? 20 : 0;

  const raw = killPts + assistPts + deathPts + lastHitPts + gpmPts + xpmPts + winBonus;

  return {
    matchId:    match.match_id,
    score:      Math.max(raw, 0),
    kills:      match.kills       || 0,
    deaths:     match.deaths      || 0,
    assists:    match.assists     || 0,
    lastHits:   match.last_hits   || 0,
    gpm:        match.gold_per_min || 0,
    xpm:        match.xp_per_min  || 0,
    duration:   match.duration    || 0,
    win,
    startTime:  match.start_time  || 0,   // unix seconds
    heroId:     match.hero_id     || 0,

    // Store breakdown so UI can display it without recomputing
    breakdown: {
      killPts,
      assistPts,
      deathPts,
      lastHitPts,
      gpmPts,
      xpmPts,
      winBonus,
    },
  };
}

export function calculatePlayerScore(
  matches: any[],
  tournamentStartTime: number,  // unix seconds — when the player registered
  tournamentEndTime: number     // unix seconds — when the tournament ends
): { totalScore: number; topMatches: SoloMatchScore[]; matchesPlayed: number } {
  const validMatches = matches.filter((m) => {
    const t = m.start_time || 0;
    return t >= tournamentStartTime && t <= tournamentEndTime;
  });

  if (validMatches.length === 0) {
    return { totalScore: 0, topMatches: [], matchesPlayed: 0 };
  }

  const scored = validMatches.map(scoreMatch);
  const sorted = scored.sort((a, b) => b.score - a.score);
  const top5   = sorted.slice(0, 5);
  const totalScore = top5.reduce((sum, m) => sum + m.score, 0);

  return { totalScore, topMatches: top5, matchesPlayed: validMatches.length };
}