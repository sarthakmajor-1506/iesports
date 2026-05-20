/**
 * Seed a DUMMY playoff bracket on the Ascension tournament so the playoff tab
 * renders the bracket visualization with "Rank 1" through "Rank 10" placeholders.
 *
 * Uses the same match IDs the real generate-brackets route uses
 * (wb-r1-m1, wb-semi-m1, wb-final, lb-r1-m1, ..., grand-final), so when actual
 * playoffs are generated post-group-stage, those calls cleanly overwrite this
 * dummy data — no manual cleanup needed.
 *
 * Run:    npx tsx scripts/seedAscensionDummyPlayoff.ts
 * Cleanup: npx tsx scripts/seedAscensionDummyPlayoff.ts --cleanup
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
if (!getApps().length) initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n") }) });
const db = getFirestore();

const TID = "league-of-rising-stars-ascension";
const cleanup = process.argv.includes("--cleanup");

// Dummy "Rank N" team identifiers — using rank-N as the team id so the
// bracket UI distinguishes them as separate teams.
const rankTeam = (n: number) => ({ id: `rank-${n}`, name: `Rank ${n}` });
const TBD = { id: "TBD", name: "TBD" };

function makeMatch(id: string, label: string, type: "winners" | "losers" | "grand_final",
                   bracketRound: number, matchDay: number, matchIndex: number,
                   t1: { id: string; name: string }, t2: { id: string; name: string },
                   bestOf = 2,
                   winnerGoesTo?: string, loserGoesTo?: string) {
  return {
    id,
    data: {
      tournamentId: TID,
      matchDay,
      matchIndex,
      bracketLabel: label,
      bracketType: type,
      bracketRound,
      isBracket: true,
      bestOf,
      team1Id: t1.id,
      team1Name: t1.name,
      team2Id: t2.id,
      team2Name: t2.name,
      status: "pending",
      team1Score: 0,
      team2Score: 0,
      createdAt: new Date().toISOString(),
      _dummyPlayoff: true,           // marker so a future cleanup can find these easily
      ...(winnerGoesTo && { winnerGoesTo }),
      ...(loserGoesTo && { loserGoesTo }),
    },
  };
}

async function run() {
  const tRef = db.collection("valorantTournaments").doc(TID);
  const matchesCol = tRef.collection("matches");

  const ids = [
    "wb-r1-m1", "wb-r1-m2", "lb-r1-m1", "lb-r1-m2",
    "wb-semi-m1", "wb-semi-m2", "lb-r2-m1", "lb-r2-m2",
    "wb-final", "lb-r3-m1", "lb-r3-m2",
    "lb-semi", "lb-final", "grand-final",
  ];

  if (cleanup) {
    console.log(`Cleaning up dummy playoff bracket on ${TID}...`);
    for (const id of ids) {
      await matchesCol.doc(id).delete().catch(() => {});
      console.log(`  deleted ${id}`);
    }
    await tRef.update({ bracketGenerated: false, bracketSize: null, bracketTeams: null });
    console.log("✅ cleanup done");
    process.exit(0);
  }

  const matches = [
    // ── Day 1 — UB R1 (Rank 3-6) + LB R1 (Rank 7-10) ─────────────────────
    makeMatch("wb-r1-m1", "UB R1 M1", "winners", 1, 1, 0, rankTeam(3), rankTeam(6), 2, "wb-semi-m2", "lb-r2-m2"),
    makeMatch("wb-r1-m2", "UB R1 M2", "winners", 1, 1, 1, rankTeam(4), rankTeam(5), 2, "wb-semi-m1", "lb-r2-m1"),
    makeMatch("lb-r1-m1", "LB R1 M1", "losers",  1, 1, 2, rankTeam(7), rankTeam(10), 2, "lb-r2-m1"),
    makeMatch("lb-r1-m2", "LB R1 M2", "losers",  1, 1, 3, rankTeam(8), rankTeam(9), 2, "lb-r2-m2"),

    // ── Day 2 — UB Semis (Rank 1/2 + Day-1 winners) + LB R2 ───────────────
    makeMatch("wb-semi-m1", "UB Semi M1", "winners", 2, 2, 0, rankTeam(1), TBD, 2, "wb-final", "lb-r3-m2"),
    makeMatch("wb-semi-m2", "UB Semi M2", "winners", 2, 2, 1, rankTeam(2), TBD, 2, "wb-final", "lb-r3-m1"),
    makeMatch("lb-r2-m1",   "LB R2 M1",   "losers",  2, 2, 2, TBD, TBD, 2, "lb-r3-m1"),
    makeMatch("lb-r2-m2",   "LB R2 M2",   "losers",  2, 2, 3, TBD, TBD, 2, "lb-r3-m2"),

    // ── Day 3 — UB Final + LB R3 (crossed) ────────────────────────────────
    makeMatch("wb-final",  "Upper Bracket Final", "winners", 3, 3, 0, TBD, TBD, 2, "grand-final", "lb-final"),
    makeMatch("lb-r3-m1",  "LB R3 M1",            "losers",  3, 3, 1, TBD, TBD, 2, "lb-semi"),
    makeMatch("lb-r3-m2",  "LB R3 M2",            "losers",  3, 3, 2, TBD, TBD, 2, "lb-semi"),

    // ── Day 4 — LB Semi ───────────────────────────────────────────────────
    makeMatch("lb-semi",   "Lower Bracket Semi",  "losers",  4, 4, 0, TBD, TBD, 2, "lb-final"),

    // ── Day 5 — LB Final ──────────────────────────────────────────────────
    makeMatch("lb-final",  "Lower Bracket Final", "losers",  5, 5, 0, TBD, TBD, 3, "grand-final"),

    // ── Day 6 — Grand Final ───────────────────────────────────────────────
    makeMatch("grand-final", "Grand Final", "grand_final", 1, 6, 0, TBD, TBD, 5),
  ];

  console.log(`Seeding ${matches.length} dummy bracket matches into ${TID}...`);
  const batch = db.batch();
  for (const m of matches) {
    batch.set(matchesCol.doc(m.id), m.data);
  }
  batch.commit();

  // Also flip the tournament-level flags so the playoff tab knows to render the bracket
  await tRef.update({
    bracketGenerated: true,
    bracketSize: 10,
    bracketTeams: 10,
    bracketTeamCount: 10,
    ubTeamCount: 6,
    _dummyPlayoffSeeded: true,
  });

  console.log("\n✅ Dummy playoff bracket seeded.");
  console.log("   View the playoff tab on the tournament page to see the bracket.");
  console.log("   To remove: npx tsx scripts/seedAscensionDummyPlayoff.ts --cleanup");
  console.log("   Real generate-brackets call will overwrite these dummy matches cleanly.");
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
