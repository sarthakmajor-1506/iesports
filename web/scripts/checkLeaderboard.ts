import { initializeApp, cert, getApps } from "firebase-admin/app";
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

const db = getFirestore();
const tid = "valorant-shuffle-test-mar28";

async function check() {
  const lb = await db.collection("valorantTournaments").doc(tid).collection("leaderboard").get();
  console.log("Leaderboard docs:", lb.size);
  lb.forEach(d => console.log(d.id, JSON.stringify(d.data()).slice(0, 300)));

  const matches = await db.collection("valorantTournaments").doc(tid).collection("matches").get();
  matches.forEach(d => {
    const data = d.data();
    if (data.playerStats) console.log("Match", d.id, "- playerStats count:", data.playerStats.length);
    else console.log("Match", d.id, "- NO playerStats");
    if (data.valorantMatchId) console.log("  valorantMatchId:", data.valorantMatchId);
    if (data.mapName) console.log("  map:", data.mapName);
  });
}

check().then(() => process.exit(0));