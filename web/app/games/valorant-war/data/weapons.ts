// Prices match real Valorant 2026 economy where applicable (Vandal/Phantom 2900,
// Sheriff 800, Spectre 1600, Operator 4700, Ghost 500). Damage bonuses are
// MVP-tuned ratios, not real Valorant damage values.
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
