#!/usr/bin/env node
/**
 * Draft Lab — pro draft scenario builder.
 *
 * Freezes real professional Captains Mode drafts at a pick node. The pro's
 * actual choice is NOT ground truth — it is an observed expert action under a
 * particular information set (they knew their players' hero pools, the series
 * score, and their scouting; the model knows none of that). The match result is
 * the only ground truth here, and it is stored separately.
 *
 * Node selection is uniform over eligible pick nodes with at least 3 heroes
 * already revealed. That floor exists so the player has something to reason
 * about; it is a deliberate, documented selection rule rather than a filter on
 * how strong an opinion the model happens to have — selecting on model opinion
 * would bias scenarios toward exactly the states where the model is most
 * confidently wrong.
 *
 *   node scripts/draftlab/fetchScenarios.mjs --count 50
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const argVal = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const COUNT = parseInt(argVal("--count", "50"), 10);
const OUT = path.resolve(argVal("--out", "../data/draftlab"));
const MIN_REVEALED_PICKS = 3;

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

async function api(pathname) {
  const res = await fetch(`https://api.opendota.com/api${pathname}`, {
    headers: { "User-Agent": "iesports-draftlab/0.1" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${pathname}`);
  return res.json();
}

log("fetching recent pro matches…");
const pro = await api("/proMatches");
log(`${pro.length} candidates`);

const scenarios = [];
let seen = 0;

for (const p of pro) {
  if (scenarios.length >= COUNT) break;
  seen++;

  let m;
  try {
    m = await api(`/matches/${p.match_id}`);
  } catch (e) {
    log(`skip ${p.match_id}: ${e.message}`);
    await sleep(1100);
    continue;
  }
  await sleep(1100); // 60/min ceiling

  const pb = m.picks_bans || [];
  // Full Captains Mode only — 24 entries. Anything else is a different mode
  // with different draft semantics and does not belong in the same pool.
  if (pb.length !== 24) continue;
  if (typeof m.radiant_win !== "boolean") continue;

  const seq = [...pb].sort((a, b) => a.order - b.order);

  // Eligible freeze points: pick nodes with enough revealed picks before them.
  const eligible = [];
  let revealedPicks = 0;
  for (let i = 0; i < seq.length; i++) {
    if (seq[i].is_pick && revealedPicks >= MIN_REVEALED_PICKS) eligible.push(i);
    if (seq[i].is_pick) revealedPicks++;
  }
  if (!eligible.length) continue;

  const nodeIndex = eligible[Math.floor(Math.random() * eligible.length)];

  scenarios.push({
    id: `s${m.match_id}`,
    matchId: m.match_id,
    league: (m.league && m.league.name || p.league_name || "").trim(),
    radiantName: (m.radiant_team && m.radiant_team.name) || p.radiant_name || "Radiant",
    direName: (m.dire_team && m.dire_team.name) || p.dire_name || "Dire",
    startTime: m.start_time,
    durationSec: m.duration,
    radiantWin: m.radiant_win,
    sequence: seq.map((s) => ({ p: s.is_pick ? 1 : 0, h: s.hero_id, t: s.team, o: s.order })),
    nodeIndex,
  });

  if (scenarios.length % 10 === 0) log(`built ${scenarios.length}/${COUNT} (scanned ${seen})`);
}

const outFile = path.join(OUT, "scenarios.json");
fs.writeFileSync(outFile, JSON.stringify(scenarios, null, 1));
log(`wrote ${scenarios.length} scenarios (from ${seen} pro matches scanned) → ${outFile}`);
