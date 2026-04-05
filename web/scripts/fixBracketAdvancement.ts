/**
 * Fix bracket advancement — propagate winners/losers from completed bracket matches
 * Run: npx tsx scripts/fixBracketAdvancement.ts
 */

import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore(getApp());

async function fix() {
  // Find all valorant tournaments
  const tournamentsSnap = await db.collection("valorantTournaments").get();

  for (const tDoc of tournamentsSnap.docs) {
    const tId = tDoc.id;
    const tName = tDoc.data().name || tId;

    // Get all bracket matches
    const matchesSnap = await tDoc.ref.collection("matches").where("isBracket", "==", true).get();
    if (matchesSnap.empty) continue;

    console.log(`\n=== Tournament: ${tName} (${tId}) — ${matchesSnap.size} bracket matches ===`);

    const completedMatches = matchesSnap.docs.filter(d => d.data().status === "completed");
    console.log(`  Completed bracket matches: ${completedMatches.length}`);

    let advancedCount = 0;

    for (const mDoc of completedMatches) {
      const m = mDoc.data();
      const matchId = mDoc.id;

      // Determine winner/loser from series scores
      const t1Score = m.team1Score || 0;
      const t2Score = m.team2Score || 0;

      if (t1Score === 0 && t2Score === 0) {
        console.log(`  [${matchId}] Skipping — scores are 0-0`);
        continue;
      }

      const winnerId   = t1Score >= t2Score ? m.team1Id : m.team2Id;
      const winnerName = t1Score >= t2Score ? m.team1Name : m.team2Name;
      const loserId    = t1Score >= t2Score ? m.team2Id : m.team1Id;
      const loserName  = t1Score >= t2Score ? m.team2Name : m.team1Name;

      console.log(`  [${matchId}] ${m.team1Name} ${t1Score}-${t2Score} ${m.team2Name} → Winner: ${winnerName}`);

      const batch = db.batch();
      let changed = false;

      // Advance winner
      if (m.winnerGoesTo) {
        const nextRef = tDoc.ref.collection("matches").doc(m.winnerGoesTo);
        const nextDoc = await nextRef.get();
        if (nextDoc.exists) {
          const next = nextDoc.data()!;
          if (next.team1Id === "TBD") {
            batch.update(nextRef, { team1Id: winnerId, team1Name: winnerName });
            console.log(`    → Winner ${winnerName} → ${m.winnerGoesTo} (team1 slot)`);
            changed = true;
          } else if (next.team2Id === "TBD") {
            batch.update(nextRef, { team2Id: winnerId, team2Name: winnerName });
            console.log(`    → Winner ${winnerName} → ${m.winnerGoesTo} (team2 slot)`);
            changed = true;
          } else {
            console.log(`    → winnerGoesTo ${m.winnerGoesTo} already filled (${next.team1Name} vs ${next.team2Name})`);
          }
        }
      }

      // Advance loser
      if (m.loserGoesTo) {
        const loseRef = tDoc.ref.collection("matches").doc(m.loserGoesTo);
        const loseDoc = await loseRef.get();
        if (loseDoc.exists) {
          const lose = loseDoc.data()!;
          if (lose.team1Id === "TBD") {
            batch.update(loseRef, { team1Id: loserId, team1Name: loserName });
            console.log(`    → Loser ${loserName} → ${m.loserGoesTo} (team1 slot)`);
            changed = true;
          } else if (lose.team2Id === "TBD") {
            batch.update(loseRef, { team2Id: loserId, team2Name: loserName });
            console.log(`    → Loser ${loserName} → ${m.loserGoesTo} (team2 slot)`);
            changed = true;
          } else {
            console.log(`    → loserGoesTo ${m.loserGoesTo} already filled (${lose.team1Name} vs ${lose.team2Name})`);
          }
        }
      }

      if (changed) {
        await batch.commit();
        advancedCount++;
      }
    }

    console.log(`  Total advancements made: ${advancedCount}`);
  }

  console.log("\nDone!");
}

fix().catch(console.error);
