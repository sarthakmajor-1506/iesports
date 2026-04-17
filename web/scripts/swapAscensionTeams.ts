/**
 * Swap Team 4 and Domin8 Janta Party (DJP) in Ascension Round 1.
 *
 * round1-match5 (11 AM): TEAM 4 vs RADIANT REAPERS → DJP vs RADIANT REAPERS
 * round1-match3 (3 PM):  DJP vs TEMPORARY PEACEKEEPERS → TEAM 4 vs TEMPORARY PEACEKEEPERS
 *
 * Usage: npx tsx scripts/swapAscensionTeams.ts
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

const TOURNAMENT_ID = "league-of-rising-stars-ascension";

async function main() {
  const tournamentRef = db.collection("valorantTournaments").doc(TOURNAMENT_ID);

  // Read both matches
  const [match5Doc, match3Doc] = await Promise.all([
    tournamentRef.collection("matches").doc("round1-match5").get(),
    tournamentRef.collection("matches").doc("round1-match3").get(),
  ]);

  if (!match5Doc.exists || !match3Doc.exists) {
    console.log("❌ Match docs not found");
    return;
  }

  const m5 = match5Doc.data()!;
  const m3 = match3Doc.data()!;

  console.log("BEFORE:");
  console.log(`  round1-match5 (11 AM): ${m5.team1Name} (${m5.team1Id}) vs ${m5.team2Name} (${m5.team2Id})`);
  console.log(`  round1-match3 (3 PM):  ${m3.team1Name} (${m3.team1Id}) vs ${m3.team2Name} (${m3.team2Id})`);

  // Verify expected state
  if (m5.team1Id !== "team-4" || m3.team1Id !== "team-6") {
    console.log("\n⚠️  Unexpected team IDs — aborting to be safe.");
    console.log(`  Expected round1-match5 team1 = team-4, got ${m5.team1Id}`);
    console.log(`  Expected round1-match3 team1 = team-6, got ${m3.team1Id}`);
    return;
  }

  const batch = db.batch();

  // round1-match5: swap team1 from TEAM 4 → DJP
  batch.update(tournamentRef.collection("matches").doc("round1-match5"), {
    team1Id: "team-6",
    team1Name: "DOMIN8 JANTA PARTY (DJP)",
  });

  // round1-match3: swap team1 from DJP → TEAM 4
  batch.update(tournamentRef.collection("matches").doc("round1-match3"), {
    team1Id: "team-4",
    team1Name: "TEAM 4",
  });

  await batch.commit();

  // Verify
  const [v5, v3] = await Promise.all([
    tournamentRef.collection("matches").doc("round1-match5").get(),
    tournamentRef.collection("matches").doc("round1-match3").get(),
  ]);

  console.log("\nAFTER:");
  console.log(`  round1-match5 (11 AM): ${v5.data()!.team1Name} (${v5.data()!.team1Id}) vs ${v5.data()!.team2Name} (${v5.data()!.team2Id})`);
  console.log(`  round1-match3 (3 PM):  ${v3.data()!.team1Name} (${v3.data()!.team1Id}) vs ${v3.data()!.team2Name} (${v3.data()!.team2Id})`);
  console.log("\n✅ Swap complete");
}

main().catch(console.error);
