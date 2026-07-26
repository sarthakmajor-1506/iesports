// Zone positions tuned to land on Haven's actual green bombsite zones.
// Coordinates are 0..1 of a SQUARE container (image fills it).
import type { Zone } from './zones';

export const HAVEN_ZONE_POS: Record<Zone, { xPct: number; yPct: number }> = {
  A:   { xPct: 0.40, yPct: 0.20 },
  B:   { xPct: 0.45, yPct: 0.50 },
  C:   { xPct: 0.38, yPct: 0.82 },
  Mid: { xPct: 0.62, yPct: 0.52 },
};

export const SITE_MARKER_R = 50;

// Spawn positions on the map. Per the user's design:
//   Defender spawn = LEFT edge (vertically centered)
//   Attacker spawn = RIGHT edge (vertically centered)
// Agents enter the round at their spawn and then walk to their assigned zone.
export const DEFENDER_SPAWN_POS = { xPct: 0.06, yPct: 0.50 };
export const ATTACKER_SPAWN_POS = { xPct: 0.94, yPct: 0.50 };

// Secondary callouts shown as small text labels on the map.
// (ATTACKER/DEFENDER labels are now rendered from spawn markers, not callouts.)
export const HAVEN_CALLOUTS: { name: string; xPct: number; yPct: number }[] = [
  { name: 'A SHORT',   xPct: 0.30, yPct: 0.28 },
  { name: 'A LONG',    xPct: 0.55, yPct: 0.30 },
  { name: 'A LINK',    xPct: 0.40, yPct: 0.35 },
  { name: 'GARDEN',    xPct: 0.55, yPct: 0.42 },
  { name: 'B BACK',    xPct: 0.45, yPct: 0.42 },
  { name: 'COURTYARD', xPct: 0.55, yPct: 0.62 },
  { name: 'C LINK',    xPct: 0.40, yPct: 0.70 },
  { name: 'C LONG',    xPct: 0.20, yPct: 0.78 },
  { name: 'C CUBBY',   xPct: 0.28, yPct: 0.65 },
];
