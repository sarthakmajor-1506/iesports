// Real Valorant prices: Light 400, Heavy 1000.
import type { ArmorDef } from './types';

export const ARMORS: ArmorDef[] = [
  { id: 'none',  name: 'None',         cost:    0, hpBonus:  0 },
  { id: 'light', name: 'Light Shield', cost:  400, hpBonus: 25 },
  { id: 'heavy', name: 'Heavy Shield', cost: 1000, hpBonus: 50 },
];

export const ARMOR_BY_ID: Record<string, ArmorDef> =
  Object.fromEntries(ARMORS.map(a => [a.id, a]));

export function getArmor(id: string): ArmorDef {
  const a = ARMOR_BY_ID[id];
  if (!a) throw new Error(`Unknown armor: ${id}`);
  return a;
}
