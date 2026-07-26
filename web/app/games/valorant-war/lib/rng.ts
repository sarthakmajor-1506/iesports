// Mulberry32 — small, fast, well-distributed seedable PRNG.
// Same seed → same sequence. Used so battles are reproducible from {seed, history}.

export type RNG = () => number;

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
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
  return Math.floor(Math.random() * 0xffffffff);
}
