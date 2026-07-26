// Haven navmesh — nodes (zones + callouts + spawns) with positions, side
// classification, and adjacency that reflects the actual Haven map layout.
// v11: side-aware pathfinder — defenders avoid attacker territory and vice versa.
import { HAVEN_ZONE_POS, HAVEN_CALLOUTS, ATTACKER_SPAWN_POS, DEFENDER_SPAWN_POS } from './havenLayout';

export type GraphNode =
  | 'A' | 'B' | 'C' | 'Mid'
  | 'A_LONG' | 'A_SHORT' | 'A_LINK' | 'GARDEN'
  | 'B_BACK'
  | 'COURTYARD' | 'C_LINK' | 'C_CUBBY' | 'C_LONG'
  | 'ATTACKER_SPAWN' | 'DEFENDER_SPAWN';

function calloutPos(name: string): { xPct: number; yPct: number } {
  const c = HAVEN_CALLOUTS.find(x => x.name === name);
  if (!c) throw new Error(`Unknown callout: ${name}`);
  return { xPct: c.xPct, yPct: c.yPct };
}

export const NODE_POS: Record<GraphNode, { xPct: number; yPct: number }> = {
  A:               HAVEN_ZONE_POS.A,
  B:               HAVEN_ZONE_POS.B,
  C:               HAVEN_ZONE_POS.C,
  Mid:             HAVEN_ZONE_POS.Mid,
  A_LONG:          calloutPos('A LONG'),
  A_SHORT:         calloutPos('A SHORT'),
  A_LINK:          calloutPos('A LINK'),
  GARDEN:          calloutPos('GARDEN'),
  B_BACK:          calloutPos('B BACK'),
  COURTYARD:       calloutPos('COURTYARD'),
  C_LINK:          calloutPos('C LINK'),
  C_CUBBY:         calloutPos('C CUBBY'),
  C_LONG:          calloutPos('C LONG'),
  ATTACKER_SPAWN:  ATTACKER_SPAWN_POS,
  DEFENDER_SPAWN:  DEFENDER_SPAWN_POS,
};

// Side classification — used by side-aware pathfinder to keep defenders out
// of attacker corridors and vice versa.
//   attacker — only attackers should traverse (attacker spawn, A long, garden, C long)
//   defender — only defenders should traverse (defender spawn, A short, A link, B back, C link, C cubby)
//   neutral  — both sides naturally traverse (the 3 sites and the Mid courtyard)
export type NodeSide = 'attacker' | 'defender' | 'neutral';
export const NODE_SIDE: Record<GraphNode, NodeSide> = {
  ATTACKER_SPAWN:  'attacker',
  A_LONG:          'attacker',
  GARDEN:          'attacker',
  C_LONG:          'attacker',
  DEFENDER_SPAWN:  'defender',
  A_SHORT:         'defender',
  A_LINK:          'defender',
  B_BACK:          'defender',
  C_LINK:          'defender',
  C_CUBBY:         'defender',
  COURTYARD:       'neutral',
  Mid:             'neutral',
  A:               'neutral',
  B:               'neutral',
  C:               'neutral',
};

// Adjacency. Critical edits vs v10:
//   removed B_BACK ↔ GARDEN  (defender→attacker shortcut)
//   removed C_CUBBY ↔ C_LONG (defender→attacker shortcut)
// All cross-side traffic must now route through a SITE or MID.
const RAW_EDGES: [GraphNode, GraphNode][] = [
  // Attacker corridors
  ['ATTACKER_SPAWN', 'A_LONG'],
  ['ATTACKER_SPAWN', 'GARDEN'],
  ['ATTACKER_SPAWN', 'COURTYARD'],
  ['ATTACKER_SPAWN', 'C_LONG'],
  ['A_LONG',   'A'],
  ['A_LONG',   'GARDEN'],
  ['GARDEN',   'B'],
  ['GARDEN',   'Mid'],
  ['C_LONG',   'C'],
  // Sites <→ defender corridors
  ['A_SHORT',  'A'],
  ['A_SHORT',  'A_LINK'],
  ['A',        'A_LINK'],
  ['A_LINK',   'B_BACK'],
  ['A_LINK',   'Mid'],
  ['B_BACK',   'B'],
  ['B_BACK',   'Mid'],
  ['C_LINK',   'COURTYARD'],
  ['C_LINK',   'C_CUBBY'],
  ['C_LINK',   'C'],
  ['C_CUBBY',  'C'],
  // Mid hub
  ['Mid',      'COURTYARD'],
  ['COURTYARD','B'],
  // Defender spawn corridors
  ['DEFENDER_SPAWN', 'A_SHORT'],
  ['DEFENDER_SPAWN', 'A_LINK'],
  ['DEFENDER_SPAWN', 'B_BACK'],
  ['DEFENDER_SPAWN', 'C_LINK'],
  ['DEFENDER_SPAWN', 'C_CUBBY'],
];

export const ADJ: Record<GraphNode, GraphNode[]> = (() => {
  const map: Record<string, GraphNode[]> = {};
  for (const [a, b] of RAW_EDGES) {
    (map[a] ??= []).push(b);
    (map[b] ??= []).push(a);
  }
  return map as Record<GraphNode, GraphNode[]>;
})();

/**
 * Side-aware shortest path. Strongly prefers nodes that are friendly to
 * `mySide` (= my own side OR neutral). Crossing into enemy territory costs
 * ~10× a normal step, so the path will detour through neutral routes (sites,
 * Mid) before risking enemy corridors.
 */
export function pathFindForSide(
  start: GraphNode,
  end: GraphNode,
  mySide: 'attacker' | 'defender',
): GraphNode[] {
  if (start === end) return [start];

  const enemy: NodeSide = mySide === 'attacker' ? 'defender' : 'attacker';
  const stepCost = (node: GraphNode): number => {
    const s = NODE_SIDE[node];
    if (s === enemy) return 12;     // strong penalty
    return 1;
  };

  // Dijkstra
  const dist: Map<GraphNode, number> = new Map();
  const prev: Map<GraphNode, GraphNode | null> = new Map();
  const visited: Set<GraphNode> = new Set();
  dist.set(start, 0);
  prev.set(start, null);

  while (true) {
    let bestNode: GraphNode | null = null;
    let bestDist = Infinity;
    for (const [n, d] of dist) {
      if (visited.has(n)) continue;
      if (d < bestDist) { bestDist = d; bestNode = n; }
    }
    if (bestNode == null) break;
    if (bestNode === end) break;
    visited.add(bestNode);

    for (const next of ADJ[bestNode] ?? []) {
      const alt = bestDist + stepCost(next);
      const cur = dist.get(next);
      if (cur === undefined || alt < cur) {
        dist.set(next, alt);
        prev.set(next, bestNode);
      }
    }
  }

  if (!prev.has(end)) return [start, end];
  const path: GraphNode[] = [];
  let cur: GraphNode | null = end;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev.get(cur) ?? null;
  }
  return path;
}

/** Backward-compatible plain BFS (no side preference). */
export function pathFind(start: GraphNode, end: GraphNode): GraphNode[] {
  if (start === end) return [start];
  const queue: GraphNode[] = [start];
  const cameFrom: Map<GraphNode, GraphNode | null> = new Map();
  cameFrom.set(start, null);
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node === end) break;
    for (const next of ADJ[node] ?? []) {
      if (cameFrom.has(next)) continue;
      cameFrom.set(next, node);
      queue.push(next);
    }
  }
  if (!cameFrom.has(end)) return [start, end];
  const path: GraphNode[] = [];
  let cur: GraphNode | null = end;
  while (cur !== null) {
    path.unshift(cur);
    cur = cameFrom.get(cur) ?? null;
  }
  return path;
}
