/**
 * Bump Ascension's upper-bracket cut from top-4 to top-6.
 *
 * The standings UI tints the top `ubTeamCount` rows blue (Upper) and the
 * next `(bracketTeamCount - ubTeamCount)` rows orange (Lower). For
 * Ascension we want top 6 → UB, next 4 → LB. Brackets aren't generated
 * yet, so this is the only field that needs to move now — the API will
 * cover the rest when the admin actually generates the bracket.
 *
 * Run: npx tsx scripts/updateAscensionUbCount.ts
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

async function run() {
  const ref = db.collection("valorantTournaments").doc(TOURNAMENT_ID);
  const before = await ref.get();
  if (!before.exists) {
    console.error(`❌ Tournament not found: ${TOURNAMENT_ID}`);
    process.exit(1);
  }
  const b = before.data() || {};
  console.log(`Before: ubTeamCount=${b.ubTeamCount} · bracketTeamCount=${b.bracketTeamCount}`);
  await ref.update({ ubTeamCount: 6, bracketTeamCount: 10 });
  const after = (await ref.get()).data() || {};
  console.log(`After:  ubTeamCount=${after.ubTeamCount} · bracketTeamCount=${after.bracketTeamCount}`);
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Update error:", err);
  process.exit(1);
});
