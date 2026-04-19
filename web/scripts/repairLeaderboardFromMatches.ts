/**
 * Repairs the tournament leaderboard + valorant section of globalLeaderboard
 * by re-aggregating every game from `valorantTournaments/{tid}/matches/*`
 * exactly once. Use this to recover from the old bug where re-fetching the
 * same match multiple times added its stats to leaderboard totals each time.
 *
 * Dry-run by default. Pass `--write` to actually commit.
 *
 *   npx tsx scripts/repairLeaderboardFromMatches.ts
 *     → dry-run on Ascension, shows before/after totals
 *   npx tsx scripts/repairLeaderboardFromMatches.ts --write
 *     → clear + rebuild leaderboard for Ascension
 *   npx tsx scripts/repairLeaderboardFromMatches.ts --tid=<id> --write
 *     → same for another tournament
 */
import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = admin.firestore();

const args = process.argv.slice(2);
const write = args.includes("--write");
const tidArg = args.find((a) => a.startsWith("--tid="))?.slice(6);
const TOURNAMENT_ID = tidArg || "league-of-rising-stars-ascension";

type GameSnap = {
  kills: number; deaths: number; assists: number; score: number;
  headshots: number; bodyshots: number; legshots: number;
  damageDealt: number; damageReceived: number;
  roundsPlayed: number; firstKills: number; firstDeaths: number;
  won: number; agent: string;
};

type Agg = {
  puuid: string; name: string; tag: string; uid: string | null; teamId: string | null;
  agents: Set<string>;
  totalKills: number; totalDeaths: number; totalAssists: number; totalScore: number;
  totalHeadshots: number; totalBodyshots: number; totalLegshots: number;
  totalDamageDealt: number; totalDamageReceived: number;
  totalFirstKills: number; totalFirstDeaths: number;
  totalRoundsPlayed: number; matchesPlayed: number; gamesWon: number;
  processedGames: Record<string, GameSnap>;
};

function blank(puuid: string): Agg {
  return {
    puuid, name: "", tag: "", uid: null, teamId: null,
    agents: new Set(),
    totalKills: 0, totalDeaths: 0, totalAssists: 0, totalScore: 0,
    totalHeadshots: 0, totalBodyshots: 0, totalLegshots: 0,
    totalDamageDealt: 0, totalDamageReceived: 0,
    totalFirstKills: 0, totalFirstDeaths: 0,
    totalRoundsPlayed: 0, matchesPlayed: 0, gamesWon: 0,
    processedGames: {},
  };
}

async function main() {
  const tref = db.collection("valorantTournaments").doc(TOURNAMENT_ID);

  // Build per-team PUUID sets so each match can check only its own two teams
  // — a player who is on team A's roster should not accumulate stats from a
  // match between teams B and C just because they sub'd in.
  const teamsSnap = await tref.collection("teams").get();
  const puuidsByTeamId = new Map<string, Set<string>>();
  const rosterTeamByPuuid = new Map<string, string>();
  const uidByPuuid = new Map<string, string>();
  for (const t of teamsSnap.docs) {
    const set = new Set<string>();
    for (const m of (t.data().members || []) as any[]) {
      const uid = m?.uid as string | undefined;
      const mpuuid = m?.riotPuuid as string | undefined;
      if (mpuuid) { set.add(mpuuid); rosterTeamByPuuid.set(mpuuid, t.id); if (uid) uidByPuuid.set(mpuuid, uid); }
      else if (uid) {
        const udoc = await db.collection("users").doc(uid).get();
        const up = udoc.data()?.riotPuuid as string | undefined;
        if (up) { set.add(up); rosterTeamByPuuid.set(up, t.id); uidByPuuid.set(up, uid); }
      }
    }
    puuidsByTeamId.set(t.id, set);
  }
  const totalRoster = Array.from(puuidsByTeamId.values()).reduce((s, x) => s + x.size, 0);
  console.log(`Roster PUUIDs across ${puuidsByTeamId.size} teams: ${totalRoster}`);

  // Aggregate from match docs — each game applied exactly once
  const matchesSnap = await tref.collection("matches").get();
  const agg = new Map<string, Agg>();
  let gamesProcessed = 0;

  for (const mDoc of matchesSnap.docs) {
    const md = mDoc.data();
    const games = md.games || {};
    const gameKeys: string[] = Object.keys(games).filter((k) => /^game\d+$/.test(k));

    // For this specific match, only players on team1's OR team2's roster
    // are eligible for leaderboard aggregation. Subs playing for a team
    // they don't belong to are skipped, matching match-fetch behaviour.
    const team1Roster = puuidsByTeamId.get(md.team1Id) || new Set<string>();
    const team2Roster = puuidsByTeamId.get(md.team2Id) || new Set<string>();
    const matchRoster = new Set<string>([...team1Roster, ...team2Roster]);

    for (const gk of gameKeys) {
      const g = games[gk] || (md as any)[gk];
      if (!g || !g.playerStats || !g.mapName) continue;

      const gameNumber = parseInt(gk.replace("game", ""), 10);
      const procKey = `${mDoc.id}__game${gameNumber}`;
      const roundsPlayed = g.roundsPlayed || ((g.redRoundsWon || 0) + (g.blueRoundsWon || 0));
      const gameWinner: "team1" | "team2" | null = g.winner || null;
      gamesProcessed++;

      for (const p of g.playerStats as any[]) {
        if (!p?.puuid || !matchRoster.has(p.puuid)) continue;

        const won = gameWinner && p.tournamentTeam === gameWinner ? 1 : 0;
        const snap: GameSnap = {
          kills: p.kills || 0, deaths: p.deaths || 0, assists: p.assists || 0, score: p.score || 0,
          headshots: p.headshots || 0, bodyshots: p.bodyshots || 0, legshots: p.legshots || 0,
          damageDealt: p.damageDealt || 0, damageReceived: p.damageReceived || 0,
          roundsPlayed, firstKills: p.firstKills || 0, firstDeaths: p.firstDeaths || 0,
          won, agent: p.agent || "Unknown",
        };

        let a = agg.get(p.puuid);
        if (!a) { a = blank(p.puuid); agg.set(p.puuid, a); }
        a.name = p.name || a.name;
        a.tag = p.tag || a.tag;
        a.uid = uidByPuuid.get(p.puuid) || a.uid;
        a.teamId = rosterTeamByPuuid.get(p.puuid) || p.teamId || a.teamId;
        if (snap.agent) a.agents.add(snap.agent);

        a.totalKills += snap.kills;
        a.totalDeaths += snap.deaths;
        a.totalAssists += snap.assists;
        a.totalScore += snap.score;
        a.totalHeadshots += snap.headshots;
        a.totalBodyshots += snap.bodyshots;
        a.totalLegshots += snap.legshots;
        a.totalDamageDealt += snap.damageDealt;
        a.totalDamageReceived += snap.damageReceived;
        a.totalFirstKills += snap.firstKills;
        a.totalFirstDeaths += snap.firstDeaths;
        a.totalRoundsPlayed += snap.roundsPlayed;
        a.matchesPlayed += 1;
        a.gamesWon += snap.won;
        a.processedGames[procKey] = snap;
      }
    }
  }

  console.log(`Games processed: ${gamesProcessed} · Players aggregated: ${agg.size}\n`);

  // Read current stored leaderboard for diff report
  const currentSnap = await tref.collection("leaderboard").get();
  const current = new Map<string, any>();
  for (const d of currentSnap.docs) current.set(d.id, d.data());

  const rows: string[] = [];
  for (const [puuid, a] of agg) {
    const ex = current.get(puuid) || {};
    const was = `K:${ex.totalKills ?? 0} D:${ex.totalDeaths ?? 0} M:${ex.matchesPlayed ?? 0}`;
    const now = `K:${a.totalKills} D:${a.totalDeaths} M:${a.matchesPlayed}`;
    const drift = (ex.totalKills ?? 0) !== a.totalKills || (ex.matchesPlayed ?? 0) !== a.matchesPlayed;
    rows.push(`${drift ? "⚠ " : "  "}${(a.name || "?").padEnd(18)} ${was.padEnd(22)} → ${now}`);
  }
  rows.sort();
  rows.forEach((r) => console.log(r));

  if (!write) {
    console.log(`\n🟡 DRY RUN — pass --write to apply (${agg.size} tournament + global leaderboard docs).`);
    process.exit(0);
  }

  console.log("\n🚀 Writing...");

  // Wipe tournament leaderboard
  const wipeBatch = db.batch();
  for (const d of currentSnap.docs) wipeBatch.delete(d.ref);
  await wipeBatch.commit();

  // Rewrite tournament leaderboard
  const lbBatch = db.batch();
  for (const [puuid, a] of agg) {
    const kd = Math.round((a.totalKills / Math.max(1, a.totalDeaths)) * 100) / 100;
    const acs = a.totalRoundsPlayed > 0 ? Math.round(a.totalScore / a.totalRoundsPlayed) : 0;
    const hsTotal = a.totalHeadshots + a.totalBodyshots + a.totalLegshots;
    const hsPercent = Math.round((a.totalHeadshots / Math.max(1, hsTotal)) * 100);
    lbBatch.set(tref.collection("leaderboard").doc(puuid), {
      puuid, name: a.name, tag: a.tag, uid: a.uid, teamId: a.teamId,
      totalKills: a.totalKills, totalDeaths: a.totalDeaths, totalAssists: a.totalAssists, totalScore: a.totalScore,
      totalHeadshots: a.totalHeadshots, totalBodyshots: a.totalBodyshots, totalLegshots: a.totalLegshots,
      totalDamageDealt: a.totalDamageDealt, totalDamageReceived: a.totalDamageReceived,
      totalFirstKills: a.totalFirstKills, totalFirstDeaths: a.totalFirstDeaths,
      matchesPlayed: a.matchesPlayed, totalRoundsPlayed: a.totalRoundsPlayed,
      agents: Array.from(a.agents),
      avgKills: a.matchesPlayed > 0 ? Math.round((a.totalKills / a.matchesPlayed) * 100) / 100 : 0,
      avgDeaths: a.matchesPlayed > 0 ? Math.round((a.totalDeaths / a.matchesPlayed) * 100) / 100 : 0,
      kd, acs, hsPercent,
      lastUpdated: new Date().toISOString(),
      processedGames: a.processedGames,
    });
  }
  await lbBatch.commit();
  console.log(`✓ Tournament leaderboard rewritten (${agg.size} docs)`);

  // Repair global leaderboard: remove this tournament's old contributions
  // and apply the fresh aggregation under valorant.*. For each aggregated
  // puuid, we compute the delta by stripping any processedGames entry that
  // references this tournament's matches, then adding the fresh totals.
  const thisTournamentMatchIds = new Set(matchesSnap.docs.map((d) => d.id));
  let glRepaired = 0;
  for (const [puuid, a] of agg) {
    const glRef = db.collection("globalLeaderboard").doc(puuid);
    const glDoc = await glRef.get();
    const existing = glDoc.data()?.valorant || {};
    const oldProc: Record<string, GameSnap> = existing.processedGames || {};
    // Sum contributions for this tournament that were previously counted
    let oK=0, oD=0, oA=0, oS=0, oHS=0, oBS=0, oLS=0, oDD=0, oDR=0, oFK=0, oFD=0, oR=0, oM=0, oW=0;
    for (const [k, s] of Object.entries(oldProc)) {
      const matchDocId = k.split("__")[0];
      if (!thisTournamentMatchIds.has(matchDocId)) continue;
      oK += s.kills; oD += s.deaths; oA += s.assists; oS += s.score;
      oHS += s.headshots; oBS += s.bodyshots; oLS += s.legshots;
      oDD += s.damageDealt; oDR += s.damageReceived;
      oFK += s.firstKills; oFD += s.firstDeaths;
      oR += s.roundsPlayed; oM += 1; oW += s.won;
    }
    // New processedGames = existing minus this tournament's entries, plus fresh ones
    const newProc: Record<string, GameSnap> = {};
    for (const [k, s] of Object.entries(oldProc)) {
      const matchDocId = k.split("__")[0];
      if (!thisTournamentMatchIds.has(matchDocId)) newProc[k] = s;
    }
    for (const [k, s] of Object.entries(a.processedGames)) newProc[k] = s;

    const newKills = Math.max(0, (existing.totalKills || 0) - oK + a.totalKills);
    const newDeaths = Math.max(0, (existing.totalDeaths || 0) - oD + a.totalDeaths);
    const newAssists = Math.max(0, (existing.totalAssists || 0) - oA + a.totalAssists);
    const newScore = Math.max(0, (existing.totalScore || 0) - oS + a.totalScore);
    const newHS = Math.max(0, (existing.totalHeadshots || 0) - oHS + a.totalHeadshots);
    const newBS = Math.max(0, (existing.totalBodyshots || 0) - oBS + a.totalBodyshots);
    const newLS = Math.max(0, (existing.totalLegshots || 0) - oLS + a.totalLegshots);
    const newDmgD = Math.max(0, (existing.totalDamageDealt || 0) - oDD + a.totalDamageDealt);
    const newDmgR = Math.max(0, (existing.totalDamageReceived || 0) - oDR + a.totalDamageReceived);
    const newRounds = Math.max(0, (existing.totalRoundsPlayed || 0) - oR + a.totalRoundsPlayed);
    const newMatches = Math.max(0, (existing.matchesPlayed || 0) - oM + a.matchesPlayed);
    const newWins = Math.max(0, (existing.gamesWon || 0) - oW + a.gamesWon);
    const newAgents = Array.from(new Set([...(existing.agents || []), ...a.agents]));
    const newTournaments = Array.from(new Set([...(existing.tournaments || []), TOURNAMENT_ID]));

    const payload: any = {
      puuid, uid: a.uid || glDoc.data()?.uid || null,
      name: a.name, tag: a.tag,
      lastUpdated: new Date().toISOString(),
      "valorant.totalKills": newKills,
      "valorant.totalDeaths": newDeaths,
      "valorant.totalAssists": newAssists,
      "valorant.totalScore": newScore,
      "valorant.totalHeadshots": newHS,
      "valorant.totalBodyshots": newBS,
      "valorant.totalLegshots": newLS,
      "valorant.totalDamageDealt": newDmgD,
      "valorant.totalDamageReceived": newDmgR,
      "valorant.totalRoundsPlayed": newRounds,
      "valorant.matchesPlayed": newMatches,
      "valorant.gamesWon": newWins,
      "valorant.kd": Math.round((newKills / Math.max(1, newDeaths)) * 100) / 100,
      "valorant.acs": newRounds > 0 ? Math.round(newScore / newRounds) : 0,
      "valorant.hsPercent": Math.round((newHS / Math.max(1, newHS + newBS + newLS)) * 100),
      "valorant.agents": newAgents,
      "valorant.tournaments": newTournaments,
      "valorant.processedGames": newProc,
    };

    if (glDoc.exists) await glRef.update(payload);
    else await glRef.set({ ...payload, dota: null });
    glRepaired++;
  }
  console.log(`✓ Global leaderboard repaired (${glRepaired} docs)`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
