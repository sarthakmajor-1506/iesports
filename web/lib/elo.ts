/**
 * IEsports ELO Rating System
 *
 * Rating scale: Valorant tier * 100
 *   Iron 1 (tier 3) = 300, Radiant (tier 27) = 2700
 *
 * K-factor: 50 (high volatility for small community with few games)
 *
 * How it works:
 * 1. Seed rating = avg(currentTier, peakTier) * 100
 * 2. After each match, adjust using ELO formula with asymmetric K
 * 3. Riot rank avg acts as a floor — rating can never drop below it
 */

// ── Tier ↔ Rank name mapping ────────────────────────────────────────────────

export const TIER_NAMES: Record<number, string> = {
  0: "Unranked",
  1: "Unranked",
  2: "Unranked",
  3: "Iron 1",
  4: "Iron 2",
  5: "Iron 3",
  6: "Bronze 1",
  7: "Bronze 2",
  8: "Bronze 3",
  9: "Silver 1",
  10: "Silver 2",
  11: "Silver 3",
  12: "Gold 1",
  13: "Gold 2",
  14: "Gold 3",
  15: "Platinum 1",
  16: "Platinum 2",
  17: "Platinum 3",
  18: "Diamond 1",
  19: "Diamond 2",
  20: "Diamond 3",
  21: "Ascendant 1",
  22: "Ascendant 2",
  23: "Ascendant 3",
  24: "Immortal 1",
  25: "Immortal 2",
  26: "Immortal 3",
  27: "Radiant",
};

// ── Conversion functions ────────────────────────────────────────────────────

/** Convert Valorant tier (0-27) to ELO rating */
export function tierToRating(tier: number): number {
  return Math.max(0, tier) * 100;
}

/** Convert ELO rating to Valorant tier (0-27) */
export function ratingToTier(rating: number): number {
  return Math.max(0, Math.min(27, Math.floor(rating / 100)));
}

/** Convert ELO rating to human-readable rank string (e.g. "Diamond 3") */
export function ratingToRank(rating: number): string {
  const tier = ratingToTier(rating);
  return TIER_NAMES[tier] || "Unranked";
}

// ── ELO calculation ─────────────────────────────────────────────────────────

const K = 50;

/** Standard ELO expected score: probability of winning given rating difference */
export function expectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

/**
 * Calculate new ELO rating after a game.
 *
 * K=50 symmetric (high volatility). Same magnitude for wins and losses.
 * Round differential multiplier: stomps (13-3) give/take more than close games (13-11).
 *   multiplier = 1 + roundDiff / 26
 *   13-3 (diff=10) → 1.38x | 13-11 (diff=2) → 1.08x | 13-0 (diff=13) → 1.50x
 *
 * @param playerRating - player's current rating
 * @param oppAvgRating - average rating of opposing team
 * @param result - game outcome for this player
 * @param roundDiff - absolute round differential (e.g. |13-3| = 10). 0 if unknown.
 * @returns { newRating, delta }
 */
export function calculateElo(
  playerRating: number,
  oppAvgRating: number,
  result: "win" | "draw" | "loss",
  roundDiff: number = 0,
): { newRating: number; delta: number } {
  // symmetric K for all results
  const roundMultiplier = 1 + Math.abs(roundDiff) / 26;
  const actual = result === "win" ? 1 : result === "draw" ? 0.5 : 0;
  const expected = expectedScore(playerRating, oppAvgRating);
  const delta = Math.round(K * roundMultiplier * (actual - expected));
  const newRating = Math.max(0, playerRating + delta);
  return { newRating, delta };
}

/**
 * Seed a player's initial IEsports rating from their Riot rank data.
 * Rating = avg(currentTier, peakTier) * 100
 */
export function seedRating(currentTier: number, peakTier: number): number {
  const avg = (currentTier + peakTier) / 2;
  return Math.round(avg * 100);
}

/**
 * Floor check: returns bumped rating if Riot avg exceeds current IEsports rating.
 * Returns null if no bump needed.
 */
export function floorCheck(
  currentRating: number,
  riotCurrentTier: number,
  riotPeakTier: number
): number | null {
  const floor = seedRating(riotCurrentTier, riotPeakTier);
  return floor > currentRating ? floor : null;
}
