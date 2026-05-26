import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
})});
const db = getFirestore();
const TID = "league-of-rising-stars-ascension";
(async () => {
  const m = (await db.collection("valorantTournaments").doc(TID).collection("matches").doc("round1-match1").get()).data() as any;
  const g = m.game1;
  console.log("game1.team1ValorantSide:", JSON.stringify(g.team1ValorantSide));
  console.log("game1.team2ValorantSide:", JSON.stringify(g.team2ValorantSide));
  console.log("game1.roundResults.length:", g.roundResults?.length);
  console.log("game1.roundResults[0]:", JSON.stringify(g.roundResults?.[0], null, 2));
  console.log("game1.roundResults[12]:", JSON.stringify(g.roundResults?.[12], null, 2));
  console.log("game1.team1RoundsWon:", g.team1RoundsWon, "team2RoundsWon:", g.team2RoundsWon);
  console.log("game1.blueRoundsWon:", g.blueRoundsWon, "redRoundsWon:", g.redRoundsWon);
  console.log("playerStats[0] team:", g.playerStats?.[0]?.team);
  console.log("playerStats[5] team:", g.playerStats?.[5]?.team);
  console.log("\n--- All roundResults distinct keys/winners ---");
  const seenKeys = new Set<string>();
  const winnerCounts: Record<string, number> = {};
  g.roundResults?.forEach((r: any) => {
    Object.keys(r).forEach(k => seenKeys.add(k));
    const w = String(r.winningTeam ?? r.winning_team ?? r.winner ?? r.outcome ?? "");
    winnerCounts[w] = (winnerCounts[w] || 0) + 1;
  });
  console.log("seen keys across rounds:", [...seenKeys]);
  console.log("winner counts:", winnerCounts);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
