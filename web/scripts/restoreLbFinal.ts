/**
 * Restores LB Final and Grand Final data that was wiped by resetLbFinal.ts
 * Based on logged state before reset:
 *   LB Final: Team 4 vs Muth Rajya — status=completed, score=1-2
 *   game1: winner=team1, game2: winner=team2, game3: winner=team2
 *   seriesAutoComputed=true, completedAt=2026-04-05T13:37:39.141Z
 *   winnerGoesTo=grand-final
 *   Grand Final team2 was: team-1 / Muth Rajya 🏴‍☠️
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

async function main() {
  const tournamentId = "league-of-rising-stars-prelims";

  // 1. Restore LB Final
  const lbRef = db.collection("valorantTournaments").doc(tournamentId).collection("matches").doc("lb-final");
  const lbDoc = await lbRef.get();
  if (!lbDoc.exists) {
    console.log("❌ lb-final not found");
    return;
  }

  console.log("📊 Current LB Final state:");
  const current = lbDoc.data()!;
  console.log(`   status=${current.status}, score=${current.team1Score}-${current.team2Score}`);

  await lbRef.update({
    status: "completed",
    team1Score: 1,
    team2Score: 2,
    game1Winner: "team1",
    game2Winner: "team2",
    game3Winner: "team2",
    seriesAutoComputed: true,
    completedAt: "2026-04-05T13:37:39.141Z",
  });
  console.log("✅ LB Final restored: status=completed, score=1-2, winners set");

  // 2. Restore Grand Final team2
  const gfRef = db.collection("valorantTournaments").doc(tournamentId).collection("matches").doc("grand-final");
  const gfDoc = await gfRef.get();
  if (gfDoc.exists) {
    const gf = gfDoc.data()!;
    console.log(`\n📊 Current Grand Final: ${gf.team1Name} vs ${gf.team2Name}`);
    await gfRef.update({
      team2Id: "team-1",
      team2Name: "Muth Rajya 🏴‍☠️",
    });
    console.log("✅ Grand Final team2 restored: Muth Rajya 🏴‍☠️ (team-1)");
  }

  // Verify
  const lbVerify = (await lbRef.get()).data()!;
  const gfVerify = (await gfRef.get()).data()!;
  console.log(`\n📋 Verified LB Final: ${lbVerify.team1Name} vs ${lbVerify.team2Name} | status=${lbVerify.status} | score=${lbVerify.team1Score}-${lbVerify.team2Score}`);
  console.log(`📋 Verified Grand Final: ${gfVerify.team1Name} vs ${gfVerify.team2Name} | status=${gfVerify.status}`);
  console.log("\n⚠️  NOTE: Full game detail objects (game1/game2/game3 with player stats) could not be restored — they were permanently deleted. You'll need to re-fetch them using the Valorant match IDs.");
}

main().catch(console.error);
