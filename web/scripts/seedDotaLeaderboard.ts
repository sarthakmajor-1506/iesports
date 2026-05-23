/**
 * Aggregate Dota tournament leaderboard from match.game1.playerStats.
 *
 * Reads all matches under tournaments/{id}/matches and writes a flat
 * leaderboard subcollection (one doc per player) that the existing
 * leaderboard tab on app/tournament/[id]/page.tsx consumes (it groups
 * by dota rank bracket and computes per-bracket MVPs).
 *
 *   npx tsx scripts/seedDotaLeaderboard.ts            # dry-run
 *   npx tsx scripts/seedDotaLeaderboard.ts --apply    # write
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

type Agg = {
  uid: string;
  name: string;
  steamName: string;
  steamAvatar: string;
  fullName: string;
  dotaBracket: string;
  dotaRankTier: number;
  games: number;
  wins: number;
  losses: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  totalNetWorth: number;
  totalLastHits: number;
  totalDenies: number;
  totalGPM: number;       // sum (used to compute avg)
  totalXPM: number;
  totalHeroDamage: number;
  totalTowerDamage: number;
  totalHeroHealing: number;
  heroes: Record<string, number>;
  // computed
  avgGPM?: number;
  avgXPM?: number;
  kda?: number;
  mostPlayedHero?: string;
  totalScore?: number;
};

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);

  const tRef = db.collection("tournaments").doc(TID);
  const matchesSnap = await tRef.collection("matches").get();
  console.log(`Matches in tournament: ${matchesSnap.size}`);

  const aggs: Record<string, Agg> = {};

  for (const m of matchesSnap.docs) {
    const md = m.data() as any;
    const g = md.game1;
    if (!g || !Array.isArray(g.playerStats) || md.status !== "completed") continue;

    const winnerSide = g.winner;
    for (const p of g.playerStats as any[]) {
      if (!p.uid) continue;  // skip unresolved subs / external players
      const won = p.side === winnerSide;
      if (!aggs[p.uid]) {
        aggs[p.uid] = {
          uid: p.uid,
          name: p.name || p.steamName || p.uid,
          steamName: p.steamName || p.name || "",
          steamAvatar: "",
          fullName: "",
          dotaBracket: "",
          dotaRankTier: 0,
          games: 0, wins: 0, losses: 0,
          totalKills: 0, totalDeaths: 0, totalAssists: 0,
          totalNetWorth: 0,
          totalLastHits: 0, totalDenies: 0,
          totalGPM: 0, totalXPM: 0,
          totalHeroDamage: 0, totalTowerDamage: 0, totalHeroHealing: 0,
          heroes: {},
        };
      }
      const a = aggs[p.uid];
      a.games++;
      if (won) a.wins++; else a.losses++;
      a.totalKills += p.kills || 0;
      a.totalDeaths += p.deaths || 0;
      a.totalAssists += p.assists || 0;
      a.totalNetWorth += p.netWorth || 0;
      a.totalLastHits += p.lastHits || 0;
      a.totalDenies += p.denies || 0;
      a.totalGPM += p.gpm || 0;
      a.totalXPM += p.xpm || 0;
      a.totalHeroDamage += p.heroDamage || 0;
      a.totalTowerDamage += p.towerDamage || 0;
      a.totalHeroHealing += p.heroHealing || 0;
      if (p.hero) a.heroes[p.hero] = (a.heroes[p.hero] || 0) + 1;
    }
  }

  // Enrich from users docs (bracket, avatar, name)
  for (const uid of Object.keys(aggs)) {
    const u = (await db.collection("users").doc(uid).get()).data() as any || {};
    aggs[uid].steamAvatar = u.steamAvatar || "";
    aggs[uid].fullName = u.fullName || "";
    aggs[uid].dotaBracket = u.dotaBracket || "herald_guardian";
    aggs[uid].dotaRankTier = u.dotaRankTier || 0;
    aggs[uid].steamName = aggs[uid].steamName || u.steamName || "";
  }

  // Compute derived metrics + totalScore (for sort)
  for (const a of Object.values(aggs)) {
    a.avgGPM = a.games > 0 ? Math.round(a.totalGPM / a.games) : 0;
    a.avgXPM = a.games > 0 ? Math.round(a.totalXPM / a.games) : 0;
    a.kda = (a.totalKills + 0.2 * a.totalAssists) / Math.max(1, a.totalDeaths);
    const heroEntries = Object.entries(a.heroes).sort((x, y) => y[1] - x[1]);
    a.mostPlayedHero = heroEntries[0]?.[0] || "";
    // Score formula: weights kills/assists, penalises deaths lightly, rewards farm + wins.
    a.totalScore = Math.round(
      a.totalKills * 3 +
      a.totalAssists * 1 +
      -a.totalDeaths * 2 +
      a.totalLastHits / 10 +
      a.totalGPM / 100 +
      a.wins * 20
    );
  }

  const sorted = Object.values(aggs).sort((x, y) => (y.totalScore! - x.totalScore!));
  console.log(`\nAggregated leaderboard: ${sorted.length} players`);
  for (const a of sorted) {
    console.log(
      `  ${a.steamName.padEnd(22)} ${a.dotaBracket.padEnd(18)} ` +
      `games=${a.games} W-L=${a.wins}-${a.losses} K/D/A=${a.totalKills}/${a.totalDeaths}/${a.totalAssists} ` +
      `avgGPM=${a.avgGPM} KDA=${a.kda!.toFixed(2)} score=${a.totalScore} hero=${a.mostPlayedHero}`
    );
  }

  // Wipe + rewrite leaderboard subcollection.
  const lbCol = tRef.collection("leaderboard");
  const existing = await lbCol.get();
  console.log(`\nExisting leaderboard docs: ${existing.size}  (will be replaced)`);

  if (!APPLY) {
    console.log("\n🟡 DRY RUN — pass --apply to commit.");
    return;
  }

  // Delete old, then write new
  const delBatch = db.batch();
  existing.docs.forEach(d => delBatch.delete(d.ref));
  if (existing.size) await delBatch.commit();

  const writeBatch = db.batch();
  for (const a of sorted) {
    writeBatch.set(lbCol.doc(a.uid), a);
  }
  await writeBatch.commit();
  console.log(`✅ Wrote ${sorted.length} leaderboard entries.`);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
