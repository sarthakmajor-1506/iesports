/**
 * Draft Lab — the head-to-head ladder, and the weekly coin board.
 *
 * WHY A LADDER, NOT JUST THE SOLO BOARD. Ranking players on what a
 * 58%-accurate model thinks of their five heroes has no authority: when it
 * disagrees with a player, neither of them can tell who is right, and a
 * ranking built on it inherits exactly that problem. A ladder does not have
 * it. You beat a person, and nobody argues about whether you beat a person.
 *
 * WHY THIS IS SEPARATE FROM lib/elo.ts. That file is Valorant tournament
 * seeding, and it is bound by a Riot policy line: its numbers must never be
 * surfaced as a parallel rank. This one is a public Dota ladder whose whole
 * point is to be surfaced. Sharing code between them would blur a boundary
 * that needs to stay obvious, so the twelve lines of Elo are written again
 * here.
 *
 * ONE VISIBLE BOARD. Elo/medal used to run alongside a separate avg-points
 * "Solo Scores" board and a daily Elo-delta board — three numbers for one
 * game. They are now one: Elo still moves on every ranked live result (it is
 * what the medal badge is drawn from), but the thing players are actually
 * ranked against each other on is coins earned this week, in
 * `draftlabLadderWeekly/{weekKey}/players/{uid}` — see draftLadderServer.ts
 * for who gets paid and when.
 */

/** Everyone starts at Archon — the middle of the medal range, not the bottom. */
export const START_ELO = 1200;

/**
 * K is high on purpose. A small pool playing a handful of games each needs to
 * reach its level in ten games, not two hundred; the cost is a noisier board,
 * which the weekly reset already absorbs.
 */
export const K_FACTOR = 32;

/**
 * How close is a draw.
 *
 * The model's worst calibration error is 3.7 percentage points, so a gap of
 * half a point between two drafts is not a result — it is the model's own
 * noise floor, and declaring a winner inside it would be inventing one. Both
 * players keep their rating and the game is recorded as a draw.
 */
export const DRAW_BAND = 0.005;

export type Outcome = "host" | "guest" | "draw";

/** Probability `a` beats `b`, the standard logistic. */
export function expected(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/**
 * New ratings after one game. `score` is from the first player's point of view:
 * 1 won, 0.5 drew, 0 lost.
 */
export function nextRatings(a: number, b: number, score: number): { a: number; b: number; deltaA: number; deltaB: number } {
  const ea = expected(a, b);
  const deltaA = Math.round(K_FACTOR * (score - ea));
  // Not simply -deltaA: both sides are rounded independently, and taking the
  // negative of one rounded number quietly leaks rating into or out of the pool.
  const deltaB = Math.round(K_FACTOR * ((1 - score) - (1 - ea)));
  return { a: a + deltaA, b: b + deltaB, deltaA, deltaB };
}

/** Who won, from the final win probability for the host's five. */
export function outcomeFrom(hostWinProb: number): Outcome {
  if (Math.abs(hostWinProb - 0.5) <= DRAW_BAND) return "draw";
  return hostWinProb > 0.5 ? "host" : "guest";
}

export const scoreFor = (o: Outcome): number => (o === "draw" ? 0.5 : o === "host" ? 1 : 0);

/* --------------------------------------------------------------- medals */

/**
 * Dota's own medal names, because this audience reads them instantly and a
 * number between 900 and 1800 means nothing on its own. The bands are wider at
 * the top so climbing out of Divine is meant to take a while.
 */
const MEDALS: { at: number; name: string; fill: string }[] = [
  { at: 0, name: "Herald", fill: "var(--card-2)" },
  { at: 1000, name: "Guardian", fill: "var(--mint)" },
  { at: 1100, name: "Crusader", fill: "var(--sky)" },
  { at: 1200, name: "Archon", fill: "var(--lilac)" },
  { at: 1300, name: "Legend", fill: "var(--pink)" },
  { at: 1400, name: "Ancient", fill: "var(--coral)" },
  { at: 1550, name: "Divine", fill: "var(--lemon)" },
  { at: 1750, name: "Immortal", fill: "var(--gold-fill)" },
];

export function medal(elo: number): { name: string; fill: string } {
  let hit = MEDALS[0];
  for (const m of MEDALS) if (elo >= m.at) hit = m;
  return { name: hit.name, fill: hit.fill };
}

/* ----------------------------------------------------------- the week */

/**
 * Which week a game belongs to, keyed by that week's Monday in IST.
 *
 * A Monday date string rather than an ISO week number: week numbers need a
 * library to get year-boundary edge cases right, and nobody has to debug what
 * "2026-W01" means when the Firestore console just shows a date. The board's
 * players are in India, so the boundary is IST — deriving it from the server's
 * own timezone would roll the board at whatever hour the host region happens
 * to be in, a different one from the audience on Vercel.
 */
export function weekKey(at: Date = new Date()): string {
  const ist = new Date(at.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay(); // 0 = Sunday
  const sinceMonday = (day + 6) % 7;
  const monday = new Date(ist);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(ist.getDate() - sinceMonday);
  return monday.toLocaleDateString("en-CA"); // YYYY-MM-DD, already IST-local
}

/** Milliseconds until the weekly board resets, for the countdown on it. */
export function msUntilWeekReset(now: Date = new Date()): number {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay();
  const untilMonday = (8 - day) % 7 || 7; // days remaining, 7 if today IS Monday
  const next = new Date(ist);
  next.setHours(0, 0, 0, 0);
  next.setDate(ist.getDate() + untilMonday);
  return Math.max(0, next.getTime() - ist.getTime());
}

export type LadderRow = {
  uid: string;
  name: string;
  avatar: string | null;
  elo: number;
  peak: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  best: number;
};

/** One row on the visible weekly board. */
export type WeeklyRow = {
  uid: string;
  name: string;
  avatar: string | null;
  coins: number;
  games: number;
  wins: number;
  /** Mirrored from the permanent ladder doc at write time, purely for the medal badge. */
  elo: number;
};
