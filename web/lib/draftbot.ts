/**
 * Draft Lab — reactive drafting opponent.
 *
 * The bot is NOT trying to be optimal. An argmax bot is deterministic, gets
 * solved in a week, and drafts in a way no human ever would, so nothing the
 * player learns from it transfers. This one imitates a *kind* of drafter and
 * samples, so it responds to you, surprises you, and can be read.
 *
 * A note on what was possible: pub All Pick matches carry no pick ORDER, so we
 * cannot learn "what gets taken fourth". We can learn set completion — which
 * heroes go together, and which beat which — and that is all a bot actually
 * needs when it is choosing from a board state rather than a sequence.
 *
 * Every personality below is a different weighting of coefficients the model
 * already learned. None of it is hand-authored hero tagging.
 */

import { evaluate, rankCandidates, type Engine } from "./draftlab";

export type Personality = {
  id: string;
  name: string;
  blurb: string;
  /** Weights over rank-normalised components; see score(). */
  pop: number;      // picks what everyone picks
  strength: number; // picks heroes with high raw win rate
  syn: number;      // picks heroes that fit its own team
  cnt: number;      // picks heroes that beat yours
  tempo: number;    // >0 favours early-game heroes, <0 favours late-game
  temperature: number; // higher = more erratic
};

export const PERSONALITIES: Personality[] = [
  {
    id: "counter", name: "The Counterpicker",
    blurb: "Watches what you take and answers it directly. Start here.",
    pop: 0.1, strength: 0.2, syn: 0.1, cnt: 1.6, tempo: 0, temperature: 0.16,
  },
  {
    id: "punisher", name: "The Punisher",
    blurb: "Counterpicking taken too far. It will answer everything, and overcommit doing it.",
    pop: 0, strength: 0.05, syn: 0, cnt: 2.4, tempo: 0, temperature: 0.1,
  },
  {
    id: "meta", name: "Meta Slave",
    blurb: "Drafts whatever is popular. Predictable, and popular for a reason.",
    pop: 1.0, strength: 0.5, syn: 0.15, cnt: 0.1, tempo: 0, temperature: 0.35,
  },
  {
    id: "synergy", name: "The Synergist",
    blurb: "Builds around its own core and largely ignores you.",
    pop: 0.2, strength: 0.3, syn: 1.0, cnt: 0.1, tempo: 0, temperature: 0.3,
  },
  {
    id: "greedy", name: "The Greedy Genius",
    blurb: "Drafts for the 50-minute game. Beat it before it comes online.",
    pop: 0.2, strength: 0.35, syn: 0.35, cnt: 0.15, tempo: -1.0, temperature: 0.3,
  },
  {
    id: "tempo", name: "The Rusher",
    blurb: "Wants the game over by minute 25. Survive and it falls apart.",
    pop: 0.2, strength: 0.35, syn: 0.35, cnt: 0.15, tempo: 1.0, temperature: 0.3,
  },
  {
    id: "divine", name: "Divine Draftmaster",
    blurb: "Balanced and quiet. Punishes loose picks without announcing it.",
    pop: 0.35, strength: 0.5, syn: 0.6, cnt: 0.7, tempo: 0, temperature: 0.18,
  },
  {
    id: "chaos", name: "Chaos Merchant",
    blurb: "Genuinely unhinged. Sometimes that works, which is the problem.",
    pop: 0.1, strength: 0.1, syn: 0.2, cnt: 0.2, tempo: 0, temperature: 1.1,
  },
];

export type TempoRow = [number, number, number, number, number]; // id, wrShort, wrMid, wrLong, tempo

export function tempoMap(model: { tempo?: TempoRow[] }): Map<number, TempoRow> {
  return new Map((model.tempo ?? []).map((r) => [r[0], r]));
}

/**
 * Rank-normalise to [0,1] so components with wildly different scales combine sanely.
 *
 * Ties must share the mean of the ranks they span. A stable sort would otherwise
 * hand tied values an increasing ramp by array position — and since the candidate
 * list is in hero-id order, that silently made the bot prefer whichever heroes
 * Valve released most recently. It showed up worst on an empty board, where every
 * counter value is tied at zero, but it distorted every pick: any pair without
 * enough games defaults to a 0 coefficient, so ties are everywhere.
 */
function rankNorm(values: number[]): number[] {
  const idx = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const out = new Array(values.length).fill(0.5);
  const denom = Math.max(1, values.length - 1);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && values[idx[j + 1]] === values[idx[i]]) j++;
    const meanRank = (i + j) / 2 / denom;
    for (let k = i; k <= j; k++) out[idx[k]] = meanRank;
    i = j + 1;
  }
  return out;
}

export type BotPick = { heroId: number; considered: { heroId: number; weight: number }[] };

/**
 * Choose the bot's next hero given the board.
 *
 * `botTeam` / `playerTeam` are the heroes each side already holds. `botIsRadiant`
 * only matters for reading the model's sign convention.
 */
export function botPick(
  engine: Engine,
  p: Personality,
  botTeam: number[],
  playerTeam: number[],
  available: number[],
  botIsRadiant: boolean,
  tempos: Map<number, TempoRow>,
  rand: () => number
): BotPick {
  const model = engine.model;

  const popRaw: number[] = [];
  const strRaw: number[] = [];
  const synRaw: number[] = [];
  const cntRaw: number[] = [];
  const tmpRaw: number[] = [];

  for (const h of available) {
    popRaw.push(Math.log1p(engine.baseGames.get(h) ?? 0));
    strRaw.push(engine.baseCoef.get(h) ?? 0);

    let syn = 0;
    for (const mate of botTeam) {
      const i = Math.min(h, mate), j = Math.max(h, mate);
      const row = engine.syn.get(i * model.maxh + j);
      syn += row ? row[2] : 0;
    }
    synRaw.push(syn);

    // Counter value is read from the bot's side, so a positive number always
    // means "this hero is good against what the player has".
    let cnt = 0;
    for (const foe of playerTeam) {
      const key = botIsRadiant ? h * model.maxh + foe : foe * model.maxh + h;
      const row = engine.cnt.get(key);
      const v = row ? row[2] : 0;
      cnt += botIsRadiant ? v : -v;
    }
    cntRaw.push(cnt);

    tmpRaw.push(tempos.get(h)?.[4] ?? 0);
  }

  const pop = rankNorm(popRaw), str = rankNorm(strRaw);
  const syn = rankNorm(synRaw), cnt = rankNorm(cntRaw), tmp = rankNorm(tmpRaw);

  const scores = available.map((_, i) =>
    p.pop * pop[i] + p.strength * str[i] + p.syn * syn[i] + p.cnt * cnt[i] +
    // tmp is 0 for the most late-game hero and 1 for the most early-game one.
    // A negative tempo weight must therefore REWARD low tmp, not penalise it.
    Math.abs(p.tempo) * (p.tempo >= 0 ? tmp[i] : 1 - tmp[i])
  );

  // Softmax sample. Temperature is what keeps the bot from being solvable.
  const maxS = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - maxS) / Math.max(0.05, p.temperature)));
  const total = exps.reduce((a, b) => a + b, 0);

  let r = rand() * total;
  let chosen = available[available.length - 1];
  for (let i = 0; i < available.length; i++) {
    r -= exps[i];
    if (r <= 0) { chosen = available[i]; break; }
  }

  const considered = available
    .map((heroId, i) => ({ heroId, weight: exps[i] / total }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  return { heroId: chosen, considered };
}

/**
 * The single strongest counter edge from `attackers` onto `defenders`.
 *
 * Coefficients are stored as [radiantHero, direHero] signed toward Radiant, so
 * the caller says which side the attackers are on and gets back a positive
 * `edge` meaning "this attacker genuinely beats this defender".
 */
export function strongestCounter(
  engine: Engine,
  attackers: number[],
  defenders: number[],
  attackersAreRadiant: boolean
): { attacker: number; defender: number; edge: number; games: number; winRate: number | null } | null {
  const maxh = engine.model.maxh;
  let best: { attacker: number; defender: number; edge: number; games: number; winRate: number | null } | null = null;
  for (const a of attackers) {
    for (const d of defenders) {
      const row = engine.cnt.get(attackersAreRadiant ? a * maxh + d : d * maxh + a);
      if (!row) continue;
      const edge = attackersAreRadiant ? row[2] : -row[2];
      const winRate = row[4] == null ? null : attackersAreRadiant ? row[4] : 1 - row[4];
      if (edge > 0 && (!best || edge > best.edge)) {
        best = { attacker: a, defender: d, edge, games: row[3], winRate };
      }
    }
  }
  return best;
}

/**
 * The bot's ban: take away what the PLAYER most wants.
 *
 * This is a genuinely different decision from picking — it is scored from the
 * opponent's seat, not its own — which is what makes a ban phase worth having
 * rather than four more picks. Sampled with the personality's temperature so it
 * is not a solved, deterministic list.
 */
export function botBan(
  engine: Engine,
  p: Personality,
  botTeam: number[],
  playerTeam: number[],
  available: number[],
  rand: () => number
): { heroId: number; playerRank: number } {
  // Rank from the player's seat: player drafts as Radiant (team 0) in a duel.
  const forPlayer = rankCandidates(engine, playerTeam, botTeam, available, 0);
  if (!forPlayer.length) return { heroId: available[0], playerRank: 1 };

  // Consider only what the player would realistically want.
  const pool = forPlayer.slice(0, 25);
  const top = pool[0].pForTeam;
  const temp = Math.max(0.004, p.temperature * 0.06);
  const exps = pool.map((c) => Math.exp((c.pForTeam - top) / temp));
  const total = exps.reduce((a, b) => a + b, 0);

  let r = rand() * total;
  let idx = 0;
  for (let i = 0; i < pool.length; i++) {
    r -= exps[i];
    if (r <= 0) { idx = i; break; }
  }
  return { heroId: pool[idx].heroId, playerRank: idx + 1 };
}

/** Where a hero sat among what the opponent most wanted — for scoring your bans. */
export function banValue(
  engine: Engine,
  heroId: number,
  botTeam: number[],
  playerTeam: number[],
  available: number[]
): { rankForThem: number; pool: number } {
  const forBot = rankCandidates(engine, playerTeam, botTeam, available, 1);
  return { rankForThem: forBot.findIndex((c) => c.heroId === heroId) + 1, pool: forBot.length };
}

export type CounterEdge = {
  attacker: number; defender: number; edge: number; games: number;
  /** Raw win rate of attacker over defender. */
  winRate: number | null;
  /** What their base strengths alone predict — the bar the edge is measured against. */
  expected: number | null;
};

/**
 * Every counter edge in a finished draft, strongest first, split by direction.
 *
 * Rows are classified by the RESIDUAL (row[2]), not the raw win rate, because
 * that is what "countered" means — outperforming what the two heroes' own
 * strengths predict. The raw rate is carried alongside so the UI can show both:
 * a hero can hold a real counter edge and still lose the matchup outright, and
 * printing "beats — 48%" without the expected value reads as a contradiction.
 */
export function counterMap(engine: Engine, yours: number[], theirs: number[]) {
  const maxh = engine.model.maxh;
  const sig = (z: number) => 1 / (1 + Math.exp(-z));
  const expectedFor = (a: number, d: number) =>
    sig((engine.baseCoef.get(a) ?? 0) - (engine.baseCoef.get(d) ?? 0));

  const yoursWin: CounterEdge[] = [];
  const theirsWin: CounterEdge[] = [];
  for (const y of yours) {
    for (const t of theirs) {
      const row = engine.cnt.get(y * maxh + t); // player is Radiant
      if (!row) continue;
      if (row[2] > 0) {
        yoursWin.push({ attacker: y, defender: t, edge: row[2], games: row[3], winRate: row[4], expected: expectedFor(y, t) });
      } else {
        theirsWin.push({
          attacker: t, defender: y, edge: -row[2], games: row[3],
          winRate: row[4] == null ? null : 1 - row[4], expected: expectedFor(t, y),
        });
      }
    }
  }
  yoursWin.sort((a, b) => b.edge - a.edge);
  theirsWin.sort((a, b) => b.edge - a.edge);
  return { yoursWin, theirsWin };
}

/** P(player's team wins) for the current board. */
export function playerWinProb(
  engine: Engine,
  playerTeam: number[],
  botTeam: number[],
  playerIsRadiant: boolean
): number {
  const radiant = playerIsRadiant ? playerTeam : botTeam;
  const dire = playerIsRadiant ? botTeam : playerTeam;
  const ev = evaluate(engine, radiant, dire);
  return playerIsRadiant ? ev.p : 1 - ev.p;
}

/** Mean tempo of a team — positive means it wants a short game. */
export function teamTempo(team: number[], tempos: Map<number, TempoRow>): number {
  if (!team.length) return 0;
  return team.reduce((a, h) => a + (tempos.get(h)?.[4] ?? 0), 0) / team.length;
}

/**
 * A drafting identity derived from the player's own picks — not a badge handed
 * out for playing, but a description of what they actually did.
 */
export function draftingStyle(
  engine: Engine,
  picks: number[],
  tempos: Map<number, TempoRow>
): { tag: string; line: string } {
  const t = teamTempo(picks, tempos);
  const pop =
    picks.reduce((a, h) => a + Math.log1p(engine.baseGames.get(h) ?? 0), 0) / (picks.length || 1);
  const allPop = [...engine.baseGames.values()].map((g) => Math.log1p(g)).sort((a, b) => a - b);
  const pct = allPop.length
    ? allPop.filter((v) => v < pop).length / allPop.length
    : 0.5;

  if (t < -0.28) return { tag: "The Greedy Genius", line: "You draft for the long game and dare the map to punish you." };
  if (t > 0.28) return { tag: "The Rusher", line: "You want it over early. Anything past 40 minutes is somebody else's problem." };
  if (pct < 0.3) return { tag: "The Off-Meta Menace", line: "You keep reaching for heroes almost nobody picks." };
  if (pct > 0.78) return { tag: "The Meta Enjoyer", line: "You take what works. It works, which is annoying." };
  return { tag: "The Balanced Drafter", line: "No obvious tells yet — you pick to the board rather than to a habit." };
}
