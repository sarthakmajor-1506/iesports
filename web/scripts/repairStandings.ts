/**
 * Rebuild standings from completed matches using the current formula:
 *   points = 2 × (games won across the series)
 *   rounds = sum of team1/team2RoundsWon across every game in the match
 *   wins/draws/losses still counted at match level
 *
 * Dry-run by default. `--write` commits. `--tid=<id>` for another tournament.
 */
import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = admin.firestore();

const args = process.argv.slice(2);
const write = args.includes("--write");
const tidArg = args.find((a) => a.startsWith("--tid="))?.slice(6);
const TOURNAMENT_ID = tidArg || "league-of-rising-stars-ascension";

type Row = {
  teamId: string; teamName: string;
  played: number; wins: number; draws: number; losses: number;
  mapsWon: number; mapsLost: number;
  roundsWon: number; roundsLost: number;
  points: number;
};

function blank(teamId: string, teamName: string): Row {
  return { teamId, teamName, played: 0, wins: 0, draws: 0, losses: 0, mapsWon: 0, mapsLost: 0, roundsWon: 0, roundsLost: 0, points: 0 };
}

async function main() {
  const tref = db.collection("valorantTournaments").doc(TOURNAMENT_ID);

  const teamsSnap = await tref.collection("teams").get();
  const rows = new Map<string, Row>();
  for (const t of teamsSnap.docs) rows.set(t.id, blank(t.id, t.data().teamName || t.id));

  const matchesSnap = await tref.collection("matches")
    .where("status", "==", "completed")
    .get();

  let processed = 0;
  for (const mDoc of matchesSnap.docs) {
    const m = mDoc.data();
    if (m.isBracket === true) continue;
    const t1 = rows.get(m.team1Id); const t2 = rows.get(m.team2Id);
    if (!t1 || !t2) continue;

    const s1 = m.team1Score || 0;
    const s2 = m.team2Score || 0;

    let t1Rounds = 0, t2Rounds = 0;
    const games = m.games || {};
    for (let g = 1; g <= 5; g++) {
      const gData = games[`game${g}`] || (m as any)[`game${g}`];
      if (gData && typeof gData.team1RoundsWon === "number") {
        t1Rounds += gData.team1RoundsWon;
        t2Rounds += gData.team2RoundsWon;
      }
    }

    t1.played++; t2.played++;
    t1.mapsWon += s1; t1.mapsLost += s2;
    t2.mapsWon += s2; t2.mapsLost += s1;
    t1.roundsWon += t1Rounds; t1.roundsLost += t2Rounds;
    t2.roundsWon += t2Rounds; t2.roundsLost += t1Rounds;
    t1.points += s1 * 2; t2.points += s2 * 2;
    if (s1 > s2) { t1.wins++; t2.losses++; }
    else if (s2 > s1) { t1.losses++; t2.wins++; }
    else { t1.draws++; t2.draws++; }
    processed++;
  }

  // Buchholz: sum of opponents' points (group stage only)
  const opponents = new Map<string, string[]>();
  for (const mDoc of matchesSnap.docs) {
    const m = mDoc.data();
    if (m.isBracket === true) continue;
    if (!opponents.has(m.team1Id)) opponents.set(m.team1Id, []);
    if (!opponents.has(m.team2Id)) opponents.set(m.team2Id, []);
    opponents.get(m.team1Id)!.push(m.team2Id);
    opponents.get(m.team2Id)!.push(m.team1Id);
  }
  const buchholz = new Map<string, number>();
  for (const [tid, opps] of opponents) {
    buchholz.set(tid, opps.reduce((s, o) => s + (rows.get(o)?.points || 0), 0));
  }

  // Report
  const sorted = Array.from(rows.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return (b.roundsWon - b.roundsLost) - (a.roundsWon - a.roundsLost);
  });
  console.log(`Tournament ${TOURNAMENT_ID} — rebuilt from ${processed} completed group matches\n`);
  console.log("# Team                          P  W  D  L  MW ML RW  RL  Pts  BH");
  sorted.forEach((r, i) => {
    console.log(
      `${String(i + 1).padStart(2)} ${r.teamName.padEnd(30)} ${String(r.played).padStart(2)} ${String(r.wins).padStart(2)} ${String(r.draws).padStart(2)} ${String(r.losses).padStart(2)} ${String(r.mapsWon).padStart(2)} ${String(r.mapsLost).padStart(2)} ${String(r.roundsWon).padStart(3)} ${String(r.roundsLost).padStart(3)} ${String(r.points).padStart(3)} ${String(buchholz.get(r.teamId) || 0).padStart(3)}`
    );
  });

  if (!write) {
    console.log(`\n🟡 DRY RUN — pass --write to commit.`);
    process.exit(0);
  }

  const standingsRef = tref.collection("standings");
  const existing = await standingsRef.get();
  const wipe = db.batch();
  for (const d of existing.docs) wipe.delete(d.ref);
  await wipe.commit();

  const batch = db.batch();
  for (const r of rows.values()) {
    batch.set(standingsRef.doc(r.teamId), {
      ...r,
      buchholz: buchholz.get(r.teamId) || 0,
    });
  }
  await batch.commit();
  console.log(`\n✓ ${rows.size} standings docs rewritten.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
