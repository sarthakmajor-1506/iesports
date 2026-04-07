/**
 * Reset all IEsports ratings to seed values and clear match-type rank history.
 * Run this before re-applying ELO with updated K-factors.
 *
 * Run: npx tsx scripts/resetRatings.ts
 */

import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";
import { seedRating, ratingToRank, ratingToTier } from "../lib/elo";

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

async function main() {
  console.log("\nResetting all IEsports ratings to seed values...\n");

  const usersSnap = await db.collection("users")
    .where("iesportsRating", ">", 0)
    .get();

  console.log(`Found ${usersSnap.size} users with IEsports ratings\n`);

  let reset = 0;
  let historyDeleted = 0;

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const uid = userDoc.id;
    const currentTier = data.riotTier || 0;
    const peakTier = data.riotPeakTier || currentTier;
    const rating = seedRating(currentTier, peakTier);

    // Reset rating to seed value
    await userDoc.ref.update({
      iesportsRating: rating,
      iesportsRank: ratingToRank(rating),
      iesportsTier: ratingToTier(rating),
      iesportsMatchesPlayed: 0,
    });

    // Delete match-type rank history entries (keep seed/refresh/admin)
    const historySnap = await userDoc.ref.collection("rankHistory")
      .where("type", "==", "match")
      .get();

    if (!historySnap.empty) {
      const batch = db.batch();
      for (const doc of historySnap.docs) {
        batch.delete(doc.ref);
        historyDeleted++;
      }
      await batch.commit();
    }

    const name = data.riotGameName || uid;
    console.log(`  ✓ ${name}: ${data.iesportsRating} → ${rating} (${ratingToRank(rating)}) [${historySnap.size} history entries cleared]`);
    reset++;
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`Reset: ${reset} users`);
  console.log(`History deleted: ${historyDeleted} match entries`);
  console.log(`${"═".repeat(50)}`);
  console.log(`\nNow run: npx tsx scripts/applyMatchElo.ts <tournamentId>`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
