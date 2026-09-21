/**
 * Draft Lab — the head-to-head ladder, and the monthly coin board.
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
 * ONE VISIBLE BOARD. Elo used to run alongside a separate avg-points
 * "Solo Scores" board and a daily Elo-delta board — three numbers for one
 * game. They are now one: Elo still moves on every ranked live result (it is
 * what matchmaking and the bot’s all-time board use), but the thing players are
 * ranked against each other on is coins earned this month, in
 * `draftlabLadderMonthly/{monthKey}/players/{uid}` — see draftLadderServer.ts
 * for who gets paid and when.
 */

/** Everyone starts mid-range rather than at the bottom, so a first loss is not a cliff. */
export const START_ELO = 1200;

/**
 * K is high on purpose. A small pool playing a handful of games each needs to
 * reach its level in ten games, not two hundred; the cost is a noisier board,
 * which the monthly reset already absorbs.
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

/* ---------------------------------------------------------- the month */

/**
 * Which period a game belongs to, keyed by its calendar month in IST.
 *
 * This was a week, keyed by that week's Monday. A week turned out to be too
 * short for a board this size: with a handful of players, a Monday roll wipes
 * a board that only had one good evening on it, and everyone who played that
 * evening opens the app to a zero. A month is long enough that a result is
 * still there the next time the player comes back.
 *
 * A calendar month rather than a rolling thirty days: the key is stable and
 * self-explanatory in the Firestore console, the board can name itself
 * ("SEPTEMBER"), and every player knows when it rolls without being told.
 *
 * The boundary is IST because the board's players are in India — deriving it
 * from the server's own timezone would roll the board at whatever hour the
 * host region happens to be in, a different one from the audience on Vercel.
 */
export function monthKey(at: Date = new Date()): string {
  const ist = new Date(at.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}`; // YYYY-MM
}

/** Milliseconds until the board resets, for the countdown on it. */
export function msUntilMonthReset(now: Date = new Date()): number {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const next = new Date(ist);
  next.setHours(0, 0, 0, 0);
  // Date first, THEN month. Going month-first from the 31st lands on the 1st of
  // the month after next, because a 31st that does not exist rolls forward.
  next.setDate(1);
  next.setMonth(next.getMonth() + 1);
  return Math.max(0, next.getTime() - ist.getTime());
}

const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

/** A `monthKey` as the board's own heading. Falls back rather than throwing. */
export function monthLabel(key: string): string {
  return MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? "THIS MONTH";
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

/** One row on the visible monthly board. */
export type MonthlyRow = {
  uid: string;
  name: string;
  avatar: string | null;
  coins: number;
  games: number;
  wins: number;
};
