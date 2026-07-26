// Haven map — simplified to 4 zones for the auto-battler.
// Real Haven has 3 bombsites (A, B, C) plus mid. We model that directly.
// Adjacency: A↔Mid, B↔Mid, C↔Mid. Sites are NOT adjacent to each other —
// crossing requires transiting Mid.

export type Zone = 'A' | 'B' | 'C' | 'Mid';

export const ZONES: Zone[] = ['A', 'Mid', 'B', 'C'];

export const ZONE_LABELS: Record<Zone, string> = {
  A: 'A Site',
  B: 'B Site',
  C: 'C Site',
  Mid: 'Mid',
};

export const SITES: Zone[] = ['A', 'B', 'C'];

const ADJACENCY: Record<Zone, Zone[]> = {
  A:   ['Mid'],
  B:   ['Mid'],
  C:   ['Mid'],
  Mid: ['A', 'B', 'C'],
};

export function isAdjacent(a: Zone, b: Zone): boolean {
  return ADJACENCY[a].includes(b);
}

/** Returns the next zone to step toward `target` from `from`, or null if already there. */
export function nextZoneToward(from: Zone, target: Zone): Zone | null {
  if (from === target) return null;
  if (ADJACENCY[from].includes(target)) return target;
  // Otherwise must transit Mid
  return 'Mid';
}
