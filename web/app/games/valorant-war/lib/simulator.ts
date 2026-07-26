// v2: zone-based, multi-on-one, no tick cap (safety valve at 30).
// Mechanics:
//   - Every alive agent shoots at the lowest-HP opposing agent in their SAME zone each tick.
//   - Multiple attackers in the same zone all focus-fire the weakest defender (drama).
//   - Attackers (one team) advance toward focusSite by 1 zone/tick if not already there.
//   - Defenders never move.
//   - Round ends when one side is fully eliminated, or 30 ticks (tie).
//   - HP fully resets each round; abilities still fire (every other round, plus turret_passive every round).

import type {
  AgentSlot, TeamState, BattleEvent, RoundResult, Side, RoundOutcome, TeamRole,
} from '../data/types';
import { Zone, nextZoneToward } from '../data/zones';
import { getAgent } from '../data/agents';
import { getWeapon } from '../data/weapons';
import { getArmor } from '../data/armors';
import { getUtility } from '../data/utilities';
import type { RNG } from './rng';
import { chance, pick } from './rng';

// Hard cap as a runaway-loop safety. Reaching this in practice is virtually
// impossible because we force-converge agents after STALEMATE_TICKS of zero
// damage. Tie outcome NEVER fires from a regular path — only the HP-tiebreak
// emergency path can land us back on a side after MAX_TICKS, never on tie.
const MAX_TICKS = 200;
const STALEMATE_TICKS = 6;  // ticks of zero damage before forcing converge

interface FighterRuntime {
  side: Side;
  slotIdx: number;
  agentId: string;
  zone: Zone;
  homeZone: Zone;
  hp: number;
  maxHp: number;
  baseDamage: number;
  weaponDamageBonus: number;
  weaponFlashBlocked: boolean;
  dodgePct: number;
  flashedFirstAttack: boolean;
  damageReduction: number;
  hitBonus: number;
  // v9 utility effects
  reconDamagePct: number;       // +% damage when shooting same-zone enemies
  stimTeamPct: number;          // +% damage for team while in same zone as this agent
  wallShield: boolean;          // blocks ONE incoming attack
  tripWireArmed: boolean;       // first enemy entering this zone gets damaged + flashed
  // v9 ultimate-related
  ultUsed: boolean;
  lockdownUntilTick: number;    // can't attack until this tick number passes
  // mid-round scheduled heal (Heal Pack mid-round +20)
  midRoundHealAt: number;       // tick number to heal; 0 = none scheduled
  midRoundHealAmount: number;
}

function buildFighter(side: Side, slotIdx: number, slot: AgentSlot): FighterRuntime {
  const agent = getAgent(slot.agentId);
  const weapon = getWeapon(slot.weaponId);
  const armor = getArmor(slot.armorId);
  const utility = slot.utilityId ? getUtility(slot.utilityId) : null;

  let maxHp = agent.baseHp + armor.hpBonus;
  if (utility?.effect === 'heal_30') maxHp += 30;

  if (slot.zone == null) {
    throw new Error(`Agent ${slot.agentId} (slot ${slotIdx}, ${side}) has no zone set`);
  }

  return {
    side, slotIdx,
    agentId: agent.id,
    zone: slot.zone,
    homeZone: slot.zone,
    hp: maxHp,
    maxHp,
    baseDamage: agent.baseDamage,
    weaponDamageBonus: weapon.damageBonus,
    weaponFlashBlocked: weapon.flashBlocked,
    dodgePct: utility?.effect === 'dodge_30' ? 30 : 0,
    flashedFirstAttack: false,
    damageReduction: 0,
    hitBonus: 0,
    reconDamagePct: utility?.effect === 'recon_dmg_30' ? 30 : 0,
    stimTeamPct: utility?.effect === 'stim_team_15' ? 15 : 0,
    wallShield: utility?.effect === 'wall_block_1',
    tripWireArmed: utility?.effect === 'trip_first',
    ultUsed: slot.ultUsed,
    lockdownUntilTick: 0,
    midRoundHealAt: utility?.effect === 'heal_30' ? 4 : 0,
    midRoundHealAmount: utility?.effect === 'heal_30' ? 20 : 0,
  };
}

function applyAbilities(
  roundNumber: number,
  player: FighterRuntime[],
  ai: FighterRuntime[],
  events: BattleEvent[],
): void {
  const everyOther = roundNumber % 2 === 0;

  function fireFor(team: FighterRuntime[], opposing: FighterRuntime[]) {
    for (const f of team) {
      const agent = getAgent(f.agentId);
      const isPassive = agent.abilityKind === 'turret_passive';
      if (!isPassive && !everyOther) continue;

      // Find ONE opposing agent in same zone (lowest HP)
      const sameZoneOpposing = opposing.filter(o => o.zone === f.zone && o.hp > 0);
      const target = sameZoneOpposing.length === 0
        ? null
        : sameZoneOpposing.reduce((lo, t) => (t.hp < lo.hp ? t : lo), sameZoneOpposing[0]);

      events.push({
        type: 'ability',
        side: f.side, slotIdx: f.slotIdx,
        agentId: f.agentId, abilityName: agent.abilityName,
      });

      switch (agent.abilityKind) {
        case 'aoe_damage':
        case 'turret_passive':
          if (target) target.hp = Math.max(0, target.hp - agent.abilityValue);
          break;
        case 'dodge_buff':
          f.dodgePct = Math.min(95, f.dodgePct + agent.abilityValue);
          break;
        case 'recon':
          for (const t of team) t.hitBonus = Math.min(50, t.hitBonus + agent.abilityValue);
          break;
        case 'flash':
          if (target) target.flashedFirstAttack = true;
          break;
        case 'damage_reduction':
          if (target) {
            target.damageReduction = Math.min(80, target.damageReduction + agent.abilityValue);
          }
          break;
        case 'heal_lowest': {
          if (team.length === 0) break;
          let lowest = team[0];
          for (const t of team) if (t.hp < lowest.hp) lowest = t;
          lowest.hp = Math.min(lowest.maxHp, lowest.hp + agent.abilityValue);
          break;
        }
      }
    }
  }

  fireFor(player, ai);
  fireFor(ai, player);
}

function applyOutgoingUtilities(
  playerSlots: AgentSlot[], aiSlots: AgentSlot[],
  player: FighterRuntime[], ai: FighterRuntime[],
  events: BattleEvent[],
): void {
  // Round-start utilities that affect opposing same-zone agents:
  //   - flash_zone: ALL opposing same-zone agents miss first attack
  //   - frag_25:    deal 25 damage to all opposing in same zone
  function applyFor(slots: AgentSlot[], team: FighterRuntime[], opposing: FighterRuntime[]) {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot.utilityId) continue;
      const eff = getUtility(slot.utilityId).effect;
      if (eff !== 'flash_zone' && eff !== 'frag_25') continue;
      const me = team.find(f => f.slotIdx === i);
      if (!me) continue;
      const sameZone = opposing.filter(o => o.zone === me.zone && o.hp > 0);
      if (sameZone.length === 0) continue;
      if (eff === 'flash_zone') {
        for (const target of sameZone) target.flashedFirstAttack = true;
      } else if (eff === 'frag_25') {
        for (const target of sameZone) {
          const before = target.hp;
          target.hp = Math.max(0, target.hp - 25);
          events.push({
            type: 'attack',
            attacker: { side: me.side, slotIdx: me.slotIdx },
            defender: { side: target.side, slotIdx: target.slotIdx },
            zone: target.zone,
            damage: before - target.hp,
            missed: false,
            defenderHpAfter: target.hp,
          });
        }
      }
    }
  }
  applyFor(playerSlots, player, ai);
  applyFor(aiSlots, ai, player);
}

/**
 * Apply ultimate abilities at round start. Each agent's ult fires once per
 * match starting from round 4, IF the agent is alive at round start.
 * Returns the set of slot keys that used their ult this round (so caller can
 * persist `ultUsed=true` on those slots in the AgentSlot data).
 */
function applyUltimates(
  roundNumber: number,
  player: FighterRuntime[], ai: FighterRuntime[],
  events: BattleEvent[],
  rng: RNG,
): { player: Set<number>; ai: Set<number> } {
  const ULT_AVAILABLE_FROM_ROUND = 4;
  const playerUlted = new Set<number>();
  const aiUlted = new Set<number>();
  if (roundNumber < ULT_AVAILABLE_FROM_ROUND) return { player: playerUlted, ai: aiUlted };

  function fire(team: FighterRuntime[], opposing: FighterRuntime[], usedSet: Set<number>) {
    for (const f of team) {
      if (f.ultUsed) continue;
      if (f.hp <= 0) continue;
      const agent = getAgent(f.agentId);
      events.push({
        type: 'ultimate', side: f.side, slotIdx: f.slotIdx,
        agentId: f.agentId, ultName: agent.ultimateName,
        ultKind: agent.ultimateKind,
      });
      switch (agent.ultimateKind) {
        case 'revive_self':
          // Lazy revive: tracked client-side via ultimate event;
          // we DON'T pre-revive here. Instead, agent gets a "revive credit"
          // implemented via a buff: HP fully restored if killed this round.
          // Implemented as: set hp to maxHp now (small bonus) AND set midRoundHealAt
          // to revive on death.
          f.hp = f.maxHp;  // top up immediately as visual buff
          // Attach a flag via re-using midRoundHealAt with sentinel: impossible
          // here without extending the runtime. Simpler: heal full on round start —
          // not the literal Phoenix mechanic but visually impactful.
          break;
        case 'multi_strike_3': {
          // 3 instant strikes against random same-zone enemies
          for (let s = 0; s < 3; s++) {
            const targets = opposing.filter(o => o.hp > 0 && o.zone === f.zone);
            if (targets.length === 0) break;
            const t = targets[Math.floor(rng() * targets.length)];
            const before = t.hp;
            t.hp = Math.max(0, t.hp - agent.ultimateValue);
            events.push({
              type: 'attack',
              attacker: { side: f.side, slotIdx: f.slotIdx },
              defender: { side: t.side, slotIdx: t.slotIdx },
              zone: t.zone, damage: before - t.hp,
              missed: false, defenderHpAfter: t.hp,
            });
          }
          break;
        }
        case 'big_strike_70': {
          // Highest-HP same-zone enemy
          const sameZone = opposing.filter(o => o.hp > 0 && o.zone === f.zone);
          if (sameZone.length === 0) break;
          const t = sameZone.reduce((hi, x) => x.hp > hi.hp ? x : hi, sameZone[0]);
          const before = t.hp;
          t.hp = Math.max(0, t.hp - agent.ultimateValue);
          events.push({
            type: 'attack',
            attacker: { side: f.side, slotIdx: f.slotIdx },
            defender: { side: t.side, slotIdx: t.slotIdx },
            zone: t.zone, damage: before - t.hp,
            missed: false, defenderHpAfter: t.hp,
          });
          break;
        }
        case 'flash_all': {
          // ALL opposing agents on map miss their first attack
          for (const o of opposing) if (o.hp > 0) o.flashedFirstAttack = true;
          break;
        }
        case 'teleport_focus': {
          // Teleport to focus site (or Mid as fallback)
          // Since we don't have focusSite here, teleport to a random different zone
          const zones: Zone[] = ['A', 'B', 'C', 'Mid'];
          const others = zones.filter(z => z !== f.zone);
          const target = others[Math.floor(rng() * others.length)];
          events.push({
            type: 'move', side: f.side, slotIdx: f.slotIdx,
            from: f.zone, to: target,
          });
          f.zone = target;
          break;
        }
        case 'aoe_50': {
          // 50 damage to ALL opposing in same zone
          for (const t of opposing) {
            if (t.hp <= 0 || t.zone !== f.zone) continue;
            const before = t.hp;
            t.hp = Math.max(0, t.hp - agent.ultimateValue);
            events.push({
              type: 'attack',
              attacker: { side: f.side, slotIdx: f.slotIdx },
              defender: { side: t.side, slotIdx: t.slotIdx },
              zone: t.zone, damage: before - t.hp,
              missed: false, defenderHpAfter: t.hp,
            });
          }
          break;
        }
        case 'revive_ally': {
          // Revive the lowest-HP allied agent (potentially dead = hp 0)
          const fallen = team.filter(a => a !== f && a.hp === 0);
          let target = fallen[0];
          if (!target) {
            // No fallen — heal the lowest-HP ally instead
            const live = team.filter(a => a !== f && a.hp > 0);
            if (live.length === 0) break;
            target = live.reduce((lo, x) => x.hp < lo.hp ? x : lo, live[0]);
          }
          target.hp = agent.ultimateValue;
          events.push({
            type: 'revive', side: target.side, slotIdx: target.slotIdx,
            agentId: target.agentId, hp: agent.ultimateValue,
          });
          break;
        }
        case 'lockdown_2_ticks': {
          // All opposing same-zone agents skip the next 2 ticks
          for (const t of opposing) {
            if (t.hp > 0 && t.zone === f.zone) {
              t.lockdownUntilTick = 2;
            }
          }
          break;
        }
      }
      usedSet.add(f.slotIdx);
    }
  }

  fire(player, ai, playerUlted);
  fire(ai, player, aiUlted);
  return { player: playerUlted, ai: aiUlted };
}

// Site advantage: defenders on their assigned zone gain +25% damage reduction
// (representing pre-aimed angles, hold-and-react in real Valorant).
const SITE_ADVANTAGE_PCT = 25;

function attack(
  attacker: FighterRuntime,
  defender: FighterRuntime,
  attackerRole: TeamRole,
  attackerTeam: FighterRuntime[],
  rng: RNG,
  events: BattleEvent[],
): void {
  let missed = false;
  if (attacker.flashedFirstAttack) {
    missed = true;
    attacker.flashedFirstAttack = false;
  }

  const baseHit = 100 + attacker.hitBonus;
  const finalHit = Math.max(5, Math.min(99, baseHit - defender.dodgePct));
  if (!missed && !chance(rng, finalHit)) missed = true;

  let damage = 0;
  if (!missed) {
    let raw = attacker.baseDamage + attacker.weaponDamageBonus;
    // Recon damage buff: attacker has Recon Dart → +30% damage
    if (attacker.reconDamagePct > 0) raw *= (1 + attacker.reconDamagePct / 100);
    // Stim Beacon: any teammate in attacker's same zone with stimTeamPct gives team buff
    const stimTeammate = attackerTeam.find(
      t => t !== attacker && t.hp > 0 && t.zone === attacker.zone && t.stimTeamPct > 0
    );
    if (stimTeammate) raw *= (1 + stimTeammate.stimTeamPct / 100);

    let reductionPct = defender.damageReduction;
    if (attackerRole === 'attacker' && defender.zone === defender.homeZone) {
      reductionPct = Math.min(80, reductionPct + SITE_ADVANTAGE_PCT);
    }
    const reduced = raw * (1 - reductionPct / 100);
    damage = Math.max(1, Math.round(reduced));

    // Wall shield: blocks the entire attack (full negate, then consumed)
    if (defender.wallShield) {
      defender.wallShield = false;
      damage = 0;
      missed = true;
    } else {
      defender.hp = Math.max(0, defender.hp - damage);
    }
  }

  events.push({
    type: 'attack',
    attacker: { side: attacker.side, slotIdx: attacker.slotIdx },
    defender: { side: defender.side, slotIdx: defender.slotIdx },
    zone: defender.zone,
    damage,
    missed,
    defenderHpAfter: defender.hp,
  });
}

/** Pick the lowest-HP target. RNG breaks ties. */
function pickTarget(rng: RNG, candidates: FighterRuntime[]): FighterRuntime | null {
  if (candidates.length === 0) return null;
  const minHp = Math.min(...candidates.map(c => c.hp));
  const lowest = candidates.filter(c => c.hp === minHp);
  return lowest.length === 1 ? lowest[0] : pick(rng, lowest);
}

export function simulateRound(
  player: TeamState,
  ai: TeamState,
  roundNumber: number,
  map: string,
  rng: RNG,
  playerRole: TeamRole,
  focusSite: Zone | null,
): RoundResult {
  const events: BattleEvent[] = [];

  const playerFighters = player.roster.map((s, i) => buildFighter('player', i, s));
  const aiFighters     = ai.roster.map((s, i) => buildFighter('ai', i, s));

  events.push({ type: 'round_start', roundNumber, map });

  applyAbilities(roundNumber, playerFighters, aiFighters, events);
  applyOutgoingUtilities(player.roster, ai.roster, playerFighters, aiFighters, events);
  const ulted = applyUltimates(roundNumber, playerFighters, aiFighters, events, rng);

  // Emit eliminations from AoE before combat starts
  for (const f of [...playerFighters, ...aiFighters]) {
    if (f.hp === 0) {
      events.push({ type: 'eliminate', side: f.side, slotIdx: f.slotIdx, agentId: f.agentId });
    }
  }

  // Determine which team is the attacker
  const attackerSide: Side = playerRole === 'attacker' ? 'player' : 'ai';
  const attackerFighters = attackerSide === 'player' ? playerFighters : aiFighters;
  const defenderFighters = attackerSide === 'player' ? aiFighters : playerFighters;

  let killCountsPlayer = 0;
  let killCountsAi = 0;
  let outcome: RoundOutcome | null = null;
  let ticksSinceDamage = 0;
  let convergeZone: Zone | null = null;

  // Crossfire limit: max attackers that can effectively target the same defender
  // per tick (others must pick a different target or skip).
  const CROSSFIRE_LIMIT = 2;

  for (let tick = 1; tick <= MAX_TICKS; tick++) {
    const playerAlive = playerFighters.some(f => f.hp > 0);
    const aiAlive = aiFighters.some(f => f.hp > 0);
    if (!playerAlive || !aiAlive) {
      outcome = !playerAlive ? 'ai' : 'player';
      break;
    }

    events.push({ type: 'tick_start', tick });

    if (ticksSinceDamage >= STALEMATE_TICKS && !convergeZone) {
      convergeZone = focusSite ?? 'Mid';
    }

    // Phase 1: movement
    // - STAY-AND-CLEAR (v12): any agent with a live opposing agent in their
    //   current zone stays put and engages. They don't leave an active fight.
    //   This applies to BOTH attackers and defenders. Convergence overrides
    //   (safety valve so rounds always resolve).
    // - Attackers advance toward focusSite when their zone is clear.
    // - Defenders rotate toward the largest attacker stack when their zone is clear.
    // - Convergence: when stalemate hits, ALL alive agents walk to convergeZone.

    // Determine biggest attacker stack zone (for defender rotation)
    const attackerCountByZone: Record<string, number> = {};
    for (const f of attackerFighters) {
      if (f.hp <= 0) continue;
      attackerCountByZone[f.zone] = (attackerCountByZone[f.zone] ?? 0) + 1;
    }
    let biggestStackZone: Zone | null = null;
    let biggestStackCount = 0;
    for (const z of Object.keys(attackerCountByZone) as Zone[]) {
      if (attackerCountByZone[z] > biggestStackCount) {
        biggestStackCount = attackerCountByZone[z];
        biggestStackZone = z;
      }
    }
    const rotateTowardZone = biggestStackCount >= 2 ? biggestStackZone : null;

    for (const f of [...playerFighters, ...aiFighters]) {
      if (f.hp <= 0) continue;

      // Stay-and-clear: if any live enemy is in this agent's zone, don't move.
      // (Convergence overrides this so we don't deadlock.)
      const sameZoneEnemies = (f.side === 'player' ? aiFighters : playerFighters)
        .filter(o => o.hp > 0 && o.zone === f.zone).length;
      const lockedByEngagement = sameZoneEnemies > 0 && !convergeZone;
      if (lockedByEngagement) continue;

      let target: Zone | null = null;
      if (convergeZone) {
        target = convergeZone;
      } else if (attackerFighters.includes(f)) {
        target = focusSite;
      } else {
        // Defender: rotate ONLY when current zone has no attackers AND a bigger
        // stack exists elsewhere. (We already passed the same-zone-clear check
        // above, but keep this for the rotateTowardZone heuristic.)
        if (rotateTowardZone && rotateTowardZone !== f.zone) {
          target = rotateTowardZone;
        }
      }
      if (!target || f.zone === target) continue;
      const nextZ = nextZoneToward(f.zone, target);
      if (nextZ && nextZ !== f.zone) {
        events.push({
          type: 'move',
          side: f.side, slotIdx: f.slotIdx,
          from: f.zone, to: nextZ,
        });
        f.zone = nextZ;
      }
    }

    // Phase 2: engagements per zone with CROSSFIRE LIMIT.
    const allFighters = [...playerFighters, ...aiFighters].filter(f => f.hp > 0);
    const shotOrder = [...allFighters];
    for (let i = shotOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shotOrder[i], shotOrder[j]] = [shotOrder[j], shotOrder[i]];
    }

    // Track shots-on-target per defender to enforce crossfire limit
    const shotsOnTarget: Map<string, number> = new Map();
    const targetKey = (f: FighterRuntime) => `${f.side}-${f.slotIdx}`;

    const newlyEliminated: FighterRuntime[] = [];
    let damageThisTick = 0;

    // Mid-round heal scheduled by Heal Pack
    for (const f of [...playerFighters, ...aiFighters]) {
      if (f.midRoundHealAt > 0 && tick === f.midRoundHealAt && f.hp > 0) {
        f.hp = Math.min(f.maxHp, f.hp + f.midRoundHealAmount);
        f.midRoundHealAt = 0;
      }
    }

    for (const shooter of shotOrder) {
      if (shooter.hp <= 0) continue;
      // Lockdown skip
      if (shooter.lockdownUntilTick > 0) {
        shooter.lockdownUntilTick--;
        continue;
      }
      const opposingInZone = (shooter.side === 'player' ? aiFighters : playerFighters)
        .filter(o => o.hp > 0 && o.zone === shooter.zone);
      if (opposingInZone.length === 0) continue;

      const availableTargets = opposingInZone.filter(t =>
        (shotsOnTarget.get(targetKey(t)) ?? 0) < CROSSFIRE_LIMIT
      );
      const candidates = availableTargets.length > 0 ? availableTargets : opposingInZone;
      const target = pickTarget(rng, candidates);
      if (!target) continue;

      shotsOnTarget.set(targetKey(target), (shotsOnTarget.get(targetKey(target)) ?? 0) + 1);

      const hpBefore = target.hp;
      const shooterRole: TeamRole =
        shooter.side === attackerSide ? 'attacker' : 'defender';
      const shooterTeam = shooter.side === 'player' ? playerFighters : aiFighters;
      attack(shooter, target, shooterRole, shooterTeam, rng, events);
      damageThisTick += (hpBefore - target.hp);
      if (hpBefore > 0 && target.hp === 0) newlyEliminated.push(target);
    }

    for (const elim of newlyEliminated) {
      events.push({
        type: 'eliminate',
        side: elim.side, slotIdx: elim.slotIdx, agentId: elim.agentId,
      });
      if (elim.side === 'player') killCountsAi++;
      else killCountsPlayer++;
    }

    if (damageThisTick > 0) ticksSinceDamage = 0;
    else ticksSinceDamage++;
  }
  void defenderFighters;

  // Final survivor count for outcome
  const playerSurvivors = playerFighters.filter(f => f.hp > 0).length;
  const aiSurvivors     = aiFighters.filter(f => f.hp > 0).length;

  // Fight-to-death rule: never a tie. If the loop exited only because we hit
  // MAX_TICKS, decide by survivors first, then total remaining HP, then favor player.
  if (outcome == null) {
    if (playerSurvivors !== aiSurvivors) {
      outcome = playerSurvivors > aiSurvivors ? 'player' : 'ai';
    } else {
      const playerHp = playerFighters.reduce((s, f) => s + f.hp, 0);
      const aiHp = aiFighters.reduce((s, f) => s + f.hp, 0);
      outcome = playerHp >= aiHp ? 'player' : 'ai';
    }
  }

  events.push({
    type: 'round_end',
    winner: outcome,
    playerSurvivors, aiSurvivors,
    killCounts: { player: killCountsPlayer, ai: killCountsAi },
  });

  // Bake ult usage into the starting-roster snapshot so the renderer knows
  // which ults fired this round (visual styling)
  const playerSnap = player.roster.map((s, i) =>
    ulted.player.has(i) ? { ...s, ultUsed: true } : { ...s }
  );
  const aiSnap = ai.roster.map((s, i) =>
    ulted.ai.has(i) ? { ...s, ultUsed: true } : { ...s }
  );

  return {
    roundNumber,
    events,
    winner: outcome,
    killCounts: { player: killCountsPlayer, ai: killCountsAi },
    goldAwarded: { player: 0, ai: 0 },
    startingPlayerRoster: playerSnap,
    startingAiRoster: aiSnap,
    focusSite,
    playerRole,
  };
}
