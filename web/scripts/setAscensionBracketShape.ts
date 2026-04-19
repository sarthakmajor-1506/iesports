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

/**
 * Ascension: no elimination after group stage. All 10 teams advance.
 *   - Top 4  → Upper Bracket
 *   - Next 6 → Lower Bracket
 *
 * Sets bracketTeamCount (total teams carried into play-offs) and ubTeamCount
 * (how many of those seed into UB). The standings page reads these to paint
 * the blue/amber rows and to skip the "bottom two eliminated" red styling.
 */
async function run() {
  const ref = db.collection("valorantTournaments").doc("league-of-rising-stars-ascension");
  await ref.update({ bracketTeamCount: 10, ubTeamCount: 4 });
  const fresh = await ref.get();
  const d = fresh.data() || {};
  console.log(`Ascension updated: bracketTeamCount=${d.bracketTeamCount}, ubTeamCount=${d.ubTeamCount}`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
