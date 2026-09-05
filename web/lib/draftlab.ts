/**
 * Draft Lab — client-side draft evaluator.
 *
 * The model is a few hundred KB of coefficients, so inference runs entirely in
 * the browser. Nothing here touches OpenDota at request time: that API is slow
 * and rate-limited, and putting it in a user path is what produces Cloudflare
 * 522s (see the warning in lib/opendota.ts).
 *
 * The model is additive in log-odds, so every contribution below is the real
 * arithmetic of the prediction rather than a post-hoc approximation.
 */

export type Hero = {
  id: number;
  name: string;
  img: string;
  attr: string;
  roles: string[];
};

export type PairRow = [number, number, number, number, number | null]; // i, j, coef, games, rawWinRate

export type DraftModel = {
  version: string;
  builtAt: string;
  patch: string;
  gameMode: number;
  trainRows: number;
  evalRows: number;
  sideBias: number;
  weights: { w0: number; base: number; syn: number; cnt: number };
  maxh: number;
  heroes: Hero[];
  base: [number, number, number][]; // id, coef, games
  baseByBracket: Record<string, [number, number][]>;
  syn: PairRow[];
  cnt: PairRow[];
  metrics: {
    label: string;
    logLoss: number;
    brier: number;
    accuracy: number;
    calibration: { predicted: number; actual: number; n: number }[];
  }[];
};

export type Term = {
  kind: "base" | "syn" | "cnt";
  heroes: number[];
  contribution: number; // log-odds, signed toward Radiant
  games: number;
  winRate: number | null;
};

export type Evaluation = {
  p: number; // P(Radiant wins)
  terms: Term[];
  minEvidence: number; // smallest sample behind any cross-pair term in this state
  crossPairs: number;
};

export type Engine = {
  model: DraftModel;
  heroById: Map<number, Hero>;
  baseCoef: Map<number, number>;
  baseGames: Map<number, number>;
  syn: Map<number, PairRow>;
  cnt: Map<number, PairRow>;
};




const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function buildEngine(model: DraftModel): Engine {
  const heroById = new Map(model.heroes.map((h) => [h.id, h]));
  const baseCoef = new Map<number, number>();
  const baseGames = new Map<number, number>();
  for (const [id, coef, games] of model.base) {
    baseCoef.set(id, coef);
    baseGames.set(id, games);
  }
  const syn = new Map<number, PairRow>();
  for (const row of model.syn) syn.set(row[0] * model.maxh + row[1], row);
  const cnt = new Map<number, PairRow>();
  for (const row of model.cnt) cnt.set(row[0] * model.maxh + row[1], row);
  return { model, heroById, baseCoef, baseGames, syn, cnt };
}

/**
 * Evaluate a possibly-partial draft state.
 *
 * Unrevealed picks contribute zero — their expectation, since every base and
 * pair coefficient is a centred residual. Critically we do NOT rescale a partial
 * state up to full-draft magnitude. Scaling 9 revealed cross-pairs up to 25
 * is unbiased in expectation but multiplies the variance of whatever few pairs
 * happen to be revealed, which made a single pick swing the estimate by 20+
 * points at sparse nodes.
 *
 * Leaving it unscaled means an incomplete draft simply sits nearer 50%, which is
 * the honest reading: less is known, so less is claimed. It is also what makes
 * the score fair — it can never punish a player for information that was not
 * available at their node.
 *
 * (The richer alternative — marginalising over likely completions with a pick
 * policy — is deliberately deferred; it needs an imitation model we have not
 * built yet.)
 */
export function evaluate(engine: Engine, radiant: number[], dire: number[]): Evaluation {
  const { model } = engine;
  const w = model.weights;
  const terms: Term[] = [];

  let bs = 0;
  for (const h of radiant) {
    const c = engine.baseCoef.get(h) ?? 0;
    bs += c;
    terms.push({ kind: "base", heroes: [h], contribution: w.base * c, games: engine.baseGames.get(h) ?? 0, winRate: null });
  }
  for (const h of dire) {
    const c = engine.baseCoef.get(h) ?? 0;
    bs -= c;
    terms.push({ kind: "base", heroes: [h], contribution: -w.base * c, games: engine.baseGames.get(h) ?? 0, winRate: null });
  }

  let ssRaw = 0;
  let synCount = 0;
  const synTerms: Term[] = [];
  for (const [team, sign] of [[radiant, 1], [dire, -1]] as [number[], number][]) {
    for (let a = 0; a < team.length; a++) {
      for (let b = a + 1; b < team.length; b++) {
        const i = Math.min(team[a], team[b]);
        const j = Math.max(team[a], team[b]);
        const row = engine.syn.get(i * model.maxh + j);
        const coef = row ? row[2] : 0;
        ssRaw += sign * coef;
        synCount++;
        synTerms.push({ kind: "syn", heroes: [team[a], team[b]], contribution: sign * coef, games: row ? row[3] : 0, winRate: row ? row[4] : null });
      }
    }
  }

  let csRaw = 0;
  let crossPairs = 0;
  let minEvidence = Infinity;
  const cntTerms: Term[] = [];
  for (const i of radiant) {
    for (const j of dire) {
      const row = engine.cnt.get(i * model.maxh + j);
      const coef = row ? row[2] : 0;
      csRaw += coef;
      crossPairs++;
      const games = row ? row[3] : 0;
      minEvidence = Math.min(minEvidence, games);
      cntTerms.push({ kind: "cnt", heroes: [i, j], contribution: coef, games, winRate: row ? row[4] : null });
    }
  }

  for (const t of synTerms) {
    t.contribution *= w.syn;
    terms.push(t);
  }
  for (const t of cntTerms) {
    t.contribution *= w.cnt;
    terms.push(t);
  }

  const z = w.w0 + w.base * bs + w.syn * ssRaw + w.cnt * csRaw;

  return {
    p: sigmoid(z),
    terms,
    minEvidence: minEvidence === Infinity ? 0 : minEvidence,
    crossPairs,
  };
}

export type Candidate = {
  heroId: number;
  pForTeam: number; // win probability for the drafting team
  delta: number;    // change vs. not having picked yet, in percentage points
};

/**
 * Rank every legal hero at this node, from the drafting team's perspective.
 * `team` is 0 for Radiant, 1 for Dire.
 */
export function rankCandidates(
  engine: Engine,
  radiant: number[],
  dire: number[],
  available: number[],
  team: 0 | 1
): Candidate[] {
  const before = evaluate(engine, radiant, dire);
  const beforeForTeam = team === 0 ? before.p : 1 - before.p;

  const out: Candidate[] = available.map((heroId) => {
    const r = team === 0 ? [...radiant, heroId] : radiant;
    const d = team === 1 ? [...dire, heroId] : dire;
    const ev = evaluate(engine, r, d);
    const pForTeam = team === 0 ? ev.p : 1 - ev.p;
    return { heroId, pForTeam, delta: (pForTeam - beforeForTeam) * 100 };
  });

  out.sort((a, b) => b.pForTeam - a.pForTeam);
  return out;
}

/**
 * Two different things produce a wide range, and conflating them makes every
 * close call look like a broken model:
 *
 *   modelUncertainty    — we lack data for this state
 *   decisionUncertainty — the options are genuinely near-equivalent
 */
export function uncertainty(candidates: Candidate[], minEvidence: number) {
  const top = candidates.slice(0, 5);
  const spread = top.length > 1 ? (top[0].pForTeam - top[top.length - 1].pForTeam) * 100 : 0;
  return {
    decisionSpreadPP: spread,
    decisionClose: spread < 1.0,
    modelEvidence: minEvidence,
    modelThin: minEvidence < 300,
  };
}

export type Driver = Term & {
  /** Win rate read from the DRAFTING team's side. */
  orientedWinRate: number | null;
  /** What the two heroes' own base strengths already predict, same orientation. */
  expectedWinRate: number | null;
};

/**
 * The single largest driver of a pick, oriented to the drafting team.
 *
 * Orientation matters for correctness, not just phrasing: counter terms are
 * stored as [radiantHero, direHero] with the win rate read from Radiant's side.
 * Handed to a Dire-drafting player unchanged, that renders the matchup backwards
 * and quotes the OPPONENT's win rate as if it were theirs.
 *
 * `expectedWinRate` ships alongside because the coefficient is a residual: a raw
 * 50.4% can be a genuinely positive contribution when the two heroes' base
 * strengths predicted 47%. Showing the raw rate alone reads as evidence against
 * the very pick it supports.
 */
export function topDriver(
  engine: Engine,
  before: Evaluation,
  after: Evaluation,
  team: 0 | 1
): Driver | null {
  const key = (t: Term) => `${t.kind}:${[...t.heroes].sort((a, b) => a - b).join("-")}`;
  const beforeMap = new Map(before.terms.map((t) => [key(t), t.contribution]));

  let best: Term | null = null;
  let bestMag = 0;
  for (const t of after.terms) {
    const prior = beforeMap.get(key(t)) ?? 0;
    // Signed toward the drafting team, so a Dire pick's good matchup reads positive.
    const gain = (t.contribution - prior) * (team === 0 ? 1 : -1);
    if (gain > bestMag) {
      bestMag = gain;
      best = t;
    }
  }
  if (!best) return null;

  const flip = best.kind === "cnt" && team === 1;
  const heroes = flip ? [best.heroes[1], best.heroes[0]] : best.heroes;
  const orientedWinRate =
    best.winRate == null ? null : flip ? 1 - best.winRate : best.winRate;

  let expectedWinRate: number | null = null;
  if (best.kind === "cnt" || best.kind === "syn") {
    const a = engine.baseCoef.get(heroes[0]) ?? 0;
    const b = engine.baseCoef.get(heroes[1]) ?? 0;
    expectedWinRate = sigmoid(best.kind === "cnt" ? a - b : a + b);
  }

  return { ...best, heroes, orientedWinRate, expectedWinRate };
}

export function heroImage(img: string) {
  return img.startsWith("http") ? img : `https://cdn.cloudflare.steamstatic.com${img}`;
}
