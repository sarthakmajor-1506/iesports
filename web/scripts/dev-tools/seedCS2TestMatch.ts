/**
 * Create a private 1v1 CS2 test tournament for smoke-testing the RCON/MatchZy
 * pipeline end to end, without touching Royal Sports League or any other real
 * tournament data.
 *
 * The tournament is written with `isTestTournament: true` and a
 * `visibleToUids` whitelist, so it is hidden from the public CS2 list and
 * visible ONLY to the two players named (see api/tournaments/list/route.ts,
 * which filters on exactly these two fields).
 *
 * Both players must already have a linked Steam account — a player with no
 * steamId literally cannot join a whitelisted MatchZy server.
 *
 * Players can be given by uid, or by a name fragment matched case-insensitively
 * against steamName / discordUsername / fullName. A fragment that matches zero
 * or several users aborts with the candidates printed, rather than guessing.
 *
 * TWO matches are created, `cs2-test-m1` (area 1) and `cs2-test-m2` (area 2),
 * because the real event runs two game servers at once and the failure mode
 * that matters — events from both boxes landing in the right match doc — is
 * invisible with a single match. Load m1 on server 1 and m2 on server 2 and
 * watch both settle.
 *
 * Rounds default to `--rounds=2` (mp_maxrounds 2, first to 2). A smoke test
 * exists to prove the result pipeline, and MR16 means sitting through a real
 * game to find out that it doesn't work.
 *
 * Dry run by default (repo convention) — nothing is written until --apply:
 *   npx tsx scripts/dev-tools/seedCS2TestMatch.ts --p1=HunterxD --p2=Major
 *   npx tsx scripts/dev-tools/seedCS2TestMatch.ts --p1=HunterxD --p2=Major --apply
 *   npx tsx scripts/dev-tools/seedCS2TestMatch.ts --p1=.. --p2=.. --rounds=6 --apply
 *
 * Re-running with --apply overwrites the same docs, so it is safe to redo. It
 * resets both matches to pending — run it again to replay a test.
 */
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
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
const APPLY = process.argv.includes("--apply");

const TID = arg("tid") || "cs2-test-tournament";
const TNAME = arg("name") || "CS2 Test Tournament";

/**
 * Team names default to the player's Steam name, but Steam names are often
 * decorative Unicode ("𝐊Λ𝐋ΛП𝐈𝐏ΣΣ𝐊 ツ нυитєя007™"), and the team name ends up
 * in MatchZy's server hostname via matchzy_hostname_format. Override with
 * --t1name / --t2name to keep the hostname legible.
 */
const T1NAME = arg("t1name");
const T2NAME = arg("t2name");

/**
 * mp_maxrounds for the test matches. 2 (first to 2) keeps a full smoke test
 * to a couple of minutes. Read by api/cs2/match-config off the match doc's
 * `maxRounds`, the same field the real fixtures use for MR16/MR24.
 */
const ROUNDS = Math.max(2, Number(arg("rounds") || 2));

interface Resolved { uid: string; steamId: string; steamName: string; steamAvatar: string; label: string }

function resolvePlayer(needle: string, allUsers: any[]): Resolved {
  // Exact uid wins outright.
  const byUid = allUsers.find((u) => u.uid === needle);
  const n = needle.toLowerCase();
  const matches = byUid ? [byUid] : allUsers.filter((u) =>
    [u.steamName, u.discordUsername, u.fullName]
      .filter(Boolean)
      .some((f: string) => String(f).toLowerCase().includes(n))
  );

  if (matches.length === 0) {
    throw new Error(`No user matched "${needle}". Try their exact uid, Steam name, or Discord username.`);
  }
  if (matches.length > 1) {
    const list = matches.slice(0, 15)
      .map((u) => `    ${u.uid}  steam="${u.steamName || "-"}"  discord="${u.discordUsername || "-"}"  name="${u.fullName || "-"}"`)
      .join("\n");
    throw new Error(`"${needle}" matched ${matches.length} users, be more specific:\n${list}`);
  }

  const u = matches[0];
  if (!u.steamId) {
    throw new Error(`User ${u.uid} ("${u.steamName || u.fullName || needle}") has no linked Steam account. They must connect Steam before they can join a whitelisted match.`);
  }
  return {
    uid: u.uid,
    steamId: String(u.steamId),
    steamName: u.steamName || u.fullName || needle,
    steamAvatar: u.steamAvatar || "",
    label: `${u.steamName || u.fullName || needle} (${u.uid})`,
  };
}

async function main() {
  const p1Arg = arg("p1");
  const p2Arg = arg("p2");
  if (!p1Arg || !p2Arg) {
    console.error("Usage: npx tsx scripts/dev-tools/seedCS2TestMatch.ts --p1=<uid|name> --p2=<uid|name> [--tid=] [--name=] [--apply]");
    process.exit(1);
  }

  const snap = await db.collection("users").get();
  const allUsers = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }));
  console.log(`Scanned ${allUsers.length} users.\n`);

  const p1 = resolvePlayer(p1Arg, allUsers);
  const p2 = resolvePlayer(p2Arg, allUsers);
  if (p1.uid === p2.uid) throw new Error(`Both arguments resolved to the same user (${p1.uid}).`);

  console.log("Resolved players:");
  console.log(`  team1: ${p1.label}  steam64=${p1.steamId}`);
  console.log(`  team2: ${p2.label}  steam64=${p2.steamId}`);
  console.log(`\nTournament: cs2Tournaments/${TID}  "${TNAME}"`);
  console.log(`  isTestTournament: true  (hidden from the public CS2 list)`);
  console.log(`  visibleToUids: [${p1.uid}, ${p2.uid}]  (only these two see it)`);
  console.log(`  matches: cs2-test-m1 (area 1) + cs2-test-m2 (area 2)  ${T1NAME || p1.steamName} vs ${T2NAME || p2.steamName}  BO1  MR${ROUNDS}\n`);

  if (!APPLY) {
    console.log("DRY RUN — nothing written. Re-run with --apply to create it.");
    return;
  }

  const nowIso = new Date().toISOString();
  const tref = db.collection("cs2Tournaments").doc(TID);

  await tref.set({
    name: TNAME,
    game: "cs2",
    format: "standard",
    status: "active",
    isTestTournament: true,
    visibleToUids: [p1.uid, p2.uid],
    bracketsComputed: true,
    teamsGenerated: true,
    registrationDeadline: nowIso,
    startDate: nowIso,
    endDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    totalSlots: 2,
    slotsBooked: 2,
    entryFee: 0,
    prizePool: "TBD",
    playersPerTeam: 1,
    totalTeams: 2,
    teamCount: 2,
    matchesPerRound: 1,
    bracketBestOf: 1,
    grandFinalBestOf: 1,
    // Fallback for both matches; each match doc also carries its own
    // maxRounds, which wins.
    groupMaxRounds: ROUNDS,
    bracketMaxRounds: ROUNDS,
    rules: ["Private 1v1 test match for the RCON/MatchZy pipeline. Not a real tournament."],
    desc: "Private test tournament created by scripts/dev-tools/seedCS2TestMatch.ts",
    createdAt: nowIso,
  }, { merge: true });

  // Register both players (soloPlayers doc + the user's registered list), so
  // the tournament page shows them and roster resolution can find steamIds.
  for (const p of [p1, p2]) {
    await tref.collection("soloPlayers").doc(p.uid).set({
      uid: p.uid,
      steamId: p.steamId,
      steamName: p.steamName,
      steamAvatar: p.steamAvatar,
      cs2Rank: "",
      cs2RankTier: 0,
      skillLevel: 1,
      registeredAt: nowIso,
    }, { merge: true });
    await db.collection("users").doc(p.uid).set({
      registeredCS2Tournaments: FieldValue.arrayUnion(TID),
    }, { merge: true });
  }

  const t1 = T1NAME || p1.steamName;
  const t2 = T2NAME || p2.steamName;

  const mkTeam = (id: string, idx: number, p: Resolved, teamName: string) => ({
    id, tournamentId: TID, teamIndex: idx,
    teamName, groupId: "A",
    captainUid: p.uid, avgSkillLevel: 1,
    members: [{ uid: p.uid, steamName: p.steamName, steamAvatar: p.steamAvatar, skillLevel: 1, cs2RankTier: 0 }],
    createdAt: nowIso,
  });
  await tref.collection("teams").doc("team1").set(mkTeam("team1", 0, p1, t1), { merge: true });
  await tref.collection("teams").doc("team2").set(mkTeam("team2", 1, p2, t2), { merge: true });

  // One match per area, so both servers can be smoke-tested at once. Same two
  // teams in both — the point is proving that each server's events land in
  // its own match doc, not simulating a real bracket.
  for (const [id, area, idx] of [["cs2-test-m1", 1, 1], ["cs2-test-m2", 2, 2]] as const) {
    await tref.collection("matches").doc(id).set({
      id, tournamentId: TID, groupId: "A",
      team1Id: "team1", team1Name: t1,
      team2Id: "team2", team2Name: t2,
      team1Score: 0, team2Score: 0,
      matchDay: 1, matchIndex: idx, area,
      maxRounds: ROUNDS,
      isBracket: false, status: "pending",
      scheduledTime: nowIso,
      // Cleared so a re-run is a genuine replay rather than a match that
      // still carries the previous attempt's result.
      winner: FieldValue.delete(), completedAt: FieldValue.delete(),
      result: FieldValue.delete(), liveStartedAt: FieldValue.delete(),
      liveUpdatedAt: FieldValue.delete(), matchzyMatchId: FieldValue.delete(),
      game1: FieldValue.delete(), game2: FieldValue.delete(), game3: FieldValue.delete(),
    }, { merge: true });
  }

  console.log("Created.\n");
  console.log(`  Page:  https://www.iesports.in/cs2/tournament/${TID}`);
  console.log(`         (visible only to ${p1.steamName} and ${p2.steamName} while signed in)`);
  console.log(`  Admin: /admin -> CS2 Server tab -> tournament "${TNAME}"`);
  console.log(`         Server 1 -> match "cs2-test-m1"   Server 2 -> match "cs2-test-m2"`);
  console.log(`         Both MR${ROUNDS} (first to ${Math.floor(ROUNDS / 2) + 1}), BO1.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("\n" + (e?.message || e)); process.exit(1); });
