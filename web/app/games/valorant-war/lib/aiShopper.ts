// Roughly-balanced AI buying logic. Pure function.
// Strategy:
//   1. Fill roster to MIN_FILL_TARGET (3) if affordable, then opportunistically up to 5.
//   2. With remaining gold (target ~75% spend), upgrade in priority:
//      a. Weapon: pick highest-affordable for agent with lowest current weapon damage.
//      b. Armor: same — upgrade lowest-armor agent.
//      c. Utility: fill empty utility slot with random affordable utility.
//   3. Stop when nothing more is affordable or after 12 iterations.
import type { TeamState, AgentSlot } from '../data/types';
import { AGENTS } from '../data/agents';
import { WEAPONS, getWeapon } from '../data/weapons';
import { ARMORS, getArmor } from '../data/armors';
import { UTILITIES } from '../data/utilities';
import type { RNG } from './rng';
import { pick } from './rng';

const MAX_ROSTER = 5;
const MIN_FILL_TARGET = 3;
const SPEND_TARGET_PCT = 75;

export function aiShop(team: TeamState, rng: RNG): TeamState {
  const working: TeamState = { gold: team.gold, roster: team.roster.map(s => ({ ...s })) };

  const ownedIds = () => new Set(working.roster.map(s => s.agentId));

  while (working.roster.length < MIN_FILL_TARGET) {
    const candidates = AGENTS.filter(a => !ownedIds().has(a.id) && a.cost <= working.gold);
    if (candidates.length === 0) break;
    const a = pick(rng, candidates);
    working.roster.push({ agentId: a.id, weaponId: 'classic', armorId: 'none', utilityId: null, zone: null, ultUsed: false });
    working.gold -= a.cost;
  }

  while (working.roster.length < MAX_ROSTER && working.gold >= 600) {
    const candidates = AGENTS.filter(a => !ownedIds().has(a.id) && a.cost <= working.gold * 0.4);
    if (candidates.length === 0) break;
    const a = pick(rng, candidates);
    working.roster.push({ agentId: a.id, weaponId: 'classic', armorId: 'none', utilityId: null, zone: null, ultUsed: false });
    working.gold -= a.cost;
  }

  const startGold = working.gold;
  const minHold = Math.floor((startGold * (100 - SPEND_TARGET_PCT)) / 100);

  for (let iter = 0; iter < 12; iter++) {
    if (working.gold <= minHold) break;
    const beforeGold = working.gold;

    const weakestWeapon = pickWeakestSlot(working.roster, 'weapon');
    if (weakestWeapon !== -1) {
      const current = getWeapon(working.roster[weakestWeapon].weaponId).damageBonus;
      const next = WEAPONS
        .filter(w => w.damageBonus > current && w.cost <= working.gold)
        .sort((a, b) => b.damageBonus - a.damageBonus)[0];
      if (next) {
        working.roster[weakestWeapon] = { ...working.roster[weakestWeapon], weaponId: next.id };
        working.gold -= next.cost;
        continue;
      }
    }

    const weakestArmor = pickWeakestSlot(working.roster, 'armor');
    if (weakestArmor !== -1) {
      const current = getArmor(working.roster[weakestArmor].armorId).hpBonus;
      const next = ARMORS
        .filter(a => a.hpBonus > current && a.cost <= working.gold)
        .sort((a, b) => b.hpBonus - a.hpBonus)[0];
      if (next) {
        working.roster[weakestArmor] = { ...working.roster[weakestArmor], armorId: next.id };
        working.gold -= next.cost;
        continue;
      }
    }

    const emptyUtilIdx = working.roster.findIndex(s => s.utilityId === null);
    if (emptyUtilIdx !== -1) {
      const affordable = UTILITIES.filter(u => u.cost <= working.gold);
      if (affordable.length > 0) {
        const u = pick(rng, affordable);
        working.roster[emptyUtilIdx] = { ...working.roster[emptyUtilIdx], utilityId: u.id };
        working.gold -= u.cost;
        continue;
      }
    }

    if (working.gold === beforeGold) break;
  }

  return working;
}

function pickWeakestSlot(roster: AgentSlot[], kind: 'weapon' | 'armor'): number {
  if (roster.length === 0) return -1;
  let weakestIdx = 0;
  let weakestVal = kind === 'weapon'
    ? getWeapon(roster[0].weaponId).damageBonus
    : getArmor(roster[0].armorId).hpBonus;
  for (let i = 1; i < roster.length; i++) {
    const v = kind === 'weapon'
      ? getWeapon(roster[i].weaponId).damageBonus
      : getArmor(roster[i].armorId).hpBonus;
    if (v < weakestVal) { weakestVal = v; weakestIdx = i; }
  }
  return weakestIdx;
}
