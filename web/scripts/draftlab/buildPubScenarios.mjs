#!/usr/bin/env node
/**
 * Draft Lab — in-domain scenario builder.
 *
 * WHY NOT PRO DRAFTS: the v0 model is trained on Ranked All Pick pubs. Measured
 * against 40 real professional matches it scored 42.5% outcome accuracy and a
 * log loss of 0.7264 — worse than a coin flip (0.6931). It has no transferable
 * skill in the pro domain, so scoring a pro draft decision with it would be
 * dressing noise up as analysis. Pro scenarios come back when a pro-competent
 * model exists.
 *
 * These scenarios are built where the model IS validated: real high-bracket
 * Ranked All Pick matches from the same distribution it was trained and
 * calibrated on.
 *
 * Shape: all 5 enemy heroes and 4 of yours are revealed; you choose the 5th.
 * That deliberately keeps evaluation in the near-complete-draft regime where
 * calibration was measured, rather than the sparse early-draft states where
 * a handful of revealed pairs drive the estimate.
 *
 *   node scripts/draftlab/buildPubScenarios.mjs --count 200 --minTier 46
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

const COUNT = parseInt(argVal("--count", "200"), 10);
const MIN_TIER = parseInt(argVal("--minTier", "46"), 10); // Legend+ — better play, cleaner signal
const DATA = path.resolve(argVal("--data", "../data/draftlab"));
const CORPUS = path.join(DATA, "corpus.ndjson");
const OUT = path.resolve(argVal("--out", "./public/draftlab/scenarios.json"));

// Sample from the newest slice, which is the model's HELD-OUT test window —
// these matches were never used to fit any coefficient.
const SAMPLE_FROM_NEWEST = 363795;

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

const pool = [];
{
  const rl = readline.createInterface({ input: fs.createReadStream(CORPUS), crlfDelay: Infinity });
  let idx = 0;
  for await (const line of rl) {
    idx++;
    if (idx > SAMPLE_FROM_NEWEST) break;
    if (!line) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.game_mode !== 22) continue;
    if (m.avg_rank_tier == null || m.avg_rank_tier < MIN_TIER) continue;
    if (m.duration < 1200) continue; // a real, decided game
    pool.push(m);
  }
}
log(`eligible held-out matches at tier >= ${MIN_TIER}: ${pool.length.toLocaleString()}`);

// Deterministic shuffle so a rebuild with the same corpus reproduces the set.
let seed = 20260904;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}

/**
 * Draft-mode scenarios: you build a whole team over 5 picks while the enemy
 * side is revealed two, then one at a time.
 *
 * The enemy five are FIXED — they are what that team actually played, and they
 * are not reacting to you. Revealing them progressively controls information
 * order the way a chess puzzle does; the UI says so rather than implying a live
 * opponent.
 */
const draftScenarios = [];
for (const m of pool) {
  if (draftScenarios.length >= COUNT) break;
  const forRadiant = rand() < 0.5;
  const yourTeam = forRadiant ? m.r : m.d;
  const enemyTeam = forRadiant ? m.d : m.r;

  // Deterministic reveal order, so the same scenario always plays the same way.
  const revealOrder = [...enemyTeam];
  for (let i = revealOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [revealOrder[i], revealOrder[j]] = [revealOrder[j], revealOrder[i]];
  }

  draftScenarios.push({
    id: `d${m.match_id}`,
    matchId: m.match_id,
    startTime: m.start_time,
    durationSec: m.duration,
    avgRankTier: m.avg_rank_tier,
    forRadiant,
    enemy: revealOrder,
    actualTeam: yourTeam,
    yourTeamWon: forRadiant ? m.radiant_win : !m.radiant_win,
  });
}

const draftOut = path.join(path.dirname(OUT), "scenarios_draft.json");
fs.mkdirSync(path.dirname(draftOut), { recursive: true });
fs.writeFileSync(draftOut, JSON.stringify(draftScenarios));
log(`wrote ${draftScenarios.length} draft-mode scenarios → ${draftOut}`);

const scenarios = [];
for (const m of pool) {
  if (scenarios.length >= COUNT) break;

  // Draft for whichever side actually won half the time, so "the pick that was
  // really made" is not systematically the winning one — otherwise a player
  // could score well by guessing what looks like a winner rather than reasoning.
  const forRadiant = rand() < 0.5;
  const yourTeam = forRadiant ? m.r : m.d;
  const enemyTeam = forRadiant ? m.d : m.r;

  const hiddenIdx = Math.floor(rand() * 5);
  const actualPick = yourTeam[hiddenIdx];
  const revealed = yourTeam.filter((_, i) => i !== hiddenIdx);

  scenarios.push({
    id: `p${m.match_id}`,
    matchId: m.match_id,
    startTime: m.start_time,
    durationSec: m.duration,
    avgRankTier: m.avg_rank_tier,
    forRadiant,
    yourRevealed: revealed,
    enemy: enemyTeam,
    actualPick,
    yourTeamWon: forRadiant ? m.radiant_win : !m.radiant_win,
  });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(scenarios));
log(`wrote ${scenarios.length} scenarios → ${OUT}`);
