// Valorant 2026 economy values:
//   Starting gold: 800
//   Round win:     +3000
//   Round loss:    +1900 / 2400 / 2900 (1st / 2nd / 3rd-or-more consecutive)
//   Per kill:      +200
//   Cap:           9000
import type { MatchState, RoundOutcome } from '../data/types';

export const STARTING_GOLD = 800;
export const ROUND_WIN_BONUS = 3000;
export const LOSS_BONUS_LADDER = [1900, 2400, 2900];
export const KILL_REWARD = 200;
export const GOLD_CAP = 9000;

export function lossBonusFor(consecutiveLosses: number): number {
  const idx = Math.min(consecutiveLosses, LOSS_BONUS_LADDER.length - 1);
  return LOSS_BONUS_LADDER[Math.max(0, idx)];
}

export function clampGold(g: number): number {
  return Math.max(0, Math.min(GOLD_CAP, g));
}

export function computeGoldAwards(
  outcome: RoundOutcome,
  killCounts: { player: number; ai: number },
  consecutiveLosses: { player: number; ai: number },
): { player: number; ai: number } {
  let player = killCounts.player * KILL_REWARD;
  let ai = killCounts.ai * KILL_REWARD;

  // Loss bonus uses the prior streak (1st loss = 1900, 2nd consecutive = 2400, 3rd+ = 2900).
  if (outcome === 'tie' || outcome === 'player') {
    player += ROUND_WIN_BONUS;
    ai += lossBonusFor(consecutiveLosses.ai);
  } else {
    ai += ROUND_WIN_BONUS;
    player += lossBonusFor(consecutiveLosses.player);
  }

  return { player, ai };
}

export function nextConsecutiveLosses(
  prev: { player: number; ai: number },
  outcome: RoundOutcome,
): { player: number; ai: number } {
  if (outcome === 'ai') {
    return { player: prev.player + 1, ai: 0 };
  }
  return { player: 0, ai: prev.ai + 1 };
}

export function applyGold(
  state: MatchState,
  awards: { player: number; ai: number },
): MatchState {
  return {
    ...state,
    player: { ...state.player, gold: clampGold(state.player.gold + awards.player) },
    ai:     { ...state.ai,     gold: clampGold(state.ai.gold     + awards.ai)     },
  };
}
