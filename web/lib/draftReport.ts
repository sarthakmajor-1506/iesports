import { evaluate, rankCandidates, type Engine } from "./draftlab";

/**
 * The full post-mortem of a finished draft.
 *
 * WHY THIS EXISTS. `evaluate()` has always returned every term behind its
 * verdict — a base strength for each of the ten heroes, a synergy term for each
 * of the twenty same-team pairs, and a counter term for all twenty-five
 * cross-matchups, each with its sample size and raw win rate. The result screen
 * used about six of those seventy-five numbers: the final probability and the
 * three strongest counter edges per side. Everything else was computed and
 * dropped, which is why the verdict read as an assertion rather than a
 * reckoning — the player was told who won the draft and shown almost none of
 * what decided it.
 *
 * This turns the whole evaluation into something a screen can walk through:
 * every hero with what it is worth and who it beats, every matchup in the
 * draft, and every turn with what it moved and what was available instead.
 *
 * ONE REPORT, BOTH MODES. Solo already carried per-pick numbers because the bot
 * computed them as it played; a live room carries only the ordered move list,
 * because the two clients agree on picks and nothing else. So this derives
 * everything from the move list alone and both modes get the identical report —
 * rather than solo having a rich screen and live a poor one, which is what
 * happens when the analysis lives in the component that happens to have the
 * data.
 *
 * MY SIDE IS ALWAYS RADIANT. `evaluate` is signed toward Radiant, so callers
 * pass their own five as Radiant and every number in here reads from their
 * side without a sign convention to remember.
 */

/** One cross-team matchup, always read from `ally`'s side. */
export type Matchup = {
  ally: number;
  foe: number;
  /** `ally`'s raw head-to-head win rate, 0..1. Null when the pair is unseen. */
  winRate: number | null;
  games: number;
  /** Model weight this pairing puts behind `ally`. Positive is good for them. */
  edge: number;
};

/** One same-team pairing, read from the side that owns both heroes. */
export type Pairing = {
  a: number;
  b: number;
  winRate: number | null;
  games: number;
  edge: number;
};

export type HeroReport = {
  heroId: number;
  mine: boolean;
  /** 1-based turn it was taken on; null if it never appears in the move list. */
  turn: number | null;
  /** Taken by the clock rather than by its player. */
  auto: boolean;
  /**
   * Points of win probability this hero is worth to the side that picked it.
   *
   * A real counterfactual, not a coefficient: the draft is re-evaluated with
   * this hero removed and the difference taken. That folds its standalone
   * strength, its five matchups and its four pairings into the one number a
   * player actually wants — "what is it doing for me".
   */
  worth: number;
  /** Its five cross-matchups, best for this hero first. */
  matchups: Matchup[];
  /** Its four pairings with its own team, best first. */
  pairings: Pairing[];
};

export type TurnReport = {
  turn: number;
  mine: boolean;
  kind: "pick" | "ban";
  heroId: number;
  auto: boolean;
  /** My win probability immediately after this move, 0..1. */
  pAfter: number;
  /** Points of MY win probability this move moved. Bans move nothing directly. */
  swing: number;
  /** Where this hero ranked among everything still available, for its picker. */
  rank: number | null;
  pool: number | null;
  /** The best available option at that moment, and what taking it would have been worth. */
  bestAlt: number | null;
  /** Points the picker gave up against their own best option. Never negative. */
  regret: number | null;
  /** Of the heroes already opposing it, the one it most beats and most loses to. */
  answers: number | null;
  punishedBy: number | null;
};

export type DraftReport = {
  /** My final win probability, 0..1. */
  p: number;
  mine: number[];
  theirs: number[];
  heroes: HeroReport[];
  turns: TurnReport[];
  /** Every cross matchup in the draft, best for me first. */
  matchups: Matchup[];
  /**
   * What each dimension of the model is worth to my side, in points of win
   * probability: the draft as it stands, minus the same draft with that
   * dimension taken out. Individually exact; they do not sum to anything.
   */
  split: { base: number; counters: number; synergy: number };
  /** Smallest sample behind any cross-pair in the final state. */
  minEvidence: number;
};

export type Move = { mine: boolean; kind: "pick" | "ban"; heroId: number; auto?: boolean };

const pp = (x: number) => +(x * 100).toFixed(2);

/**
 * The model's raw counter coefficient for a cross pair, signed toward Radiant
 * — which, by the convention above, means signed toward my side.
 */
function crossRow(engine: Engine, radiantHero: number, direHero: number) {
  return engine.cnt.get(radiantHero * engine.model.maxh + direHero) ?? null;
}

function pairRow(engine: Engine, a: number, b: number) {
  const i = Math.min(a, b), j = Math.max(a, b);
  return engine.syn.get(i * engine.model.maxh + j) ?? null;
}

/** My win probability for a board, with my five as Radiant. */
const mineP = (engine: Engine, mine: number[], theirs: number[]) => evaluate(engine, mine, theirs).p;

export function buildReport(engine: Engine, moves: Move[]): DraftReport {
  const all = engine.model.heroes.map((h) => h.id);

  /* ------------------------------------------------------------- the turns */

  const turns: TurnReport[] = [];
  const mine: number[] = [];
  const theirs: number[] = [];
  const used = new Set<number>();
  let pPrev = mineP(engine, [], []);

  moves.forEach((m, i) => {
    const available = all.filter((h) => !used.has(h));

    let rank: number | null = null;
    let pool: number | null = null;
    let bestAlt: number | null = null;
    let regret: number | null = null;

    if (m.kind === "pick") {
      // Ranked from the PICKER's side: team 0 is Radiant, which is mine.
      const cands = rankCandidates(engine, mine, theirs, available, m.mine ? 0 : 1);
      const idx = cands.findIndex((c) => c.heroId === m.heroId);
      if (idx >= 0) {
        rank = idx + 1;
        pool = cands.length;
        regret = Math.max(0, pp(cands[0].pForTeam - cands[idx].pForTeam));
        bestAlt = idx === 0 ? null : cands[0].heroId;
      }
    }

    // Who it walks into, judged only against heroes already on the board —
    // a pick cannot be answering something that has not been taken yet.
    const foes = m.mine ? [...theirs] : [...mine];
    let answers: number | null = null;
    let punishedBy: number | null = null;
    if (m.kind === "pick" && foes.length) {
      let best = -Infinity, worst = Infinity;
      for (const f of foes) {
        const row = m.mine ? crossRow(engine, m.heroId, f) : crossRow(engine, f, m.heroId);
        // `coef` is signed toward Radiant; flip it for a Dire picker so that
        // "good for the picker" is positive on both sides.
        const coef = (row ? row[2] : 0) * (m.mine ? 1 : -1);
        if (coef > best) { best = coef; answers = f; }
        if (coef < worst) { worst = coef; punishedBy = f; }
      }
      if (best <= 0) answers = null;
      if (worst >= 0) punishedBy = null;
    }

    used.add(m.heroId);
    if (m.kind === "pick") (m.mine ? mine : theirs).push(m.heroId);

    const pAfter = mineP(engine, mine, theirs);
    turns.push({
      turn: i + 1,
      mine: m.mine,
      kind: m.kind,
      heroId: m.heroId,
      auto: !!m.auto,
      pAfter,
      swing: pp(pAfter - pPrev),
      rank, pool, bestAlt, regret,
      answers, punishedBy,
    });
    pPrev = pAfter;
  });

  /* ------------------------------------------------------- the final board */

  const finalEval = evaluate(engine, mine, theirs);
  const p = finalEval.p;

  const matchups: Matchup[] = [];
  for (const a of mine) {
    for (const d of theirs) {
      const row = crossRow(engine, a, d);
      matchups.push({
        ally: a, foe: d,
        winRate: row ? row[4] : null,
        games: row ? row[3] : 0,
        edge: row ? row[2] : 0,
      });
    }
  }
  matchups.sort((x, y) => y.edge - x.edge);

  /* Where the gap comes from, in points, my side minus theirs. */
  const w = engine.model.weights;
  let baseZ = 0, cntZ = 0, synZ = 0;
  for (const h of mine) baseZ += w.base * (engine.baseCoef.get(h) ?? 0);
  for (const h of theirs) baseZ -= w.base * (engine.baseCoef.get(h) ?? 0);
  for (const m of matchups) cntZ += w.cnt * m.edge;
  for (const [team, sign] of [[mine, 1], [theirs, -1]] as [number[], number][]) {
    for (let a = 0; a < team.length; a++) {
      for (let b = a + 1; b < team.length; b++) {
        const row = pairRow(engine, team[a], team[b]);
        synZ += sign * w.syn * (row ? row[2] : 0);
      }
    }
  }
  /*
   * Each dimension priced as its own counterfactual, not as a scaled coefficient.
   *
   * Log-odds are not points, and the obvious conversion — multiply by the
   * slope of the curve — is an approximation that does not reconcile: on a
   * real draft it produced three numbers summing to -6.6 when the draft was
   * only 2.8 points from even, because sigmoid is not linear and the model's
   * intercept is not zero. So each term is instead the honest question "what
   * is this worth": the probability with it, minus the probability with that
   * dimension removed from the log-odds.
   *
   * These are individually exact and individually checkable. They do NOT sum
   * to the gap from an even draft — three overlapping counterfactuals on a
   * curve never will — and nothing here claims they do.
   */
  const sig = (z: number) => 1 / (1 + Math.exp(-z));
  const zTotal = w.w0 + baseZ + synZ + cntZ;
  const worthOf = (component: number) => +((sig(zTotal) - sig(zTotal - component)) * 100).toFixed(1);
  const split = {
    base: worthOf(baseZ),
    counters: worthOf(cntZ),
    synergy: worthOf(synZ),
  };

  /* ------------------------------------------------------------ the heroes */

  const turnOf = new Map<number, TurnReport>();
  for (const t of turns) if (t.kind === "pick") turnOf.set(t.heroId, t);

  const heroReport = (heroId: number, isMine: boolean): HeroReport => {
    const myTeam = isMine ? mine : theirs;
    const foeTeam = isMine ? theirs : mine;

    const without = isMine
      ? mineP(engine, mine.filter((h) => h !== heroId), theirs)
      : mineP(engine, mine, theirs.filter((h) => h !== heroId));
    // For their heroes the same subtraction is taken from their side of the
    // board, so a strong hero is a positive number for whoever picked it.
    const worth = isMine ? pp(p - without) : pp(without - p);

    const ms: Matchup[] = foeTeam.map((foe) => {
      const row = isMine ? crossRow(engine, heroId, foe) : crossRow(engine, foe, heroId);
      const raw = row ? row[4] : null;
      return {
        ally: heroId,
        foe,
        // row[4] is the RADIANT hero's rate, so it is already this hero's rate
        // when the hero is mine and needs flipping when it is theirs.
        winRate: raw == null ? null : isMine ? raw : 1 - raw,
        games: row ? row[3] : 0,
        edge: (row ? row[2] : 0) * (isMine ? 1 : -1),
      };
    });
    ms.sort((x, y) => y.edge - x.edge);

    const ps: Pairing[] = myTeam
      .filter((h) => h !== heroId)
      .map((other) => {
        const row = pairRow(engine, heroId, other);
        return { a: heroId, b: other, winRate: row ? row[4] : null, games: row ? row[3] : 0, edge: row ? row[2] : 0 };
      });
    ps.sort((x, y) => y.edge - x.edge);

    const t = turnOf.get(heroId);
    return { heroId, mine: isMine, turn: t?.turn ?? null, auto: t?.auto ?? false, worth, matchups: ms, pairings: ps };
  };

  const heroes = [
    ...mine.map((h) => heroReport(h, true)),
    ...theirs.map((h) => heroReport(h, false)),
  ];

  return { p, mine, theirs, heroes, turns, matchups, split, minEvidence: finalEval.minEvidence };
}
