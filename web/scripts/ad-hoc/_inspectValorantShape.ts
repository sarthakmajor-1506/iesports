import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
const db = getFirestore();
const TID = "league-of-rising-stars-ascension";

(async () => {
  const tref = db.collection("valorantTournaments").doc(TID);
  const t = await tref.get();
  console.log("=== TOURNAMENT DOC TOP-LEVEL KEYS ===");
  console.log(JSON.stringify(Object.keys(t.data() || {}).sort()));

  console.log("\n=== STANDINGS (first 3) ===");
  const standings = await tref.collection("standings").limit(3).get();
  standings.docs.forEach(d => {
    console.log("---", d.id);
    console.log(JSON.stringify(d.data(), null, 2));
  });

  console.log("\n=== MATCH SAMPLE COMPLETED ===");
  const matches = await tref.collection("matches").where("status", "==", "completed").limit(2).get();
  matches.docs.forEach(d => {
    console.log("--- match:", d.id);
    const data: any = d.data();
    console.log("top keys:", Object.keys(data).sort().join(","));
    console.log("status:", data.status, "winner:", data.winner);
    console.log("team1:", data.team1Name, data.team1Id, "vs", data.team2Name, data.team2Id);
    console.log("scores:", data.team1Score, "-", data.team2Score);
    console.log("isBracket:", data.isBracket, "matchDay:", data.matchDay);
    const g = data.game1 || data.games?.game1;
    if (g) {
      console.log("  game1 keys:", Object.keys(g).sort().join(","));
      console.log("  map:", g.map || g.mapName, "score:", g.team1Score ?? g.team1RoundsWon, "-", g.team2Score ?? g.team2RoundsWon);
      const p = g.team1Players?.[0] || g.playerStats?.[0];
      if (p) {
        console.log("  player[0] keys:", Object.keys(p).sort().join(","));
        console.log("  player[0]:", JSON.stringify(p));
      }
    }
  });

  console.log("\n=== ROOT valorantTeams w/ this tournamentId ===");
  const rt = await db.collection("valorantTeams").where("tournamentId", "==", TID).limit(2).get();
  console.log("count:", rt.size);
  rt.docs.forEach(d => {
    console.log("---", d.id);
    console.log(JSON.stringify(d.data(), null, 2));
  });

  console.log("\n=== SOLOPLAYERS SAMPLE ===");
  const sp = await tref.collection("soloPlayers").limit(2).get();
  sp.docs.forEach(d => {
    console.log("uid:", d.id);
    console.log(JSON.stringify(d.data(), null, 2));
  });

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
