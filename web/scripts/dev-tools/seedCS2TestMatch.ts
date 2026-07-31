/**
 * Create a throwaway 1v1 CS2 tournament + two 1-player teams + one pending
 * match, purely to smoke-test the RCON/MatchZy pipeline end to end without
 * touching Royal Sports League or any other real tournament data.
 *
 * Requires two existing users with a linked Steam account (steamId on their
 * users/{uid} doc) — e.g. your own account and a friend's, or two already-
 * registered Royal League players (safe to reuse: this writes to a brand
 * new scratch tournament id, never to theirs).
 *
 * Run: npx tsx scripts/dev-tools/seedCS2TestMatch.ts --p1=<uid> --p2=<uid> [--tid=cs2-rcon-test]
 *
 * Idempotent — re-running with the same --tid overwrites the same docs.
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

function arg(name: string): string | undefined {
  const flag = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(flag));
  return found ? found.slice(flag.length) : undefined;
}

async function main() {
  const p1 = arg("p1");
  const p2 = arg("p2");
  const tid = arg("tid") || "cs2-rcon-test";
  if (!p1 || !p2) {
    console.error("Usage: npx tsx scripts/dev-tools/seedCS2TestMatch.ts --p1=<uid> --p2=<uid> [--tid=cs2-rcon-test]");
    process.exit(1);
  }

  const [u1Snap, u2Snap] = await Promise.all([
    db.collection("users").doc(p1).get(),
    db.collection("users").doc(p2).get(),
  ]);
  const u1 = u1Snap.data();
  const u2 = u2Snap.data();
  if (!u1?.steamId) throw new Error(`users/${p1} has no linked steamId`);
  if (!u2?.steamId) throw new Error(`users/${p2} has no linked steamId`);

  const nowIso = new Date().toISOString();
  const tref = db.collection("cs2Tournaments").doc(tid);

  await tref.set({
    name: "RCON Smoke Test",
    game: "cs2",
    format: "standard",
    status: "active",
    isTestTournament: true,
    bracketsComputed: true,
    registrationDeadline: nowIso,
    startDate: nowIso,
    endDate: nowIso,
    totalSlots: 2,
    slotsBooked: 2,
    entryFee: 0,
    prizePool: "TBD",
    rules: ["Throwaway 1v1 for RCON/MatchZy pipeline testing — not a real tournament."],
    desc: "Scratch tournament created by scripts/dev-tools/seedCS2TestMatch.ts",
    playersPerTeam: 1,
    totalTeams: 2,
    matchesPerRound: 1,
    bracketBestOf: 1,
    grandFinalBestOf: 1,
    createdAt: nowIso,
  }, { merge: true });

  const team1 = {
    id: "team1", tournamentId: tid, teamIndex: 0, teamName: u1.steamName || "Player 1",
    groupId: "A", captainUid: p1, avgSkillLevel: 1,
    members: [{ uid: p1, steamName: u1.steamName || "", steamAvatar: u1.steamAvatar || "", skillLevel: 1, cs2RankTier: 0 }],
    createdAt: nowIso,
  };
  const team2 = {
    id: "team2", tournamentId: tid, teamIndex: 1, teamName: u2.steamName || "Player 2",
    groupId: "A", captainUid: p2, avgSkillLevel: 1,
    members: [{ uid: p2, steamName: u2.steamName || "", steamAvatar: u2.steamAvatar || "", skillLevel: 1, cs2RankTier: 0 }],
    createdAt: nowIso,
  };
  await tref.collection("teams").doc("team1").set(team1);
  await tref.collection("teams").doc("team2").set(team2);

  await tref.collection("matches").doc("test-match-1").set({
    id: "test-match-1", tournamentId: tid,
    team1Id: "team1", team1Name: team1.teamName,
    team2Id: "team2", team2Name: team2.teamName,
    team1Score: 0, team2Score: 0,
    isBracket: false, status: "pending",
    matchDay: 1, matchIndex: 1,
  });

  console.log(`Created cs2Tournaments/${tid} with teams team1 (${team1.teamName}) vs team2 (${team2.teamName}), match test-match-1.`);
  console.log(`Steam64: ${u1.steamId} vs ${u2.steamId}`);
  console.log(`View at https://www.iesports.in/cs2/tournament/${tid}`);
  console.log(`Load it from the admin panel's CS2 Server tab: tournament "${tid}", match "test-match-1".`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
