// AI auto-positioner. Pure function. Given an AI team and its role, returns
// the same team with each agent's `zone` set, plus a focus site if attacker.
//
// Strategy:
//   Defender: distribute agents across A/B/C, leaving ~1 on Mid for rotates.
//   Attacker: pick a focus site (random with slight weighting). Stack 60% of
//             roster on that site, scatter the rest across other sites + mid.
import type { AgentSlot, TeamState, TeamRole } from '../data/types';
import { Zone, SITES } from '../data/zones';
import type { RNG } from './rng';
import { pick } from './rng';

export function aiPosition(
  team: TeamState,
  role: TeamRole,
  rng: RNG,
): { team: TeamState; focusSite: Zone | null } {
  const roster: AgentSlot[] = team.roster.map(s => ({ ...s }));

  if (role === 'defender') {
    // Distribute round-robin across A, B, C, Mid (in that order)
    const defenderZones: Zone[] = ['A', 'B', 'C', 'Mid'];
    for (let i = 0; i < roster.length; i++) {
      roster[i].zone = defenderZones[i % defenderZones.length];
    }
    return {
      team: { gold: team.gold, roster },
      focusSite: null,
    };
  }

  // Attacker: pick focus site, stack ~60% there
  const focus: Zone = pick(rng, SITES);
  const numStacked = Math.max(1, Math.ceil(roster.length * 0.6));
  const otherZones: Zone[] = ['Mid', ...SITES.filter(s => s !== focus)];
  for (let i = 0; i < roster.length; i++) {
    if (i < numStacked) {
      roster[i].zone = focus;
    } else {
      roster[i].zone = otherZones[(i - numStacked) % otherZones.length];
    }
  }
  return {
    team: { gold: team.gold, roster },
    focusSite: focus,
  };
}
