#!/usr/bin/env node
/**
 * Draft Lab — bulk match corpus fetcher.
 *
 * Supersedes pollPublicMatches.mjs. OpenDota's /explorer SQL endpoint returns
 * 20k rows in ~2s via keyset pagination, versus 100 rows per call from
 * /publicMatches — roughly 200x the throughput per API call, which is the
 * difference between "a real model next week" and "a real model this afternoon".
 *
 * Pages backward by match_id (the primary key, so the keyset scan is indexed —
 * aggregates over this table time out, plain ordered range scans do not) and
 * stops at the current-patch boundary or the row target, whichever comes first.
 *
 *   node scripts/draftlab/fetchCorpus.mjs --target 3000000
 *   node scripts/draftlab/fetchCorpus.mjs --target 500000 --since 1774313459
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const argVal = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const TARGET = parseInt(argVal("--target", "3000000"), 10);
const PAGE = parseInt(argVal("--page", "20000"), 10);
// 7.41 released 2026-03-24. Nothing older is meta-relevant.
const SINCE = parseInt(argVal("--since", "1774313459"), 10);
const OUT_DIR = path.resolve(argVal("--out", "../data/draftlab"));
const CORPUS = path.join(OUT_DIR, "corpus.ndjson");
const STATE = path.join(OUT_DIR, "corpus_state.json");

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

const COLS =
  "match_id, start_time, duration, game_mode, lobby_type, avg_rank_tier, radiant_win, radiant_team, dire_team";

async function explorer(sql) {
  const url = new URL("https://api.opendota.com/api/explorer");
  url.searchParams.set("sql", sql);
  const res = await fetch(url, {
    headers: { "User-Agent": "iesports-draftlab/0.1" },
    signal: AbortSignal.timeout(120000),
  });
  const remaining = res.headers.get("x-rate-limit-remaining-day");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.err) throw new Error(`SQL: ${body.err}`);
  return { rows: body.rows || [], remaining };
}

/** Structural sanity only — real filtering (turbo, bracket, mode) happens at train time. */
function isSane(m) {
  if (typeof m.radiant_win !== "boolean") return false;
  if (!Array.isArray(m.radiant_team) || !Array.isArray(m.dire_team)) return false;
  if (m.radiant_team.length !== 5 || m.dire_team.length !== 5) return false;
  const heroes = [...m.radiant_team, ...m.dire_team];
  if (heroes.some((h) => !Number.isInteger(h) || h <= 0)) return false;
  if (new Set(heroes).size !== 10) return false;
  // Sub-10-minute games are abandons/remakes. Deliberately not stricter: a
  // 12-14 min game is a legitimate stomp, and cutting those would systematically
  // understate early-game heroes.
  if (!Number.isInteger(m.duration) || m.duration < 600) return false;
  return true;
}

const state = (() => {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return { cursor: null, kept: 0, dropped: 0, calls: 0 };
  }
})();

// Start from the live head of the feed if this is a fresh run.
if (!state.cursor) {
  const res = await fetch("https://api.opendota.com/api/publicMatches", {
    headers: { "User-Agent": "iesports-draftlab/0.1" },
  });
  const head = await res.json();
  state.cursor = Math.max(...head.map((m) => m.match_id)) + 1;
  log(`fresh run — starting from head match_id ${state.cursor}`);
}

log(`target ${TARGET.toLocaleString()} rows, page ${PAGE}, patch cutoff ${new Date(SINCE * 1000).toISOString().slice(0, 10)}`);

let oldest = null;
let backoff = 0;

while (state.kept < TARGET) {
  const sql = `select ${COLS} from public_matches where match_id < ${state.cursor} order by match_id desc limit ${PAGE}`;

  let rows, remaining;
  try {
    ({ rows, remaining } = await explorer(sql));
    backoff = 0;
  } catch (e) {
    backoff = Math.min(backoff ? backoff * 2 : 15_000, 5 * 60 * 1000);
    log(`error: ${e.message} — retrying in ${Math.round(backoff / 1000)}s`);
    await sleep(backoff);
    continue;
  }

  state.calls++;
  if (rows.length === 0) {
    log("no more rows — reached the end of the table");
    break;
  }

  const lines = [];
  for (const m of rows) {
    if (isSane(m)) {
      lines.push(
        JSON.stringify({
          match_id: m.match_id,
          start_time: m.start_time,
          duration: m.duration,
          game_mode: m.game_mode,
          lobby_type: m.lobby_type,
          avg_rank_tier: m.avg_rank_tier,
          radiant_win: m.radiant_win,
          r: m.radiant_team,
          d: m.dire_team,
        })
      );
      state.kept++;
    } else {
      state.dropped++;
    }
  }
  if (lines.length) fs.appendFileSync(CORPUS, lines.join("\n") + "\n");

  const last = rows[rows.length - 1];
  state.cursor = last.match_id;
  oldest = last.start_time;
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));

  log(
    `kept=${state.kept.toLocaleString()} dropped=${state.dropped.toLocaleString()} ` +
      `oldest=${new Date(oldest * 1000).toISOString().slice(0, 16)} apiLeft=${remaining ?? "?"}`
  );

  if (oldest && oldest < SINCE) {
    log(`reached patch boundary (${new Date(SINCE * 1000).toISOString().slice(0, 10)}) — stopping`);
    break;
  }

  await sleep(400); // stay a well-behaved client of a free public API
}

log(`done. corpus=${CORPUS} kept=${state.kept.toLocaleString()} calls=${state.calls}`);
