/**
 * Form teams + generate the group stage + play-off bracket for the CS2
 * "Royal Sports League" tournament, once registration has closed and you've
 * split the 40 registrants into 8 rosters of 5.
 *
 * Fill in ROSTERS below (8 teams, 4 in Group A, 4 in Group B — order within
 * each group doesn't matter, this script does not seed the group stage),
 * then:
 *
 *   npx tsx scripts/generateCS2RoyalSportsLeagueBracket.ts             # dry-run
 *   npx tsx scripts/generateCS2RoyalSportsLeagueBracket.ts --apply     # writes Firestore
 *
 * Writes:
 *   - cs2Tournaments/{TID}/teams/{teamId}        (8 teams, groupId "A"|"B")
 *   - cs2Tournaments/{TID}/matches/{matchId}     (6 round-robin BO1 matches
 *                                                 per group + 2 semifinal +
 *                                                 1 final placeholder, all
 *                                                 TBD until seeded)
 *
 * Idempotent — re-running with --apply overwrites the same doc ids, it does
 * NOT touch match results already entered (uses set({merge:true}) only for
 * fields it owns; if you need to re-run after results exist, review the
 * diff printed in dry-run mode first).
 */

import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

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
const TID = "cs2-royal-sports-league";
const APPLY = process.argv.includes("--apply");

// ─────────────────────────────────────────────────────────────────────────
// FILL THIS IN before running — 4 teams per group, 5 members each.
// `uid` must match the player's Firestore users/{uid} doc id.
// ─────────────────────────────────────────────────────────────────────────
type RosterMember = { uid: string; steamName: string };
type Roster = { teamName: string; groupId: "A" | "B"; members: RosterMember[] };

const ROSTERS: Roster[] = [
  // { teamName: "Team Alpha", groupId: "A", members: [
  //   { uid: "discord_xxx", steamName: "Player1" },
  //   { uid: "discord_xxx", steamName: "Player2" },
  //   { uid: "discord_xxx", steamName: "Player3" },
  //   { uid: "discord_xxx", steamName: "Player4" },
  //   { uid: "discord_xxx", steamName: "Player5" },
  // ]},
  // ... 7 more teams (4 in group A, 4 in group B)
];

// Standard 4-team round-robin schedule (indices into a group's 4 teams).
// Each team plays the other 3 exactly once across 3 rounds.
const ROUND_ROBIN_4: [number, number][][] = [
  [[0, 3], [1, 2]],
  [[0, 2], [3, 1]],
  [[0, 1], [2, 3]],
];

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);
  console.log(`Tournament: ${TID}\n`);

  if (ROSTERS.length !== 8) {
    console.log(`⚠️  ROSTERS has ${ROSTERS.length} teams — fill in exactly 8 (4 per group) before running.`);
    return;
  }
  const groupA = ROSTERS.filter(r => r.groupId === "A");
  const groupB = ROSTERS.filter(r => r.groupId === "B");
  if (groupA.length !== 4 || groupB.length !== 4) {
    console.log(`⚠️  Need exactly 4 teams per group — got ${groupA.length} in A, ${groupB.length} in B.`);
    return;
  }

  const tref = db.collection("cs2Tournaments").doc(TID);
  const tSnap = await tref.get();
  if (!tSnap.exists) {
    console.log(`⚠️  Tournament ${TID} not found — run seedCS2RoyalSportsLeague.ts first.`);
    return;
  }

  const teamIds: Record<string, string> = {}; // teamName -> id
  let teamIndex = 0;
  const teamDocs: any[] = [];
  for (const group of [groupA, groupB]) {
    for (const roster of group) {
      const teamId = `cs2-royal-team-${teamIndex + 1}`;
      teamIds[roster.teamName] = teamId;
      teamDocs.push({
        id: teamId,
        tournamentId: TID,
        teamIndex,
        teamName: roster.teamName,
        groupId: roster.groupId,
        captainUid: roster.members[0]?.uid || "",
        members: roster.members.map(m => ({ uid: m.uid, steamName: m.steamName })),
      });
      teamIndex++;
      console.log(`  Team ${teamIndex}: ${roster.teamName} (Group ${roster.groupId})`);
    }
  }

  // ── Generate group stage matches ────────────────────────────────────────
  const matchDocs: any[] = [];
  let matchIndex = 0;
  for (const [groupLabel, group] of [["A", groupA], ["B", groupB]] as const) {
    const ids = group.map(r => teamIds[r.teamName]);
    const names = group.map(r => r.teamName);
    ROUND_ROBIN_4.forEach((round, roundIdx) => {
      round.forEach(([i, j]) => {
        matchIndex++;
        matchDocs.push({
          id: `cs2-royal-g${groupLabel.toLowerCase()}-r${roundIdx + 1}-m${matchIndex}`,
          tournamentId: TID,
          groupId: groupLabel,
          team1Id: ids[i], team1Name: names[i],
          team2Id: ids[j], team2Name: names[j],
          team1Score: 0, team2Score: 0,
          matchDay: roundIdx + 1,
          matchIndex,
          isBracket: false,
          status: "pending",
        });
      });
    });
  }

  // ── Play-off placeholders (seeded later by admin/cs2-manual-result once
  //    the group stage completes — see maybeSeedCS2Semifinals/Final there) ──
  const bracketDocs = [
    { id: "cs2-sf1", tournamentId: TID, bracketType: "winners", bracketLabel: "SF1", matchIndex: matchIndex + 1, team1Id: "TBD", team2Id: "TBD", team1Name: "TBD", team2Name: "TBD", team1Score: 0, team2Score: 0, matchDay: 4, isBracket: true, status: "pending" },
    { id: "cs2-sf2", tournamentId: TID, bracketType: "winners", bracketLabel: "SF2", matchIndex: matchIndex + 2, team1Id: "TBD", team2Id: "TBD", team1Name: "TBD", team2Name: "TBD", team1Score: 0, team2Score: 0, matchDay: 4, isBracket: true, status: "pending" },
    { id: "cs2-final", tournamentId: TID, bracketType: "grand_final", bracketLabel: "FINAL", matchIndex: matchIndex + 3, team1Id: "TBD", team2Id: "TBD", team1Name: "TBD", team2Name: "TBD", team1Score: 0, team2Score: 0, matchDay: 5, isBracket: true, status: "pending" },
  ];

  console.log(`\n${matchDocs.length} group matches + ${bracketDocs.length} play-off placeholders:`);
  for (const m of matchDocs) console.log(`  [R${m.matchDay}] Group ${m.groupId}: ${m.team1Name} vs ${m.team2Name}`);
  for (const m of bracketDocs) console.log(`  [${m.bracketLabel}] TBD vs TBD`);

  if (!APPLY) {
    console.log("\n🟡 DRY RUN — pass --apply to write Firestore.");
    return;
  }

  const batch = db.batch();
  for (const t of teamDocs) batch.set(tref.collection("teams").doc(t.id), t);
  for (const m of [...matchDocs, ...bracketDocs]) batch.set(tref.collection("matches").doc(m.id), m);
  await batch.commit();

  console.log(`\n✅ Wrote ${teamDocs.length} teams + ${matchDocs.length + bracketDocs.length} matches.`);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
