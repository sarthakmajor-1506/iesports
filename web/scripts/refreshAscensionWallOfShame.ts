/**
 * Refresh the Ascension Wall of Shame for the current week.
 *
 * Wipes every existing entry under
 *   valorantTournaments/league-of-rising-stars-ascension/wallOfShame
 * and seeds 4 new "warning" (Late to the Party) entries for the players
 * the operator flagged this week.
 *
 * Run: npx tsx scripts/refreshAscensionWallOfShame.ts
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
const TOURNAMENT_ID = "league-of-rising-stars-ascension";

type SeedEntry = {
  uid: string;
  type: "wanted" | "warning";
  reason: string;
};

const SEEDS: SeedEntry[] = [
  {
    uid: "discord_549616273269456897", // Ace — 0 ACE 0#SNOW
    type: "warning",
    reason: "Late to lobby this week. The bracket waited, the captains pinged, the alarm clearly didn't.",
  },
  {
    uid: "discord_750380967188758578", // GPS — GPS32 ツ#HERS
    type: "warning",
    reason: "GPS rolled in late while the rest of the lobby idled. Even GPS knows the way — punctuality, mate.",
  },
  {
    uid: "discord_1050616956329402369", // Sarvagya — Tremolo#Migs
    type: "warning",
    reason: "Strolled into the lobby well after kickoff. Captains were tapping their feet — Discord pings exist.",
  },
  {
    uid: "discord_867791085644283934", // Sheeshu — Sheeshu#FERO
    type: "warning",
    reason: "Late entry, lobby on hold. The bracket doesn't run on Sheeshu time — set an alarm before the next match.",
  },
];

async function run() {
  const tournRef = db.collection("valorantTournaments").doc(TOURNAMENT_ID);
  const tournSnap = await tournRef.get();
  if (!tournSnap.exists) {
    console.error(`❌ Tournament not found: ${TOURNAMENT_ID}`);
    process.exit(1);
  }
  console.log(`🎯 Refreshing Wall of Shame for: ${tournSnap.data()?.name || TOURNAMENT_ID}\n`);

  const shameCol = tournRef.collection("wallOfShame");

  // ── Wipe existing entries ─────────────────────────────────────────────
  const existing = await shameCol.get();
  console.log(`Found ${existing.size} existing entries — deleting:`);
  for (const doc of existing.docs) {
    const d = doc.data();
    console.log(`  delete  ${d.type?.padEnd?.(7) || "?"}  ${d.playerName || d.uid}  (${doc.id})`);
    await doc.ref.delete();
  }
  console.log(`  done\n`);

  // ── Seed new entries ──────────────────────────────────────────────────
  console.log(`Seeding ${SEEDS.length} new entries:`);
  for (const seed of SEEDS) {
    const userSnap = await db.collection("users").doc(seed.uid).get();
    if (!userSnap.exists) {
      console.warn(`  ⚠ skip: user ${seed.uid} not found`);
      continue;
    }
    const u = userSnap.data() || {};
    const playerName = u.riotGameName || u.steamName || u.fullName || u.discordUsername || seed.uid;
    const playerAvatar = u.riotAvatar || u.discordAvatar || u.steamAvatar || "";
    const riotGameName = u.riotGameName || "";
    const riotTagLine = u.riotTagLine || "";

    await shameCol.add({
      uid: seed.uid,
      playerName,
      playerAvatar,
      riotGameName,
      riotTagLine,
      type: seed.type,
      reason: seed.reason,
      createdAt: new Date().toISOString(),
      createdBy: "refresh-script",
      tomatoCount: 0,
      bailCount: 0,
    });
    console.log(`  create  ${seed.type.padEnd(7)}  ${playerName}`);
  }

  console.log(`\n✅ Done.`);
  process.exit(0);
}

run().catch((e) => {
  console.error("❌ Refresh error:", e);
  process.exit(1);
});
