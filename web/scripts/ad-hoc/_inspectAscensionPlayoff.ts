/**
 * One-off: inspect Ascension play-off bracket so we can plan the semi swap.
 * Run: npx tsx scripts/ad-hoc/_inspectAscensionPlayoff.ts
 */
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

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
const TID = "league-of-rising-stars-ascension";

async function run() {
  const tRef = db.collection("valorantTournaments").doc(TID);
  const ms = await tRef.collection("matches").where("isBracket", "==", true).get();
  console.log(`Bracket matches: ${ms.size}\n`);

  const sorted = ms.docs.slice().sort((a, b) => {
    const A = a.data(), B = b.data();
    const ra = A.bracketRound || A.round || "";
    const rb = B.bracketRound || B.round || "";
    if (ra !== rb) return String(ra).localeCompare(String(rb));
    return (A.matchIndex ?? 0) - (B.matchIndex ?? 0);
  });

  for (const d of sorted) {
    const m = d.data();
    console.log(`[${d.id}]`);
    console.log(`  round=${m.bracketRound || m.round}  bracketType=${m.bracketType || "-"}  matchIndex=${m.matchIndex ?? "-"}  status=${m.status}`);
    console.log(`  team1=${m.team1Name || m.team1Id}   team2=${m.team2Name || m.team2Id}`);
    console.log(`  score=${m.team1Score ?? "-"}-${m.team2Score ?? "-"}`);
    console.log(`  winnerGoesTo=${m.winnerGoesTo || "-"}   loserGoesTo=${m.loserGoesTo || "-"}`);
    console.log(`  scheduledTime=${m.scheduledTime || "-"}   matchDay=${m.matchDay ?? "-"}`);
    console.log("");
  }
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
