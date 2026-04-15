/**
 * One-time: set entryFee to 0 on LEAGUE OF RISING STARS - ASCENSION.
 * Usage: npx tsx scripts/makeAscensionFree.ts
 */
import * as admin from "firebase-admin";
import { config } from "dotenv";
config({ path: ".env.local" });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const TOURNAMENT_ID = "league-of-rising-stars-ascension";

async function main() {
  const db = admin.firestore();
  const ref = db.collection("valorantTournaments").doc(TOURNAMENT_ID);
  const snap = await ref.get();
  if (!snap.exists) { console.log("Tournament not found"); return; }
  const before = snap.data()?.entryFee;
  await ref.update({ entryFee: 0 });
  console.log(`entryFee: ${before} -> 0`);
}

main().catch(console.error);
