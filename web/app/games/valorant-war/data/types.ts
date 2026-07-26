// All types specific to the Valorant Atomic War side game.
// Local to the game folder — additive (no edits to lib/types.ts).
import type { Zone } from './zones';

export type Role = 'duelist' | 'initiator' | 'controller' | 'sentinel';

export type AbilityKind =
  | 'aoe_damage'
  | 'dodge_buff'
  | 'recon'
  | 'flash'
  | 'damage_reduction'
  | 'heal_lowest'
  | 'turret_passive';

export type UltimateKind =
  | 'revive_self'         // Phoenix — revives at full HP if killed this round
  | 'multi_strike_3'      // Jett — 3 instant attacks against same-zone enemies
  | 'big_strike_70'       // Sova — single 70-damage shot at highest-HP enemy in same zone
  | 'flash_all'           // Skye — all enemies on map miss next 2 attacks
  | 'teleport_focus'      // Omen — teleports to focus site (defender → adjacent zone)
  | 'aoe_50'              // Brimstone — 50 damage to all enemies in same zone
  | 'revive_ally'         // Sage — revives a fallen ally at 60 HP
  | 'lockdown_2_ticks';   // Killjoy — same-zone enemies skip 2 ticks

export interface AgentDef {
  id: string;
  name: string;
  role: Role;
  cost: number;
  baseHp: number;
  baseDamage: number;
  abilityName: string;
  abilityKind: AbilityKind;
  abilityValue: number;
  ultimateName: string;
  ultimateKind: UltimateKind;
  ultimateValue: number;    // semantic depends on kind
  iconUrl: string;
}

export interface WeaponDef {
  id: string;
  name: string;
  cost: number;
  damageBonus: number;
  flashBlocked: boolean;
}

export interface ArmorDef {
  id: string;
  name: string;
  cost: number;
  hpBonus: number;
}

export type UtilityEffect =
  | 'dodge_30'         // Smoke: 30% dodge for the round
  | 'flash_zone'       // Flashbang: ALL opposing same-zone agents miss first attack
  | 'heal_30'          // Heal Pack: +30 max HP and heal +20 mid-round
  | 'recon_dmg_30'     // Recon Dart: +30% damage to opposing same-zone enemies
  | 'stim_team_15'     // Stim Beacon: +15% damage for whole team in same zone
  | 'frag_25'          // Frag: 25 damage to opposing same-zone agent at round start
  | 'wall_block_1'     // Barrier Wall: blocks the first incoming attack (full negate)
  | 'trip_first';      // Trip Wire: first enemy to enter zone takes 20 dmg + flashed

export interface UtilityDef {
  id: string;
  name: string;
  cost: number;
  effect: UtilityEffect;
}

export interface AgentSlot {
  agentId: string;
  weaponId: string;
  armorId: string;
  utilityId: string | null;
  zone: Zone | null;        // set during position phase, cleared at round start
  ultUsed: boolean;         // ultimate spent this match (one-shot per agent per match)
}

export interface TeamState {
  gold: number;
  roster: AgentSlot[];
}

export type MatchPhase = 'side_select' | 'shop' | 'position' | 'battle' | 'finished';
export type MatchStatus = 'in_progress' | 'completed' | 'abandoned';
export type Side = 'player' | 'ai';
export type RoundOutcome = Side | 'tie';
export type TeamRole = 'attacker' | 'defender';

export interface MatchState {
  matchId: string;
  playerId: string | null;
  seed: number;
  map: string;
  status: MatchStatus;
  phase: MatchPhase;
  currentRound: number;
  playerScore: number;
  aiScore: number;
  consecutiveLosses: { player: number; ai: number };
  player: TeamState;
  ai: TeamState;
  rounds: RoundResult[];
  winner: Side | null;
  createdAt: number;
  completedAt: number | null;

  // v2: side roles fixed at match start
  playerRole: TeamRole | null;

  // v2: per-round attacker focus site (set during position phase by whoever is attacker)
  focusSite: Zone | null;
}

export type BattleEvent =
  | { type: 'round_start'; roundNumber: number; map: string }
  | { type: 'tick_start'; tick: number }
  | { type: 'move'; side: Side; slotIdx: number; from: Zone; to: Zone }
  | { type: 'ability'; side: Side; slotIdx: number; agentId: string; abilityName: string }
  | { type: 'ultimate'; side: Side; slotIdx: number; agentId: string; ultName: string; ultKind: UltimateKind }
  | { type: 'revive'; side: Side; slotIdx: number; agentId: string; hp: number }
  | {
      type: 'attack';
      attacker: { side: Side; slotIdx: number };
      defender: { side: Side; slotIdx: number };
      zone: Zone;
      damage: number;
      missed: boolean;
      defenderHpAfter: number;
    }
  | { type: 'eliminate'; side: Side; slotIdx: number; agentId: string }
  | {
      type: 'round_end';
      winner: RoundOutcome;
      playerSurvivors: number;
      aiSurvivors: number;
      killCounts: { player: number; ai: number };
    };

export interface RoundResult {
  roundNumber: number;
  events: BattleEvent[];
  winner: RoundOutcome;
  killCounts: { player: number; ai: number };
  goldAwarded: { player: number; ai: number };
  // v2: snapshot of starting positions (for renderer)
  startingPlayerRoster: AgentSlot[];
  startingAiRoster: AgentSlot[];
  focusSite: Zone | null;
  playerRole: TeamRole;
}

export type ShopAction =
  | { kind: 'buy_agent'; agentId: string }
  | { kind: 'buy_weapon'; slotIdx: number; weaponId: string }
  | { kind: 'buy_armor'; slotIdx: number; armorId: string }
  | { kind: 'buy_utility'; slotIdx: number; utilityId: string }
  | { kind: 'clear_utility'; slotIdx: number };

export type PositionAction =
  | { kind: 'set_zone'; slotIdx: number; zone: Zone }
  | { kind: 'set_focus'; site: Zone };
