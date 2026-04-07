/**
 * Sync IEsports rating data from user docs to soloPlayers in a tournament.
 * This ensures teams are created based on iesportsTier instead of riotTier.
 *
 * Run: npx tsx scripts/syncSoloPlayers.ts <tournamentId>
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

async function main() {
  const tournamentId = process.argv[2];
  if (!tournamentId) {
    console.error("Usage: npx tsx scripts/syncSoloPlayers.ts <tournamentId>");
    process.exit(1);
  }

  const tournamentRef = db.collection("valorantTournaments").doc(tournamentId);
  const tDoc = await tournamentRef.get();
  if (!tDoc.exists) {
    console.error(`Tournament "${tournamentId}" not found`);
    process.exit(1);
  }
  console.log(`\nSyncing IEsports data for: ${tDoc.data()!.name}\n`);

  const playersSnap = await tournamentRef.collection("soloPlayers").get();
  if (playersSnap.empty) {
    console.log("No registered players.");
    process.exit(0);
  }

  let synced = 0;
  let missing = 0;

  for (const playerDoc of playersSnap.docs) {
    const uid = playerDoc.id;
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      console.log(`  ✗ ${uid}: user doc not found`);
      missing++;
      continue;
    }

    const u = userDoc.data()!;
    const iesportsRating = u.iesportsRating || 0;
    const iesportsRank = u.iesportsRank || "";
    const iesportsTier = u.iesportsTier || 0;

    await playerDoc.ref.update({
      riotRank: u.riotRank || playerDoc.data().riotRank || "",
      riotTier: u.riotTier || playerDoc.data().riotTier || 0,
      iesportsRating,
      iesportsRank,
      iesportsTier,
    });

    const pd = playerDoc.data();
    console.log(`  ✓ ${pd.riotGameName}#${pd.riotTagLine}: riotTier=${u.riotTier || 0} → iE=${iesportsRating} (${iesportsRank})`);
    synced++;
  }

  // Recalculate tiers (now uses iesportsTier)
  // Import recalcTiers inline since we're in a script context
  const allPlayers = await tournamentRef.collection("soloPlayers").get();
  const sorted = allPlayers.docs
    .map(d => ({
      uid: d.id,
      tier: d.data().iesportsTier || d.data().riotTier || 0,
      registeredAt: d.data().registeredAt || "",
    }))
    .sort((a, b) => b.tier - a.tier || a.registeredAt.localeCompare(b.registeredAt));

  const n = sorted.length;
  const t1Count = Math.ceil(n / 4);
  const t2Count = Math.ceil((n - t1Count) / 3);
  const t3Count = Math.ceil((n - t1Count - t2Count) / 2);

  const batch = db.batch();
  for (let i = 0; i < n; i++) {
    let skillLevel: number;
    if (i < t1Count) skillLevel = 1;
    else if (i < t1Count + t2Count) skillLevel = 2;
    else if (i < t1Count + t2Count + t3Count) skillLevel = 3;
    else skillLevel = 4;
    batch.update(tournamentRef.collection("soloPlayers").doc(sorted[i].uid), { skillLevel });
  }
  await batch.commit();

  console.log(`\n${"═".repeat(50)}`);
  console.log(`Synced: ${synced} | Missing: ${missing} | Total: ${playersSnap.size}`);
  console.log(`Skill levels recalculated (based on iesportsTier)`);
  console.log(`${"═".repeat(50)}\n`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
