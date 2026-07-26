import type { UtilityDef } from './types';

// v9: utilities buffed to be impactful and tactical.
export const UTILITIES: UtilityDef[] = [
  { id: 'smoke',       name: 'Smoke',         cost: 200, effect: 'dodge_30'      },
  { id: 'flash',       name: 'Flashbang',     cost: 250, effect: 'flash_zone'    },
  { id: 'heal_charge', name: 'Heal Pack',     cost: 300, effect: 'heal_30'       },
  { id: 'recon_dart',  name: 'Recon Dart',    cost: 250, effect: 'recon_dmg_30'  },
  { id: 'stim_pack',   name: 'Stim Beacon',   cost: 300, effect: 'stim_team_15'  },
  { id: 'frag',        name: 'Frag',          cost: 350, effect: 'frag_25'       },
  { id: 'wall',        name: 'Barrier Wall',  cost: 400, effect: 'wall_block_1'  },
  { id: 'trip',        name: 'Trip Wire',     cost: 250, effect: 'trip_first'    },
];

export const UTILITY_BY_ID: Record<string, UtilityDef> =
  Object.fromEntries(UTILITIES.map(u => [u.id, u]));

export function getUtility(id: string): UtilityDef {
  const u = UTILITY_BY_ID[id];
  if (!u) throw new Error(`Unknown utility: ${id}`);
  return u;
}
