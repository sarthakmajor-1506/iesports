/**
 * Mark Sheeshu as the team-10 (Radiant Reapers) substitute for orcus in
 * round3-match5 of the Ascension tournament. Writes him into team1Subs or
 * team2Subs (whichever side Radiant is on) so the leaderboard rebuild
 * scripts skip his stats from this match.
 *
 *   npx tsx scripts/markSheeshuSubRound3Match5.ts            ← dry-run
 *   npx tsx scripts/markSheeshuSubRound3Match5.ts --write    ← commit
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
if (!getApps().length) initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

const TID = "league-of-rising-stars-ascension";
const MATCH_DOC = "round3-match5";
const RADIANT_TEAM_ID = "team-10";
const SHEESHU_UID = "discord_867791085644283934";
const SHEESHU_DISCORD_ID = "867791085644283934";

const write = process.argv.includes("--write");

async function run() {
  const matchRef = db
    .collection("valorantTournaments").doc(TID)
    .collection("matches").doc(MATCH_DOC);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) throw new Error(`Match ${MATCH_DOC} not found in ${TID}`);
  const md = matchSnap.data()!;

  const userSnap = await db.collection("users").doc(SHEESHU_UID).get();
  if (!userSnap.exists) throw new Error(`User ${SHEESHU_UID} not found`);
  const u = userSnap.data()!;
  const sheeshuPuuid: string | undefined = u.riotPuuid;
  if (!sheeshuPuuid) throw new Error(`Sheeshu has no riotPuuid on user doc`);
  const sheeshuName: string = u.riotGameName || u.fullName || "Sheeshu";

  let side: "team1" | "team2";
  if (md.team1Id === RADIANT_TEAM_ID) side = "team1";
  else if (md.team2Id === RADIANT_TEAM_ID) side = "team2";
  else throw new Error(`Radiant (${RADIANT_TEAM_ID}) is not on this match — team1Id=${md.team1Id}, team2Id=${md.team2Id}`);

  const subsKey = side === "team1" ? "team1Subs" : "team2Subs";
  const existingSubs: any[] = (md[subsKey] || []) as any[];

  console.log(`Match: ${MATCH_DOC}  ${md.team1Name} vs ${md.team2Name}`);
  console.log(`Radiant is on ${side} (${subsKey})`);
  console.log(`Sheeshu puuid: ${sheeshuPuuid}`);
  console.log(`Existing ${subsKey}:`, existingSubs.length ? existingSubs : "[]");

  if (existingSubs.some((s) => s?.riotPuuid === sheeshuPuuid)) {
    console.log(`\nSheeshu is already in ${subsKey}. Nothing to do.`);
    process.exit(0);
  }

  const newSub = {
    uid: SHEESHU_UID,
    discordId: SHEESHU_DISCORD_ID,
    name: sheeshuName,
    riotPuuid: sheeshuPuuid,
  };
  const newSubs = [...existingSubs, newSub];
  console.log(`\nWill set ${subsKey} to:`, newSubs);

  if (!write) {
    console.log(`\n🟡 DRY RUN — pass --write to apply.`);
    process.exit(0);
  }

  await matchRef.update({ [subsKey]: newSubs });
  console.log(`\n✅ Updated ${MATCH_DOC}.${subsKey}.`);
  console.log(`Next: rerun  npx tsx scripts/repairLeaderboardFromMatches.ts --write  to recompute the leaderboard.`);
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
