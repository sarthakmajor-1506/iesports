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
  const ref = db.collection("valorantTournaments").doc(TID);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error("Tournament not found:", TID);
    process.exit(1);
  }
  const before = snap.data()!;
  console.log(`Before: matchesPerRound = ${before.matchesPerRound}`);

  await ref.update({ matchesPerRound: 2 });

  const after = (await ref.get()).data()!;
  console.log(`After:  matchesPerRound = ${after.matchesPerRound}`);
  console.log("Done. Group stage is now BO2. Click 'Generate Fixtures' in admin.");
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
