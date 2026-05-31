/**
 * One-off: swap the Ascension Upper Semis pairings.
 *
 *  Before:                                    After:
 *    wb-semi-m1  DJP  vs  TBD (← wb-r1-m2)      wb-semi-m1  DJP  vs  Temporary Peacekeepers (← wb-r1-m1)
 *    wb-semi-m2  TC   vs  Temp Peacekeepers     wb-semi-m2  TC   vs  TBD (← wb-r1-m2)
 *
 * We also swap loserGoesTo on both semis so the lower bracket keeps the
 * no-rematch invariant (Temporary Peacekeepers' LB landing must not be the
 * one that pulls Muth Mantralaya, who they already beat in wb-r1-m1).
 *
 * Run: npx tsx scripts/ad-hoc/_swapAscensionUpperSemis.ts
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
  const matches = tRef.collection("matches");

  const [r1m1, r1m2, sm1, sm2] = await Promise.all([
    matches.doc("wb-r1-m1").get(),
    matches.doc("wb-r1-m2").get(),
    matches.doc("wb-semi-m1").get(),
    matches.doc("wb-semi-m2").get(),
  ]);

  if (!r1m1.exists || !r1m2.exists || !sm1.exists || !sm2.exists) {
    throw new Error("Missing one of: wb-r1-m1, wb-r1-m2, wb-semi-m1, wb-semi-m2");
  }

  const r1m1d = r1m1.data()!;
  const sm2d  = sm2.data()!;

  // Temporary Peacekeepers data: pulled from sm2 (where they currently sit)
  // because wb-r1-m1 stored MM as team1 and TP as team2 but advancement
  // would have promoted to team2 of sm2. Confirm by name.
  const tpName = "TEMPORARY PEACEKEEPERS";
  let tpId = "";
  if (sm2d.team1Name === tpName) tpId = sm2d.team1Id;
  else if (sm2d.team2Name === tpName) tpId = sm2d.team2Id;
  else throw new Error(`Could not find Temporary Peacekeepers in wb-semi-m2: ${JSON.stringify(sm2d)}`);

  console.log(`Found Temporary Peacekeepers: id=${tpId}`);
  console.log(`Currently sitting in wb-semi-m2.${sm2d.team1Name === tpName ? "team1" : "team2"}\n`);

  const batch = db.batch();

  // 1. Re-route the WB-R1 winners.
  batch.update(matches.doc("wb-r1-m1"), { winnerGoesTo: "wb-semi-m1" });
  batch.update(matches.doc("wb-r1-m2"), { winnerGoesTo: "wb-semi-m2" });

  // 2. Place Temporary Peacekeepers into wb-semi-m1.team2 (DJP is team1).
  batch.update(matches.doc("wb-semi-m1"), {
    team2Id:   tpId,
    team2Name: tpName,
    // loserGoesTo flipped so TP, if they lose here, do NOT land in the LB
    // slot that pulls Muth Mantralaya (whom they already beat in wb-r1-m1).
    loserGoesTo: "lb-r3-m1",
  });

  // 3. Empty wb-semi-m2.team2 (was Temporary Peacekeepers); it now waits for
  //    the winner of wb-r1-m2 (Choot K Chooze vs Strait of Homos).
  batch.update(matches.doc("wb-semi-m2"), {
    team2Id:   "TBD",
    team2Name: "TBD",
    loserGoesTo: "lb-r3-m2",
  });

  await batch.commit();
  console.log("Swap committed.\n");

  // Verify
  console.log("=== After swap ===");
  for (const id of ["wb-r1-m1", "wb-r1-m2", "wb-semi-m1", "wb-semi-m2"]) {
    const d = (await matches.doc(id).get()).data()!;
    console.log(`[${id}]`);
    console.log(`  team1=${d.team1Name}   team2=${d.team2Name}`);
    console.log(`  winnerGoesTo=${d.winnerGoesTo || "-"}   loserGoesTo=${d.loserGoesTo || "-"}`);
    console.log("");
  }
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
