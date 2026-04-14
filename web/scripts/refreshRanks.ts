/**
 * Batch refresh Riot ranks for all linked users + seed IEsports ratings.
 *
 * What it does:
 * 1. Fetches all users with riotPuuid from Firestore
 * 2. Calls interim Valorant rank API v2/mmr for fresh current + peak rank
 * 3. Seeds iesportsRating = avg(currentTier, peakTier) * 100 for new users
 * 4. Applies floor check for existing users (Riot avg can only bump UP)
 * 5. Creates rankHistory entries for every change
 *
 * Rate limiting: batches of 25, 60-second delay between batches (30 req/min limit)
 *
 * Run: npx tsx scripts/refreshRanks.ts
 */

import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";
import { seedRating, floorCheck, ratingToRank, ratingToTier } from "../lib/elo";

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
const HENRIK_BASE = "https://api.henrikdev.xyz/valorant";
const API_KEY = process.env.HENRIK_API_KEY || "";

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 60_000; // 60 seconds between batches

// ── Valorant rank API fetch ─────────────────────────────────────────────────

async function henrikMMR(region: string, name: string, tag: string) {
  const encodedName = encodeURIComponent(name);
  const encodedTag = encodeURIComponent(tag);
  const url = `${HENRIK_BASE}/v2/mmr/${region}/${encodedName}/${encodedTag}?api_key=${API_KEY}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(API_KEY ? { Authorization: API_KEY } : {}),
    },
  });

  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  return json.data;
}

// ── Main ────────────────────────────────────────────────────────────────────

type UserRow = {
  uid: string;
  riotGameName: string;
  riotTagLine: string;
  riotRegion: string;
  oldRank: string;
  oldTier: number;
  newRank: string;
  newTier: number;
  peakRank: string;
  peakTier: number;
  iesportsRating: number;
  iesportsRank: string;
  action: string;
};

async function main() {
  // Fetch all users with riotPuuid
  const usersSnap = await db.collection("users")
    .where("riotPuuid", "!=", null)
    .get();

  const users = usersSnap.docs.filter(d => {
    const data = d.data();
    return data.riotPuuid && data.riotGameName && data.riotTagLine;
  });

  console.log(`\nFound ${users.length} users with Riot ID linked\n`);

  if (users.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  // Split into batches
  const batches: typeof users[] = [];
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    batches.push(users.slice(i, i + BATCH_SIZE));
  }

  const results: UserRow[] = [];
  let errors = 0;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    console.log(`── Batch ${b + 1}/${batches.length} (${batch.length} users) ──`);

    for (const doc of batch) {
      const data = doc.data();
      const uid = doc.id;
      const name = data.riotGameName;
      const tag = data.riotTagLine;
      const region = data.riotRegion || "ap";

      try {
        const mmrData = await henrikMMR(region, name, tag);

        // Extract current rank
        const newTier = mmrData?.current_data?.currenttier || 0;
        const newRank = mmrData?.current_data?.currenttierpatched || "Unranked";

        // Extract peak rank from API (new!)
        const apiPeakTier = mmrData?.highest_rank?.tier || 0;
        const apiPeakRank = mmrData?.highest_rank?.patched_tier || "Unranked";

        // Peak = max of API peak and any previously stored peak
        const storedPeakTier = data.riotPeakTier || 0;
        const peakTier = Math.max(apiPeakTier, storedPeakTier, newTier);
        const peakRank = peakTier === apiPeakTier ? apiPeakRank
          : peakTier === storedPeakTier ? (data.riotPeakRank || newRank)
          : newRank;

        // Build update object
        const update: Record<string, any> = {
          riotRank: newRank,
          riotTier: newTier,
          riotPeakRank: peakRank,
          riotPeakTier: peakTier,
        };

        let action = "updated";
        let rating: number;
        let ratingBefore = data.iesportsRating || 0;

        if (!data.iesportsRating) {
          // First time — seed rating
          rating = seedRating(newTier, peakTier);
          update.iesportsRating = rating;
          update.iesportsRank = ratingToRank(rating);
          update.iesportsTier = ratingToTier(rating);
          update.iesportsMatchesPlayed = data.iesportsMatchesPlayed || 0;
          action = "seeded";

          // Create seed history entry
          await db.collection("users").doc(uid).collection("rankHistory").add({
            timestamp: new Date().toISOString(),
            type: "seed",
            ratingBefore: 0,
            ratingAfter: rating,
            delta: rating,
          });
        } else {
          // Existing rating — apply floor check
          rating = data.iesportsRating;
          const bumped = floorCheck(rating, newTier, peakTier);
          if (bumped !== null) {
            update.iesportsRating = bumped;
            update.iesportsRank = ratingToRank(bumped);
            update.iesportsTier = ratingToTier(bumped);
            action = `floor bump ${rating}→${bumped}`;

            // Create riot_refresh history entry
            await db.collection("users").doc(uid).collection("rankHistory").add({
              timestamp: new Date().toISOString(),
              type: "riot_refresh",
              ratingBefore: rating,
              ratingAfter: bumped,
              delta: bumped - rating,
              riotRankBefore: data.riotRank || "Unknown",
              riotRankAfter: newRank,
              riotTierBefore: data.riotTier || 0,
              riotTierAfter: newTier,
            });

            rating = bumped;
          } else {
            // No change to iesportsRating, but still update derived fields
            update.iesportsRank = ratingToRank(rating);
            update.iesportsTier = ratingToTier(rating);
          }
        }

        await db.collection("users").doc(uid).update(update);

        results.push({
          uid,
          riotGameName: name,
          riotTagLine: tag,
          riotRegion: region,
          oldRank: data.riotRank || "None",
          oldTier: data.riotTier || 0,
          newRank,
          newTier,
          peakRank,
          peakTier,
          iesportsRating: rating,
          iesportsRank: ratingToRank(rating),
          action,
        });

        console.log(`  ✓ ${name}#${tag}: ${data.riotRank || "None"} → ${newRank} | peak: ${peakRank} | iE: ${rating} (${ratingToRank(rating)}) [${action}]`);
      } catch (err: any) {
        errors++;
        console.error(`  ✗ ${name}#${tag}: ${err.message}`);

        if (err.message === "RATE_LIMITED") {
          console.log("  ⚠ Rate limited! Waiting 90 seconds...");
          await sleep(90_000);
        }
      }
    }

    // Wait between batches (skip after last batch)
    if (b < batches.length - 1) {
      console.log(`\n  Waiting ${BATCH_DELAY_MS / 1000}s before next batch...\n`);
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log(`SUMMARY`);
  console.log(`${"═".repeat(60)}`);
  console.log(`Total users: ${users.length}`);
  console.log(`Refreshed:   ${results.length}`);
  console.log(`Errors:      ${errors}`);
  console.log(`Seeded:      ${results.filter(r => r.action === "seeded").length}`);
  console.log(`Floor bumps: ${results.filter(r => r.action.startsWith("floor")).length}`);
  console.log(`${"═".repeat(60)}\n`);

  // Print table
  console.log(`${"Player".padEnd(25)} ${"Old".padEnd(14)} ${"New".padEnd(14)} ${"Peak".padEnd(14)} ${"iE Rating".padEnd(10)} ${"iE Rank".padEnd(14)} Action`);
  console.log("-".repeat(105));
  for (const r of results) {
    console.log(
      `${(`${r.riotGameName}#${r.riotTagLine}`).padEnd(25)} ` +
      `${r.oldRank.padEnd(14)} ${r.newRank.padEnd(14)} ${r.peakRank.padEnd(14)} ` +
      `${String(r.iesportsRating).padEnd(10)} ${r.iesportsRank.padEnd(14)} ${r.action}`
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().then(() => process.exit(0)).catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
