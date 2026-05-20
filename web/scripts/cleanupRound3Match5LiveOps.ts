/**
 * Post-fetch cleanup for round3-match5 live ops:
 *   1. Restore Orcus's full member fields on team-10 (riotPuuid was dropped
 *      when substitute revert wrote a stripped-down member object).
 *   2. Backfill Sheeshu's leaderboard entry with both round3-match5 games
 *      that match-fetch missed (because the Sheeshu sub member had no puuid).
 *
 * Idempotent: re-running won't double-count games (uses processedGames keys).
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
if (!getApps().length) initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n") }) });
const db = getFirestore();

const TID = "league-of-rising-stars-ascension";
const TEAM_RADIANT = "team-10";
const ORCUS_UID = "discord_741592452485480488";
const SHEESHU_UID = "discord_867791085644283934";
const SHEESHU_PUUID = "99633612-cd99-5803-8fd6-c022f47dbe95";
const MATCH_DOC = "round3-match5";

async function restoreOrcus() {
  console.log("\n──── 1. Restore Orcus's full member entry on team-10 ────");
  const u = (await db.collection("users").doc(ORCUS_UID).get()).data() as any;
  if (!u || !u.riotPuuid) throw new Error("Orcus user doc missing riotPuuid");

  const skillLevels: Record<string, number> = {
    "Iron": 1, "Bronze": 1, "Silver": 1, "Gold": 1,
    "Platinum": 2, "Diamond": 3, "Ascendant": 4, "Immortal": 5, "Radiant": 5,
  };
  const baseTier = (u.riotRank || "").split(" ")[0];

  const teamRef = db.collection("valorantTournaments").doc(TID).collection("teams").doc(TEAM_RADIANT);
  const team = (await teamRef.get()).data() as any;
  const members = team.members as any[];
  const idx = members.findIndex(m => m.uid === ORCUS_UID);
  if (idx === -1) throw new Error("Orcus not on team-10");

  members[idx] = {
    uid: ORCUS_UID,
    riotGameName: u.riotGameName,
    riotTagLine: u.riotTagLine || "",
    riotAvatar: u.riotAvatar || "",
    riotRank: u.riotRank || "",
    riotTier: u.riotTier || 0,
    riotPuuid: u.riotPuuid,                           // ← the field that got dropped
    skillLevel: skillLevels[baseTier] ?? 1,
  };

  const totalSkill = members.reduce((s, m) => s + (m.skillLevel || 1), 0);
  await teamRef.update({ members, totalSkillLevel: totalSkill, avgSkillLevel: Math.round((totalSkill / members.length) * 100) / 100 });
  console.log(`  ✅ Orcus member restored with riotPuuid=${u.riotPuuid}`);
}

async function backfillSheeshu() {
  console.log("\n──── 2. Backfill Sheeshu's leaderboard for both games ────");
  const matchDoc = (await db.collection("valorantTournaments").doc(TID).collection("matches").doc(MATCH_DOC).get()).data() as any;

  const lbRef = db.collection("valorantTournaments").doc(TID).collection("leaderboard").doc(SHEESHU_PUUID);
  const lb = (await lbRef.get()).data() as any || {};
  const processedGames = lb.processedGames || {};

  for (const [gameKey, gameField] of [["round3-match5__game1", "game1"], ["round3-match5__game2", "game2"]] as const) {
    if (processedGames[gameKey]) {
      console.log(`  · ${gameKey} already processed — skipping`);
      continue;
    }
    const game = matchDoc[gameField];
    if (!game) { console.log(`  ⚠ ${gameField} missing on match doc — skipping`); continue; }
    const ps = (game.playerStats || []).find((p: any) => p.puuid === SHEESHU_PUUID);
    if (!ps) { console.log(`  ⚠ Sheeshu's puuid not in ${gameField}.playerStats — skipping`); continue; }

    const won = ps.tournamentTeam === game.winner ? 1 : 0;
    const entry = {
      kills: ps.kills || 0,
      deaths: ps.deaths || 0,
      assists: ps.assists || 0,
      score: ps.score || 0,
      headshots: ps.headshots || 0,
      bodyshots: ps.bodyshots || 0,
      legshots: ps.legshots || 0,
      damageDealt: ps.damageDealt || 0,
      damageReceived: ps.damageReceived || 0,
      roundsPlayed: game.roundsPlayed || 0,
      firstKills: ps.firstKills || 0,
      firstDeaths: ps.firstDeaths || 0,
      won,
      agent: ps.agent || "Unknown",
    };
    processedGames[gameKey] = entry;
    console.log(`  + ${gameKey}: K/D/A=${entry.kills}/${entry.deaths}/${entry.assists}  acs≈${Math.round(entry.score / Math.max(entry.roundsPlayed, 1))}  won=${won}  agent=${entry.agent}`);
  }

  // Recompute aggregates from the merged processedGames map
  const agg = Object.values(processedGames).reduce((a: any, g: any) => {
    a.kills += g.kills; a.deaths += g.deaths; a.assists += g.assists; a.score += g.score;
    a.headshots += g.headshots; a.bodyshots += g.bodyshots; a.legshots += g.legshots;
    a.damageDealt += g.damageDealt; a.damageReceived += g.damageReceived;
    a.rounds += g.roundsPlayed; a.firstKills += g.firstKills; a.firstDeaths += g.firstDeaths;
    a.matches += 1;
    a.agents.add(g.agent);
    return a;
  }, { kills: 0, deaths: 0, assists: 0, score: 0, headshots: 0, bodyshots: 0, legshots: 0, damageDealt: 0, damageReceived: 0, rounds: 0, firstKills: 0, firstDeaths: 0, matches: 0, agents: new Set<string>() });

  const upd = {
    puuid: SHEESHU_PUUID,
    name: "Sheeshu",
    tag: "FERO",
    uid: SHEESHU_UID,
    teamId: lb.teamId || "team-5",   // home team unchanged
    processedGames,
    totalKills: agg.kills,
    totalDeaths: agg.deaths,
    totalAssists: agg.assists,
    totalScore: agg.score,
    totalHeadshots: agg.headshots,
    totalBodyshots: agg.bodyshots,
    totalLegshots: agg.legshots,
    totalDamageDealt: agg.damageDealt,
    totalDamageReceived: agg.damageReceived,
    totalRoundsPlayed: agg.rounds,
    totalFirstKills: agg.firstKills,
    totalFirstDeaths: agg.firstDeaths,
    matchesPlayed: agg.matches,
    avgKills: Math.round((agg.kills / Math.max(agg.matches, 1)) * 10) / 10,
    avgDeaths: Math.round((agg.deaths / Math.max(agg.matches, 1)) * 10) / 10,
    kd: Math.round((agg.kills / Math.max(agg.deaths, 1)) * 100) / 100,
    acs: agg.rounds > 0 ? Math.round(agg.score / agg.rounds) : 0,
    hsPercent: (agg.headshots + agg.bodyshots + agg.legshots) > 0
      ? Math.round((agg.headshots / (agg.headshots + agg.bodyshots + agg.legshots)) * 100)
      : 0,
    agents: Array.from(agg.agents),
    lastUpdated: new Date().toISOString(),
  };
  await lbRef.set(upd, { merge: true });
  console.log(`  ✅ Sheeshu leaderboard updated. matchesPlayed=${upd.matchesPlayed}  acs=${upd.acs}  kd=${upd.kd}`);
}

async function run() {
  await restoreOrcus();
  await backfillSheeshu();

  // Sanity prints
  const rad = (await db.collection("valorantTournaments").doc(TID).collection("teams").doc(TEAM_RADIANT).get()).data() as any;
  console.log("\n=== Radiant roster post-cleanup ===");
  for (const m of rad.members) console.log(`  · ${m.riotGameName}  uid=${m.uid}  puuid=${m.riotPuuid || "(missing)"}`);
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
