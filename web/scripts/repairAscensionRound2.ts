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

const TOURNAMENT_ID = "league-of-rising-stars-ascension";
const MATCH_DAY = 2;

/**
 * Re-pairs Round 2 as Swiss slide-style pairing:
 *   rank 1 vs rank 2, rank 3 vs rank 4, rank 5 vs rank 6, ...
 *
 * Standings rank = points desc, then (roundsWon − roundsLost) desc,
 * then mapsWon desc, then teamId asc for a stable ordering.
 *
 * md=1 matches must be `completed` for Round 2 pairings to be meaningful.
 */
async function run() {
  const tRef = db.collection("valorantTournaments").doc(TOURNAMENT_ID);
  const [standingsSnap, matchesSnap] = await Promise.all([
    tRef.collection("standings").get(),
    tRef.collection("matches").where("matchDay", "==", MATCH_DAY).get(),
  ]);

  const standings = standingsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const sorted = [...standings].sort((a, b) => {
    if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
    const diffA = (a.roundsWon || 0) - (a.roundsLost || 0);
    const diffB = (b.roundsWon || 0) - (b.roundsLost || 0);
    if (diffA !== diffB) return diffB - diffA;
    if ((b.mapsWon || 0) !== (a.mapsWon || 0)) return (b.mapsWon || 0) - (a.mapsWon || 0);
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });

  console.log("Swiss ranking:");
  sorted.forEach((s, i) => {
    console.log(`  ${String(i + 1).padStart(2)}  ${s.teamName.padEnd(28)}  pts=${s.points || 0}  diff=${((s.roundsWon || 0) - (s.roundsLost || 0))}`);
  });

  // Round 1 opponents — used to flag rematches, not to change the pairing.
  const r1Snap = await tRef.collection("matches").where("matchDay", "==", 1).get();
  const playedWith = new Map<string, Set<string>>();
  for (const d of r1Snap.docs) {
    const m = d.data() as any;
    if (!m.team1Id || !m.team2Id) continue;
    if (!playedWith.has(m.team1Id)) playedWith.set(m.team1Id, new Set());
    if (!playedWith.has(m.team2Id)) playedWith.set(m.team2Id, new Set());
    playedWith.get(m.team1Id)!.add(m.team2Id);
    playedWith.get(m.team2Id)!.add(m.team1Id);
  }

  const round2Docs = matchesSnap.docs.sort((a, b) => (a.data() as any).matchIndex - (b.data() as any).matchIndex);
  if (round2Docs.length * 2 !== sorted.length) {
    console.warn(`\n⚠️  ${round2Docs.length} Round 2 slots vs ${sorted.length} teams — expected ${sorted.length / 2} matches.`);
  }

  const batch = db.batch();
  console.log("\nRound 2 pairings:");
  for (let i = 0; i < round2Docs.length; i++) {
    const top = sorted[i * 2];
    const bot = sorted[i * 2 + 1];
    if (!top || !bot) break;

    const matchDoc = round2Docs[i];
    const existing = matchDoc.data() as any;
    const rematch = playedWith.get(top.id)?.has(bot.id);
    const flag = rematch ? " ⚠️ REMATCH" : "";
    console.log(
      `  idx=${existing.matchIndex}  ${top.teamName}  vs  ${bot.teamName}${flag}`
      + `  (was: ${existing.team1Name} vs ${existing.team2Name})`
    );

    batch.update(matchDoc.ref, {
      team1Id: top.id,
      team1Name: top.teamName,
      team2Id: bot.id,
      team2Name: bot.teamName,
      isTBD: false,
    });
  }

  await batch.commit();
  console.log("\n✓ Round 2 matches updated.");
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
