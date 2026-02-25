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

async function clear() {
  const db = getFirestore();

  const teams = await db.collection("teams").get();
  for (const d of teams.docs) {
    await d.ref.delete();
    console.log(`Deleted team: ${d.id}`);
  }

  const solo = await db.collection("soloPool").get();
  for (const d of solo.docs) {
    await d.ref.delete();
    console.log(`Deleted solo: ${d.id}`);
  }

  // Reset slotsBooked on all tournaments
  const tournaments = await db.collection("tournaments").get();
  for (const d of tournaments.docs) {
    await d.ref.update({
      slotsBooked: 0,
      "brackets.herald_guardian.slotsBooked": 0,
      "brackets.crusader_archon.slotsBooked": 0,
      "brackets.legend_ancient.slotsBooked": 0,
      "brackets.divine_immortal.slotsBooked": 0,
    });
    console.log(`Reset slots: ${d.data().name}`);
  }

  console.log("Done!");
  process.exit(0);
}

clear();
