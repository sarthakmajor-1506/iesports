#!/usr/bin/env node
/**
 * Draft Lab — public match corpus poller.
 *
 * Walks BACKWARD through OpenDota /publicMatches (newest first) and appends
 * sanity-checked rows to an NDJSON corpus. This is the training data for the
 * win-probability model; it is deliberately NOT in Firestore (per-document
 * pricing on millions of analytical rows is the wrong trade) and NOT inside
 * web/ (it must never be uploaded in a Vercel deploy).
 *
 * Long-running: designed to be left alive for days. Restartable — the cursor
 * file lets it resume exactly where it stopped.
 *
 * Measured limits (2026-09-04, no API key): 3000 calls/day, 60 calls/min.
 * Each call returns ~100 matches, so a full day of budget is ~300k matches.
 *
 *   node scripts/draftlab/pollPublicMatches.mjs
 *   node scripts/draftlab/pollPublicMatches.mjs --budget 2700 --out ../data/draftlab
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const argVal = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

// Leave headroom under the 3000/day cap for the static build pulls + ad-hoc work.
const DAILY_BUDGET = parseInt(argVal("--budget", "2700"), 10);
const OUT_DIR = path.resolve(argVal("--out", "../data/draftlab"));
const CORPUS = path.join(OUT_DIR, "public_matches.ndjson");
const CURSOR = path.join(OUT_DIR, "cursor.json");
const STATS = path.join(OUT_DIR, "poll_stats.json");

// Spread the daily budget evenly rather than burning it in one hour. This keeps
// us far below the 60/min ceiling and leaves the API usable for everything else.
const INTERVAL_MS = Math.floor((24 * 60 * 60 * 1000) / DAILY_BUDGET);

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sanity filter. We store liberally and filter properly at train time — the one
 * thing we will NOT store is a row that is structurally impossible, because
 * those silently poison hero win rates.
 *
 * Real junk observed in the live feed:
 *   - duration 0 with radiant_team [0,0,0,0,0]  (never actually started)
 *   - duplicate hero ids inside one team        (impossible in a real match)
 *   - duration ~100s                            (instant abandon)
 */
function isSane(m) {
  if (typeof m.radiant_win !== "boolean") return false;
  if (!Array.isArray(m.radiant_team) || !Array.isArray(m.dire_team)) return false;
  if (m.radiant_team.length !== 5 || m.dire_team.length !== 5) return false;

  const heroes = [...m.radiant_team, ...m.dire_team];
  if (heroes.some((h) => !Number.isInteger(h) || h <= 0)) return false;
  if (new Set(heroes).size !== 10) return false; // no hero appears twice

  // Sub-10-minute games are overwhelmingly abandons/remakes. Deliberately NOT
  // stricter than this: a 12-14 min game is a legitimate stomp, and filtering
  // those out would systematically understate early-game heroes — the exact
  // silent bias this corpus exists to avoid.
  if (!Number.isInteger(m.duration) || m.duration < 600) return false;

  return true;
}

function slim(m) {
  return {
    match_id: m.match_id,
    start_time: m.start_time,
    duration: m.duration,
    game_mode: m.game_mode,
    lobby_type: m.lobby_type,
    avg_rank_tier: m.avg_rank_tier,
    num_rank_tier: m.num_rank_tier,
    radiant_win: m.radiant_win,
    r: m.radiant_team,
    d: m.dire_team,
  };
}

function loadJSON(file, dflt) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return dflt;
  }
}

const cursor = loadJSON(CURSOR, { lessThanMatchId: null });
const stats = loadJSON(STATS, {
  startedAt: new Date().toISOString(),
  calls: 0,
  kept: 0,
  dropped: 0,
  errors: 0,
  oldestStartTime: null,
});

let dayKey = new Date().toISOString().slice(0, 10);
let callsToday = 0;

async function fetchPage() {
  const url = new URL("https://api.opendota.com/api/publicMatches");
  if (cursor.lessThanMatchId) {
    url.searchParams.set("less_than_match_id", String(cursor.lessThanMatchId));
  }

  const res = await fetch(url, {
    headers: { "User-Agent": "iesports-draftlab/0.1" },
    signal: AbortSignal.timeout(20000),
  });

  const remainingDay = res.headers.get("x-rate-limit-remaining-day");
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.remainingDay = remainingDay;
    throw err;
  }

  const rows = await res.json();
  return { rows, remainingDay };
}

function log(msg) {
  console.log(`[${new Date().toISOString().slice(0, 19)}] ${msg}`);
}

let backoff = 0;

async function tick() {
  // Reset the per-day counter at UTC midnight.
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) {
    dayKey = today;
    callsToday = 0;
    log(`new UTC day — budget reset to ${DAILY_BUDGET}`);
  }

  if (callsToday >= DAILY_BUDGET) {
    log(`daily budget (${DAILY_BUDGET}) spent; idling until UTC midnight`);
    await sleep(10 * 60 * 1000);
    return;
  }

  try {
    const { rows, remainingDay } = await fetchPage();
    callsToday++;
    stats.calls++;
    backoff = 0;

    if (!Array.isArray(rows) || rows.length === 0) {
      log("empty page — reached the end of the feed, idling");
      await sleep(5 * 60 * 1000);
      return;
    }

    const lines = [];
    let kept = 0;
    let minMatchId = Infinity;
    let minStart = Infinity;

    for (const m of rows) {
      if (typeof m.match_id === "number") minMatchId = Math.min(minMatchId, m.match_id);
      if (isSane(m)) {
        lines.push(JSON.stringify(slim(m)));
        kept++;
        if (typeof m.start_time === "number") minStart = Math.min(minStart, m.start_time);
      }
    }

    if (lines.length) fs.appendFileSync(CORPUS, lines.join("\n") + "\n");

    stats.kept += kept;
    stats.dropped += rows.length - kept;
    if (minStart !== Infinity) stats.oldestStartTime = minStart;

    // Page backward. Guard against a non-advancing cursor (would loop forever).
    if (minMatchId !== Infinity && minMatchId !== cursor.lessThanMatchId) {
      cursor.lessThanMatchId = minMatchId;
    } else {
      log("cursor did not advance — nudging past it");
      cursor.lessThanMatchId = (cursor.lessThanMatchId ?? minMatchId) - 1;
    }

    fs.writeFileSync(CURSOR, JSON.stringify(cursor));
    fs.writeFileSync(STATS, JSON.stringify(stats, null, 2));

    if (stats.calls % 10 === 0 || stats.calls === 1) {
      const oldest = stats.oldestStartTime
        ? new Date(stats.oldestStartTime * 1000).toISOString().slice(0, 16)
        : "?";
      log(
        `calls=${stats.calls} kept=${stats.kept} dropped=${stats.dropped} ` +
          `oldest=${oldest} apiDayLeft=${remainingDay ?? "?"}`
      );
    }
  } catch (e) {
    stats.errors++;
    backoff = Math.min(backoff ? backoff * 2 : 30_000, 15 * 60 * 1000);
    log(`error: ${e.message} (backing off ${Math.round(backoff / 1000)}s)`);
    fs.writeFileSync(STATS, JSON.stringify(stats, null, 2));
    await sleep(backoff);
  }
}

log(
  `Draft Lab poller starting — budget ${DAILY_BUDGET}/day, one call every ${Math.round(
    INTERVAL_MS / 1000
  )}s, corpus at ${CORPUS}`
);

while (true) {
  await tick();
  await sleep(INTERVAL_MS);
}
