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

async function clear() {
  const lb = await db.collection("valorantTournaments").doc(tid).collection("leaderboard").get();
  const batch = db.batch();
  lb.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log(`Cleared ${lb.size} leaderboard docs`);

  // Also clear old match playerStats since format changed
  const matches = await db.collection("valorantTournaments").doc(tid).collection("matches").get();
  const mBatch = db.batch();
  matches.forEach(d => {
    const data = d.data();
    if (data.playerStats && !data.game1) {
      // Old format — clear the playerStats field
      mBatch.update(d.ref, { playerStats: null, valorantMatchId: null, mapName: null });
    }
  });
  await mBatch.commit();
  console.log("Cleared old-format match data");
  process.exit(0);
}

clear().catch(console.error);
