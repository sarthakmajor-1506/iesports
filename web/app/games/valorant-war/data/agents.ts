import type { AgentDef } from './types';

// 8 agents. Each has a signature ability (every-other-round trigger) AND an
// ultimate (one-shot per match, auto-fires from round 4+ if alive).
export const AGENTS: AgentDef[] = [
  { id: 'phoenix', name: 'Phoenix', role: 'duelist', cost: 400,
    baseHp: 100, baseDamage: 22,
    abilityName: 'Hot Hands', abilityKind: 'aoe_damage', abilityValue: 15,
    ultimateName: 'Run It Back', ultimateKind: 'revive_self', ultimateValue: 100,
    iconUrl: 'https://media.valorant-api.com/agents/eb93336a-449b-9c1b-0a54-a891f7921d69/displayicon.png' },

  { id: 'jett', name: 'Jett', role: 'duelist', cost: 600,
    baseHp: 100, baseDamage: 21,
    abilityName: 'Updraft', abilityKind: 'dodge_buff', abilityValue: 25,
    ultimateName: 'Blade Storm', ultimateKind: 'multi_strike_3', ultimateValue: 30,
    iconUrl: 'https://media.valorant-api.com/agents/add6443a-41bd-e414-f6ad-e58d267f4e95/displayicon.png' },

  { id: 'sova', name: 'Sova', role: 'initiator', cost: 500,
    baseHp: 100, baseDamage: 19,
    abilityName: 'Recon Bolt', abilityKind: 'recon', abilityValue: 15,
    ultimateName: "Hunter's Fury", ultimateKind: 'big_strike_70', ultimateValue: 70,
    iconUrl: 'https://media.valorant-api.com/agents/320b2a48-4d9b-a075-30f1-1f93a9b638fa/displayicon.png' },

  { id: 'skye', name: 'Skye', role: 'initiator', cost: 500,
    baseHp: 100, baseDamage: 18,
    abilityName: 'Guiding Light', abilityKind: 'flash', abilityValue: 0,
    ultimateName: 'Seekers', ultimateKind: 'flash_all', ultimateValue: 2,
    iconUrl: 'https://media.valorant-api.com/agents/6f2a04ca-43e0-be17-7f36-b3908627744d/displayicon.png' },

  { id: 'omen', name: 'Omen', role: 'controller', cost: 500,
    baseHp: 100, baseDamage: 18,
    abilityName: 'Paranoia', abilityKind: 'damage_reduction', abilityValue: 30,
    ultimateName: 'From the Shadows', ultimateKind: 'teleport_focus', ultimateValue: 0,
    iconUrl: 'https://media.valorant-api.com/agents/8e253930-4c05-31dd-1b6c-968525494517/displayicon.png' },

  { id: 'brimstone', name: 'Brimstone', role: 'controller', cost: 500,
    baseHp: 100, baseDamage: 19,
    abilityName: 'Incendiary', abilityKind: 'aoe_damage', abilityValue: 12,
    ultimateName: 'Orbital Strike', ultimateKind: 'aoe_50', ultimateValue: 50,
    iconUrl: 'https://media.valorant-api.com/agents/9f0d8ba9-4140-b941-57d3-a7ad57c6b417/displayicon.png' },

  { id: 'sage', name: 'Sage', role: 'sentinel', cost: 500,
    baseHp: 100, baseDamage: 15,
    abilityName: 'Heal', abilityKind: 'heal_lowest', abilityValue: 25,
    ultimateName: 'Resurrection', ultimateKind: 'revive_ally', ultimateValue: 60,
    iconUrl: 'https://media.valorant-api.com/agents/569fdd95-4d10-43ab-ca70-79becc718b46/displayicon.png' },

  { id: 'killjoy', name: 'Killjoy', role: 'sentinel', cost: 600,
    baseHp: 100, baseDamage: 17,
    abilityName: 'Turret', abilityKind: 'turret_passive', abilityValue: 8,
    ultimateName: 'Lockdown', ultimateKind: 'lockdown_2_ticks', ultimateValue: 2,
    iconUrl: 'https://media.valorant-api.com/agents/1e58de9c-4950-5125-93e9-a0aee9f98746/displayicon.png' },
];

export const AGENT_BY_ID: Record<string, AgentDef> =
  Object.fromEntries(AGENTS.map(a => [a.id, a]));

export function getAgent(id: string): AgentDef {
  const a = AGENT_BY_ID[id];
  if (!a) throw new Error(`Unknown agent: ${id}`);
  return a;
}
