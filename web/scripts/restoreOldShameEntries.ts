/**
 * Restore the previous-week Wall of Shame entries (SullieD + CMX AryenG) to
 * the Ascension wallOfShame collection with `archived: true`. The public
 * GET API filters archived entries out of the wall, so they stay invisible
 * to players but the data is preserved for future audits / analytics.
 *
 * Run: npx tsx scripts/restoreOldShameEntries.ts
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

type ArchivedEntry = {
  uid: string;
  type: "wanted" | "warning";
  reason: string;
};

const RESTORES: ArchivedEntry[] = [
  {
    uid: "discord_601601191893532696", // SullieD
    type: "wanted",
    reason: "Ghosted ALPHAS on match day. Never joined the lobby, never messaged, just vanished into the night.",
  },
  {
    uid: "discord_784460891843461142", // CMX AryenG
    type: "warning",
    reason: "Strolled into the TOOFANI CHOKERS Round 1 lobby 30 minutes late. Held up the whole bracket — alarms exist, buddy.",
  },
];

async function run() {
  const tournRef = db.collection("valorantTournaments").doc(TOURNAMENT_ID);
  const tournSnap = await tournRef.get();
  if (!tournSnap.exists) {
    console.error(`❌ Tournament not found: ${TOURNAMENT_ID}`);
    process.exit(1);
  }
  console.log(`📦 Restoring archived Wall of Shame entries for: ${tournSnap.data()?.name || TOURNAMENT_ID}\n`);

  const shameCol = tournRef.collection("wallOfShame");

  for (const seed of RESTORES) {
    // If an archived entry for this uid + type already exists, skip — we're
    // idempotent so re-running doesn't pile up duplicates.
    const dupe = await shameCol
      .where("uid", "==", seed.uid)
      .where("type", "==", seed.type)
      .where("archived", "==", true)
      .limit(1)
      .get();
    if (!dupe.empty) {
      console.log(`  skip   ${seed.type.padEnd(7)}  ${seed.uid}  (already archived)`);
      continue;
    }

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
      createdBy: "restore-script",
      tomatoCount: 0,
      bailCount: 0,
      archived: true,
      archivedAt: new Date().toISOString(),
    });
    console.log(`  restore  ${seed.type.padEnd(7)}  ${playerName}  (archived)`);
  }

  console.log(`\n✅ Done.`);
  process.exit(0);
}

run().catch((e) => {
  console.error("❌ Restore error:", e);
  process.exit(1);
});
