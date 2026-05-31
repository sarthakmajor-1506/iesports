// One-off: fix existing Valorant tournaments where UB→LB drops landed in
// team1 of the receiving LB cell because of the old first-TBD-fill
// advancement. New advancement puts losers in team2 (bottom slot); this
// script swaps the slots in already-advanced matches so the live data
// matches the new convention.
//
// Usage:  npx tsx scripts/ad-hoc/_swapLbDropSlots.ts <tournamentId>

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

const tournamentId = process.argv[2];
if (!tournamentId) {
  console.error("usage: npx tsx scripts/ad-hoc/_swapLbDropSlots.ts <tournamentId>");
  process.exit(1);
}

(async () => {
  const matchesCol = db.collection("valorantTournaments").doc(tournamentId).collection("matches");
  const snap = await matchesCol.get();
  if (snap.empty) {
    console.log("no matches found for", tournamentId);
    return;
  }

  // Build a map of every match by id so we can resolve loserGoesTo chains.
  const all: Record<string, any> = {};
  snap.docs.forEach(d => { all[d.id] = { id: d.id, ...d.data() }; });

  // For each completed UB match with loserGoesTo, work out who its loser
  // was and whether that loser is currently sitting in team1 (top) of the
  // destination — if so, and team2 is TBD, swap.
  let swapped = 0;
  for (const src of Object.values(all)) {
    if (!src.loserGoesTo) continue;
    if (src.status !== "completed") continue;

    const t1Score = src.team1Score ?? 0;
    const t2Score = src.team2Score ?? 0;
    if (t1Score === t2Score) continue; // shouldn't happen, but be safe

    const loserId   = t1Score < t2Score ? src.team1Id   : src.team2Id;
    const loserName = t1Score < t2Score ? src.team1Name : src.team2Name;
    if (!loserId || loserId === "TBD" || loserId === "BYE") continue;

    const dest = all[src.loserGoesTo];
    if (!dest) continue;

    // Already in team2 — already correct, nothing to do.
    if (dest.team2Id === loserId) continue;
    // In team1 with team2 still open — swap.
    if (dest.team1Id === loserId && dest.team2Id === "TBD") {
      await matchesCol.doc(dest.id).update({
        team1Id: "TBD",
        team1Name: "TBD",
        team2Id: loserId,
        team2Name: loserName,
      });
      console.log(`✓ ${dest.id}: moved ${loserName} from team1 → team2 (came from ${src.id})`);
      swapped++;
      // Reflect in our local map so subsequent iterations see the new state.
      dest.team1Id = "TBD"; dest.team1Name = "TBD";
      dest.team2Id = loserId; dest.team2Name = loserName;
      continue;
    }
    // Either team1 is something else (LB-winner already arrived correctly) or
    // team2 is filled (someone else there) — leave alone, manual review needed.
    console.log(`· ${dest.id}: skip (team1=${dest.team1Name}, team2=${dest.team2Name}, expected loser=${loserName})`);
  }

  console.log(`\ndone — swapped ${swapped} matches`);
  process.exit(0);
})();
