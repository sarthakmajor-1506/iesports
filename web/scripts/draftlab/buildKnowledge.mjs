#!/usr/bin/env node
/**
 * Draft Lab — hero and item knowledge base.
 *
 * Pulls the current-patch constants from OpenDota and flattens them into one
 * file the app can ship: every hero with its abilities, talents and base stats,
 * and every purchasable item with cost, recipe and description.
 *
 * This is the single source for three things — the Guide, the quiz question
 * bank, and the ability/item art — so it is built once here rather than fetched
 * at runtime (OpenDota is rate-limited and must never sit in a user's path).
 *
 * ART IS VERIFIED, NEVER DERIVED.
 *
 * The previous version built image URLs from the ability key and shipped them
 * unchecked. OpenDota hands out an `img` path for every ability whether or not
 * Valve actually publishes that file, so 53 of 784 ability icons 404'd in the
 * quiz and the Guide — all of them innate abilities, whose icons are simply not
 * on the web CDN, plus a handful of hidden sub-abilities that should never have
 * been shown at all. Every URL below is HEAD-checked against the CDN before it
 * is written, and anything that does not resolve is stored as null so the UI can
 * substitute rather than render a broken box.
 *
 *   node scripts/draftlab/buildKnowledge.mjs
 */

import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("./public/draftlab/knowledge.json");
const API = "https://api.opendota.com/api";
const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2";
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

async function get(p) {
  const r = await fetch(`${API}${p}`, { headers: { "User-Agent": "iesports-draftlab/0.2" }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}`);
  return r.json();
}

/** Valve's description strings carry markup and template tokens; strip to plain prose. */
function clean(s, max = 320) {
  if (typeof s !== "string") return "";
  const out = s
    .replace(/<[^>]*>/g, " ")
    .replace(/%%/g, "%")
    .replace(/\{s:[^}]+\}/g, "…")
    .replace(/\s+/g, " ")
    // Stripping the markup leaves stranded punctuation: a space before a full
    // stop, and doubled stops where a template already ended a sentence — which
    // is how a quiz prompt ended up reading "increased by 20%..".
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\.{2,}/g, ".")
    .trim();
  return out.length > max ? out.slice(0, max - 1).trimEnd() + "…" : out;
}

const first = (v) => (Array.isArray(v) ? v[0] : v);
const behaviorOf = (v) => (Array.isArray(v) ? v.join(", ") : v || "");

/* -------------------------------------------------------------- art check */

/**
 * HEAD every candidate URL once and remember the answer.
 *
 * A single transient failure must not permanently blank an icon, so a request
 * that errors (rather than returning a clean 404) is retried once.
 */
const seen = new Map();
async function exists(url) {
  if (seen.has(url)) return seen.get(url);
  const probe = async () => {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(20000) });
    return r.ok;
  };
  let ok = false;
  try { ok = await probe(); }
  catch { try { ok = await probe(); } catch { ok = false; } }
  seen.set(url, ok);
  return ok;
}

/** Run `jobs` (thunks) with a fixed number in flight. */
async function pool(jobs, width = 24, label = "") {
  let i = 0, done = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const job = jobs[i++];
      await job();
      done++;
      if (label && done % 250 === 0) log(`  ${label} ${done}/${jobs.length}`);
    }
  };
  await Promise.all(Array.from({ length: width }, worker));
}

/* ---------------------------------------------------------------- fetch */

log("fetching constants…");
const [heroStats, heroAbilities, abilities, items, patches] = await Promise.all([
  get("/heroStats"),
  get("/constants/hero_abilities"),
  get("/constants/abilities"),
  get("/constants/items"),
  get("/constants/patch"),
]);
const patch = patches[patches.length - 1]?.name ?? "unknown";
log(`patch ${patch} · ${heroStats.length} heroes · ${Object.keys(items).length} item keys`);

/* ------------------------------------------------------------------ heroes */

const heroes = [];
for (const h of heroStats) {
  const entry = heroAbilities[h.name];
  if (!entry) continue;

  const list = (entry.abilities || [])
    .filter((k) => k && k !== "generic_hidden")
    .map((k) => {
      const a = abilities[k];
      if (!a || !a.dname) return null;

      // Hidden sub-abilities are internal bookkeeping rows — "APPLICATION
      // DAMAGE:", "Spring Early" — not things a player has ever seen named.
      // They have no art and no description, and they made the Guide look wrong.
      const behavior = behaviorOf(a.behavior);
      const hidden = /\bHidden\b/.test(behavior) && !a.is_innate;
      if (hidden) return null;
      if (/:$/.test(a.dname)) return null;

      return {
        k,
        n: a.dname,
        img: `${CDN}/images/dota_react/abilities/${k}.png`, // verified below
        innate: !!a.is_innate,
        desc: clean(a.desc),
        lore: clean(a.lore, 180),
        behavior,
        dmg: a.dmg_type || "",
        pierces: a.bkbpierce === "Yes",
        cd: first(a.cd) != null ? String(first(a.cd)) : "",
        mc: first(a.mc) != null ? String(first(a.mc)) : "",
      };
    })
    .filter(Boolean);

  if (!list.length) continue;

  // Valve orders a hero's abilities with the ultimate last, and there is no
  // explicit flag in the data. Innates are listed among them but are never the
  // ultimate, so the ultimate is the last non-innate entry.
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i].innate) { list[i].ult = true; break; }
  }

  const talents = (entry.talents || [])
    .map((t) => ({ n: clean(abilities[t.name]?.dname || t.name, 80), lvl: t.level }))
    .filter((t) => t.n && !t.n.startsWith("special_bonus"));

  const base = h.img.split("/").pop().replace(/\.png.*$/, "");

  heroes.push({
    id: h.id,
    name: h.localized_name,
    base,
    attr: h.primary_attr,
    roles: h.roles || [],
    atk: h.attack_type,
    art: {
      // Portrait is the standing 235x272; four of the newest heroes have none
      // and fall back to the landscape crop. All four are checked, not assumed.
      portrait: `${CDN}/images/heroes/${base}_vert.jpg`,
      crop: `${CDN}/images/dota_react/heroes/crops/${base}.png`,
      icon: `${CDN}/images/dota_react/heroes/icons/${base}.png`,
      render: `${CDN}/videos/dota_react/heroes/renders/${base}.webm`,
    },
    stats: {
      str: h.base_str, agi: h.base_agi, int: h.base_int,
      strG: h.str_gain, agiG: h.agi_gain, intG: h.int_gain,
      hp: h.base_health, mana: h.base_mana, armor: h.base_armor, mr: h.base_mr,
      dmgMin: h.base_attack_min, dmgMax: h.base_attack_max,
      ms: h.move_speed, range: h.attack_range, bat: h.attack_rate,
      dayVision: h.day_vision, nightVision: h.night_vision, legs: h.legs,
    },
    // Pub pick/win from the same feed, so the Guide can say whether a hero is
    // actually winning right now rather than only what it does.
    pubPick: h.pub_pick ?? null,
    pubWin: h.pub_pick ? +(h.pub_win / h.pub_pick).toFixed(4) : null,
    abilities: list,
    talents,
  });
}
log(`heroes with abilities: ${heroes.length}`);

/* ------------------------------------------------------------------- items */

const SKIP = /^(recipe_|halloween|diretide|river_painter|present|mystery|greevil|dagon_[2-5]$)/;

const itemList = [];
for (const [k, it] of Object.entries(items)) {
  if (!it || !it.dname || !it.img) continue;
  if (SKIP.test(k)) continue;
  if (typeof it.cost !== "number" || it.cost <= 0) continue;

  const desc = (it.abilities || []).map((a) => `${a.title}: ${clean(a.description, 220)}`).join(" — ");
  itemList.push({
    k,
    n: it.dname,
    img: `${CDN}/images/dota_react/items/${k}.png`, // verified below
    cost: it.cost,
    qual: it.qual || "",
    desc: desc || clean(it.notes, 220),
    notes: clean(it.notes, 200),
    components: Array.isArray(it.components) ? it.components : null,
    neutral: !!it.tier,
    tier: it.tier ?? null,
    behavior: behaviorOf(it.behavior),
    lore: clean(it.lore, 200),
  });
}
itemList.sort((a, b) => a.cost - b.cost);
log(`items: ${itemList.length} (with recipes: ${itemList.filter((i) => i.components).length})`);

/* --------------------------------------------------------------- verify art */

log("verifying art against the CDN…");
const jobs = [];

for (const h of heroes) {
  for (const key of ["portrait", "crop", "icon", "render"]) {
    jobs.push(async () => { if (!(await exists(h.art[key]))) h.art[key] = null; });
  }
  for (const a of h.abilities) {
    jobs.push(async () => { if (!(await exists(a.img))) a.img = null; });
  }
}
for (const i of itemList) {
  jobs.push(async () => { if (!(await exists(i.img))) i.img = null; });
}

await pool(jobs, 24, "checked");

// An ability with no icon of its own borrows the hero's — an innate is a real
// part of the hero and belongs in the Guide, it just has no published icon.
let borrowed = 0, blank = 0;
for (const h of heroes) {
  for (const a of h.abilities) {
    if (a.img) continue;
    a.imgFallback = true;
    if (h.art.icon) { a.img = h.art.icon; borrowed++; } else blank++;
  }
  if (!h.art.portrait && h.art.crop) h.art.portrait = h.art.crop;
}

const missingItemArt = itemList.filter((i) => !i.img).length;
log(`art: ${borrowed} abilities fell back to the hero icon, ${blank} have none, ${missingItemArt} items missing`);

/* ------------------------------------------------------------------ output */

const payload = {
  builtAt: new Date().toISOString(),
  patch,
  version: 2,
  cdn: `${CDN}/images/dota_react`,
  heroes,
  items: itemList,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
log(`wrote ${OUT} (${kb} KB)`);

const abilityCount = heroes.reduce((a, h) => a + h.abilities.length, 0);
const quizable = heroes.reduce((a, h) => a + h.abilities.filter((x) => x.img && !x.imgFallback).length, 0);
log(`abilities: ${abilityCount} · with own art (quizable): ${quizable} · ults: ${heroes.filter((h) => h.abilities.some((a) => a.ult)).length}`);
log(`heroes missing a portrait: ${heroes.filter((h) => !h.art.portrait).length} · missing a render: ${heroes.filter((h) => !h.art.render).length}`);
