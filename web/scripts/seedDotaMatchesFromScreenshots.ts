/**
 * Seed Domin8 Dota tournament matches from WhatsApp screenshots (21 May 2026).
 *
 * The bot wasn't in the lobby for these practice/scrim matches, so the GC
 * pipeline couldn't ingest results. Operator hand-transcribed the
 * end-of-game scoreboards.
 *
 * Updates four `r1-match-N` docs (matches A, B, C, D map to r1-match-1/2/3/5
 * by majority-roster) and creates one extra `practice-1` doc for the pre-
 * tournament warmup (match E). Tournament status is bumped from "upcoming"
 * to "in_progress".
 *
 *   npx tsx scripts/seedDotaMatchesFromScreenshots.ts            # dry-run
 *   npx tsx scripts/seedDotaMatchesFromScreenshots.ts --apply    # write
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();
const TID = "domin8-ultimate-tilt-proof-tournament";
const APPLY = process.argv.includes("--apply");

// ── Roster lookup ───────────────────────────────────────────────────────────
// Hard-coded from Firestore team docs (avoids fuzzy matching brittle steam names).
const ROSTER: Record<string, { uid: string; team: string; steamName: string }> = {
  // team-1 (10k ke Pohe)
  "brisingr":       { uid: "steam_76561198329575612", team: "team-1", steamName: "bRiSINGR" },
  "zu mu mu!":      { uid: "discord_443481547249811468", team: "team-1", steamName: "zu mu mu!" },
  "kiluminati..!":  { uid: "discord_444438240095633408", team: "team-1", steamName: "Kiluminati..!" },
  "aomine":         { uid: "discord_475274594802991105", team: "team-1", steamName: "Aomine" },
  "itachi":         { uid: "discord_703754385909350400", team: "team-1", steamName: "ITACHI" },
  // team-2 (Toxic but Talented)
  "miyamc":         { uid: "discord_257510407571243008", team: "team-2", steamName: "MiyaMC" },
  "caterpillar_":   { uid: "discord_364743440715612160", team: "team-2", steamName: "Caterpillar_" },
  "pablo":          { uid: "discord_665194485650685963", team: "team-2", steamName: "PABLO" },
  "enoughofgrief":  { uid: "discord_718122172610117643", team: "team-2", steamName: "enoughofgrief-_-|" },
  "nol":            { uid: "discord_342240213910945794", team: "team-2", steamName: "nol" },
  // team-3 (Versatile Dogs)
  "kysms":          { uid: "discord_394429076158545920", team: "team-3", steamName: "kysms" },
  "default'11":     { uid: "steam_76561198046224649", team: "team-3", steamName: "Default'11" },
  "mr. walru5":     { uid: "discord_735213506105835650", team: "team-3", steamName: "Mr. Walru5" },
  "naruto uzumaki": { uid: "discord_722068528076816424", team: "team-3", steamName: "Naruto Uzumaki" },
  "smooth operatorrr": { uid: "discord_754777338058899539", team: "team-3", steamName: "SMooth OperaTorrr" },
  // team-4 (Dog Tamers)
  "pma :)":         { uid: "steam_76561198961912477", team: "team-4", steamName: "PMA :)" },
  "bazoooxa":       { uid: "discord_827178822847430677", team: "team-4", steamName: "BAZOOOㄨA|٢٨™" },
  "ninja":          { uid: "steam_76561198976188603", team: "team-4", steamName: "Ninja" },
  "mr pig":         { uid: "discord_360748823905304577", team: "team-4", steamName: "Mr Pig" },
  "bubble":         { uid: "discord_1364667323860127815", team: "team-4", steamName: "Bubble" },
};

// Strip clan tags / decorations to a stable lookup key.
function normalize(name: string): string {
  return name.toLowerCase()
    .replace(/\[[^\]]*\]/g, "")  // strip [clan]
    .replace(/\s+-\|.*$/, "")    // strip suffix decorations like " -|"
    .replace(/^smooth operatorr.*$/i, "smooth operatorrr")  // both 2-r and 3-r forms
    .replace(/^bazo+.*$/i, "bazoooxa")  // various BAZOOO mangling
    .replace(/[^\w!'.: ]/g, "")   // drop most symbols (keep ! ' . :)
    .replace(/\s+/g, " ").trim();
}

function lookup(displayName: string): { uid: string | null; team: string | null; steamName: string } {
  const key = normalize(displayName);
  const r = ROSTER[key];
  if (r) return { uid: r.uid, team: r.team, steamName: r.steamName };
  // Try contains-match fallback
  for (const [k, v] of Object.entries(ROSTER)) {
    if (key.includes(k) || k.includes(key)) return { uid: v.uid, team: v.team, steamName: v.steamName };
  }
  return { uid: null, team: null, steamName: displayName };
}

// ── Match data ───────────────────────────────────────────────────────────────
type PlayerStat = {
  displayName: string;
  hero: string;
  level: number;
  kills: number; deaths: number; assists: number;
  netWorth: number;
  lastHits: number; denies: number;
  gpm: number; xpm: number;
  heroDamage?: number; towerDamage?: number; heroHealing?: number;
  bountyRunes?: number;
  // Newer optional fields (extracted from M6 screenshots; safe to omit)
  outposts?: number;
  damageReceivedRaw?: number;
  damageReducedPct?: number;
  deathGoldLoss?: number;
  deathTime?: string;
  pickOrder?: number;
};

type ParsedMatch = {
  matchDocId: string;            // r1-match-N or practice-N
  dotaMatchId: string;
  gameMode: "captains_mode" | "all_pick";
  durationSec: number;
  completedAtIso: string;
  radiantTeamId: string | null;  // null for non-tournament practice
  direTeamId: string | null;
  winner: "radiant" | "dire";
  radiantScore: number;          // kill count
  direScore: number;
  radiant: PlayerStat[];
  dire: PlayerStat[];
  dataQuality?: "ok" | "low";
};

const MATCHES: ParsedMatch[] = [
  // ── Match A: r1-match-1, 5/16 11:32 PM IST, Dire Victory ─────────────────
  {
    matchDocId: "r1-match-1",
    dotaMatchId: "8813637124",
    gameMode: "captains_mode",
    durationSec: 3977,                // 1:06:17
    completedAtIso: "2026-05-16T18:02:00Z",
    radiantTeamId: "team-1",          // 10k ke Pohe
    direTeamId: "team-2",             // Toxic but Talented (lobby labelled "The Dire")
    winner: "dire",
    radiantScore: 48, direScore: 45,  // Dire won despite fewer kills (throne destroyed)
    radiant: [
      { displayName: "Aomine",           hero: "Grimstroke",   level: 10, kills:  3, deaths:  7, assists: 36, netWorth: 17709, lastHits:  270, denies:  6, gpm: 406, xpm:  537, heroDamage: 41947, towerDamage:   263, heroHealing: 1384, bountyRunes: 1 },
      { displayName: "bRISINGR",         hero: "Axe",          level: 26, kills:  3, deaths: 12, assists: 26, netWorth: 19371, lastHits:  308, denies:  1, gpm: 386, xpm:  614, heroDamage: 29950, towerDamage:   208, heroHealing:    0, bountyRunes: 3 },
      { displayName: "Kiluminati..!",    hero: "Juggernaut",   level: 30, kills: 21, deaths:  7, assists: 10, netWorth: 49069, lastHits: 1044, denies: 20, gpm: 961, xpm: 1248, heroDamage: 58484, towerDamage: 19834, heroHealing:10753, bountyRunes:12 },
      { displayName: "zu mu mu!",        hero: "Death Prophet",level: 28, kills: 10, deaths:  9, assists: 21, netWorth: 25118, lastHits:  352, denies: 15, gpm: 467, xpm:  753, heroDamage: 41476, towerDamage:  3025, heroHealing:    0, bountyRunes: 2 },
      { displayName: "ITACHI",           hero: "Lich",         level: 25, kills:  9, deaths: 10, assists: 25, netWorth: 15717, lastHits:  108, denies:  3, gpm: 309, xpm:  545, heroDamage: 32719, towerDamage:   189, heroHealing:    0, bountyRunes: 1 },
    ],
    dire: [
      { displayName: "Caterpillar",      hero: "Invoker",      level: 30, kills: 20, deaths:  4, assists: 20, netWorth: 40591, lastHits:  544, denies: 24, gpm: 788, xpm: 1074, heroDamage: 76118, towerDamage:  8559, heroHealing:    0, bountyRunes: 0 },
      { displayName: "PABLO",            hero: "Underlord",    level: 27, kills:  3, deaths: 12, assists: 22, netWorth: 22245, lastHits:  363, denies:  6, gpm: 466, xpm:  740, heroDamage: 25101, towerDamage:   404, heroHealing:    0, bountyRunes: 3 },
      { displayName: "MiyaMC",           hero: "Wraith King",  level: 30, kills: 14, deaths:  6, assists: 16, netWorth: 39264, lastHits:  778, denies: 12, gpm: 767, xpm:  975, heroDamage: 43820, towerDamage:  9902, heroHealing:    0, bountyRunes: 6 },
      { displayName: "enoughofgrief- -|",hero: "Techies",      level: 23, kills:  3, deaths: 15, assists: 25, netWorth: 17061, lastHits:  154, denies:  0, gpm: 363, xpm:  574, heroDamage: 33192, towerDamage:   209, heroHealing:    0, bountyRunes: 0 },
      { displayName: "nol",              hero: "Jakiro",       level: 24, kills:  2, deaths: 11, assists: 23, netWorth: 17762, lastHits:  146, denies:  0, gpm: 336, xpm:  494, heroDamage: 20328, towerDamage:   260, heroHealing:    0, bountyRunes: 5 },
    ],
  },

  // ── Match C: r1-match-2, 5/17 1:28 AM IST, Dire Victory (Domin8 Jr lobby) ─
  {
    matchDocId: "r1-match-2",
    dotaMatchId: "8813780132",
    gameMode: "captains_mode",
    durationSec: 3399,                // 56:39
    completedAtIso: "2026-05-16T19:58:00Z",
    radiantTeamId: "team-4",          // Dog Tamers (3 of 5 + 1 sub from team-3)
    direTeamId: "team-3",             // Versatile Dogs (3 of 5 + Caterpillar sub from team-2)
    winner: "dire",
    radiantScore: 43, direScore: 39,
    radiant: [
      { displayName: "Ninja",            hero: "Primal Beast", level: 27, kills: 11, deaths: 12, assists: 19, netWorth: 20357, lastHits:  324, denies:  3, gpm: 486, xpm:  777, heroDamage: 25734, towerDamage:   180, heroHealing:    0, bountyRunes: 1 },
      { displayName: "Mr Pig",           hero: "Jakiro",       level: 23, kills:  2, deaths:  7, assists: 18, netWorth: 13552, lastHits:   36, denies:  3, gpm: 261, xpm:  517, heroDamage: 17468, towerDamage:   111, heroHealing:    0, bountyRunes: 4 },
      { displayName: "Kratos",           hero: "Ursa",         level: 29, kills: 19, deaths:  7, assists:  6, netWorth: 29052, lastHits:  575, denies: 13, gpm: 718, xpm: 1045, heroDamage: 34015, towerDamage:   987, heroHealing:    0, bountyRunes: 3 },
      { displayName: "Naruto Uzumaki",   hero: "Shadow Shaman",level: 22, kills:  4, deaths: 11, assists: 22, netWorth: 12033, lastHits:   68, denies:  6, gpm: 282, xpm:  475, heroDamage: 10009, towerDamage:  3036, heroHealing:    0, bountyRunes: 0 },
      { displayName: "BAZOOOXA",         hero: "Zeus",         level: 25, kills:  6, deaths:  2, assists: 24, netWorth: 27123, lastHits:  392, denies: 13, gpm: 504, xpm:  677, heroDamage: 67795, towerDamage:   493, heroHealing:    0, bountyRunes: 2 },
    ],
    dire: [
      { displayName: "Default'11",       hero: "Sniper",       level: 27, kills: 14, deaths:  5, assists: 12, netWorth: 34178, lastHits:  450, denies:  5, gpm: 644, xpm:  784, heroDamage: 38915, towerDamage:  9483, heroHealing:    0, bountyRunes: 6 },
      { displayName: "Bubble",           hero: "Skywrath Mage",level: 21, kills:  3, deaths:  9, assists: 20, netWorth: 10864, lastHits:   21, denies:  2, gpm: 231, xpm:  437, heroDamage: 14375, towerDamage:   252, heroHealing:    0, bountyRunes: 0 },
      { displayName: "Caterpillar",      hero: "Lifestealer",  level: 30, kills: 15, deaths:  3, assists: 18, netWorth: 41497, lastHits:  552, denies: 48, gpm: 776, xpm: 1166, heroDamage: 36096, towerDamage: 11258, heroHealing: 4440, bountyRunes: 2 },
      { displayName: "Mr. Walru5",       hero: "Lion",         level: 21, kills:  2, deaths: 14, assists: 17, netWorth: 11627, lastHits:   50, denies:  2, gpm: 252, xpm:  421, heroDamage: 11087, towerDamage:   559, heroHealing: 1282, bountyRunes: 3 },
      { displayName: "SMooth OperaTorr", hero: "Legion Commander", level: 26, kills:  4, deaths: 12, assists: 18, netWorth: 18233, lastHits:  235, denies:  8, gpm: 419, xpm:  730, heroDamage: 24221, towerDamage:  1672, heroHealing: 2751, bountyRunes: 1 },
    ],
  },

  // ── Match B: r1-match-3, 5/17 4:30 AM IST, Radiant Victory ────────────────
  {
    matchDocId: "r1-match-3",
    dotaMatchId: "8813947549",
    gameMode: "captains_mode",
    durationSec: 2921,                // 48:41
    completedAtIso: "2026-05-16T23:00:00Z",
    radiantTeamId: "team-3",          // Versatile Dogs
    direTeamId: "team-1",             // 10k ke Pohe
    winner: "radiant",
    radiantScore: 60, direScore: 40,
    radiant: [
      { displayName: "SMooth OperaTorr", hero: "Windranger",   level: 23, kills:  8, deaths: 10, assists: 21, netWorth: 18967, lastHits:  191, denies:  4, gpm: 444, xpm:  620, heroDamage: 19859, towerDamage:  6474, heroHealing:    0, bountyRunes: 9 },
      { displayName: "Default'11",       hero: "Axe",          level: 25, kills: 16, deaths:  8, assists: 22, netWorth: 19797, lastHits:  194, denies: 11, gpm: 510, xpm:  765, heroDamage: 33912, towerDamage:  3466, heroHealing:    0, bountyRunes: 1 },
      { displayName: "Naruto Uzumaki",   hero: "Lich",         level: 21, kills: 12, deaths: 14, assists: 25, netWorth: 13700, lastHits:   43, denies:  2, gpm: 370, xpm:  531, heroDamage: 11381, towerDamage:   593, heroHealing:    0, bountyRunes: 0 },
      { displayName: "kysms",            hero: "Kez",          level: 29, kills: 19, deaths:  2, assists: 21, netWorth: 35155, lastHits:  394, denies: 15, gpm: 749, xpm: 1174, heroDamage: 61171, towerDamage: 13927, heroHealing:    0, bountyRunes: 1 },
      { displayName: "Mr. Walru5",       hero: "Hoodwink",     level: 24, kills:  4, deaths:  6, assists: 15, netWorth: 19200, lastHits:  216, denies:  3, gpm: 431, xpm:  665, heroDamage: 12747, towerDamage:   955, heroHealing: 2403, bountyRunes: 2 },
    ],
    dire: [
      { displayName: "ITACHI",           hero: "Jakiro",       level: 23, kills:  7, deaths: 13, assists: 17, netWorth: 11497, lastHits:   32, denies:  1, gpm: 280, xpm:  590, heroDamage: 23200, towerDamage:     0, heroHealing:  604, bountyRunes: 0 },
      { displayName: "Aomine",           hero: "Shadow Shaman",level: 22, kills:  6, deaths:  7, assists: 19, netWorth: 12686, lastHits:  112, denies:  5, gpm: 339, xpm:  574, heroDamage: 13958, towerDamage:  3864, heroHealing:    0, bountyRunes: 2 },
      { displayName: "Kiluminati..!",    hero: "Drow Ranger",  level: 25, kills: 10, deaths: 11, assists: 11, netWorth: 26416, lastHits:  460, denies:  7, gpm: 645, xpm:  758, heroDamage: 28742, towerDamage:  1582, heroHealing:    0, bountyRunes: 4 },
      { displayName: "bRISINGR",         hero: "Viper",        level: 21, kills:  6, deaths: 18, assists: 13, netWorth: 13983, lastHits:  171, denies: 14, gpm: 363, xpm:  508, heroDamage: 22515, towerDamage:   219, heroHealing:    0, bountyRunes: 3 },
      { displayName: "zu mu mu!",        hero: "Void Spirit",  level: 25, kills: 10, deaths: 11, assists: 22, netWorth: 17573, lastHits:  213, denies:  5, gpm: 445, xpm:  772, heroDamage: 31550, towerDamage:   712, heroHealing:    0, bountyRunes: 1 },
    ],
  },

  // ── Match D: r1-match-5, 5/17 3:13 AM IST, Dire Victory (Toxic But Talented)
  {
    matchDocId: "r1-match-5",
    dotaMatchId: "8813888349",
    gameMode: "captains_mode",
    durationSec: 2813,                // 46:53
    completedAtIso: "2026-05-16T21:43:00Z",
    radiantTeamId: "team-4",          // Dog Tamers (3 of 5 + 2 subs from team-3)
    direTeamId: "team-2",             // Toxic but Talented
    winner: "dire",
    radiantScore: 35, direScore: 63,
    radiant: [
      { displayName: "BAZOOOXA",         hero: "Invoker",      level: 24, kills:  6, deaths: 10, assists: 15, netWorth: 18004, lastHits:  278, denies: 13, gpm: 501, xpm:  684, heroDamage: 41482, towerDamage:   648, heroHealing:  320, bountyRunes: 4 },
      { displayName: "Mr Pig",           hero: "Silencer",     level: 19, kills:  0, deaths: 11, assists: 20, netWorth: 10496, lastHits:   66, denies:  3, gpm: 249, xpm:  444, heroDamage: 12618, towerDamage:   115, heroHealing:    0, bountyRunes: 2 },
      { displayName: "Default'11",       hero: "Vengeful Spirit",level: 27, kills: 12, deaths: 13, assists: 10, netWorth: 18741, lastHits:  317, denies: 13, gpm: 544, xpm:  957, heroDamage: 31552, towerDamage:  2308, heroHealing:    0, bountyRunes: 0 },
      { displayName: "Naruto Uzumaki",   hero: "Axe",          level: 23, kills:  6, deaths: 16, assists: 10, netWorth: 13113, lastHits:  255, denies:  3, gpm: 385, xpm:  636, heroDamage: 22986, towerDamage:     0, heroHealing:    0, bountyRunes: 1 },
      { displayName: "Ninja",            hero: "Skywrath Mage",level: 22, kills: 10, deaths: 13, assists: 13, netWorth: 13360, lastHits:   87, denies:  2, gpm: 373, xpm:  555, heroDamage: 28274, towerDamage:     0, heroHealing:  125, bountyRunes: 2 },
    ],
    dire: [
      { displayName: "Caterpillar",      hero: "Kez",          level: 27, kills: 29, deaths:  7, assists: 19, netWorth: 27234, lastHits:  291, denies: 12, gpm: 705, xpm: 1027, heroDamage: 51909, towerDamage:  8404, heroHealing:    0, bountyRunes: 3 },
      { displayName: "nol",              hero: "Jakiro",       level: 24, kills:  4, deaths: 10, assists: 36, netWorth: 15397, lastHits:   49, denies:  2, gpm: 375, xpm:  715, heroDamage: 14987, towerDamage:  3169, heroHealing: 7161, bountyRunes: 2 },
      { displayName: "MiyaMC",           hero: "Phoenix",      level: 26, kills: 11, deaths:  7, assists: 34, netWorth: 23913, lastHits:  259, denies:  2, gpm: 547, xpm:  872, heroDamage: 33533, towerDamage:  1357, heroHealing: 1267, bountyRunes: 2 },
      { displayName: "enoughofgrief- -|",hero: "Dark Willow",  level: 23, kills:  8, deaths:  7, assists: 30, netWorth: 13263, lastHits:   19, denies:  2, gpm: 304, xpm:  642, heroDamage: 13918, towerDamage:     0, heroHealing: 1800, bountyRunes: 4 },
      { displayName: "PABLO",            hero: "Magnus",       level: 26, kills:  9, deaths:  4, assists: 28, netWorth: 20995, lastHits:  206, denies:  1, gpm: 480, xpm:  859, heroDamage: 24941, towerDamage:   425, heroHealing:    0, bountyRunes: 4 },
    ],
  },

  // ── Match F: r1-match-6, 5/17 5:55 AM IST, Radiant Victory 48-36 ─────────
  //   Versatile Dogs (Radiant, team-3) beat Toxic but Talented (Dire, team-2).
  //   Subs: Ninja (team-4) filled in for Naruto Uzumaki on team-3 side;
  //         Major (external) and ITACHI (team-1) filled in for PABLO and nol on team-2.
  {
    matchDocId: "r1-match-6",
    dotaMatchId: "8813997841",
    gameMode: "captains_mode",
    durationSec: 2629,                 // 43:49
    completedAtIso: "2026-05-17T00:25:00Z",
    radiantTeamId: "team-3",           // Versatile Dogs
    direTeamId: "team-2",              // Toxic but Talented
    winner: "radiant",
    radiantScore: 48, direScore: 36,
    radiant: [
      { displayName: "Mr. Walru5",       hero: "Shadow Shaman", level: 19, kills:  4, deaths:  9, assists: 27, netWorth: 14518, lastHits:  63, denies:  3, gpm: 382, xpm:  476, heroDamage: 20957, towerDamage:  3054, heroHealing:  125, bountyRunes: 2, outposts: 2, damageReceivedRaw: 30043, damageReducedPct: 31.4, deathGoldLoss: 1215, deathTime: "5:29",  pickOrder: 10 },
      { displayName: "Default'11",       hero: "Pudge",         level: 24, kills: 16, deaths:  7, assists: 15, netWorth: 20073, lastHits: 200, denies:  4, gpm: 525, xpm:  747, heroDamage: 31158, towerDamage:  1848, heroHealing:    0, bountyRunes: 6, outposts: 0, damageReceivedRaw: 65591, damageReducedPct: 51.7, deathGoldLoss: 1608, deathTime: "5:24",  pickOrder:  8 },
      { displayName: "SMooth OperaTorr", hero: "Riki",          level: 25, kills: 12, deaths: 10, assists: 12, netWorth: 18679, lastHits: 174, denies:  9, gpm: 488, xpm:  847, heroDamage: 20320, towerDamage:  1818, heroHealing:    0, bountyRunes: 3, outposts: 0, damageReceivedRaw: 34080, damageReducedPct: 32.8, deathGoldLoss: 2228, deathTime: "6:55",  pickOrder:  7 },
      { displayName: "Ninja",            hero: "Clockwerk",     level: 20, kills:  2, deaths:  8, assists: 30, netWorth: 11591, lastHits:  44, denies:  0, gpm: 306, xpm:  502, heroDamage: 15998, towerDamage:   383, heroHealing:    0, bountyRunes: 0, outposts: 0, damageReceivedRaw: 35091, damageReducedPct: 27.8, deathGoldLoss:  875, deathTime: "4:46",  pickOrder:  5 },
      { displayName: "kysms",            hero: "Juggernaut",    level: 29, kills: 13, deaths:  3, assists: 14, netWorth: 37881, lastHits: 583, denies: 10, gpm: 895, xpm: 1440, heroDamage: 38614, towerDamage: 21846, heroHealing: 7069, bountyRunes: 1, outposts: 0, damageReceivedRaw: 49701, damageReducedPct: 53.1, deathGoldLoss:  562, deathTime: "2:23",  pickOrder:  9 },
    ],
    dire: [
      { displayName: "enoughofgrief- -|",hero: "Phoenix",       level: 20, kills:  7, deaths:  9, assists: 18, netWorth: 11071, lastHits:  78, denies:  1, gpm: 309, xpm:  527, heroDamage: 26235, towerDamage:   202, heroHealing: 1560, bountyRunes: 1, outposts: 1, damageReceivedRaw: 26489, damageReducedPct: 36.3, deathGoldLoss: 1098, deathTime: "5:40",  pickOrder:  2 },
      { displayName: "Major",            hero: "Bristleback",   level: 23, kills:  7, deaths: 11, assists: 17, netWorth: 16938, lastHits: 263, denies:  6, gpm: 489, xpm:  660, heroDamage: 33675, towerDamage:   159, heroHealing:    0, bountyRunes: 3, outposts: 1, damageReceivedRaw: 112619, damageReducedPct: 67.5, deathGoldLoss: 2192, deathTime: "6:15", pickOrder:  4 },
      { displayName: "Caterpillar",      hero: "Slardar",       level: 22, kills: 11, deaths:  7, assists: 19, netWorth: 16670, lastHits: 220, denies:  8, gpm: 501, xpm:  635, heroDamage: 23226, towerDamage:   524, heroHealing:    0, bountyRunes: 2, outposts: 0, damageReceivedRaw: 65999, damageReducedPct: 50.9, deathGoldLoss: 2135, deathTime: "5:41",  pickOrder:  1 },
      { displayName: "ITACHI",           hero: "Disruptor",     level: 18, kills:  4, deaths: 11, assists: 21, netWorth: 11198, lastHits:  30, denies:  1, gpm: 277, xpm:  411, heroDamage: 13725, towerDamage:   334, heroHealing:    0, bountyRunes: 4, outposts: 0, damageReceivedRaw: 27717, damageReducedPct: 39.8, deathGoldLoss: 1145, deathTime: "6:49",  pickOrder:  6 },
      { displayName: "MiyaMC",           hero: "Clinkz",        level: 21, kills:  7, deaths: 11, assists: 11, netWorth: 18508, lastHits: 274, denies:  7, gpm: 475, xpm:  586, heroDamage: 27040, towerDamage:  2296, heroHealing:    0, bountyRunes: 1, outposts: 0, damageReceivedRaw: 41333, damageReducedPct: 40.8, deathGoldLoss: 2069, deathTime: "8:07",  pickOrder:  3 },
    ],
  },

  // ── Match E: practice-1 — REMOVED ─────────────────────────────────────────
  // Operator flagged this 5/16 6:44 PM warmup as junk (rosters were almost
  // entirely non-tournament players; the bot wasn't tracking it). Doc deleted
  // from Firestore on 21 May 2026. Keeping the comment so future seeds don't
  // accidentally re-add it.
  /* DELETED — practice-1 entry kept for reference only:
  {
    matchDocId: "practice-1",
    dotaMatchId: "8813222962",
    gameMode: "all_pick",
    durationSec: 1954,                // 32:34
    completedAtIso: "2026-05-16T13:14:00Z",
    radiantTeamId: null,
    direTeamId: null,
    winner: "radiant",
    radiantScore: 59, direScore: 37,
    dataQuality: "low",
    radiant: [
      { displayName: "Kiluminati..!",    hero: "Juggernaut",   level: 0, kills:  7, deaths:  4, assists: 12, netWorth: 22259, lastHits: 232, denies: 11, gpm: 711, xpm:    0 },
      { displayName: "kysms",            hero: "Earthshaker",  level: 0, kills:  5, deaths: 19, assists: 26, netWorth: 17496, lastHits: 142, denies:  0, gpm: 372, xpm:  671 },
      { displayName: "bRISINGR",         hero: "Undying",      level: 0, kills:  9, deaths:  3, assists: 26, netWorth: 14867, lastHits:  80, denies:  2, gpm: 414, xpm:  789 },
      { displayName: "Major",            hero: "Witch Doctor", level: 0, kills: 11, deaths: 11, assists: 17, netWorth: 17540, lastHits:   0, denies:  0, gpm:   0, xpm:    0 },
      { displayName: "Pangoluer",        hero: "Unknown",      level: 0, kills: 11, deaths:  7, assists: 22, netWorth: 17257, lastHits:   0, denies:  0, gpm:   0, xpm:    0 },
    ],
    dire: [
      { displayName: "Gabe Newell",      hero: "Axe",          level: 0, kills: 10, deaths:  7, assists: 16, netWorth: 10703, lastHits:   0, denies:  0, gpm:   0, xpm:    0 },
      { displayName: "Venomanjar",       hero: "Skywrath Mage",level: 0, kills:  6, deaths: 11, assists: 11, netWorth:  9136, lastHits:   0, denies:  0, gpm:   0, xpm:    0 },
      { displayName: "SmallButMighty",   hero: "Rubick",       level: 0, kills:  4, deaths: 13, assists: 27, netWorth:  8323, lastHits:   0, denies:  0, gpm:   0, xpm:    0 },
      { displayName: "Aizi",             hero: "Phantom Lancer",level: 0,kills: 10, deaths:  7, assists:  8, netWorth: 16862, lastHits:   0, denies:  0, gpm:   0, xpm:    0 },
      { displayName: "Egor",             hero: "Storm Spirit", level: 0, kills:  9, deaths:  7, assists: 15, netWorth: 13003, lastHits:   0, denies:  0, gpm:   0, xpm:    0 },
    ],
  },
  */
];

// ── Helpers ────────────────────────────────────────────────────────────────
function buildPlayerStats(players: PlayerStat[], side: "radiant" | "dire", radiantTeamId: string | null, direTeamId: string | null) {
  const sideTeamId = side === "radiant" ? radiantTeamId : direTeamId;
  return players.map(p => {
    const { uid, team, steamName } = lookup(p.displayName);
    return {
      uid,
      name: p.displayName,
      steamName,
      tournamentTeam: team === radiantTeamId ? "team1" : team === direTeamId ? "team2" : team || null,
      teamId: team || sideTeamId,
      side,
      hero: p.hero,
      level: p.level,
      kills: p.kills, deaths: p.deaths, assists: p.assists,
      netWorth: p.netWorth,
      lastHits: p.lastHits, denies: p.denies,
      gpm: p.gpm, xpm: p.xpm,
      heroDamage: p.heroDamage ?? 0,
      towerDamage: p.towerDamage ?? 0,
      heroHealing: p.heroHealing ?? 0,
      bountyRunes: p.bountyRunes ?? 0,
      ...(p.outposts !== undefined ? { outposts: p.outposts } : {}),
      ...(p.damageReceivedRaw !== undefined ? { damageReceivedRaw: p.damageReceivedRaw } : {}),
      ...(p.damageReducedPct !== undefined ? { damageReducedPct: p.damageReducedPct } : {}),
      ...(p.deathGoldLoss !== undefined ? { deathGoldLoss: p.deathGoldLoss } : {}),
      ...(p.deathTime !== undefined ? { deathTime: p.deathTime } : {}),
      ...(p.pickOrder !== undefined ? { pickOrder: p.pickOrder } : {}),
    };
  });
}

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}\n`);

  // Probe roster lookup
  let unresolved: string[] = [];
  for (const m of MATCHES) {
    for (const p of [...m.radiant, ...m.dire]) {
      const r = lookup(p.displayName);
      if (!r.uid && (m.radiantTeamId || m.direTeamId)) {
        unresolved.push(`${m.matchDocId}  ${p.displayName} -> NO MATCH`);
      }
    }
  }
  if (unresolved.length) {
    console.log("⚠️  Unresolved players (will be stored with uid=null):");
    unresolved.forEach(u => console.log("  " + u));
    console.log();
  }

  const tRef = db.collection("tournaments").doc(TID);
  const t = await tRef.get();
  if (!t.exists) throw new Error(`Tournament ${TID} not found`);

  const writes: Array<{ ref: FirebaseFirestore.DocumentReference; data: any; merge: boolean }> = [];

  for (const m of MATCHES) {
    const matchRef = tRef.collection("matches").doc(m.matchDocId);
    const existing = (await matchRef.get()).data() as any;

    const radiantStats = buildPlayerStats(m.radiant, "radiant", m.radiantTeamId, m.direTeamId);
    const direStats = buildPlayerStats(m.dire, "dire", m.radiantTeamId, m.direTeamId);

    // For r1-match-N docs the team1Id/team2Id is already set in the schedule.
    // Map radiant/dire → team1/team2 so the existing UI reads cleanly.
    const team1Id = existing?.team1Id ?? m.radiantTeamId;
    const team2Id = existing?.team2Id ?? m.direTeamId;
    const winnerTeamId =
      m.winner === "radiant"
        ? m.radiantTeamId
        : m.direTeamId;
    const team1Won = winnerTeamId === team1Id;
    const team2Won = winnerTeamId === team2Id;

    const data: any = {
      ...(existing || {}),
      id: m.matchDocId,
      tournamentId: TID,
      isBracket: existing?.isBracket ?? false,
      bestOf: 1,
      matchDay: existing?.matchDay ?? 1,
      matchIndex: existing?.matchIndex ?? (m.matchDocId.startsWith("practice") ? 0 : Number(m.matchDocId.split("-").pop()) || 0),
      team1Id, team2Id,
      team1Name: existing?.team1Name ?? "Radiant",
      team2Name: existing?.team2Name ?? "Dire",
      team1Score: team1Won ? 1 : 0,
      team2Score: team2Won ? 1 : 0,
      status: "completed",
      winnerTeamId,
      startedAt: new Date(new Date(m.completedAtIso).getTime() - m.durationSec * 1000).toISOString(),
      completedAt: m.completedAtIso,
      dotaMatchId: m.dotaMatchId,
      durationSec: m.durationSec,
      gameMode: m.gameMode,
      dataSource: "manual-screenshot-2026-05-21",
      ...(m.dataQuality ? { dataQuality: m.dataQuality } : {}),
      game1: {
        radiantTeamId: m.radiantTeamId,
        direTeamId: m.direTeamId,
        radiantScore: m.radiantScore,
        direScore: m.direScore,
        winner: m.winner,
        durationSec: m.durationSec,
        gameMode: m.gameMode,
        dotaMatchId: m.dotaMatchId,
        startedAt: new Date(new Date(m.completedAtIso).getTime() - m.durationSec * 1000).toISOString(),
        playerStats: [...radiantStats, ...direStats],
      },
    };

    console.log(`── ${m.matchDocId}  (dota ${m.dotaMatchId})`);
    console.log(`    ${m.radiantTeamId || "?"} vs ${m.direTeamId || "?"}`);
    console.log(`    Radiant ${m.radiantScore} - ${m.direScore} Dire   winner=${m.winner}   dur=${Math.floor(m.durationSec/60)}:${(m.durationSec%60).toString().padStart(2,"0")}`);
    console.log(`    playerStats: ${radiantStats.length + direStats.length} entries  (resolved uid: ${radiantStats.filter(p => p.uid).length + direStats.filter(p => p.uid).length})`);
    writes.push({ ref: matchRef, data, merge: false });
  }

  // Tournament status bump — `ongoing` matches lib/types.ts and the
  // /api/tournaments/list filter; `in_progress` would silently hide it.
  writes.push({ ref: tRef, data: { status: "ongoing" }, merge: true });

  console.log(`\nTotal writes: ${writes.length}`);
  if (!APPLY) {
    console.log("\n🟡 DRY RUN — pass --apply to commit.");
    return;
  }

  const batch = db.batch();
  for (const w of writes) {
    if (w.merge) batch.set(w.ref, w.data, { merge: true });
    else batch.set(w.ref, w.data);
  }
  await batch.commit();
  console.log("\n✅ Wrote all matches + tournament status.");
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
