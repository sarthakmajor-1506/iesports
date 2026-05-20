# Valorant Atomic War MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a local-only browser auto-battler at `/games/valorant-war` where a player buys agents and gear with progressive Valorant economy, fights a 1v1 AI opponent over BO7 rounds, with server-authoritative simulation persisted to a new `valorantWarGames` Firestore collection.

**Architecture:** Stateful match — server holds canonical state in Firestore. Client makes shop/play-round calls; server validates, simulates, and persists. Pure-function simulator with seedable RNG produces deterministic `BattleEvent[]` logs replayed by a canvas-based `BattleRenderer` (future-Phaser-ready behind one component seam). Auth optional: `playerId = uid` if signed in (read from Firebase ID token), `null` otherwise.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, `firebase-admin` 13 (Admin SDK), `firebase` 12 (client), inline styles only. No new external deps. Smoke tests via `npx tsx` (already used in `scripts/`).

**Project conventions (must follow):**
- Inline styles only (`style={{ ... }}`). No new CSS files, no Tailwind classes added.
- All server-side Firestore via `import { adminDb } from '@/lib/firebaseAdmin'`.
- Additive only — do not modify `lib/types.ts`, `lib/types-additions.ts`, or `AuthContext.tsx`. New types live local to the game at `app/games/valorant-war/data/types.ts`.
- No git commits and no GitHub push during MVP build (user will commit when satisfied).
- Riot policy (per `web/CLAUDE.md` rule #10): text labels only for agent/weapon names, NO Riot art/portraits/icons. No Elo or "true rank" estimators surfaced.

**Visual palette (taken from `app/valorant/page.tsx`):**
- Background: `#0f1923`
- Text: `#F0EEEA`
- Primary accent (Valorant cyan): `#3CCBFF`, hover: `#30B5E6`
- Yellow accent: `#fbbf24`
- Subtle surface: `rgba(255,255,255,0.04)`
- Hover surface: `rgba(255,255,255,0.06)`
- Border: `rgba(255,255,255,0.1)`
- Muted text: `rgba(255,255,255,0.55)`

**Working directory for ALL commands:** `/Users/sjain/Documents/iesports/iesports/web`

---

## File Structure (locked before tasks)

```
web/app/games/valorant-war/
  page.tsx                                ← lobby ("New Match" CTA)
  match/[matchId]/page.tsx                ← active match (shop ⇄ battle)
  data/
    types.ts                              ← all war-specific TS types
    agents.ts                             ← 8 agent defs
    weapons.ts                            ← 6 weapon defs
    armors.ts                             ← 3 armor defs
    utilities.ts                          ← 4 utility defs
    maps.ts                               ← S26A3 map flavor list
  lib/
    rng.ts                                ← mulberry32 seeded PRNG
    economy.ts                            ← gold reward formulas
    simulator.ts                          ← simulateRound pure fn
    aiShopper.ts                          ← AI buy decisions
    matchRepo.ts                          ← Firestore read/write helpers
  components/
    EconomyBar.tsx                        ← gold + round + score
    RosterDisplay.tsx                     ← agent slots, HP, loadouts
    ShopPanel.tsx                         ← purchase UI
    BattleRenderer.tsx                    ← canvas event playback
    ResultOverlay.tsx                     ← end-of-round + end-of-match overlays

web/app/api/games/valorant-war/
  new-match/route.ts                      ← POST → create match
  shop/route.ts                           ← POST → apply shop action
  play-round/route.ts                     ← POST → run AI shop + sim + persist
  match/[matchId]/route.ts                ← GET → fetch state

web/scripts/
  testValorantWarSim.ts                   ← smoke test for simulator/AI/economy
  testValorantWarApi.ts                   ← smoke test for API endpoints

web/app/components/Navbar.tsx              ← MODIFY (add 1 link in Phase 6)
```

**Files NOT touched:** `lib/types.ts`, `lib/types-additions.ts`, `lib/firebase.ts`, `lib/firebaseAdmin.ts`, `app/context/AuthContext.tsx`, any tournament code.

---

## Phase Boundaries (review checkpoints)

After each phase the engineer **STOPS** and waits for user review before continuing:

- **Phase 1 → checkpoint** (data + types compile cleanly)
- **Phase 2 → checkpoint** (smoke scripts pass)
- **Phase 3 → checkpoint** (curl tests pass, Firestore writes visible)
- **Phase 4 → checkpoint** (shop UI works in browser, can complete a match in text-only mode)
- **Phase 5 → checkpoint** (canvas animation plays in browser)
- **Phase 6 → checkpoint** (final end-to-end verified, no commit yet)

---

# PHASE 1 — Data + Types

Goal: lay down the static game data and the TypeScript contracts. No runtime behavior.

## Task 1.1: Create `data/types.ts`

**Files:**
- Create: `web/app/games/valorant-war/data/types.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/games/valorant-war/data/types.ts
// All types specific to the Valorant Atomic War side game.
// Deliberately local to the game folder (additive — no edits to lib/types.ts).

export type Role = 'duelist' | 'initiator' | 'controller' | 'sentinel';

export type AbilityKind =
  | 'aoe_damage'         // deals damage to opposing pair (Phoenix, Brimstone)
  | 'dodge_buff'         // grants dodge for the round (Jett)
  | 'recon'              // grants hit-chance buff to whole team next round (Sova)
  | 'flash'              // opposing pair misses first attack next round (Skye)
  | 'damage_reduction'   // opposing pair deals reduced damage next round (Omen)
  | 'heal_lowest'        // heals lowest-HP allied agent at round start (Sage)
  | 'turret_passive';    // passive bonus damage every round (Killjoy)

export interface AgentDef {
  id: string;
  name: string;
  role: Role;
  cost: number;
  baseHp: number;
  baseDamage: number;
  abilityName: string;
  abilityKind: AbilityKind;
  abilityValue: number;  // semantics depend on abilityKind (damage / hp / pct)
}

export interface WeaponDef {
  id: string;
  name: string;
  cost: number;
  damageBonus: number;
  flashBlocked: boolean;  // if true, attacker missed-on-flash applies (e.g. Operator)
}

export interface ArmorDef {
  id: string;
  name: string;
  cost: number;
  hpBonus: number;
}

export type UtilityEffect = 'dodge_15' | 'flash_first' | 'heal_15' | 'recon_10';

export interface UtilityDef {
  id: string;
  name: string;
  cost: number;
  effect: UtilityEffect;
}

export interface AgentSlot {
  agentId: string;
  weaponId: string;       // defaults to 'classic' (free)
  armorId: string;        // defaults to 'none'
  utilityId: string | null;
}

export interface TeamState {
  gold: number;
  roster: AgentSlot[];    // 0..5 entries
}

export type MatchPhase = 'shop' | 'battle' | 'finished';
export type MatchStatus = 'in_progress' | 'completed' | 'abandoned';
export type Side = 'player' | 'ai';
export type RoundOutcome = Side | 'tie';

export interface MatchState {
  matchId: string;
  playerId: string | null;
  seed: number;
  map: string;
  status: MatchStatus;
  phase: MatchPhase;
  currentRound: number;        // 1..7
  playerScore: number;         // rounds won
  aiScore: number;
  consecutiveLosses: { player: number; ai: number };
  player: TeamState;
  ai: TeamState;
  rounds: RoundResult[];
  winner: Side | null;
  createdAt: number;           // ms epoch
  completedAt: number | null;
}

export type BattleEvent =
  | { type: 'round_start'; roundNumber: number; map: string; playerHps: number[]; aiHps: number[] }
  | { type: 'ability'; side: Side; slotIdx: number; agentId: string; abilityName: string }
  | { type: 'attack'; attacker: { side: Side; slotIdx: number }; defender: { side: Side; slotIdx: number }; damage: number; missed: boolean; defenderHpAfter: number }
  | { type: 'eliminate'; side: Side; slotIdx: number; agentId: string }
  | { type: 'round_end'; winner: RoundOutcome; playerSurvivors: number; aiSurvivors: number; killCounts: { player: number; ai: number } };

export interface RoundResult {
  roundNumber: number;
  events: BattleEvent[];
  winner: RoundOutcome;
  killCounts: { player: number; ai: number };
  goldAwarded: { player: number; ai: number };
}

// ---- Shop action discriminated union (sent client → /api/games/valorant-war/shop) ----
export type ShopAction =
  | { kind: 'buy_agent'; agentId: string }
  | { kind: 'buy_weapon'; slotIdx: number; weaponId: string }
  | { kind: 'buy_armor'; slotIdx: number; armorId: string }
  | { kind: 'buy_utility'; slotIdx: number; utilityId: string }
  | { kind: 'clear_utility'; slotIdx: number };
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from `web/`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

## Task 1.2: Create `data/agents.ts`

**Files:**
- Create: `web/app/games/valorant-war/data/agents.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/games/valorant-war/data/agents.ts
import type { AgentDef } from './types';

// 8 agents — 2 per role. All baseHp = 100 per Valorant canon.
// abilityKind semantics:
//   aoe_damage      → abilityValue = damage to opposing pair
//   dodge_buff      → abilityValue = dodge percent (0-100) for next round
//   recon           → abilityValue = hit-chance bonus pct for whole team next round
//   flash           → abilityValue unused
//   damage_reduction→ abilityValue = damage reduction pct on opposing pair
//   heal_lowest     → abilityValue = HP healed to lowest-HP ally at round start
//   turret_passive  → abilityValue = bonus damage applied to opposing pair every round

export const AGENTS: AgentDef[] = [
  { id: 'phoenix', name: 'Phoenix', role: 'duelist', cost: 400,
    baseHp: 100, baseDamage: 22,
    abilityName: 'Hot Hands', abilityKind: 'aoe_damage', abilityValue: 15 },

  { id: 'jett', name: 'Jett', role: 'duelist', cost: 600,
    baseHp: 100, baseDamage: 21,
    abilityName: 'Updraft', abilityKind: 'dodge_buff', abilityValue: 25 },

  { id: 'sova', name: 'Sova', role: 'initiator', cost: 500,
    baseHp: 100, baseDamage: 19,
    abilityName: 'Recon Bolt', abilityKind: 'recon', abilityValue: 15 },

  { id: 'skye', name: 'Skye', role: 'initiator', cost: 500,
    baseHp: 100, baseDamage: 18,
    abilityName: 'Guiding Light', abilityKind: 'flash', abilityValue: 0 },

  { id: 'omen', name: 'Omen', role: 'controller', cost: 500,
    baseHp: 100, baseDamage: 18,
    abilityName: 'Paranoia', abilityKind: 'damage_reduction', abilityValue: 30 },

  { id: 'brimstone', name: 'Brimstone', role: 'controller', cost: 500,
    baseHp: 100, baseDamage: 19,
    abilityName: 'Incendiary', abilityKind: 'aoe_damage', abilityValue: 12 },

  { id: 'sage', name: 'Sage', role: 'sentinel', cost: 500,
    baseHp: 100, baseDamage: 15,
    abilityName: 'Heal', abilityKind: 'heal_lowest', abilityValue: 25 },

  { id: 'killjoy', name: 'Killjoy', role: 'sentinel', cost: 600,
    baseHp: 100, baseDamage: 17,
    abilityName: 'Turret', abilityKind: 'turret_passive', abilityValue: 8 },
];

export const AGENT_BY_ID: Record<string, AgentDef> =
  Object.fromEntries(AGENTS.map(a => [a.id, a]));

export function getAgent(id: string): AgentDef {
  const a = AGENT_BY_ID[id];
  if (!a) throw new Error(`Unknown agent: ${id}`);
  return a;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 1.3: Create `data/weapons.ts`

**Files:**
- Create: `web/app/games/valorant-war/data/weapons.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/games/valorant-war/data/weapons.ts
// Prices match real Valorant 2026 economy where applicable (Vandal/Phantom 2900,
// Sheriff 800, Spectre 1600, Operator 4700, Ghost 500). Damage bonuses are
// MVP-tuned ratios — not real Valorant damage values.
import type { WeaponDef } from './types';

export const WEAPONS: WeaponDef[] = [
  { id: 'classic',  name: 'Classic',  cost:    0, damageBonus:  0, flashBlocked: false },
  { id: 'ghost',    name: 'Ghost',    cost:  500, damageBonus:  3, flashBlocked: false },
  { id: 'sheriff',  name: 'Sheriff',  cost:  800, damageBonus:  6, flashBlocked: false },
  { id: 'spectre',  name: 'Spectre',  cost: 1600, damageBonus:  9, flashBlocked: false },
  { id: 'phantom',  name: 'Phantom',  cost: 2900, damageBonus: 14, flashBlocked: false },
  { id: 'operator', name: 'Operator', cost: 4700, damageBonus: 22, flashBlocked: true  },
];

export const WEAPON_BY_ID: Record<string, WeaponDef> =
  Object.fromEntries(WEAPONS.map(w => [w.id, w]));

export function getWeapon(id: string): WeaponDef {
  const w = WEAPON_BY_ID[id];
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 1.4: Create `data/armors.ts`

**Files:**
- Create: `web/app/games/valorant-war/data/armors.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/games/valorant-war/data/armors.ts
// Real Valorant prices: Light 400, Heavy 1000.
import type { ArmorDef } from './types';

export const ARMORS: ArmorDef[] = [
  { id: 'none',   name: 'None',         cost:    0, hpBonus:  0 },
  { id: 'light',  name: 'Light Shield', cost:  400, hpBonus: 25 },
  { id: 'heavy',  name: 'Heavy Shield', cost: 1000, hpBonus: 50 },
];

export const ARMOR_BY_ID: Record<string, ArmorDef> =
  Object.fromEntries(ARMORS.map(a => [a.id, a]));

export function getArmor(id: string): ArmorDef {
  const a = ARMOR_BY_ID[id];
  if (!a) throw new Error(`Unknown armor: ${id}`);
  return a;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 1.5: Create `data/utilities.ts`

**Files:**
- Create: `web/app/games/valorant-war/data/utilities.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/games/valorant-war/data/utilities.ts
import type { UtilityDef } from './types';

export const UTILITIES: UtilityDef[] = [
  { id: 'smoke',       name: 'Smoke',       cost: 200, effect: 'dodge_15'    },
  { id: 'flash',       name: 'Flash',       cost: 200, effect: 'flash_first' },
  { id: 'heal_charge', name: 'Heal Charge', cost: 300, effect: 'heal_15'     },
  { id: 'recon_dart',  name: 'Recon Dart',  cost: 200, effect: 'recon_10'    },
];

export const UTILITY_BY_ID: Record<string, UtilityDef> =
  Object.fromEntries(UTILITIES.map(u => [u.id, u]));

export function getUtility(id: string): UtilityDef {
  const u = UTILITY_BY_ID[id];
  if (!u) throw new Error(`Unknown utility: ${id}`);
  return u;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 1.6: Create `data/maps.ts`

**Files:**
- Create: `web/app/games/valorant-war/data/maps.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/games/valorant-war/data/maps.ts
// Current Valorant Season 26 Act 3 competitive pool. Used as flavor only —
// no per-map mechanics in MVP.
export const MAPS: string[] = [
  'Ascent', 'Breeze', 'Fracture', 'Haven', 'Lotus', 'Pearl', 'Split',
];

export function pickMap(rng: () => number): string {
  return MAPS[Math.floor(rng() * MAPS.length)];
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Phase 1 Checkpoint

- [ ] **Run final type-check**

```bash
cd /Users/sjain/Documents/iesports/iesports/web && npx tsc --noEmit
```
Expected: 0 errors anywhere in the project.

- [ ] **Stop and report to user.** Show the 6 files created. Wait for approval before Phase 2.

---

# PHASE 2 — Server Logic (pure functions)

Goal: deterministic simulator + AI shopper + economy + RNG. All pure (no Firestore). Smoke-tested standalone.

## Task 2.1: Create `lib/rng.ts`

**Files:**
- Create: `web/app/games/valorant-war/lib/rng.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/games/valorant-war/lib/rng.ts
// Mulberry32 — small, fast, well-distributed seedable PRNG.
// Same seed → same sequence. Used so battles are reproducible from {seed, history}.

export type RNG = () => number;

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: RNG, minInclusive: number, maxExclusive: number): number {
  return Math.floor(rng() * (maxExclusive - minInclusive)) + minInclusive;
}

export function pick<T>(rng: RNG, arr: T[]): T {
  if (arr.length === 0) throw new Error('pick from empty array');
  return arr[Math.floor(rng() * arr.length)];
}

export function chance(rng: RNG, percent: number): boolean {
  return rng() * 100 < percent;
}

export function newSeed(): number {
  return Math.floor(Math.random() * 0xFFFFFFFF);
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 2.2: Create `lib/economy.ts`

**Files:**
- Create: `web/app/games/valorant-war/lib/economy.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/games/valorant-war/lib/economy.ts
// Valorant 2026 economy values:
//   Starting gold: 800
//   Round win:     +3000 to every player on winning team
//   Round loss:    +1900 / 2400 / 2900 (1st / 2nd / 3rd-or-more consecutive)
//   Per kill:      +200 to the killer's team (we credit per kill, not per killer)
//   Cap:           9000
import type { MatchState, RoundOutcome } from '../data/types';

export const STARTING_GOLD = 800;
export const ROUND_WIN_BONUS = 3000;
export const LOSS_BONUS_LADDER = [1900, 2400, 2900]; // index = consecutiveLosses (clamped)
export const KILL_REWARD = 200;
export const GOLD_CAP = 9000;

export function lossBonusFor(consecutiveLosses: number): number {
  const idx = Math.min(consecutiveLosses, LOSS_BONUS_LADDER.length - 1);
  return LOSS_BONUS_LADDER[Math.max(0, idx)];
}

export function clampGold(g: number): number {
  return Math.max(0, Math.min(GOLD_CAP, g));
}

/**
 * Pure function: compute gold awarded to each side after a round.
 * Caller is responsible for updating consecutiveLosses afterwards.
 */
export function computeGoldAwards(
  outcome: RoundOutcome,
  killCounts: { player: number; ai: number },
  consecutiveLosses: { player: number; ai: number },
): { player: number; ai: number } {
  // Kill rewards
  let player = killCounts.player * KILL_REWARD;
  let ai = killCounts.ai * KILL_REWARD;

  if (outcome === 'tie') {
    // Tie favors player per design — player counts as winner economy-wise.
    player += ROUND_WIN_BONUS;
    ai += lossBonusFor(consecutiveLosses.ai + 1);
  } else if (outcome === 'player') {
    player += ROUND_WIN_BONUS;
    ai += lossBonusFor(consecutiveLosses.ai + 1);
  } else {
    ai += ROUND_WIN_BONUS;
    player += lossBonusFor(consecutiveLosses.player + 1);
  }

  return { player, ai };
}

/**
 * Update consecutiveLosses based on round outcome (tie counts as player win).
 */
export function nextConsecutiveLosses(
  prev: { player: number; ai: number },
  outcome: RoundOutcome,
): { player: number; ai: number } {
  if (outcome === 'ai') {
    return { player: prev.player + 1, ai: 0 };
  }
  // player or tie → AI loses
  return { player: 0, ai: prev.ai + 1 };
}

/**
 * Apply gold awards onto a MatchState's TeamState gold (with cap).
 * Mutates a copy and returns new MatchState (caller is responsible for assignment).
 */
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
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 2.3: Create `lib/simulator.ts`

**Files:**
- Create: `web/app/games/valorant-war/lib/simulator.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/games/valorant-war/lib/simulator.ts
// Pure deterministic battle simulator. Given two TeamStates (rosters with
// loadouts), a roundNumber, and a seeded RNG, produces a RoundResult: a list
// of BattleEvents, the winner, and per-side kill counts.
//
// Round mechanics:
//   - HP fully resets every round to baseHp + armor.hpBonus + heal_charge utility (+15).
//   - Pair agents 1v1 by slot index. Excess slots on the larger side stay alive
//     contributing to survivor count (auto-win their phantom pairing) ONLY if
//     the smaller side has nothing in that slot. (Effectively: missing slot = -1 survivor.)
//   - Each pair trades attacks for up to 6 ticks or until one is at 0 HP.
//   - Damage = max(1, attackerBase + weaponBonus - flatModifiers), * (1 - dodge),
//     after applying paranoia damage_reduction multipliers.
//   - Abilities trigger on round_number % 2 === 0 (rounds 2, 4, 6) or if it's
//     a turret_passive (every round).
//   - Round winner = side with more survivors. Ties → 'tie' (economy treats as player win).
//
// Determinism: every random draw goes through `rng`. Same seed + same rosters + same
// roundNumber → identical RoundResult.

import type {
  AgentSlot, TeamState, BattleEvent, RoundResult, Side, RoundOutcome,
} from '../data/types';
import { getAgent } from '../data/agents';
import { getWeapon } from '../data/weapons';
import { getArmor } from '../data/armors';
import { getUtility } from '../data/utilities';
import type { RNG } from './rng';
import { chance } from './rng';

interface FighterRuntime {
  side: Side;
  slotIdx: number;
  agentId: string;
  hp: number;
  maxHp: number;
  baseDamage: number;
  weaponDamageBonus: number;
  weaponFlashBlocked: boolean;
  // Round-only modifiers (re-applied each round from abilities + utilities)
  dodgePct: number;        // 0..100
  flashedFirstAttack: boolean;
  damageReduction: number; // 0..100 multiplicative reduction
  hitBonus: number;        // 0..100 added to base 100 hit chance (capped)
  hasUtilityFlashApplied: boolean; // for outgoing flash on opposing pair
}

function buildFighter(side: Side, slotIdx: number, slot: AgentSlot): FighterRuntime {
  const agent = getAgent(slot.agentId);
  const weapon = getWeapon(slot.weaponId);
  const armor = getArmor(slot.armorId);
  const utility = slot.utilityId ? getUtility(slot.utilityId) : null;

  let maxHp = agent.baseHp + armor.hpBonus;
  if (utility?.effect === 'heal_15') maxHp += 15;

  return {
    side, slotIdx,
    agentId: agent.id,
    hp: maxHp,
    maxHp,
    baseDamage: agent.baseDamage,
    weaponDamageBonus: weapon.damageBonus,
    weaponFlashBlocked: weapon.flashBlocked,
    dodgePct: utility?.effect === 'dodge_15' ? 15 : 0,
    flashedFirstAttack: false,
    damageReduction: 0,
    hitBonus: utility?.effect === 'recon_10' ? 10 : 0,
    hasUtilityFlashApplied: false,
  };
}

/**
 * Apply ability effects at round start. Mutates fighter arrays in-place.
 * Emits an 'ability' event for each ability that fires.
 * Abilities trigger on roundNumber % 2 === 0 OR turret_passive (every round).
 */
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

      const opposingPair = opposing.find(o => o.slotIdx === f.slotIdx);
      events.push({
        type: 'ability', side: f.side, slotIdx: f.slotIdx,
        agentId: f.agentId, abilityName: agent.abilityName,
      });

      switch (agent.abilityKind) {
        case 'aoe_damage':
          if (opposingPair) {
            opposingPair.hp = Math.max(0, opposingPair.hp - agent.abilityValue);
          }
          break;
        case 'turret_passive':
          if (opposingPair) {
            opposingPair.hp = Math.max(0, opposingPair.hp - agent.abilityValue);
          }
          break;
        case 'dodge_buff':
          f.dodgePct = Math.min(95, f.dodgePct + agent.abilityValue);
          break;
        case 'recon':
          for (const t of team) t.hitBonus = Math.min(50, t.hitBonus + agent.abilityValue);
          break;
        case 'flash':
          if (opposingPair) opposingPair.flashedFirstAttack = true;
          break;
        case 'damage_reduction':
          if (opposingPair) {
            opposingPair.damageReduction = Math.min(80, opposingPair.damageReduction + agent.abilityValue);
          }
          break;
        case 'heal_lowest':
          // Heal the lowest-HP allied agent (could be self)
          let lowest = team[0];
          for (const t of team) if (t.hp < lowest.hp) lowest = t;
          lowest.hp = Math.min(lowest.maxHp, lowest.hp + agent.abilityValue);
          break;
      }
    }
  }

  fireFor(player, ai);
  fireFor(ai, player);

  // After abilities fire, apply utility-flash on the opposing pair (utility flashes apply unconditionally each round)
  function applyUtilityFlashes(team: FighterRuntime[], opposing: FighterRuntime[]) {
    for (const f of team) {
      // Look up the slot's utility from the original buildFighter pass — we encoded the outgoing flash flag
      // Actually we need to re-look-up: the FighterRuntime we built tracks INCOMING dodge_15 / recon_10 / heal_15, not outgoing flash.
      // Outgoing flash from utility is handled here by inspecting agent loadout — but we don't have slot here.
      // We'll handle utility-driven flash in `runPair` (attack-time) by re-reading the slot — or just bake this at buildFighter time by tracking outgoingFlash on the opposing pair.
      // Simpler: handled in caller. See note below.
      void f; void opposing;
    }
  }
  void applyUtilityFlashes; // (kept as documentation; actual outgoing-flash handled below)
}

/** Apply utility outgoing effects: 'flash_first' utility on attacker → defender misses next attack. */
function applyOutgoingUtilities(
  playerSlots: AgentSlot[], aiSlots: AgentSlot[],
  player: FighterRuntime[], ai: FighterRuntime[],
): void {
  for (const slot of playerSlots) {
    if (slot.utilityId && getUtility(slot.utilityId).effect === 'flash_first') {
      const target = ai.find(o => o.slotIdx === playerSlots.indexOf(slot));
      if (target) target.flashedFirstAttack = true;
    }
  }
  for (const slot of aiSlots) {
    if (slot.utilityId && getUtility(slot.utilityId).effect === 'flash_first') {
      const target = player.find(o => o.slotIdx === aiSlots.indexOf(slot));
      if (target) target.flashedFirstAttack = true;
    }
  }
}

/** Run one paired 1v1 fight. Mutates fighter HPs. Pushes events. Returns winner side or 'tie'. */
function runPair(
  attackerStarter: FighterRuntime,
  defenderStarter: FighterRuntime,
  rng: RNG,
  events: BattleEvent[],
): void {
  // Random first-attacker (50/50)
  const goesFirst = rng() < 0.5;
  let attacker = goesFirst ? attackerStarter : defenderStarter;
  let defender = goesFirst ? defenderStarter : attackerStarter;

  for (let tick = 0; tick < 6; tick++) {
    if (attacker.hp <= 0 || defender.hp <= 0) break;

    // Flash check: does attacker miss this attack?
    let missed = false;
    if (attacker.flashedFirstAttack) {
      missed = true;
      attacker.flashedFirstAttack = false; // consume
    }
    // Operator-while-flashed: if attacker's weapon is flashBlocked AND was flashed, doubled-miss handled by missed=true above.
    // (No additional logic needed; weaponFlashBlocked reserved for future use.)

    // Hit chance (default 100, plus recon hitBonus, minus defender dodge)
    const baseHit = 100 + attacker.hitBonus;
    const finalHit = Math.max(5, Math.min(99, baseHit - defender.dodgePct));
    if (!missed && !chance(rng, finalHit)) missed = true;

    let damage = 0;
    if (!missed) {
      const raw = attacker.baseDamage + attacker.weaponDamageBonus;
      const reduced = raw * (1 - defender.damageReduction / 100);
      damage = Math.max(1, Math.round(reduced));
      defender.hp = Math.max(0, defender.hp - damage);
    }

    events.push({
      type: 'attack',
      attacker: { side: attacker.side, slotIdx: attacker.slotIdx },
      defender: { side: defender.side, slotIdx: defender.slotIdx },
      damage,
      missed,
      defenderHpAfter: defender.hp,
    });

    if (defender.hp <= 0) {
      events.push({
        type: 'eliminate',
        side: defender.side, slotIdx: defender.slotIdx, agentId: defender.agentId,
      });
      break;
    }

    // Swap roles
    const tmp = attacker; attacker = defender; defender = tmp;
  }
}

export function simulateRound(
  player: TeamState,
  ai: TeamState,
  roundNumber: number,
  map: string,
  rng: RNG,
): RoundResult {
  const events: BattleEvent[] = [];

  // Build runtime fighters
  const playerFighters = player.roster.map((s, i) => buildFighter('player', i, s));
  const aiFighters     = ai.roster.map((s, i) => buildFighter('ai', i, s));

  events.push({
    type: 'round_start',
    roundNumber, map,
    playerHps: playerFighters.map(f => f.hp),
    aiHps: aiFighters.map(f => f.hp),
  });

  applyAbilities(roundNumber, playerFighters, aiFighters, events);
  applyOutgoingUtilities(player.roster, ai.roster, playerFighters, aiFighters);

  // After abilities, log any deaths from AoE
  for (const f of [...playerFighters, ...aiFighters]) {
    if (f.hp === 0) {
      events.push({ type: 'eliminate', side: f.side, slotIdx: f.slotIdx, agentId: f.agentId });
    }
  }

  // Pair up by slot index. Iterate over max length.
  const maxSlots = Math.max(playerFighters.length, aiFighters.length);
  let playerKills = 0;
  let aiKills = 0;

  for (let i = 0; i < maxSlots; i++) {
    const p = playerFighters[i];
    const a = aiFighters[i];

    if (p && a) {
      // Skip if either is already 0 from AoE
      if (p.hp > 0 && a.hp > 0) {
        runPair(p, a, rng, events);
      }
      if (p.hp === 0) aiKills++;
      if (a.hp === 0) playerKills++;
    } else if (p && !a) {
      // Empty AI slot → counts as player having unopposed survivor (no kill credit)
    } else if (a && !p) {
      // Empty player slot → AI has unopposed survivor
    }
  }

  const playerSurvivors = playerFighters.filter(f => f.hp > 0).length;
  const aiSurvivors     = aiFighters.filter(f => f.hp > 0).length;

  // Tie-break: factor missing-slot disadvantage
  const playerEffective = playerSurvivors - Math.max(0, aiFighters.length - playerFighters.length);
  const aiEffective     = aiSurvivors     - Math.max(0, playerFighters.length - aiFighters.length);

  let winner: RoundOutcome;
  if (playerEffective > aiEffective) winner = 'player';
  else if (aiEffective > playerEffective) winner = 'ai';
  else winner = 'tie';

  events.push({
    type: 'round_end',
    winner,
    playerSurvivors, aiSurvivors,
    killCounts: { player: playerKills, ai: aiKills },
  });

  return {
    roundNumber,
    events,
    winner,
    killCounts: { player: playerKills, ai: aiKills },
    goldAwarded: { player: 0, ai: 0 }, // economy fills this in
  };
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 2.4: Create `lib/aiShopper.ts`

**Files:**
- Create: `web/app/games/valorant-war/lib/aiShopper.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/games/valorant-war/lib/aiShopper.ts
// Roughly-balanced AI buying logic. Pure function.
//
// Strategy:
//   1. If <3 agents owned and gold >= cheapest agent, buy a random not-owned agent.
//   2. With remaining gold (target ~75% spend), upgrade in priority:
//      a. Weapon: pick highest-affordable weapon for the agent that currently
//         has the lowest weapon damageBonus.
//      b. Armor: same — upgrade lowest-armor agent if affordable.
//      c. Utility: fill empty utility slot for any agent if affordable.
//   3. Stop spending when remaining gold < cheapest upgradable cost OR after 8 iterations.
import type { TeamState, AgentSlot } from '../data/types';
import { AGENTS } from '../data/agents';
import { WEAPONS, getWeapon } from '../data/weapons';
import { ARMORS, getArmor } from '../data/armors';
import { UTILITIES, getUtility } from '../data/utilities';
import type { RNG } from './rng';
import { pick } from './rng';

const MAX_ROSTER = 5;
const MIN_FILL_TARGET = 3;
const SPEND_TARGET_PCT = 75;

export function aiShop(team: TeamState, rng: RNG): TeamState {
  let working: TeamState = { gold: team.gold, roster: team.roster.map(s => ({ ...s })) };

  const ownedIds = () => new Set(working.roster.map(s => s.agentId));

  // Step 1: roster fill to MIN_FILL_TARGET, then opportunistically up to 5.
  while (working.roster.length < MIN_FILL_TARGET) {
    const candidates = AGENTS.filter(a => !ownedIds().has(a.id) && a.cost <= working.gold);
    if (candidates.length === 0) break;
    const a = pick(rng, candidates);
    working.roster.push({ agentId: a.id, weaponId: 'classic', armorId: 'none', utilityId: null });
    working.gold -= a.cost;
  }
  // Opportunistic 4th/5th agent if cheap and gold is high
  while (working.roster.length < MAX_ROSTER && working.gold >= 600) {
    const candidates = AGENTS.filter(a => !ownedIds().has(a.id) && a.cost <= working.gold * 0.4);
    if (candidates.length === 0) break;
    const a = pick(rng, candidates);
    working.roster.push({ agentId: a.id, weaponId: 'classic', armorId: 'none', utilityId: null });
    working.gold -= a.cost;
  }

  // Step 2: gradual upgrades up to spend target.
  const startGold = working.gold;
  const minHold = Math.floor(startGold * (100 - SPEND_TARGET_PCT) / 100);

  for (let iter = 0; iter < 12; iter++) {
    if (working.gold <= minHold) break;
    const beforeGold = working.gold;

    // 2a. Upgrade weakest weapon
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

    // 2b. Upgrade weakest armor
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

    // 2c. Fill empty utility slot
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

    if (working.gold === beforeGold) break; // nothing more to buy
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
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 2.5: Create `scripts/testValorantWarSim.ts`

**Files:**
- Create: `web/scripts/testValorantWarSim.ts`

- [ ] **Step 1: Write the smoke test**

```typescript
// web/scripts/testValorantWarSim.ts
// Smoke test: run a deterministic round simulation, then run aiShop,
// then run economy. Print readable summary.
// Usage: npx tsx scripts/testValorantWarSim.ts
import { mulberry32 } from '../app/games/valorant-war/lib/rng';
import { simulateRound } from '../app/games/valorant-war/lib/simulator';
import { aiShop } from '../app/games/valorant-war/lib/aiShopper';
import { computeGoldAwards, nextConsecutiveLosses, STARTING_GOLD } from '../app/games/valorant-war/lib/economy';
import type { TeamState } from '../app/games/valorant-war/data/types';
import { pickMap } from '../app/games/valorant-war/data/maps';

function main() {
  const seed = 12345;
  const rng = mulberry32(seed);
  const map = pickMap(rng);

  console.log(`Seed=${seed}  Map=${map}\n`);

  // Player buys: 2 cheap agents w/ basic loadouts
  const player: TeamState = {
    gold: STARTING_GOLD - 400 - 400 - 800,
    roster: [
      { agentId: 'phoenix', weaponId: 'sheriff', armorId: 'none', utilityId: null },
      { agentId: 'sage',    weaponId: 'classic', armorId: 'none', utilityId: null },
    ],
  };

  // AI shops with same starting gold
  const aiInitial: TeamState = { gold: STARTING_GOLD, roster: [] };
  const ai = aiShop(aiInitial, rng);
  console.log('AI bought:', ai.roster.map(s => `${s.agentId}+${s.weaponId}+${s.armorId}+${s.utilityId ?? '-'}`).join(', '), `(${STARTING_GOLD - ai.gold}g spent)\n`);

  // Run round 1
  const result = simulateRound(player, ai, 1, map, rng);
  console.log(`Round 1 → winner: ${result.winner}, kills=${result.killCounts.player}/${result.killCounts.ai}, events=${result.events.length}`);

  // Show first 8 events
  for (const ev of result.events.slice(0, 12)) {
    console.log('  ', JSON.stringify(ev));
  }

  // Economy
  const awards = computeGoldAwards(result.winner, result.killCounts, { player: 0, ai: 0 });
  const losses = nextConsecutiveLosses({ player: 0, ai: 0 }, result.winner);
  console.log(`\nGold awards: player=+${awards.player} ai=+${awards.ai}, consecutiveLosses=`, losses);

  // Determinism check: re-run with same seed
  const rng2 = mulberry32(seed);
  pickMap(rng2);
  const aiAgain = aiShop({ gold: STARTING_GOLD, roster: [] }, rng2);
  if (JSON.stringify(aiAgain.roster) !== JSON.stringify(ai.roster)) {
    console.error('DETERMINISM FAILURE — same seed produced different AI roster');
    process.exit(1);
  }
  console.log('\n✅ Determinism check passed (same seed → same AI roster).');
}

main();
```

- [ ] **Step 2: Run smoke test**

```bash
cd /Users/sjain/Documents/iesports/iesports/web && npx tsx scripts/testValorantWarSim.ts
```
Expected output: a round summary, gold awards, and "Determinism check passed".

- [ ] **Step 3: Investigate any failures.** If determinism fails, the most likely cause is a non-RNG random source (`Math.random()` in production code). Grep simulator.ts and aiShopper.ts for `Math.random` — none should be present.

## Phase 2 Checkpoint

- [ ] **Final type-check** — `npx tsc --noEmit` → 0 errors
- [ ] **Smoke test passes** — `npx tsx scripts/testValorantWarSim.ts` → runs to "Determinism check passed"
- [ ] **Stop and report.** Show smoke output. Wait for user approval before Phase 3.

---

# PHASE 3 — API Routes (Firestore-backed state machine)

Goal: 4 API endpoints, all server-authoritative. Match docs in new `valorantWarGames` collection.

## Task 3.1: Create `lib/matchRepo.ts`

**Files:**
- Create: `web/app/games/valorant-war/lib/matchRepo.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/games/valorant-war/lib/matchRepo.ts
// Thin Firestore wrapper for valorantWarGames. Server-only (uses adminDb).
import { adminDb } from '@/lib/firebaseAdmin';
import type { MatchState } from '../data/types';

const COLLECTION = 'valorantWarGames';

export async function createMatch(state: MatchState): Promise<void> {
  await adminDb.collection(COLLECTION).doc(state.matchId).set(state);
}

export async function getMatch(matchId: string): Promise<MatchState | null> {
  const snap = await adminDb.collection(COLLECTION).doc(matchId).get();
  if (!snap.exists) return null;
  return snap.data() as MatchState;
}

export async function updateMatch(state: MatchState): Promise<void> {
  await adminDb.collection(COLLECTION).doc(state.matchId).set(state);
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 3.2: Create `app/api/games/valorant-war/new-match/route.ts`

**Files:**
- Create: `web/app/api/games/valorant-war/new-match/route.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/api/games/valorant-war/new-match/route.ts
// POST → create a new match. Body: { idToken?: string }.
// Returns: { matchId, state }.
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { createMatch } from '@/app/games/valorant-war/lib/matchRepo';
import { mulberry32, newSeed } from '@/app/games/valorant-war/lib/rng';
import { pickMap } from '@/app/games/valorant-war/data/maps';
import { STARTING_GOLD } from '@/app/games/valorant-war/lib/economy';
import type { MatchState } from '@/app/games/valorant-war/data/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const idToken: string | undefined = body?.idToken;

    let playerId: string | null = null;
    if (idToken) {
      try {
        const decoded = await getAuth().verifyIdToken(idToken);
        playerId = decoded.uid;
      } catch {
        playerId = null; // bad/expired token → treat as anonymous
      }
    }

    const seed = newSeed();
    const rng = mulberry32(seed);
    const map = pickMap(rng);

    const matchId = `vw_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const state: MatchState = {
      matchId,
      playerId,
      seed,
      map,
      status: 'in_progress',
      phase: 'shop',
      currentRound: 1,
      playerScore: 0,
      aiScore: 0,
      consecutiveLosses: { player: 0, ai: 0 },
      player: { gold: STARTING_GOLD, roster: [] },
      ai:     { gold: STARTING_GOLD, roster: [] },
      rounds: [],
      winner: null,
      createdAt: Date.now(),
      completedAt: null,
    };

    await createMatch(state);
    return NextResponse.json({ matchId, state });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 3.3: Create `app/api/games/valorant-war/shop/route.ts`

**Files:**
- Create: `web/app/api/games/valorant-war/shop/route.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/api/games/valorant-war/shop/route.ts
// POST → apply one shop action. Body: { matchId, action: ShopAction }.
// Returns: { state } on success, { error } on validation failure.
import { NextRequest, NextResponse } from 'next/server';
import { getMatch, updateMatch } from '@/app/games/valorant-war/lib/matchRepo';
import { getAgent } from '@/app/games/valorant-war/data/agents';
import { getWeapon } from '@/app/games/valorant-war/data/weapons';
import { getArmor } from '@/app/games/valorant-war/data/armors';
import { getUtility } from '@/app/games/valorant-war/data/utilities';
import type { ShopAction, MatchState, AgentSlot } from '@/app/games/valorant-war/data/types';

const MAX_ROSTER = 5;

export async function POST(req: NextRequest) {
  try {
    const { matchId, action } = await req.json() as { matchId: string; action: ShopAction };
    if (!matchId || !action) {
      return NextResponse.json({ error: 'matchId and action required' }, { status: 400 });
    }

    const state = await getMatch(matchId);
    if (!state) return NextResponse.json({ error: 'match not found' }, { status: 404 });
    if (state.status !== 'in_progress') {
      return NextResponse.json({ error: 'match not in progress' }, { status: 400 });
    }
    if (state.phase !== 'shop') {
      return NextResponse.json({ error: 'not in shop phase' }, { status: 400 });
    }

    const next = applyShopAction(state, action);
    if ('error' in next) return NextResponse.json({ error: next.error }, { status: 400 });

    await updateMatch(next.state);
    return NextResponse.json({ state: next.state });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

function applyShopAction(state: MatchState, action: ShopAction): { state: MatchState } | { error: string } {
  const player = { gold: state.player.gold, roster: state.player.roster.map(s => ({ ...s })) };

  switch (action.kind) {
    case 'buy_agent': {
      const agent = getAgentSafe(action.agentId);
      if (!agent) return { error: 'unknown agent' };
      if (player.roster.length >= MAX_ROSTER) return { error: 'roster full' };
      if (player.roster.some(s => s.agentId === agent.id)) return { error: 'agent already owned' };
      if (player.gold < agent.cost) return { error: 'insufficient gold' };
      player.roster.push({ agentId: agent.id, weaponId: 'classic', armorId: 'none', utilityId: null });
      player.gold -= agent.cost;
      break;
    }
    case 'buy_weapon': {
      const slot = player.roster[action.slotIdx];
      if (!slot) return { error: 'invalid slot' };
      const weapon = getWeaponSafe(action.weaponId);
      if (!weapon) return { error: 'unknown weapon' };
      if (slot.weaponId === weapon.id) return { error: 'already equipped' };
      // Charge full cost (no refund on swap — matches Valorant behavior)
      if (player.gold < weapon.cost) return { error: 'insufficient gold' };
      slot.weaponId = weapon.id;
      player.gold -= weapon.cost;
      break;
    }
    case 'buy_armor': {
      const slot = player.roster[action.slotIdx];
      if (!slot) return { error: 'invalid slot' };
      const armor = getArmorSafe(action.armorId);
      if (!armor) return { error: 'unknown armor' };
      if (slot.armorId === armor.id) return { error: 'already equipped' };
      if (player.gold < armor.cost) return { error: 'insufficient gold' };
      slot.armorId = armor.id;
      player.gold -= armor.cost;
      break;
    }
    case 'buy_utility': {
      const slot = player.roster[action.slotIdx];
      if (!slot) return { error: 'invalid slot' };
      const util = getUtilitySafe(action.utilityId);
      if (!util) return { error: 'unknown utility' };
      if (slot.utilityId === util.id) return { error: 'already equipped' };
      if (player.gold < util.cost) return { error: 'insufficient gold' };
      slot.utilityId = util.id;
      player.gold -= util.cost;
      break;
    }
    case 'clear_utility': {
      const slot = player.roster[action.slotIdx];
      if (!slot) return { error: 'invalid slot' };
      slot.utilityId = null;
      break;
    }
  }

  return { state: { ...state, player } };
}

function getAgentSafe(id: string) { try { return getAgent(id); } catch { return null; } }
function getWeaponSafe(id: string) { try { return getWeapon(id); } catch { return null; } }
function getArmorSafe(id: string) { try { return getArmor(id); } catch { return null; } }
function getUtilitySafe(id: string) { try { return getUtility(id); } catch { return null; } }
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 3.4: Create `app/api/games/valorant-war/play-round/route.ts`

**Files:**
- Create: `web/app/api/games/valorant-war/play-round/route.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/api/games/valorant-war/play-round/route.ts
// POST → AI shops, simulate round, persist, return events + new state.
// Body: { matchId }
// Returns: { state, roundResult }
import { NextRequest, NextResponse } from 'next/server';
import { getMatch, updateMatch } from '@/app/games/valorant-war/lib/matchRepo';
import { mulberry32 } from '@/app/games/valorant-war/lib/rng';
import { aiShop } from '@/app/games/valorant-war/lib/aiShopper';
import { simulateRound } from '@/app/games/valorant-war/lib/simulator';
import {
  computeGoldAwards, nextConsecutiveLosses, applyGold,
} from '@/app/games/valorant-war/lib/economy';
import type { MatchState, RoundResult } from '@/app/games/valorant-war/data/types';

const FIRST_TO_WIN = 4;

export async function POST(req: NextRequest) {
  try {
    const { matchId } = await req.json() as { matchId: string };
    const state = await getMatch(matchId);
    if (!state) return NextResponse.json({ error: 'match not found' }, { status: 404 });
    if (state.status !== 'in_progress') {
      return NextResponse.json({ error: 'match not in progress' }, { status: 400 });
    }
    if (state.phase !== 'shop') {
      return NextResponse.json({ error: 'not in shop phase' }, { status: 400 });
    }
    if (state.player.roster.length === 0) {
      return NextResponse.json({ error: 'must own at least one agent before playing a round' }, { status: 400 });
    }

    // Seed: derive a per-round sub-seed so AI shop and battle aren't sharing draws across rounds
    const subSeed = (state.seed ^ (state.currentRound * 0x9E3779B1)) >>> 0;
    const rng = mulberry32(subSeed);

    // 1. AI shops
    const newAiState = aiShop(state.ai, rng);

    // 2. Simulate round
    const sim = simulateRound(state.player, newAiState, state.currentRound, state.map, rng);

    // 3. Compute economy
    const awards = computeGoldAwards(sim.winner, sim.killCounts, state.consecutiveLosses);
    const consec = nextConsecutiveLosses(state.consecutiveLosses, sim.winner);

    // 4. Persist round result with awards filled in
    const roundResult: RoundResult = { ...sim, goldAwarded: awards };

    // 5. Update scores
    const playerScore = state.playerScore + (sim.winner === 'player' || sim.winner === 'tie' ? 1 : 0);
    const aiScore     = state.aiScore     + (sim.winner === 'ai' ? 1 : 0);

    // 6. Decide if match ended
    const matchOver = playerScore >= FIRST_TO_WIN || aiScore >= FIRST_TO_WIN || state.currentRound >= 7;
    const winner = !matchOver ? null : (playerScore > aiScore ? 'player' : aiScore > playerScore ? 'ai' : 'player');

    // 7. Build next state (apply gold AFTER snapshot, increment round)
    let nextState: MatchState = {
      ...state,
      ai: newAiState,
      rounds: [...state.rounds, roundResult],
      playerScore,
      aiScore,
      consecutiveLosses: consec,
      currentRound: matchOver ? state.currentRound : state.currentRound + 1,
      phase: matchOver ? 'finished' : 'shop',
      status: matchOver ? 'completed' : 'in_progress',
      winner,
      completedAt: matchOver ? Date.now() : null,
    };
    nextState = applyGold(nextState, awards);

    await updateMatch(nextState);
    return NextResponse.json({ state: nextState, roundResult });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 3.5: Create `app/api/games/valorant-war/match/[matchId]/route.ts`

**Files:**
- Create: `web/app/api/games/valorant-war/match/[matchId]/route.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/api/games/valorant-war/match/[matchId]/route.ts
// GET → return current match state (so client can refresh / resume).
import { NextRequest, NextResponse } from 'next/server';
import { getMatch } from '@/app/games/valorant-war/lib/matchRepo';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  try {
    const { matchId } = await params;
    const state = await getMatch(matchId);
    if (!state) return NextResponse.json({ error: 'match not found' }, { status: 404 });
    return NextResponse.json({ state });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 3.6: Create `scripts/testValorantWarApi.ts`

**Files:**
- Create: `web/scripts/testValorantWarApi.ts`

- [ ] **Step 1: Write the smoke test**

```typescript
// web/scripts/testValorantWarApi.ts
// End-to-end smoke test. Requires `npm run dev` running on :3000.
// Usage: npx tsx scripts/testValorantWarApi.ts
const BASE = 'http://localhost:3000/api/games/valorant-war';

async function post(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${JSON.stringify(j)}`);
  return j;
}

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`);
  const j = await r.json();
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${JSON.stringify(j)}`);
  return j;
}

async function main() {
  console.log('1. new-match');
  const { matchId, state: s0 } = await post('/new-match', {});
  console.log(`   matchId=${matchId} map=${s0.map} gold=${s0.player.gold}`);

  console.log('2. shop: buy phoenix');
  const { state: s1 } = await post('/shop', { matchId, action: { kind: 'buy_agent', agentId: 'phoenix' } });
  console.log(`   roster=${s1.player.roster.length} gold=${s1.player.gold}`);

  console.log('3. shop: buy sheriff for slot 0');
  const { state: s2 } = await post('/shop', { matchId, action: { kind: 'buy_weapon', slotIdx: 0, weaponId: 'sheriff' } });
  console.log(`   slot0.weapon=${s2.player.roster[0].weaponId} gold=${s2.player.gold}`);

  console.log('4. play-round');
  const { state: s3, roundResult } = await post('/play-round', { matchId });
  console.log(`   round1 winner=${roundResult.winner} score=${s3.playerScore}-${s3.aiScore} gold=${s3.player.gold} phase=${s3.phase}`);

  console.log('5. GET match state');
  const { state: s4 } = await get(`/match/${matchId}`);
  console.log(`   round=${s4.currentRound} phase=${s4.phase} status=${s4.status}`);

  console.log('\n✅ All API endpoints responded correctly');
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Start dev server**

In one terminal:
```bash
cd /Users/sjain/Documents/iesports/iesports/web && npm run dev
```
Wait for "Ready in" line.

- [ ] **Step 3: Run smoke test**

In another terminal:
```bash
cd /Users/sjain/Documents/iesports/iesports/web && npx tsx scripts/testValorantWarApi.ts
```
Expected: all 5 steps print → final ✅ line.

- [ ] **Step 4: Verify Firestore write**

Open Firebase Console → project iesports-auth → Firestore → look for collection `valorantWarGames` → confirm a doc with the matchId from step 1.

## Phase 3 Checkpoint

- [ ] **tsc clean** — `npx tsc --noEmit` → 0 errors
- [ ] **API smoke passes** — script runs to ✅
- [ ] **Firestore write confirmed**
- [ ] **Stop and report.** Wait for user approval before Phase 4.

---

# PHASE 4 — Selection / Shop UI

Goal: a working text-only UI where the user can complete a full match (no fancy animation yet — just shop + textual round result).

## Task 4.1: Create `data/colors.ts` (palette constants)

**Files:**
- Create: `web/app/games/valorant-war/data/colors.ts`

- [ ] **Step 1: Write the file**

```typescript
// web/app/games/valorant-war/data/colors.ts
// Inline-style color palette matched to app/valorant/page.tsx.
// We'd put these in CSS but the project rule is inline-only.
export const COLORS = {
  bg:           '#0f1923',
  bgRaised:     'rgba(255,255,255,0.04)',
  bgHover:      'rgba(255,255,255,0.06)',
  border:       'rgba(255,255,255,0.1)',
  text:         '#F0EEEA',
  textMuted:    'rgba(255,255,255,0.55)',
  textDim:      'rgba(255,255,255,0.35)',
  accent:       '#3CCBFF',
  accentHover:  '#30B5E6',
  warning:      '#fbbf24',
  danger:       '#ff5252',
  success:      '#4ade80',
  hpBar:        '#4ade80',
  hpBarLow:     '#fbbf24',
  hpBarCrit:    '#ff5252',
} as const;
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 4.2: Create `components/EconomyBar.tsx`

**Files:**
- Create: `web/app/games/valorant-war/components/EconomyBar.tsx`

- [ ] **Step 1: Write the file**

```tsx
// web/app/games/valorant-war/components/EconomyBar.tsx
'use client';
import { COLORS } from '../data/colors';
import type { MatchState } from '../data/types';

export default function EconomyBar({ state }: { state: MatchState }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 20px',
      background: COLORS.bgRaised,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      marginBottom: 16,
      color: COLORS.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ display: 'flex', gap: 24 }}>
        <span style={{ color: COLORS.textMuted, fontSize: 13 }}>Round</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{state.currentRound} / 7</span>
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        <span style={{ color: COLORS.accent, fontWeight: 700 }}>YOU {state.playerScore}</span>
        <span style={{ color: COLORS.textDim }}>vs</span>
        <span style={{ color: COLORS.danger, fontWeight: 700 }}>AI {state.aiScore}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
        <span style={{ color: COLORS.textMuted, fontSize: 13 }}>Gold</span>
        <span style={{ color: COLORS.warning, fontWeight: 800, fontSize: 18 }}>
          {state.player.gold}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 4.3: Create `components/RosterDisplay.tsx`

**Files:**
- Create: `web/app/games/valorant-war/components/RosterDisplay.tsx`

- [ ] **Step 1: Write the file**

```tsx
// web/app/games/valorant-war/components/RosterDisplay.tsx
'use client';
import { COLORS } from '../data/colors';
import { getAgent } from '../data/agents';
import { getWeapon } from '../data/weapons';
import { getArmor } from '../data/armors';
import { getUtility } from '../data/utilities';
import type { TeamState } from '../data/types';

interface Props {
  team: TeamState;
  side: 'player' | 'ai';
  selectedSlot?: number | null;
  onSelectSlot?: (idx: number) => void;
}

export default function RosterDisplay({ team, side, selectedSlot, onSelectSlot }: Props) {
  return (
    <div>
      <div style={{
        fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
        color: side === 'player' ? COLORS.accent : COLORS.danger,
        marginBottom: 8,
      }}>
        {side === 'player' ? 'YOUR ROSTER' : 'AI ROSTER'} ({team.roster.length}/5)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {[0, 1, 2, 3, 4].map(i => {
          const slot = team.roster[i];
          if (!slot) {
            return (
              <div key={i} style={{
                padding: 12, minHeight: 80,
                background: COLORS.bgRaised,
                border: `1px dashed ${COLORS.border}`,
                borderRadius: 6,
                color: COLORS.textDim, fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                empty
              </div>
            );
          }
          const agent = getAgent(slot.agentId);
          const weapon = getWeapon(slot.weaponId);
          const armor = getArmor(slot.armorId);
          const utility = slot.utilityId ? getUtility(slot.utilityId) : null;
          const isSelected = selectedSlot === i;
          const clickable = !!onSelectSlot;
          return (
            <button
              key={i}
              onClick={() => onSelectSlot?.(i)}
              disabled={!clickable}
              style={{
                padding: 12, minHeight: 80, textAlign: 'left',
                background: isSelected ? COLORS.bgHover : COLORS.bgRaised,
                border: `1px solid ${isSelected ? COLORS.accent : COLORS.border}`,
                borderRadius: 6,
                color: COLORS.text,
                cursor: clickable ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{agent.name}</div>
              <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
                {agent.role}
              </div>
              <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 6 }}>
                {weapon.name} · {armor.name}
              </div>
              {utility && (
                <div style={{ fontSize: 10, color: COLORS.warning, marginTop: 2 }}>
                  +{utility.name}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 4.4: Create `components/ShopPanel.tsx`

**Files:**
- Create: `web/app/games/valorant-war/components/ShopPanel.tsx`

- [ ] **Step 1: Write the file**

```tsx
// web/app/games/valorant-war/components/ShopPanel.tsx
'use client';
import { useState } from 'react';
import { COLORS } from '../data/colors';
import { AGENTS } from '../data/agents';
import { WEAPONS } from '../data/weapons';
import { ARMORS } from '../data/armors';
import { UTILITIES } from '../data/utilities';
import type { MatchState, ShopAction } from '../data/types';

interface Props {
  state: MatchState;
  selectedSlot: number | null;
  onShop: (action: ShopAction) => Promise<void>;
  onPlayRound: () => Promise<void>;
  busy: boolean;
}

type Tab = 'agents' | 'weapons' | 'armor' | 'utility';

export default function ShopPanel({ state, selectedSlot, onShop, onPlayRound, busy }: Props) {
  const [tab, setTab] = useState<Tab>('agents');
  const ownedAgentIds = new Set(state.player.roster.map(s => s.agentId));
  const slot = selectedSlot != null ? state.player.roster[selectedSlot] ?? null : null;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'agents', label: 'Agents' },
    { id: 'weapons', label: 'Weapons' },
    { id: 'armor', label: 'Armor' },
    { id: 'utility', label: 'Utility' },
  ];

  return (
    <div style={{
      background: COLORS.bgRaised,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      padding: 16,
      color: COLORS.text,
    }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '6px 14px',
            background: tab === t.id ? COLORS.accent : 'transparent',
            color: tab === t.id ? COLORS.bg : COLORS.textMuted,
            border: `1px solid ${tab === t.id ? COLORS.accent : COLORS.border}`,
            borderRadius: 4,
            fontWeight: 700, fontSize: 12,
            cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'agents' && (
        <ShopGrid items={AGENTS.map(a => ({
          id: a.id, name: a.name, sub: `${a.role} · ${a.abilityName}`, cost: a.cost,
          disabled: ownedAgentIds.has(a.id) || state.player.roster.length >= 5 || a.cost > state.player.gold || busy,
          onClick: () => onShop({ kind: 'buy_agent', agentId: a.id }),
        }))} />
      )}

      {tab === 'weapons' && (
        slot == null
          ? <Hint text="Click an agent slot above to assign a weapon." />
          : <ShopGrid items={WEAPONS.map(w => ({
              id: w.id, name: w.name, sub: `+${w.damageBonus} dmg`, cost: w.cost,
              disabled: slot.weaponId === w.id || w.cost > state.player.gold || busy,
              onClick: () => onShop({ kind: 'buy_weapon', slotIdx: selectedSlot!, weaponId: w.id }),
            }))} />
      )}

      {tab === 'armor' && (
        slot == null
          ? <Hint text="Click an agent slot above to assign armor." />
          : <ShopGrid items={ARMORS.map(a => ({
              id: a.id, name: a.name, sub: `+${a.hpBonus} HP`, cost: a.cost,
              disabled: slot.armorId === a.id || a.cost > state.player.gold || busy,
              onClick: () => onShop({ kind: 'buy_armor', slotIdx: selectedSlot!, armorId: a.id }),
            }))} />
      )}

      {tab === 'utility' && (
        slot == null
          ? <Hint text="Click an agent slot above to assign a utility." />
          : <ShopGrid items={UTILITIES.map(u => ({
              id: u.id, name: u.name, sub: u.effect, cost: u.cost,
              disabled: slot.utilityId === u.id || u.cost > state.player.gold || busy,
              onClick: () => onShop({ kind: 'buy_utility', slotIdx: selectedSlot!, utilityId: u.id }),
            }))} />
      )}

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onPlayRound}
          disabled={state.player.roster.length === 0 || busy}
          style={{
            padding: '10px 28px',
            background: state.player.roster.length === 0 ? COLORS.bgHover : COLORS.accent,
            color: state.player.roster.length === 0 ? COLORS.textDim : COLORS.bg,
            border: 'none', borderRadius: 4,
            fontWeight: 800, fontSize: 14, letterSpacing: '0.05em',
            cursor: state.player.roster.length === 0 ? 'not-allowed' : 'pointer',
          }}>
          {busy ? '...' : 'PLAY ROUND →'}
        </button>
      </div>
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return <div style={{ color: COLORS.textMuted, fontSize: 13, padding: 24, textAlign: 'center' }}>{text}</div>;
}

interface ShopItemProps {
  id: string; name: string; sub: string; cost: number;
  disabled: boolean; onClick: () => void;
}

function ShopGrid({ items }: { items: ShopItemProps[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
      {items.map(it => (
        <button key={it.id} onClick={it.onClick} disabled={it.disabled} style={{
          padding: 10, textAlign: 'left',
          background: it.disabled ? 'transparent' : COLORS.bgHover,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 4,
          color: it.disabled ? COLORS.textDim : COLORS.text,
          cursor: it.disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{it.name}</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{it.sub}</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.warning, marginTop: 4 }}>{it.cost}g</div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 4.5: Create lobby `app/games/valorant-war/page.tsx`

**Files:**
- Create: `web/app/games/valorant-war/page.tsx`

- [ ] **Step 1: Write the file**

```tsx
// web/app/games/valorant-war/page.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import { auth } from '@/lib/firebase';
import { COLORS } from './data/colors';

export default function LobbyPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startNew() {
    setBusy(true); setError(null);
    try {
      const idToken = user ? await auth.currentUser?.getIdToken() : undefined;
      const r = await fetch('/api/games/valorant-war/new-match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'failed to create match');
      router.push(`/games/valorant-war/match/${j.matchId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: COLORS.bg, color: COLORS.text,
      padding: 32, fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em' }}>
          Valorant <span style={{ color: COLORS.accent }}>Atomic War</span>
        </h1>
        <p style={{ color: COLORS.textMuted, fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
          A side-game auto-battler. Buy agents, equip them, and fight a 7-round duel against the AI.
          Match state is server-authoritative — no cheating yourself rich.
        </p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <button onClick={startNew} disabled={busy} style={{
            padding: '12px 32px',
            background: busy ? COLORS.bgHover : COLORS.accent,
            color: busy ? COLORS.textDim : COLORS.bg,
            border: 'none', borderRadius: 4,
            fontWeight: 800, fontSize: 14, letterSpacing: '0.05em',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}>
            {busy ? 'CREATING...' : 'NEW MATCH'}
          </button>
          <a href="/" style={{
            padding: '12px 24px',
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            color: COLORS.textMuted,
            textDecoration: 'none', fontSize: 13,
            display: 'flex', alignItems: 'center',
          }}>← Back to iEsports</a>
        </div>
        {error && (
          <div style={{ marginTop: 16, padding: 10, background: 'rgba(255,82,82,0.1)',
                       border: `1px solid ${COLORS.danger}`, borderRadius: 4,
                       color: COLORS.danger, fontSize: 13 }}>
            {error}
          </div>
        )}
        <div style={{ marginTop: 32, fontSize: 12, color: COLORS.textDim }}>
          {user ? `Logged in — match will be saved to your record.` : `Anonymous — match recorded without a player ID.`}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify**

Note: the file imports `useAuth` — verify the export name. Check `app/context/AuthContext.tsx`. If it exports as `useAuth`, the import is correct. If it's exported under a different name, update accordingly. Run:

```bash
grep -nE "^export (const|function) use" /Users/sjain/Documents/iesports/iesports/web/app/context/AuthContext.tsx
```
Expected: a line `export function useAuth(...)` or `export const useAuth = ...`. If different, update the import in `page.tsx` to match.

Run `npx tsc --noEmit`. Expected: 0 errors.

## Task 4.6: Create match page `app/games/valorant-war/match/[matchId]/page.tsx`

**Files:**
- Create: `web/app/games/valorant-war/match/[matchId]/page.tsx`

- [ ] **Step 1: Write the file**

```tsx
// web/app/games/valorant-war/match/[matchId]/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { COLORS } from '../../data/colors';
import EconomyBar from '../../components/EconomyBar';
import RosterDisplay from '../../components/RosterDisplay';
import ShopPanel from '../../components/ShopPanel';
import type { MatchState, ShopAction, RoundResult } from '../../data/types';

type RoundView =
  | { kind: 'shop' }
  | { kind: 'playing'; result: RoundResult }
  | { kind: 'finished' };

export default function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params?.matchId ?? '';
  const [state, setState] = useState<MatchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [view, setView] = useState<RoundView>({ kind: 'shop' });

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/games/valorant-war/match/${matchId}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'failed to load match');
      setState(j.state);
      if (j.state.status === 'completed') setView({ kind: 'finished' });
    } catch (e) { setError((e as Error).message); }
  }, [matchId]);

  useEffect(() => { if (matchId) refresh(); }, [matchId, refresh]);

  async function shop(action: ShopAction) {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/games/valorant-war/shop', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matchId, action }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'shop failed');
      setState(j.state);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function playRound() {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/games/valorant-war/play-round', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matchId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'play-round failed');
      setState(j.state);
      setView({ kind: 'playing', result: j.roundResult });
      setSelectedSlot(null);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!state) {
    return (
      <main style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text, padding: 32 }}>
        {error ? <div style={{ color: COLORS.danger }}>{error}</div> : 'Loading...'}
      </main>
    );
  }

  return (
    <main style={{
      minHeight: '100vh', background: COLORS.bg, color: COLORS.text,
      padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900 }}>
            Atomic War <span style={{ color: COLORS.accent }}>·</span> {state.map}
          </h1>
          <a href="/games/valorant-war" style={{ color: COLORS.textMuted, fontSize: 12, textDecoration: 'none' }}>← Lobby</a>
        </div>
        <EconomyBar state={state} />

        {/* AI roster (read-only) */}
        <div style={{ marginBottom: 16 }}>
          <RosterDisplay team={state.ai} side="ai" />
        </div>

        {/* Player roster (clickable for shop targeting) */}
        <div style={{ marginBottom: 16 }}>
          <RosterDisplay
            team={state.player}
            side="player"
            selectedSlot={selectedSlot}
            onSelectSlot={(i) => setSelectedSlot(i === selectedSlot ? null : i)}
          />
        </div>

        {view.kind === 'shop' && state.status === 'in_progress' && (
          <ShopPanel
            state={state} selectedSlot={selectedSlot}
            onShop={shop} onPlayRound={playRound} busy={busy}
          />
        )}

        {view.kind === 'playing' && (
          <RoundResultPanel
            result={view.result}
            onContinue={() => {
              if (state.status === 'completed') setView({ kind: 'finished' });
              else setView({ kind: 'shop' });
            }}
          />
        )}

        {view.kind === 'finished' && (
          <FinishedPanel state={state} />
        )}

        {error && (
          <div style={{ marginTop: 16, padding: 10, background: 'rgba(255,82,82,0.1)',
                       border: `1px solid ${COLORS.danger}`, borderRadius: 4,
                       color: COLORS.danger, fontSize: 13 }}>{error}</div>
        )}
      </div>
    </main>
  );
}

function RoundResultPanel({ result, onContinue }: { result: RoundResult; onContinue: () => void }) {
  const winnerLabel =
    result.winner === 'player' ? 'YOU WON THE ROUND' :
    result.winner === 'ai'     ? 'AI WON THE ROUND'  :
                                 'TIE — economy favors you';
  const winnerColor =
    result.winner === 'player' || result.winner === 'tie' ? COLORS.success :
                                                            COLORS.danger;
  return (
    <div style={{
      padding: 20,
      background: COLORS.bgRaised,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      color: COLORS.text,
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: winnerColor }}>{winnerLabel}</div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 4 }}>
        Round {result.roundNumber} · kills {result.killCounts.player}–{result.killCounts.ai}
      </div>
      <div style={{ fontSize: 13, color: COLORS.warning, marginTop: 8 }}>
        +{result.goldAwarded.player}g (you) · +{result.goldAwarded.ai}g (AI)
      </div>
      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', color: COLORS.textMuted, fontSize: 12 }}>
          Show {result.events.length} events
        </summary>
        <pre style={{ fontSize: 11, color: COLORS.textDim, maxHeight: 240, overflow: 'auto', marginTop: 8 }}>
          {result.events.map(e => JSON.stringify(e)).join('\n')}
        </pre>
      </details>
      <button onClick={onContinue} style={{
        marginTop: 16,
        padding: '10px 24px',
        background: COLORS.accent, color: COLORS.bg,
        border: 'none', borderRadius: 4,
        fontWeight: 800, fontSize: 13, cursor: 'pointer',
      }}>CONTINUE →</button>
    </div>
  );
}

function FinishedPanel({ state }: { state: MatchState }) {
  const won = state.winner === 'player';
  return (
    <div style={{
      padding: 32, textAlign: 'center',
      background: COLORS.bgRaised,
      border: `2px solid ${won ? COLORS.success : COLORS.danger}`,
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 32, fontWeight: 900,
                   color: won ? COLORS.success : COLORS.danger }}>
        {won ? 'VICTORY' : 'DEFEAT'}
      </div>
      <div style={{ fontSize: 14, color: COLORS.textMuted, marginTop: 4 }}>
        Final: {state.playerScore} – {state.aiScore}
      </div>
      <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center' }}>
        <a href="/games/valorant-war" style={{
          padding: '10px 24px',
          background: COLORS.accent, color: COLORS.bg,
          textDecoration: 'none', borderRadius: 4,
          fontWeight: 800, fontSize: 13,
        }}>PLAY AGAIN</a>
        <a href="/" style={{
          padding: '10px 24px',
          border: `1px solid ${COLORS.border}`,
          color: COLORS.textMuted,
          textDecoration: 'none', borderRadius: 4,
          fontSize: 13,
        }}>← iEsports</a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

```bash
cd /Users/sjain/Documents/iesports/iesports/web && npx tsc --noEmit
```
Expected: 0 errors.

## Task 4.7: Manual browser smoke test

- [ ] **Step 1: Start dev server (if not already running)**

```bash
cd /Users/sjain/Documents/iesports/iesports/web && npm run dev
```

- [ ] **Step 2: Open browser to lobby**

Navigate to `http://localhost:3000/games/valorant-war`. Verify:
- Title renders, "NEW MATCH" button visible
- Click "NEW MATCH" → routes to `/games/valorant-war/match/<id>`

- [ ] **Step 3: Walk through one match in browser**

On the match page:
1. Buy Phoenix (400g) → roster shows 1 agent, gold drops to 400
2. Click slot 0 → it highlights
3. Tab "Weapons" → buy Sheriff (impossible at 400g; should be disabled). Buy nothing.
4. Tab "Agents" → buy Sage (500g cost, but you have 400 — should be disabled). OK try Phoenix again — disabled (already owned). Continue with what you have.
5. Click "PLAY ROUND →" → result panel shows winner / kills / gold
6. Click "CONTINUE →" → back to shop with new gold
7. Continue until match ends — verify VICTORY/DEFEAT panel shows

If anything misbehaves: open browser DevTools → Network → inspect failed call. Open Console for client-side errors.

- [ ] **Step 4: Verify persistence**

After completing one round, hit `GET /api/games/valorant-war/match/<matchId>` (paste in browser address bar) → should return JSON with `currentRound: 2`, `rounds: [...]`. Also check Firestore Console.

## Phase 4 Checkpoint

- [ ] **tsc clean**
- [ ] **Browser walk-through completes (lobby → match → finished panel)**
- [ ] **Stop and report.** Wait for user approval before Phase 5.

---

# PHASE 5 — Canvas Battle Renderer

Goal: replace the textual round result with an animated canvas playback of the BattleEvent stream.

## Task 5.1: Create `components/BattleRenderer.tsx`

**Files:**
- Create: `web/app/games/valorant-war/components/BattleRenderer.tsx`

- [ ] **Step 1: Write the file**

```tsx
// web/app/games/valorant-war/components/BattleRenderer.tsx
// Canvas-based battle event playback. Future-Phaser-ready: this whole component
// is the swap-out seam. The contract is:
//   - props: { events, playerRoster, aiRoster, onComplete }
//   - it renders a fixed-size canvas, plays each event at TICK_MS, then calls onComplete()
'use client';
import { useEffect, useRef, useState } from 'react';
import { COLORS } from '../data/colors';
import { getAgent } from '../data/agents';
import { getArmor } from '../data/armors';
import { getUtility } from '../data/utilities';
import type { BattleEvent, AgentSlot, Side } from '../data/types';

interface Props {
  events: BattleEvent[];
  playerRoster: AgentSlot[];
  aiRoster: AgentSlot[];
  onComplete: () => void;
}

const W = 880;
const H = 320;
const SLOT_W = 140;
const SLOT_H = 90;
const ROW_Y_PLAYER = H - SLOT_H - 30;
const ROW_Y_AI = 30;
const TICK_MS = 700;

export default function BattleRenderer({ events, playerRoster, aiRoster, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [eventIdx, setEventIdx] = useState(0);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [playerHps, setPlayerHps] = useState<number[]>(() => playerRoster.map(s => maxHp(s)));
  const [aiHps, setAiHps] = useState<number[]>(() => aiRoster.map(s => maxHp(s)));
  const [eliminated, setEliminated] = useState<{ player: Set<number>; ai: Set<number> }>({
    player: new Set(), ai: new Set(),
  });
  const [bannerText, setBannerText] = useState<string | null>(null);
  const completedRef = useRef(false);

  // Drive event playback with setTimeout
  useEffect(() => {
    if (completedRef.current) return;
    if (eventIdx >= events.length) {
      completedRef.current = true;
      const t = setTimeout(() => onComplete(), 600);
      return () => clearTimeout(t);
    }

    const ev = events[eventIdx];
    let cancelled = false;

    function next() { if (!cancelled) setEventIdx(i => i + 1); }

    if (ev.type === 'round_start') {
      setPlayerHps(ev.playerHps);
      setAiHps(ev.aiHps);
      setBannerText(`ROUND ${ev.roundNumber} — ${ev.map}`);
      const t = setTimeout(() => { setBannerText(null); next(); }, TICK_MS);
      return () => { cancelled = true; clearTimeout(t); };
    }
    if (ev.type === 'ability') {
      setBannerText(`${getAgent(ev.agentId).name}: ${ev.abilityName}`);
      const t = setTimeout(() => { setBannerText(null); next(); }, TICK_MS);
      return () => { cancelled = true; clearTimeout(t); };
    }
    if (ev.type === 'attack') {
      const dSide = ev.defender.side;
      const dIdx = ev.defender.slotIdx;
      // Update HP of defender
      if (dSide === 'player') {
        setPlayerHps(hps => hps.map((h, i) => i === dIdx ? ev.defenderHpAfter : h));
      } else {
        setAiHps(hps => hps.map((h, i) => i === dIdx ? ev.defenderHpAfter : h));
      }
      // Floater
      setFloaters(f => [...f, {
        id: Math.random(),
        text: ev.missed ? 'MISS' : `-${ev.damage}`,
        side: dSide, slotIdx: dIdx,
        color: ev.missed ? COLORS.textDim : COLORS.danger,
        born: Date.now(),
      }]);
      const t = setTimeout(next, TICK_MS);
      return () => { cancelled = true; clearTimeout(t); };
    }
    if (ev.type === 'eliminate') {
      setEliminated(prev => ({
        ...prev,
        [ev.side]: new Set([...prev[ev.side], ev.slotIdx]),
      }));
      const t = setTimeout(next, TICK_MS);
      return () => { cancelled = true; clearTimeout(t); };
    }
    if (ev.type === 'round_end') {
      const label =
        ev.winner === 'player' ? 'ROUND WON' :
        ev.winner === 'ai'     ? 'ROUND LOST' :
                                 'TIE';
      setBannerText(label);
      const t = setTimeout(next, TICK_MS * 1.4);
      return () => { cancelled = true; clearTimeout(t); };
    }
  }, [eventIdx, events, onComplete]);

  // Floater cleanup (remove after 1s)
  useEffect(() => {
    if (floaters.length === 0) return;
    const t = setInterval(() => {
      const cutoff = Date.now() - 1000;
      setFloaters(f => f.filter(x => x.born > cutoff));
    }, 200);
    return () => clearInterval(t);
  }, [floaters.length]);

  // Render
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    drawScene(ctx, {
      playerRoster, aiRoster,
      playerHps, aiHps,
      eliminated, floaters, bannerText,
    });
  });

  return (
    <div style={{
      background: COLORS.bgRaised,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      padding: 12,
    }}>
      <canvas
        ref={canvasRef}
        width={W} height={H}
        style={{ width: '100%', maxWidth: W, height: 'auto', display: 'block' }}
      />
    </div>
  );
}

interface Floater {
  id: number; text: string; side: Side; slotIdx: number;
  color: string; born: number;
}

function maxHp(slot: AgentSlot): number {
  const a = getAgent(slot.agentId);
  const ar = getArmor(slot.armorId);
  let hp = a.baseHp + ar.hpBonus;
  if (slot.utilityId) {
    const u = getUtility(slot.utilityId);
    if (u.effect === 'heal_15') hp += 15;
  }
  return hp;
}

interface SceneInput {
  playerRoster: AgentSlot[];
  aiRoster: AgentSlot[];
  playerHps: number[];
  aiHps: number[];
  eliminated: { player: Set<number>; ai: Set<number> };
  floaters: Floater[];
  bannerText: string | null;
}

function drawScene(ctx: CanvasRenderingContext2D, s: SceneInput) {
  // Clear
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid background
  ctx.strokeStyle = 'rgba(60,203,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Center divider
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

  const slotsAi = Math.max(s.aiRoster.length, 1);
  const slotsPlayer = Math.max(s.playerRoster.length, 1);

  // Layout helpers — center each row
  function xForSlot(idx: number, count: number) {
    const totalWidth = count * SLOT_W + (count - 1) * 12;
    const startX = (W - totalWidth) / 2;
    return startX + idx * (SLOT_W + 12);
  }

  // AI row
  for (let i = 0; i < s.aiRoster.length; i++) {
    drawSlot(ctx, xForSlot(i, slotsAi), ROW_Y_AI, s.aiRoster[i], s.aiHps[i] ?? 0,
             s.eliminated.ai.has(i), 'ai');
  }
  // Player row
  for (let i = 0; i < s.playerRoster.length; i++) {
    drawSlot(ctx, xForSlot(i, slotsPlayer), ROW_Y_PLAYER, s.playerRoster[i], s.playerHps[i] ?? 0,
             s.eliminated.player.has(i), 'player');
  }

  // Floaters
  for (const f of s.floaters) {
    const age = (Date.now() - f.born) / 1000; // 0..1
    const alpha = Math.max(0, 1 - age);
    const dy = -age * 30;
    const slotX = f.side === 'player'
      ? xForSlot(f.slotIdx, slotsPlayer)
      : xForSlot(f.slotIdx, slotsAi);
    const slotY = f.side === 'player' ? ROW_Y_PLAYER : ROW_Y_AI;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = f.color;
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(f.text, slotX + SLOT_W / 2, slotY - 4 + dy);
    ctx.globalAlpha = 1;
  }

  // Banner
  if (s.bannerText) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H / 2 - 24, W, 48);
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 18px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.bannerText, W / 2, H / 2);
    ctx.textBaseline = 'alphabetic';
  }
}

function drawSlot(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  slot: AgentSlot, hp: number,
  isEliminated: boolean,
  side: Side,
) {
  const agent = getAgent(slot.agentId);
  const max = maxHp(slot);
  const pct = max > 0 ? hp / max : 0;

  ctx.globalAlpha = isEliminated ? 0.3 : 1;

  // Card
  ctx.fillStyle = COLORS.bgRaised;
  ctx.strokeStyle = side === 'player' ? COLORS.accent : COLORS.danger;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, SLOT_W, SLOT_H, 6);
  ctx.fill();
  ctx.stroke();

  // Agent name
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 14px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(agent.name, x + 10, y + 22);

  // Role
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '11px system-ui';
  ctx.fillText(agent.role, x + 10, y + 38);

  // HP bar
  const barX = x + 10, barY = y + 50, barW = SLOT_W - 20, barH = 8;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle =
    pct > 0.5 ? COLORS.hpBar :
    pct > 0.25 ? COLORS.hpBarLow : COLORS.hpBarCrit;
  ctx.fillRect(barX, barY, barW * pct, barH);

  // HP text
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = '10px system-ui';
  ctx.fillText(`${hp} / ${max}`, x + 10, y + 76);

  ctx.globalAlpha = 1;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 5.2: Wire BattleRenderer into match page

**Files:**
- Modify: `web/app/games/valorant-war/match/[matchId]/page.tsx`

- [ ] **Step 1: Replace the `view.kind === 'playing'` branch**

Find the existing block:
```tsx
{view.kind === 'playing' && (
  <RoundResultPanel
    result={view.result}
    onContinue={() => {
      if (state.status === 'completed') setView({ kind: 'finished' });
      else setView({ kind: 'shop' });
    }}
  />
)}
```

Replace with a two-step playback (animation then summary). Use a sub-state to switch between renderer and summary panel:

```tsx
{view.kind === 'playing' && (
  <PlaybackThenSummary
    result={view.result}
    state={state}
    onContinue={() => {
      if (state.status === 'completed') setView({ kind: 'finished' });
      else setView({ kind: 'shop' });
    }}
  />
)}
```

- [ ] **Step 2: Add the `PlaybackThenSummary` component at the bottom of the file**

Append (above the existing `function RoundResultPanel` is fine — keep RoundResultPanel; we'll reuse it):

```tsx
function PlaybackThenSummary({
  result, state, onContinue,
}: { result: RoundResult; state: MatchState; onContinue: () => void }) {
  const [done, setDone] = useState(false);
  if (done) return <RoundResultPanel result={result} onContinue={onContinue} />;
  return (
    <BattleRenderer
      events={result.events}
      playerRoster={state.player.roster}
      aiRoster={state.ai.roster}
      onComplete={() => setDone(true)}
    />
  );
}
```

- [ ] **Step 3: Add the import at the top**

Add after the existing imports:
```tsx
import BattleRenderer from '../../components/BattleRenderer';
```

- [ ] **Step 4: Verify type-check**

Run: `npx tsc --noEmit`. Expected: 0 errors.

## Task 5.3: Browser verification

- [ ] **Step 1: Restart dev server if needed**

```bash
cd /Users/sjain/Documents/iesports/iesports/web && npm run dev
```

- [ ] **Step 2: Run a fresh match in browser**

Navigate to `http://localhost:3000/games/valorant-war` → NEW MATCH. Buy 2 agents + sheriff for slot 0 → PLAY ROUND.

Expected:
- Canvas renders (~880x320px) with 2 player slots bottom, AI slots top
- Round 1 banner appears
- Attack ticks animate, damage numbers float, HP bars deplete
- Eliminations grey out the slot
- "ROUND WON/LOST/TIE" banner
- Summary panel auto-replaces canvas after ~600ms
- "CONTINUE →" returns to shop

- [ ] **Step 3: Optional — run Playwright headed verification**

Use the playwright-interactive skill (loaded). Open `http://localhost:3000/games/valorant-war/`, click NEW MATCH, then automate the buy + play-round flow. Take a screenshot of the canvas mid-battle. Visually confirm slots render, HP bars look right, no JS errors in console.

## Phase 5 Checkpoint

- [ ] **tsc clean**
- [ ] **Animation plays smoothly in browser**
- [ ] **Stop and report.** Wait for user approval before Phase 6.

---

# PHASE 6 — Polish + Nav Link

## Task 6.1: Add "Atomic War" Navbar link

**Files:**
- Modify: `web/app/components/Navbar.tsx` (additive only — find an existing game-link block and append)

- [ ] **Step 1: Read current Navbar.tsx**

Run:
```bash
grep -n "valorant\|/cs2\|/dota2\|/cod" /Users/sjain/Documents/iesports/iesports/web/app/components/Navbar.tsx | head -10
```

Identify the line that renders the desktop game-links list. Pattern is likely a series of `<Link>` or `<a>` elements with `href="/valorant"` etc.

- [ ] **Step 2: Add a single link entry**

Append a new entry adjacent to the existing game links. Example pattern (adapt to the actual JSX structure of Navbar.tsx):

```tsx
<a href="/games/valorant-war" style={{ /* match adjacent inline styles */ }}>
  Atomic War
</a>
```

If the navbar uses an array of `{ label, href }` objects mapped over, append:
```tsx
{ label: 'Atomic War', href: '/games/valorant-war' },
```

**Constraint:** must NOT modify the existing structure or styles of unrelated nav items. Pure addition.

- [ ] **Step 3: Verify type-check + visual**

```bash
cd /Users/sjain/Documents/iesports/iesports/web && npx tsc --noEmit
```
Expected: 0 errors.

In browser at `http://localhost:3000/`: confirm the new nav link appears and clicking routes to `/games/valorant-war`.

## Task 6.2: End-to-end verification

- [ ] **Step 1: Full match walkthrough**

In browser:
1. From landing → click new "Atomic War" nav link
2. Click NEW MATCH → routes to match page
3. Play through ALL 7 rounds (or until first-to-4 reached). Verify:
   - HP bars deplete correctly
   - Eliminations show as greyed slots
   - Gold accumulates round-over-round (loss bonus increases on consecutive losses)
   - Match ends with VICTORY/DEFEAT panel
4. Click PLAY AGAIN → back to lobby, can start a new match without page reload

- [ ] **Step 2: Verify Firestore final state**

Open Firebase Console → Firestore → `valorantWarGames`. Find the just-completed match. Confirm:
- `status: "completed"`
- `winner: "player"` or `"ai"`
- `rounds` array length matches actual rounds played
- `completedAt` is set

- [ ] **Step 3: Type-check + lint**

```bash
cd /Users/sjain/Documents/iesports/iesports/web && npx tsc --noEmit && npm run lint
```
Expected: 0 type errors, 0 new lint errors (existing repo lint warnings are out-of-scope).

- [ ] **Step 4: Final build smoke**

```bash
cd /Users/sjain/Documents/iesports/iesports/web && npm run build
```
Expected: build completes successfully. The new pages should appear in the build output (e.g. `/games/valorant-war`, `/games/valorant-war/match/[matchId]`, `/api/games/valorant-war/...`).

## Phase 6 Checkpoint

- [ ] **All 3 verifications pass**
- [ ] **Stop and report.** Do NOT git commit. Hand off to user for review and any final tweaks.

---

# Self-Review

**1. Spec coverage:**
- ✅ Local-only MVP (no push to GitHub) — no commit steps included
- ✅ Inline styles only — confirmed in every component
- ✅ TypeScript everywhere — all files .ts/.tsx
- ✅ Additive to shared files — only Navbar.tsx is touched, with pure-add instructions
- ✅ Admin SDK in API routes — `matchRepo.ts` uses `adminDb`
- ✅ ADMIN_SECRET pattern — not needed (no admin endpoints in this MVP) per spec
- ✅ New routes under `/games/valorant-war/` and `/api/games/valorant-war/`
- ✅ New collection `valorantWarGames` — used in `matchRepo.ts`
- ✅ Visual style matches existing Valorant page palette
- ✅ Phaser-ready canvas — `BattleRenderer` is the swap-out seam, contract documented
- ✅ Server-authoritative simulation — all sim runs in `/play-round` route
- ✅ Auth: optional, ID-token-based — `new-match` accepts `idToken`, anonymous if absent
- ✅ Progressive economy + buying agents — Phase 1-3 cover all data and state machine
- ✅ Round resets HP — `simulateRound` rebuilds fighters with fresh HP every round
- ✅ Best-of-7, first-to-4 — `play-round/route.ts` enforces `FIRST_TO_WIN = 4`
- ✅ Roughly balanced AI — `aiShop` fills roster to 3 then upgrades by weakness
- ✅ Riot policy — text labels only, no Riot art / portraits / icons

**2. Placeholder scan:**
- All steps include either complete code blocks or exact commands with expected output.
- No "TBD" / "TODO" / "etc." placeholders found.
- Task 6.1 has a slightly soft instruction ("adapt to actual JSX structure of Navbar.tsx") because Navbar's structure varies — but the engineer is given exact grep commands to find the right line and exact JSX templates for both common patterns.

**3. Type consistency check:**
- `MatchState` is defined in Task 1.1, used identically in 2.x, 3.x, and 4.x.
- `AgentSlot.utilityId` is `string | null`, used consistently as nullable everywhere.
- `BattleEvent` discriminated union matches between `simulator.ts` (producer) and `BattleRenderer.tsx` (consumer).
- `ShopAction` defined in Task 1.1, used in `shop/route.ts` and `ShopPanel.tsx` identically.
- `RoundOutcome = 'player' | 'ai' | 'tie'` consistent in `simulator.ts`, `economy.ts`, and UI panels.
- Function names: `getAgent`, `getWeapon`, `getArmor`, `getUtility` (singular `get`) used consistently.
- Constants `STARTING_GOLD`, `ROUND_WIN_BONUS`, `LOSS_BONUS_LADDER`, `KILL_REWARD`, `GOLD_CAP`, `FIRST_TO_WIN` named consistently.

No fix-ups needed.

---

# Execution Notes

- **Per CLAUDE.md rule #11**, the user does not want git commits during this MVP build. Skip every commit step in the original plan template.
- **Per user's session preference**, stop and report after each phase checkpoint. Do not continue to the next phase without user approval.
- **Per CLAUDE.md rule #6**, all server-side Firestore writes go through `adminDb` from `lib/firebaseAdmin.ts`. Never import the client `db` from `lib/firebase.ts` in API routes.
- **Per CLAUDE.md rule #10 (Riot policy)**, never download Valorant agent portraits, weapon images, or other Riot art. Text labels are sufficient and Riot-policy-safe for this MVP.
- **If a verification step fails**, STOP and ask the user. Use the `systematic-debugging` skill if the failure is a runtime bug (4-phase root cause analysis).
- **Future Phaser swap:** the `BattleRenderer` component is the single swap-out point. Same props (`events`, `playerRoster`, `aiRoster`, `onComplete`) → swap canvas internals for Phaser scene. No other code needs to change.
