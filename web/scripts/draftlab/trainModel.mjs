#!/usr/bin/env node
/**
 * Draft Lab — v0 win-probability model.
 *
 * Design constraints this satisfies, in priority order:
 *
 *  1. EXACTLY DECOMPOSABLE. The explanation shown to a player must be the real
 *     arithmetic of the prediction, not a post-hoc approximation. So the model
 *     is additive in log-odds and every displayed contribution literally sums
 *     to the total.
 *  2. CALIBRATED. A stated 60% must win ~60% of the time. Raw residual sums are
 *     not calibrated, so a 4-parameter logistic stacker is fit on a HELD-OUT
 *     time split and its calibration is measured and reported.
 *  3. COUNTERS != STRONG HEROES. Raw matchup win rate conflates "A counters B"
 *     with "A is simply strong". Every pair term is therefore a RESIDUAL against
 *     what the two heroes' base strengths already predict. Without this the
 *     model degenerates into "pick the highest win-rate hero", which is the
 *     exact degenerate strategy the product exists to punish.
 *  4. HONEST ABOUT THIN DATA. Every pair estimate is shrunk toward zero by its
 *     sample size, and the evidence count is exported so the UI can separate
 *     "we lack data here" from "these options are genuinely close".
 *
 *   node scripts/draftlab/trainModel.mjs
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import process from "node:process";

const args = process.argv.slice(2);
const argVal = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const DATA = path.resolve(argVal("--data", "../data/draftlab"));
const CORPUS = path.join(DATA, "corpus.ndjson");
const OUT_MODEL = path.resolve(argVal("--out", "./public/draftlab/model.json"));
const OUT_REPORT = path.join(DATA, "model_report.json");

const GAME_MODE = 22;      // Ranked All Pick only — free hero choice, consistent economy
const TEST_FRACTION = 0.08; // newest slice of the corpus, held out
const MAXH = 200;
const K_BASE = 2000;
const K_PAIR = 400;

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

const bracketOf = (t) =>
  t == null ? "unknown" : t <= 25 ? "herald_guardian" : t <= 45 ? "crusader_archon" : t <= 65 ? "legend_ancient" : "divine_immortal";

// ---------------------------------------------------------------- pass 1: count

log("counting corpus lines…");
let totalLines = 0;
{
  const rl = readline.createInterface({ input: fs.createReadStream(CORPUS), crlfDelay: Infinity });
  for await (const _ of rl) totalLines++;
}
const testCutoff = Math.floor(totalLines * TEST_FRACTION);
log(`${totalLines.toLocaleString()} rows — newest ${testCutoff.toLocaleString()} held out as test`);

// ---------------------------------------------------------- pass 2: accumulate

const heroGames = new Float64Array(MAXH);
const heroWins = new Float64Array(MAXH);

/**
 * Per-hero win rate split by game length. This is the one genuinely strategic
 * axis the model can learn from data it already has: some heroes win the games
 * that end fast, others win the ones that go long. It gives the game a real
 * thing to reason about beyond "which number is bigger", and it gives the bot
 * a data-grounded personality rather than a hand-authored one.
 *
 * Buckets: 0 = under 30 min, 1 = 30-45 min, 2 = over 45 min.
 */
const durGames = [new Float64Array(MAXH), new Float64Array(MAXH), new Float64Array(MAXH)];
const durWins = [new Float64Array(MAXH), new Float64Array(MAXH), new Float64Array(MAXH)];
const durBucket = (d) => (d < 1800 ? 0 : d < 2700 ? 1 : 2);
// Per-bracket base rates (display + bracket conditioning), pairs stay global:
// splitting pairs four ways would thin them past usefulness at this corpus size.
const brackets = ["herald_guardian", "crusader_archon", "legend_ancient", "divine_immortal", "unknown"];
const bg = {}, bw = {};
for (const b of brackets) { bg[b] = new Float64Array(MAXH); bw[b] = new Float64Array(MAXH); }

const synGames = new Float64Array(MAXH * MAXH);
const synWins = new Float64Array(MAXH * MAXH);
const cntGames = new Float64Array(MAXH * MAXH);
const cntWins = new Float64Array(MAXH * MAXH);

let trainN = 0, trainRadWins = 0;
const test = [];

{
  const rl = readline.createInterface({ input: fs.createReadStream(CORPUS), crlfDelay: Infinity });
  let idx = 0;
  for await (const line of rl) {
    idx++;
    if (!line) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.game_mode !== GAME_MODE) continue;

    if (idx <= testCutoff) {
      test.push([m.r, m.d, m.radiant_win ? 1 : 0, m.avg_rank_tier]);
      continue;
    }

    trainN++;
    const win = m.radiant_win ? 1 : 0;
    trainRadWins += win;
    const br = bracketOf(m.avg_rank_tier);

    const db = durBucket(m.duration);
    for (const h of m.r) { durGames[db][h]++; durWins[db][h] += win; }
    for (const h of m.d) { durGames[db][h]++; durWins[db][h] += 1 - win; }

    for (const h of m.r) { heroGames[h]++; heroWins[h] += win; bg[br][h]++; bw[br][h] += win; }
    for (const h of m.d) { heroGames[h]++; heroWins[h] += 1 - win; bg[br][h]++; bw[br][h] += 1 - win; }

    // same-team pairs (store canonically i<j, credit that team's result)
    for (const [team, res] of [[m.r, win], [m.d, 1 - win]]) {
      for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) {
        const i = Math.min(team[a], team[b]), j = Math.max(team[a], team[b]);
        synGames[i * MAXH + j]++; synWins[i * MAXH + j] += res;
      }
    }
    // cross-team ordered pairs: (radiant hero i) vs (dire hero j), credit radiant result
    for (const i of m.r) for (const j of m.d) {
      cntGames[i * MAXH + j]++; cntWins[i * MAXH + j] += win;
    }

    if (trainN % 500000 === 0) log(`  accumulated ${trainN.toLocaleString()} train rows`);
  }
}

log(`train=${trainN.toLocaleString()} test=${test.length.toLocaleString()} radiantWR=${(trainRadWins / trainN).toFixed(4)}`);
const sideBias = logit(trainRadWins / trainN);

// ------------------------------------------------------------- fit components

const base = new Float64Array(MAXH);
for (let h = 0; h < MAXH; h++) {
  const n = heroGames[h];
  if (n < 200) continue;
  base[h] = logit(Math.min(Math.max(heroWins[h] / n, 1e-4), 1 - 1e-4)) * (n / (n + K_BASE));
}

const baseByBracket = {};
for (const b of brackets) {
  const arr = new Float64Array(MAXH);
  for (let h = 0; h < MAXH; h++) {
    const n = bg[b][h];
    if (n < 200) continue;
    arr[h] = logit(Math.min(Math.max(bw[b][h] / n, 1e-4), 1 - 1e-4)) * (n / (n + K_BASE));
  }
  baseByBracket[b] = arr;
}

// Residual pair terms. This is the step that stops "counter" meaning "strong".
const syn = new Float64Array(MAXH * MAXH);
const synN = new Float64Array(MAXH * MAXH);
const cnt = new Float64Array(MAXH * MAXH);
const cntN = new Float64Array(MAXH * MAXH);

for (let i = 0; i < MAXH; i++) {
  for (let j = 0; j < MAXH; j++) {
    const k = i * MAXH + j;
    if (j > i) {
      const n = synGames[k];
      if (n >= 50) {
        const raw = logit(Math.min(Math.max(synWins[k] / n, 1e-4), 1 - 1e-4));
        syn[k] = (raw - (base[i] + base[j])) * (n / (n + K_PAIR));
        synN[k] = n;
      }
    }
    const nc = cntGames[k];
    if (nc >= 50) {
      const raw = logit(Math.min(Math.max(cntWins[k] / nc, 1e-4), 1 - 1e-4));
      cnt[k] = (raw - (base[i] - base[j])) * (nc / (nc + K_PAIR));
      cntN[k] = nc;
    }
  }
}
/**
 * Remove the systematic component from the pair residuals.
 *
 * Individual hero effects are NOT exactly additive in log-odds: two 55% heroes
 * together win about 57-58%, not the 60% that adding their log-odds predicts.
 * So a raw residual against (base_i + base_j) is systematically negative for
 * strong pairs and positive for weak ones — miscalibration masquerading as
 * synergy. Left in, it made a single pick swing the estimate by 8-17 points.
 *
 * Regressing the residual on its own base term and subtracting the linear fit
 * removes exactly that artefact and leaves genuine interaction behind.
 */
function decontaminate(coefArr, nArr, baseTermFn) {
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < MAXH; i++) for (let j = 0; j < MAXH; j++) {
    const k = i * MAXH + j;
    const n = nArr[k];
    if (n < 50) continue;
    const x = baseTermFn(i, j);
    const y = coefArr[k];
    sw += n; sx += n * x; sy += n * y; sxx += n * x * x; sxy += n * x * y;
  }
  if (sw === 0) return { a: 0, b: 0 };
  const denom = sw * sxx - sx * sx;
  const b = Math.abs(denom) < 1e-12 ? 0 : (sw * sxy - sx * sy) / denom;
  const a = (sy - b * sx) / sw;
  for (let i = 0; i < MAXH; i++) for (let j = 0; j < MAXH; j++) {
    const k = i * MAXH + j;
    if (nArr[k] < 50) continue;
    coefArr[k] -= a + b * baseTermFn(i, j);
  }
  return { a, b };
}

const synFit = decontaminate(syn, synN, (i, j) => base[i] + base[j]);
const cntFit = decontaminate(cnt, cntN, (i, j) => base[i] - base[j]);
log(`decontamination — syn: a=${synFit.a.toFixed(4)} b=${synFit.b.toFixed(4)} | cnt: a=${cntFit.a.toFixed(4)} b=${cntFit.b.toFixed(4)}`);

// Enforce antisymmetry: a counter edge must be the same fact read from either side.
for (let i = 0; i < MAXH; i++) for (let j = i + 1; j < MAXH; j++) {
  const a = i * MAXH + j, b = j * MAXH + i;
  const avg = (cnt[a] - cnt[b]) / 2;
  cnt[a] = avg; cnt[b] = -avg;
  const n = cntN[a] + cntN[b];
  cntN[a] = n; cntN[b] = n;
}

// ---------------------------------------------------------- feature extraction

/**
 * Component sums for a (possibly partial) draft state.
 *
 * Partial states are extrapolated to full-draft scale: if only 8 of 25 cross
 * pairs are revealed, the counter sum is scaled by 25/8. That encodes exactly
 * one assumption — the unrevealed picks are, in expectation, average — which is
 * the correct decision-time reading of an incomplete information set.
 */
function features(r, d) {
  let bs = 0;
  for (const h of r) bs += base[h];
  for (const h of d) bs -= base[h];

  let ss = 0, sN = 0;
  for (const [team, sign] of [[r, 1], [d, -1]]) {
    for (let a = 0; a < team.length; a++) for (let b = a + 1; b < team.length; b++) {
      const i = Math.min(team[a], team[b]), j = Math.max(team[a], team[b]);
      ss += sign * syn[i * MAXH + j]; sN++;
    }
  }
  let cs = 0, cN = 0, minEvidence = Infinity;
  for (const i of r) for (const j of d) {
    cs += cnt[i * MAXH + j];
    cN++;
    minEvidence = Math.min(minEvidence, cntN[i * MAXH + j]);
  }

  const synFull = 20, cntFull = 25;
  return {
    bs,
    ss: sN ? ss * (synFull / sN) : 0,
    cs: cN ? cs * (cntFull / cN) : 0,
    minEvidence: minEvidence === Infinity ? 0 : minEvidence,
  };
}

// ------------------------------------------- stacker: 4 params on held-out data

// Split held-out into calibration (fit the stacker) and test (report honest metrics).
const calib = test.slice(0, Math.floor(test.length / 2));
const evalSet = test.slice(Math.floor(test.length / 2));
log(`stacker fit on ${calib.length.toLocaleString()}, metrics on ${evalSet.length.toLocaleString()}`);

const X = calib.map(([r, d]) => features(r, d));
const y = calib.map((t) => t[2]);

let w = [sideBias, 1, 1, 1]; // w0 + w1*base + w2*syn + w3*cnt
const LR = 0.5;
for (let epoch = 0; epoch < 400; epoch++) {
  const g = [0, 0, 0, 0];
  for (let i = 0; i < X.length; i++) {
    const f = X[i];
    const z = w[0] + w[1] * f.bs + w[2] * f.ss + w[3] * f.cs;
    const e = sigmoid(z) - y[i];
    g[0] += e; g[1] += e * f.bs; g[2] += e * f.ss; g[3] += e * f.cs;
  }
  for (let k = 0; k < 4; k++) w[k] -= (LR * g[k]) / X.length;
}
log(`stacker weights: w0=${w[0].toFixed(4)} base=${w[1].toFixed(3)} syn=${w[2].toFixed(3)} cnt=${w[3].toFixed(3)}`);

// ---------------------------------------------------------------- evaluation

function metrics(predFn, label) {
  let ll = 0, brier = 0, correct = 0;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, sum: 0, wins: 0 }));
  for (const [r, d, yy] of evalSet) {
    const p = Math.min(Math.max(predFn(r, d), 1e-6), 1 - 1e-6);
    ll += -(yy * Math.log(p) + (1 - yy) * Math.log(1 - p));
    brier += (p - yy) ** 2;
    if ((p >= 0.5 ? 1 : 0) === yy) correct++;
    const b = bins[Math.min(9, Math.floor(p * 10))];
    b.n++; b.sum += p; b.wins += yy;
  }
  const n = evalSet.length;
  const out = {
    label,
    logLoss: +(ll / n).toFixed(5),
    brier: +(brier / n).toFixed(5),
    accuracy: +(correct / n).toFixed(4),
    calibration: bins.filter((b) => b.n > 0).map((b) => ({
      predicted: +(b.sum / b.n).toFixed(3),
      actual: +(b.wins / b.n).toFixed(3),
      n: b.n,
    })),
  };
  log(`${label}: logloss=${out.logLoss} brier=${out.brier} acc=${out.accuracy}`);
  return out;
}

const results = [
  metrics(() => 0.5, "baseline: coin flip"),
  metrics(() => sigmoid(sideBias), "baseline: radiant side bias only"),
  metrics((r, d) => sigmoid(w[0] + w[1] * features(r, d).bs), "hero base strength only"),
  metrics((r, d) => {
    const f = features(r, d);
    return sigmoid(w[0] + w[1] * f.bs + w[2] * f.ss + w[3] * f.cs);
  }, "full: base + synergy + counters"),
];

// -------------------------------------------------------------------- export

/**
 * Pack a pair matrix as [i, j, coefficient, games, rawWinRate].
 * The raw win rate ships alongside the coefficient because an explanation needs
 * checkable evidence ("61.3% across 4,321 games"), not just a log-odds number
 * no player can verify.
 */
function packMatrix(mat, nMat, winsArr, gamesArr, threshold) {
  const out = [];
  for (let i = 0; i < MAXH; i++) for (let j = 0; j < MAXH; j++) {
    const k = i * MAXH + j;
    if (nMat[k] >= threshold && Math.abs(mat[k]) > 1e-4) {
      const g = gamesArr[k];
      const wr = g > 0 ? +(winsArr[k] / g).toFixed(4) : null;
      out.push([i, j, +mat[k].toFixed(5), nMat[k], wr]);
    }
  }
  return out;
}

const heroStats = await (await fetch("https://api.opendota.com/api/heroStats", {
  headers: { "User-Agent": "iesports-draftlab/0.1" },
})).json();

const model = {
  version: "v0",
  builtAt: new Date().toISOString(),
  patch: "7.41",
  gameMode: GAME_MODE,
  trainRows: trainN,
  evalRows: evalSet.length,
  sideBias,
  weights: { w0: w[0], base: w[1], syn: w[2], cnt: w[3] },
  maxh: MAXH,
  heroes: heroStats.map((h) => ({
    id: h.id,
    name: h.localized_name,
    img: h.img,
    attr: h.primary_attr,
    roles: h.roles,
  })),
  base: Array.from(base).map((v, i) => (v ? [i, +v.toFixed(5), heroGames[i]] : null)).filter(Boolean),
  /**
   * [heroId, wrShort, wrMid, wrLong, tempo] — tempo > 0 means the hero wins the
   * fast games more than the long ones. Shrunk toward the hero's overall rate so
   * thin buckets can't produce a wild tilt.
   */
  tempo: (() => {
    const out = [];
    for (let h = 0; h < MAXH; h++) {
      const tot = durGames[0][h] + durGames[1][h] + durGames[2][h];
      if (tot < 2000) continue;
      const rate = (b) => {
        const g = durGames[b][h], w = durWins[b][h];
        if (g < 200) return null;
        const overall = heroWins[h] / heroGames[h];
        return (w / g) * (g / (g + 1000)) + overall * (1000 / (g + 1000));
      };
      const s = rate(0), m = rate(1), l = rate(2);
      if (s == null || m == null || l == null) continue;
      const clamp = (x) => Math.min(Math.max(x, 1e-3), 1 - 1e-3);
      const tempo = logit(clamp(s)) - logit(clamp(l));
      out.push([h, +s.toFixed(4), +m.toFixed(4), +l.toFixed(4), +tempo.toFixed(4)]);
    }
    return out;
  })(),
  baseByBracket: Object.fromEntries(
    brackets.map((b) => [b, Array.from(baseByBracket[b]).map((v, i) => (v ? [i, +v.toFixed(5)] : null)).filter(Boolean)])
  ),
  syn: packMatrix(syn, synN, synWins, synGames, 50),
  // Counter win rates are combined across sides: hero i's wins against j when i
  // was radiant, PLUS its wins when i was dire. cntN was already made symmetric
  // above, so the rate has to be too or the evidence shown would disagree with
  // the sample size shown.
  cnt: (() => {
    const combinedWins = new Float64Array(MAXH * MAXH);
    const combinedGames = new Float64Array(MAXH * MAXH);
    for (let i = 0; i < MAXH; i++) for (let j = 0; j < MAXH; j++) {
      const a = i * MAXH + j, b = j * MAXH + i;
      combinedGames[a] = cntGames[a] + cntGames[b];
      combinedWins[a] = cntWins[a] + (cntGames[b] - cntWins[b]);
    }
    return packMatrix(cnt, cntN, combinedWins, combinedGames, 50);
  })(),
  metrics: results,
};

fs.mkdirSync(path.dirname(OUT_MODEL), { recursive: true });
fs.writeFileSync(OUT_MODEL, JSON.stringify(model));
fs.writeFileSync(OUT_REPORT, JSON.stringify({ builtAt: model.builtAt, trainRows: trainN, weights: model.weights, metrics: results }, null, 2));

const sizeMb = (fs.statSync(OUT_MODEL).size / 1024 / 1024).toFixed(1);
log(`wrote ${OUT_MODEL} (${sizeMb} MB) — syn=${model.syn.length} cnt=${model.cnt.length} pairs`);
