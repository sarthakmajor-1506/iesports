/**
 * Lists all valorant tournaments and their lb-final match state.
 * Usage: npx tsx scripts/resetLbFinal.ts
 *        npx tsx scripts/resetLbFinal.ts <tournamentId>   ← to reset
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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
  const tournamentId = process.argv[2];

  if (!tournamentId) {
    // List mode — show all tournaments + lb-final state
    const snap = await db.collection("valorantTournaments").get();
    for (const doc of snap.docs) {
      const t = doc.data();
      console.log(`\n📋 ${doc.id} — ${t.name}`);
      const lbSnap = await db.collection("valorantTournaments").doc(doc.id).collection("matches").doc("lb-final").get();
      if (lbSnap.exists) {
        const lb = lbSnap.data()!;
        console.log(`   LB Final: ${lb.team1Name} vs ${lb.team2Name} | status=${lb.status} | score=${lb.team1Score}-${lb.team2Score}`);
        console.log(`   game1: ${lb.game1 ? "✅" : "—"}  game2: ${lb.game2 ? "✅" : "—"}  game3: ${lb.game3 ? "✅" : "—"}`);
        console.log(`   seriesAutoComputed=${lb.seriesAutoComputed}, completedAt=${lb.completedAt}`);
        console.log(`   winnerGoesTo=${lb.winnerGoesTo}`);
      } else {
        console.log("   LB Final: not found");
      }
      // Also show grand-final state
      const gfSnap = await db.collection("valorantTournaments").doc(doc.id).collection("matches").doc("grand-final").get();
      if (gfSnap.exists) {
        const gf = gfSnap.data()!;
        console.log(`   Grand Final: ${gf.team1Name} vs ${gf.team2Name} | status=${gf.status} | score=${gf.team1Score}-${gf.team2Score}`);
      }
    }
    console.log("\n\nTo reset, run: npx tsx scripts/resetLbFinal.ts <tournamentId>");
    return;
  }

  // Reset mode
  console.log(`\n🔧 Resetting LB Final for tournament: ${tournamentId}`);
  const matchRef = db.collection("valorantTournaments").doc(tournamentId).collection("matches").doc("lb-final");
  const matchDoc = await matchRef.get();
  if (!matchDoc.exists) {
    console.log("❌ lb-final match not found!");
    return;
  }

  const current = matchDoc.data()!;
  console.log("\n📊 Current state:");
  console.log(`   ${current.team1Name} vs ${current.team2Name}`);
  console.log(`   status=${current.status}, score=${current.team1Score}-${current.team2Score}`);
  console.log(`   game1: ${current.game1 ? JSON.stringify({ status: current.game1.status, winner: current.game1Winner }) : "—"}`);
  console.log(`   game2: ${current.game2 ? JSON.stringify({ status: current.game2.status, winner: current.game2Winner }) : "—"}`);
  console.log(`   game3: ${current.game3 ? JSON.stringify({ status: current.game3.status, winner: current.game3Winner }) : "—"}`);

  // Wipe all game data and reset to live
  const resetPayload: Record<string, any> = {
    status: "live",
    team1Score: 0,
    team2Score: 0,
    game1: FieldValue.delete(),
    game2: FieldValue.delete(),
    game3: FieldValue.delete(),
    "games.game1": FieldValue.delete(),
    "games.game2": FieldValue.delete(),
    "games.game3": FieldValue.delete(),
    game1MatchId: FieldValue.delete(),
    game2MatchId: FieldValue.delete(),
    game3MatchId: FieldValue.delete(),
    game1Winner: FieldValue.delete(),
    game2Winner: FieldValue.delete(),
    game3Winner: FieldValue.delete(),
    completedAt: FieldValue.delete(),
    seriesAutoComputed: FieldValue.delete(),
    needsManualScore: FieldValue.delete(),
  };

  await matchRef.update(resetPayload);
  console.log("\n✅ LB Final reset — all game data wiped, status=live, score=0-0");

  // Also check if grand-final was corrupted by advancement from this match
  const gfRef = db.collection("valorantTournaments").doc(tournamentId).collection("matches").doc("grand-final");
  const gfDoc = await gfRef.get();
  if (gfDoc.exists) {
    const gf = gfDoc.data()!;
    // If grand-final has a team that came from lb-final winner, reset that slot to TBD
    if (current.winnerGoesTo === "grand-final" && current.seriesAutoComputed) {
      const winnerId = current.team1Score > current.team2Score ? current.team1Id : current.team2Id;
      if (gf.team1Id === winnerId) {
        await gfRef.update({ team1Id: "TBD", team1Name: "TBD" });
        console.log(`🔧 Grand Final team1 reset to TBD (was ${winnerId} from LB final winner)`);
      } else if (gf.team2Id === winnerId) {
        await gfRef.update({ team2Id: "TBD", team2Name: "TBD" });
        console.log(`🔧 Grand Final team2 reset to TBD (was ${winnerId} from LB final winner)`);
      }
    }
    const gfUpdated = (await gfRef.get()).data()!;
    console.log(`   Grand Final now: ${gfUpdated.team1Name} vs ${gfUpdated.team2Name} | status=${gfUpdated.status}`);
  }
}

main().catch(console.error);
