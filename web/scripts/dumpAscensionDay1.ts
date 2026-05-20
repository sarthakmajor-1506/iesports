/**
 * Dump tournament name + Day-1 match team data for the recap-edit pipeline.
 * Run: npx tsx scripts/dumpAscensionDay1.ts
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();
const TID = "league-of-rising-stars-ascension";

async function run() {
  const tRef = db.collection("valorantTournaments").doc(TID);
  const tSnap = await tRef.get();
  const t = tSnap.data() || {};
  console.log("=== Tournament ===");
  console.log("name:", t.name);
  console.log();

  const matchesSnap = await tRef.collection("matches").get();
  const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  // Filter Day 1 / Round 1 matches
  const day1 = matches.filter(m => {
    const day = m.day ?? m.dayNumber ?? null;
    const round = m.round ?? m.roundNumber ?? m.roundIndex ?? null;
    return day === 1 || round === 1 || (m.id || "").includes("round-1");
  });

  console.log(`=== ${matches.length} total match docs · ${day1.length} look like Day-1/Round-1 ===\n`);

  for (const m of (day1.length ? day1 : matches)) {
    const t1 = m.team1Name || m.team1?.name || m.team1Id || "?";
    const t2 = m.team2Name || m.team2?.name || m.team2Id || "?";
    const day = m.day ?? m.dayNumber ?? "?";
    const round = m.round ?? m.roundNumber ?? "?";
    const matchNum = m.matchNumber ?? m.matchIndex ?? "?";
    console.log(`[${m.id}]  D${day} R${round} M${matchNum}  ${t1}  vs  ${t2}`);
  }

  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
