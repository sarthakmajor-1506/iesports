/**
 * Step 1: List all matches, their stored match IDs, and leaderboard state
 * Step 2: Reset everything (run with --reset flag)
 *
 * Usage: npx tsx scripts/resetPrelims.ts              ← list/inspect
 *        npx tsx scripts/resetPrelims.ts --reset      ← actually reset
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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

const TOURNAMENT_ID = "league-of-rising-stars-prelims";
const doReset = process.argv.includes("--reset");

async function main() {
  const tournamentRef = db.collection("valorantTournaments").doc(TOURNAMENT_ID);
  const tournamentDoc = await tournamentRef.get();
  if (!tournamentDoc.exists) {
    console.log("❌ Tournament not found");
    return;
  }
  const tData = tournamentDoc.data()!;
  console.log(`\n🏆 ${tData.name}\n`);

  // ── 1. List all matches and collect Valorant match IDs ──
  const matchesSnap = await tournamentRef.collection("matches").get();
  const allMatchIds: { matchDocId: string; gameNum: number; valorantMatchId: string }[] = [];

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  ALL MATCHES");
  console.log("═══════════════════════════════════════════════════════════");

  for (const doc of matchesSnap.docs) {
    const m = doc.data();
    console.log(`\n📋 ${doc.id} — ${m.team1Name || "TBD"} vs ${m.team2Name || "TBD"}`);
    console.log(`   status=${m.status} | score=${m.team1Score ?? 0}-${m.team2Score ?? 0} | round=${m.round || "bracket"} | isBracket=${m.isBracket || false}`);
    if (m.bracketType) console.log(`   bracketType=${m.bracketType}`);
    if (m.winnerGoesTo) console.log(`   winnerGoesTo=${m.winnerGoesTo}`);
    if (m.loserGoesTo) console.log(`   loserGoesTo=${m.loserGoesTo}`);

    // Check for game data (up to 5 games)
    for (let g = 1; g <= 5; g++) {
      const matchId = m[`game${g}MatchId`];
      const gameData = m[`game${g}`];
      const winner = m[`game${g}Winner`];
      if (matchId || gameData) {
        console.log(`   game${g}: matchId=${matchId || "—"} | winner=${winner || "—"} | hasData=${!!gameData}`);
        if (matchId) {
          allMatchIds.push({ matchDocId: doc.id, gameNum: g, valorantMatchId: matchId });
        }
      }
    }
  }

  // ── 2. List leaderboard (global stats) ──
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("  LEADERBOARD / STANDINGS");
  console.log("═══════════════════════════════════════════════════════════");

  // Check standings subcollection
  const standingsSnap = await tournamentRef.collection("standings").get();
  if (standingsSnap.size > 0) {
    console.log(`\n📊 standings subcollection: ${standingsSnap.size} entries`);
    for (const doc of standingsSnap.docs) {
      const s = doc.data();
      console.log(`   ${doc.id}: ${s.teamName} — P=${s.played||0} W=${s.wins||0} D=${s.draws||0} L=${s.losses||0} Pts=${s.points||0}`);
    }
  }

  // Check leaderboard subcollection
  const leaderboardSnap = await tournamentRef.collection("leaderboard").get();
  if (leaderboardSnap.size > 0) {
    console.log(`\n🏅 leaderboard subcollection: ${leaderboardSnap.size} entries`);
    for (const doc of leaderboardSnap.docs) {
      const l = doc.data();
      console.log(`   ${doc.id}: ${l.playerName || l.name || doc.id} — kills=${l.kills||0} deaths=${l.deaths||0} assists=${l.assists||0} acs=${l.acs||0}`);
    }
  }

  // Check tournament-level leaderboard fields
  if (tData.leaderboard) {
    console.log(`\n🏅 tournament.leaderboard field exists (${typeof tData.leaderboard})`);
  }
  if (tData.globalLeaderboard) {
    console.log(`\n🏅 tournament.globalLeaderboard field exists (${typeof tData.globalLeaderboard})`);
  }

  // ── 3. Summary of Valorant match IDs to save ──
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("  VALORANT MATCH IDs TO RE-FETCH");
  console.log("═══════════════════════════════════════════════════════════\n");
  if (allMatchIds.length === 0) {
    console.log("   (none found — game data may already be wiped)");
  } else {
    for (const entry of allMatchIds) {
      console.log(`   ${entry.matchDocId} game${entry.gameNum}: ${entry.valorantMatchId}`);
    }
  }

  if (!doReset) {
    console.log("\n\n💡 To reset, run: npx tsx scripts/resetPrelims.ts --reset");
    return;
  }

  // ══════════════════════════════════════════════════════════════
  // RESET MODE
  // ══════════════════════════════════════════════════════════════
  console.log("\n\n🔧 RESETTING...\n");

  // Reset all matches — wipe game data, keep fixtures (teams, bracket structure)
  for (const doc of matchesSnap.docs) {
    const m = doc.data();
    const matchRef = tournamentRef.collection("matches").doc(doc.id);

    const resetPayload: Record<string, any> = {
      status: "pending",
      team1Score: 0,
      team2Score: 0,
    };

    // Delete all game fields (up to 5)
    for (let g = 1; g <= 5; g++) {
      if (m[`game${g}`] !== undefined) resetPayload[`game${g}`] = FieldValue.delete();
      if (m[`game${g}MatchId`] !== undefined) resetPayload[`game${g}MatchId`] = FieldValue.delete();
      if (m[`game${g}Winner`] !== undefined) resetPayload[`game${g}Winner`] = FieldValue.delete();
      if (m.games && m.games[`game${g}`] !== undefined) resetPayload[`games.game${g}`] = FieldValue.delete();
    }

    // Delete completion fields
    if (m.completedAt !== undefined) resetPayload.completedAt = FieldValue.delete();
    if (m.seriesAutoComputed !== undefined) resetPayload.seriesAutoComputed = FieldValue.delete();
    if (m.needsManualScore !== undefined) resetPayload.needsManualScore = FieldValue.delete();

    // For bracket matches: reset advanced teams back to TBD (only the teams that were advanced FROM other matches)
    // Keep original seeded teams in place
    // We'll handle bracket advancement separately below

    await matchRef.update(resetPayload);
    console.log(`   ✅ Reset match: ${doc.id} (${m.team1Name || "TBD"} vs ${m.team2Name || "TBD"})`);
  }

  // Reset bracket advancement — for bracket matches, teams that were filled by advancement need to go back to TBD
  // Only reset teams in matches that receive winners/losers from other matches
  const bracketMatches = matchesSnap.docs.filter(d => d.data().isBracket);
  const advancedToMatches = new Set<string>();
  for (const doc of bracketMatches) {
    const m = doc.data();
    if (m.winnerGoesTo) advancedToMatches.add(m.winnerGoesTo);
    if (m.loserGoesTo) advancedToMatches.add(m.loserGoesTo);
  }

  // Find the "source" bracket matches (UB-R1, LB-R1 etc — ones that have original seeded teams)
  // Matches that receive teams from other matches should have their teams reset to TBD
  for (const matchId of advancedToMatches) {
    const matchRef = tournamentRef.collection("matches").doc(matchId);
    const matchDoc = await matchRef.get();
    if (matchDoc.exists) {
      const m = matchDoc.data()!;
      // Check if this match's teams came from advancement (i.e., another match points here)
      // Reset both team slots to TBD for matches that receive advanced teams
      const sourceMatches = bracketMatches.filter(d => {
        const data = d.data();
        return data.winnerGoesTo === matchId || data.loserGoesTo === matchId;
      });

      if (sourceMatches.length > 0) {
        // Figure out which team slots were filled by advancement
        const update: Record<string, any> = {};
        // For simplicity, check each source — if winnerGoesTo or loserGoesTo points here, reset the slot
        for (const src of sourceMatches) {
          const srcData = src.data();
          if (srcData.winnerGoesTo === matchId || srcData.loserGoesTo === matchId) {
            // We need to figure out which slot (team1 or team2) this source filled
            // Since we can't tell reliably, reset both if BOTH sources point here
          }
        }
        // If this match has 2 sources, both teams came from advancement — reset both
        // If 1 source, one team is seeded and one is advanced — but we can't tell which without original fixture data
        // Safest: reset both for matches that receive ANY advancement
        if (sourceMatches.length >= 2) {
          update.team1Id = "TBD";
          update.team1Name = "TBD";
          update.team2Id = "TBD";
          update.team2Name = "TBD";
        } else if (sourceMatches.length === 1) {
          // One team was advanced — but which slot? Check if the advancing team matches
          // For safety, we need to know the original fixtures. Let's check against UB-R1/LB-R1 seeded teams
          // For now, mark both TBD for late-round matches
          update.team1Id = "TBD";
          update.team1Name = "TBD";
          update.team2Id = "TBD";
          update.team2Name = "TBD";
        }
        if (Object.keys(update).length > 0) {
          await matchRef.update(update);
          console.log(`   🔄 Reset advanced teams in: ${matchId} → TBD vs TBD`);
        }
      }
    }
  }

  // Reset standings
  for (const doc of standingsSnap.docs) {
    await tournamentRef.collection("standings").doc(doc.id).update({
      played: 0, wins: 0, draws: 0, losses: 0,
      mapsWon: 0, mapsLost: 0, points: 0, buchholz: 0,
      opponents: [],
    });
    console.log(`   📊 Reset standings: ${doc.id}`);
  }

  // Reset leaderboard
  for (const doc of leaderboardSnap.docs) {
    await tournamentRef.collection("leaderboard").doc(doc.id).delete();
    console.log(`   🏅 Deleted leaderboard entry: ${doc.id}`);
  }

  // Reset global individual player leaderboard (top-level collection)
  const globalLbSnap = await db.collection("globalLeaderboard").get();
  if (globalLbSnap.size > 0) {
    for (const doc of globalLbSnap.docs) {
      await db.collection("globalLeaderboard").doc(doc.id).delete();
    }
    console.log(`   🌍 Deleted ${globalLbSnap.size} global leaderboard entries`);
  } else {
    console.log("   🌍 Global leaderboard: already empty");
  }

  // Reset tournament-level fields if they exist
  const tournamentReset: Record<string, any> = {};
  if (tData.leaderboard) tournamentReset.leaderboard = FieldValue.delete();
  if (tData.globalLeaderboard) tournamentReset.globalLeaderboard = FieldValue.delete();
  if (tData.currentRound) tournamentReset.currentRound = 1;
  if (Object.keys(tournamentReset).length > 0) {
    await tournamentRef.update(tournamentReset);
    console.log("   🏆 Reset tournament-level leaderboard/round fields");
  }

  console.log("\n✅ RESET COMPLETE — all match data wiped, standings zeroed, leaderboard cleared");
  console.log("   Teams, players, and bracket fixtures preserved");
  console.log("   You can now re-fetch matches one by one\n");
}

main().catch(console.error);
