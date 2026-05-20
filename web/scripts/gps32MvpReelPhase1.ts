/**
 * Phase 1: verify GPS32's 6 games + cache stream metadata.
 *
 * Outputs:
 *   - media/ascension-reels/cache/tournaments/{tid}/players/gps32.json
 *     {puuid, uid, riotName, games: [{matchId, gameNum, valorantMatchId, map, opponent, ...}]}
 *
 * Run: npx tsx scripts/gps32MvpReelPhase1.ts
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: ".env.local" });
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

const TID = "league-of-rising-stars-ascension";
const GPS32_UID = "discord_750380967188758578";
const TEAM_CHOOT = "team-2";
const CACHE_ROOT = path.resolve(__dirname, "../../media/ascension-reels/cache");

async function run() {
  // ── 1. GPS32 user doc ───────────────────────────────────────────────
  const u = (await db.collection("users").doc(GPS32_UID).get()).data() as any;
  if (!u) throw new Error("GPS32 user doc missing");
  console.log(`Player: ${u.fullName || u.discordUsername}  riot=${u.riotGameName}#${u.riotTagLine}  puuid=${u.riotPuuid}`);

  // ── 2. All Choot K Chooze matches that are completed ───────────────
  const matchesSnap = await db.collection("valorantTournaments").doc(TID).collection("matches").get();
  const games: any[] = [];
  for (const m of matchesSnap.docs) {
    const d = m.data() as any;
    if (d.team1Id !== TEAM_CHOOT && d.team2Id !== TEAM_CHOOT) continue;
    if (d.status !== "completed") {
      console.log(`  · skipping ${m.id} status=${d.status}`);
      continue;
    }
    const opponentName = d.team1Id === TEAM_CHOOT ? d.team2Name : d.team1Name;
    const chootSide = d.team1Id === TEAM_CHOOT ? "team1" : "team2";

    for (const gn of [1, 2]) {
      const g = d[`game${gn}`];
      if (!g) { console.log(`  · ${m.id} game${gn} missing`); continue; }
      const stats = (g.playerStats || []).find((p: any) => p.puuid === u.riotPuuid);
      games.push({
        matchDocId: m.id,
        gameNum: gn,
        valorantMatchId: g.valorantMatchId || d[`game${gn}MatchId`],
        map: g.mapName,
        opponent: opponentName,
        chootSide,
        chootRoundsWon: chootSide === "team1" ? g.team1RoundsWon : g.team2RoundsWon,
        opponentRoundsWon: chootSide === "team1" ? g.team2RoundsWon : g.team1RoundsWon,
        roundsPlayed: g.roundsPlayed,
        startedAt: g.startedAt,
        gpsStats: stats ? {
          kills: stats.kills, deaths: stats.deaths, assists: stats.assists,
          score: stats.score, agent: stats.agent, headshots: stats.headshots,
          firstKills: stats.firstKills, firstDeaths: stats.firstDeaths,
        } : null,
        hasRoundResults: Array.isArray(g.roundResults),
        roundResultsHavePerPlayer: Array.isArray(g.roundResults) && g.roundResults.some((r: any) => Array.isArray(r.playerStats)),
      });
    }
  }

  console.log(`\nFound ${games.length} games for GPS32:`);
  for (const g of games) {
    console.log(`  ${g.matchDocId}  game${g.gameNum}  ${g.map}  vs ${g.opponent}  ${g.chootRoundsWon}-${g.opponentRoundsWon}  agent=${g.gpsStats?.agent}  K/D/A=${g.gpsStats?.kills}/${g.gpsStats?.deaths}/${g.gpsStats?.assists}  perRound=${g.roundResultsHavePerPlayer}`);
  }

  // ── 3. Write to cache ───────────────────────────────────────────────
  const playerCacheDir = path.join(CACHE_ROOT, "tournaments", TID, "players");
  fs.mkdirSync(playerCacheDir, { recursive: true });
  const playerCachePath = path.join(playerCacheDir, "gps32.json");
  fs.writeFileSync(playerCachePath, JSON.stringify({
    uid: GPS32_UID,
    puuid: u.riotPuuid,
    riotName: u.riotGameName,
    riotTag: u.riotTagLine,
    fullName: u.fullName,
    discord: u.discordUsername,
    teamId: TEAM_CHOOT,
    teamName: "CHOOT K CHOOZE",
    games,
    cachedAt: new Date().toISOString(),
  }, null, 2));
  console.log(`\n✅ Wrote ${playerCachePath}`);
  console.log(`   ${games.length} games cached.`);
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
