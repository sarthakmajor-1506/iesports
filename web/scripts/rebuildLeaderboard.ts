/**
 * Rebuilds the leaderboard subcollection from match game data.
 * Fixes missing teamId, agents, totalFirstKills, totalFirstDeaths fields.
 *
 * Usage:
 *   npx tsx scripts/rebuildLeaderboard.ts                           ← dry run (inspect)
 *   npx tsx scripts/rebuildLeaderboard.ts --write                   ← actually write
 *   npx tsx scripts/rebuildLeaderboard.ts --tid=some-other-id       ← different tournament
 *   npx tsx scripts/rebuildLeaderboard.ts --tid=some-other-id --write
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
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
const db = getFirestore(getApp());

const DEFAULT_TID = "league-of-rising-stars-prelims";
const tidArg = process.argv.find(a => a.startsWith("--tid="));
const TOURNAMENT_ID = tidArg ? tidArg.split("=")[1] : DEFAULT_TID;
const doWrite = process.argv.includes("--write");

interface PlayerAgg {
  puuid: string;
  name: string;
  tag: string;
  uid: string | null;
  teamId: string | null;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  totalScore: number;
  totalHeadshots: number;
  totalBodyshots: number;
  totalLegshots: number;
  totalDamageDealt: number;
  totalDamageReceived: number;
  totalFirstKills: number;
  totalFirstDeaths: number;
  totalRoundsPlayed: number;
  matchesPlayed: number;
  agents: Set<string>;
}

async function main() {
  const tournamentRef = db.collection("valorantTournaments").doc(TOURNAMENT_ID);
  const tournamentDoc = await tournamentRef.get();
  if (!tournamentDoc.exists) {
    console.log("❌ Tournament not found:", TOURNAMENT_ID);
    return;
  }
  const tData = tournamentDoc.data()!;
  console.log(`\n🏆 ${tData.name} (${TOURNAMENT_ID})\n`);

  // Load teams for UID mapping
  const teamsSnap = await tournamentRef.collection("teams").get();
  const puuidToUid: Record<string, string> = {};
  const puuidToTeamId: Record<string, string> = {};
  for (const doc of teamsSnap.docs) {
    const team = doc.data();
    for (const m of team.members || []) {
      if (m.riotPuuid) {
        if (m.uid) puuidToUid[m.riotPuuid] = m.uid;
        puuidToTeamId[m.riotPuuid] = doc.id;
      }
    }
  }

  // Also load soloPlayers for UID fallback
  const playersSnap = await tournamentRef.collection("soloPlayers").get();
  const nameToUid: Record<string, string> = {};
  for (const doc of playersSnap.docs) {
    const p = doc.data();
    const uid = p.uid || doc.id;
    if (p.riotPuuid) {
      puuidToUid[p.riotPuuid] = uid;
      if (!puuidToTeamId[p.riotPuuid] && p.teamId) puuidToTeamId[p.riotPuuid] = p.teamId;
    }
    if (p.riotGameName) nameToUid[p.riotGameName.toLowerCase()] = uid;
  }

  // Load user docs for additional PUUID mapping
  const userUids = new Set<string>(Object.values(puuidToUid));
  if (userUids.size > 0) {
    const userRefs = Array.from(userUids).map(uid => db.collection("users").doc(uid));
    const userDocs = await db.getAll(...userRefs);
    for (const doc of userDocs) {
      if (doc.exists) {
        const data = doc.data()!;
        if (data.riotPuuid) {
          puuidToUid[data.riotPuuid] = doc.id;
        }
      }
    }
  }

  console.log(`📋 Teams: ${teamsSnap.size}, PUUID mappings: ${Object.keys(puuidToUid).length}\n`);

  // Read all matches
  const matchesSnap = await tournamentRef.collection("matches").get();
  const players: Record<string, PlayerAgg> = {};
  let gamesProcessed = 0;

  for (const doc of matchesSnap.docs) {
    const match = doc.data();
    const bo = match.isBracket
      ? (match.bracketType === "grand_final" ? (tData.grandFinalBestOf || 3) : (tData.bracketBestOf || 2))
      : (tData.matchesPerRound || 2);

    for (let g = 1; g <= bo; g++) {
      const game = match[`game${g}`] || match.games?.[`game${g}`] || null;
      if (!game?.playerStats) continue;

      const roundsPlayed = game.roundsPlayed || ((game.team1RoundsWon || 0) + (game.team2RoundsWon || 0)) || 1;
      gamesProcessed++;

      for (const ps of game.playerStats) {
        const puuid = ps.puuid;
        if (!puuid) continue;

        // Determine teamId
        let teamId = ps.teamId || null;
        if (!teamId && puuidToTeamId[puuid]) teamId = puuidToTeamId[puuid];
        if (!teamId) {
          if (ps.tournamentTeam === "team1") teamId = match.team1Id;
          else if (ps.tournamentTeam === "team2") teamId = match.team2Id;
          else if (game.team1ValorantSide && ps.team === game.team1ValorantSide) teamId = match.team1Id;
          else if (game.team2ValorantSide && ps.team === game.team2ValorantSide) teamId = match.team2Id;
        }

        // Determine UID
        let uid = puuidToUid[puuid] || null;
        if (!uid && ps.name) uid = nameToUid[ps.name.toLowerCase()] || null;

        if (!players[puuid]) {
          players[puuid] = {
            puuid,
            name: ps.name || "Unknown",
            tag: ps.tag || "",
            uid,
            teamId,
            totalKills: 0,
            totalDeaths: 0,
            totalAssists: 0,
            totalScore: 0,
            totalHeadshots: 0,
            totalBodyshots: 0,
            totalLegshots: 0,
            totalDamageDealt: 0,
            totalDamageReceived: 0,
            totalFirstKills: 0,
            totalFirstDeaths: 0,
            totalRoundsPlayed: 0,
            matchesPlayed: 0,
            agents: new Set(),
          };
        }

        const p = players[puuid];
        p.totalKills += ps.kills || 0;
        p.totalDeaths += ps.deaths || 0;
        p.totalAssists += ps.assists || 0;
        p.totalScore += ps.score || 0;
        p.totalHeadshots += ps.headshots || 0;
        p.totalBodyshots += ps.bodyshots || 0;
        p.totalLegshots += ps.legshots || 0;
        p.totalDamageDealt += ps.damageDealt || 0;
        p.totalDamageReceived += ps.damageReceived || 0;
        p.totalFirstKills += ps.firstKills || 0;
        p.totalFirstDeaths += ps.firstDeaths || 0;
        p.totalRoundsPlayed += roundsPlayed;
        p.matchesPlayed += 1;
        if (ps.agent && ps.agent !== "Unknown") p.agents.add(ps.agent);
        if (!p.uid && uid) p.uid = uid;
        if (!p.teamId && teamId) p.teamId = teamId;
      }
    }
  }

  console.log(`🎮 Processed ${gamesProcessed} games across ${matchesSnap.size} matches`);
  console.log(`👥 Found ${Object.keys(players).length} unique players\n`);

  // Build team name map for display
  const teamNameMap: Record<string, string> = {};
  for (const doc of teamsSnap.docs) {
    teamNameMap[doc.id] = doc.data().teamName || doc.id;
  }

  // Display results
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  REBUILT LEADERBOARD");
  console.log("═══════════════════════════════════════════════════════════\n");

  const sorted = Object.values(players).sort((a, b) => {
    const kdA = (a.totalKills + 0.5 * a.totalAssists) / Math.max(1, a.totalDeaths);
    const kdB = (b.totalKills + 0.5 * b.totalAssists) / Math.max(1, b.totalDeaths);
    return kdB - kdA;
  });

  for (const p of sorted) {
    const kda = Math.round((p.totalKills + 0.5 * p.totalAssists) / Math.max(1, p.totalDeaths) * 100) / 100;
    const acs = p.totalRoundsPlayed > 0 ? Math.round(p.totalScore / p.totalRoundsPlayed) : 0;
    const teamName = p.teamId ? (teamNameMap[p.teamId] || p.teamId) : "—";
    console.log(
      `  ${p.name.padEnd(20)} | Team: ${teamName.padEnd(20)} | Maps: ${p.matchesPlayed} | KDA: ${kda} | ACS: ${acs} | FK: ${p.totalFirstKills} | FD: ${p.totalFirstDeaths} | Agents: ${[...p.agents].join(", ") || "—"}`
    );
  }

  if (!doWrite) {
    console.log("\n💡 Dry run complete. To write, run: npx tsx scripts/rebuildLeaderboard.ts --write\n");
    return;
  }

  // Write to Firestore
  console.log("\n🔧 WRITING TO FIRESTORE...\n");

  // Delete existing leaderboard
  const existingLb = await tournamentRef.collection("leaderboard").get();
  if (existingLb.size > 0) {
    const deleteBatch = db.batch();
    for (const doc of existingLb.docs) {
      deleteBatch.delete(doc.ref);
    }
    await deleteBatch.commit();
    console.log(`   🗑️  Deleted ${existingLb.size} existing leaderboard entries`);
  }

  // Write new entries in batches of 500
  const entries = Object.values(players);
  for (let i = 0; i < entries.length; i += 450) {
    const batch = db.batch();
    const chunk = entries.slice(i, i + 450);
    for (const p of chunk) {
      const ref = tournamentRef.collection("leaderboard").doc(p.puuid);
      const totalShots = p.totalHeadshots + p.totalBodyshots + p.totalLegshots;
      batch.set(ref, {
        puuid: p.puuid,
        name: p.name,
        tag: p.tag,
        uid: p.uid,
        teamId: p.teamId,
        totalKills: p.totalKills,
        totalDeaths: p.totalDeaths,
        totalAssists: p.totalAssists,
        totalScore: p.totalScore,
        totalHeadshots: p.totalHeadshots,
        totalBodyshots: p.totalBodyshots,
        totalLegshots: p.totalLegshots,
        totalDamageDealt: p.totalDamageDealt,
        totalDamageReceived: p.totalDamageReceived,
        totalFirstKills: p.totalFirstKills,
        totalFirstDeaths: p.totalFirstDeaths,
        totalRoundsPlayed: p.totalRoundsPlayed,
        matchesPlayed: p.matchesPlayed,
        agents: [...p.agents],
        kd: Math.round(p.totalKills / Math.max(1, p.totalDeaths) * 100) / 100,
        acs: p.totalRoundsPlayed > 0 ? Math.round(p.totalScore / p.totalRoundsPlayed) : 0,
        hsPercent: totalShots > 0 ? Math.round(p.totalHeadshots / totalShots * 100) : 0,
        avgKills: Math.round(p.totalKills / Math.max(1, p.matchesPlayed) * 100) / 100,
        avgDeaths: Math.round(p.totalDeaths / Math.max(1, p.matchesPlayed) * 100) / 100,
        lastUpdated: new Date().toISOString(),
      });
    }
    await batch.commit();
    console.log(`   ✅ Wrote ${chunk.length} entries (batch ${Math.floor(i / 450) + 1})`);
  }

  console.log(`\n✅ REBUILD COMPLETE — ${entries.length} leaderboard entries written`);
  console.log("   Fields populated: teamId, agents, totalFirstKills, totalFirstDeaths, acs, hsPercent\n");
}

main().catch(console.error);
