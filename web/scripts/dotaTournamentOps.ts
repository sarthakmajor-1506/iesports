/**
 * Three ops:
 *  1. Delete the test tournament (zz-test-dota-lobby-flow) + its subcollections
 *     + its synthesized botQueues / botLobbies test docs.
 *  2. Point the real Domin8 tournament's discordChannelId at the #domin8
 *     text channel (1504863767203283051) so all bot lobby traffic routes there.
 *  3. Rename the 4 Domin8 teams and propagate the names onto every match doc.
 *
 * Dry run by default. Pass --apply to execute.
 * Run: npx tsx scripts/dotaTournamentOps.ts [--apply]
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }) });
}

const APPLY = process.argv.includes("--apply");
const TEST_TID = "zz-test-dota-lobby-flow";
const DOMIN8 = "domin8-ultimate-tilt-proof-tournament";
const DOTA_CHANNEL = "1504863767203283051";
const TEAM_NAMES: Record<string, string> = {
  "team-1": "10k ke Pohe",
  "team-2": "Toxic but Talented",
  "team-3": "Versatile Dogs",
  "team-4": "Dog Tamers",
};

async function main() {
  const db = getFirestore();
  const tag = APPLY ? "" : "[dry-run] ";

  // ── 1. Delete test tournament ─────────────────────────────────────────────
  const testRef = db.collection("tournaments").doc(TEST_TID);
  const testSnap = await testRef.get();
  if (testSnap.exists) {
    console.log(`${tag}DELETE tournaments/${TEST_TID} (recursive)`);
    if (APPLY) await db.recursiveDelete(testRef);
  } else {
    console.log(`tournaments/${TEST_TID} already gone`);
  }
  // its bot queue + lobbies
  const qid = `tournament_${TEST_TID}_r1-match-1_g1`;
  const qRef = db.collection("botQueues").doc(qid);
  if ((await qRef.get()).exists) {
    console.log(`${tag}DELETE botQueues/${qid}`);
    if (APPLY) await qRef.delete();
  }
  const lobs = await db.collection("botLobbies").where("queueId", "==", qid).get();
  for (const d of lobs.docs) {
    console.log(`${tag}DELETE botLobbies/${d.id}`);
    if (APPLY) await d.ref.delete();
  }

  // ── 2. Route Domin8 to the dota channel ───────────────────────────────────
  const dRef = db.collection("tournaments").doc(DOMIN8);
  const dSnap = await dRef.get();
  if (!dSnap.exists) { console.log(`❌ ${DOMIN8} not found`); process.exit(1); }
  console.log(`${tag}SET ${DOMIN8}.discordChannelId = ${DOTA_CHANNEL} (was ${dSnap.data()?.discordChannelId || "—"})`);
  if (APPLY) await dRef.update({ discordChannelId: DOTA_CHANNEL });

  // ── 3. Rename teams + propagate to matches ────────────────────────────────
  for (const [teamId, newName] of Object.entries(TEAM_NAMES)) {
    const tRef = dRef.collection("teams").doc(teamId);
    const t = (await tRef.get()).data();
    console.log(`${tag}RENAME teams/${teamId}: "${t?.teamName || "—"}" → "${newName}"`);
    if (APPLY) await tRef.update({ teamName: newName });
  }
  const matches = await dRef.collection("matches").get();
  for (const m of matches.docs) {
    const d = m.data();
    const t1 = TEAM_NAMES[d.team1Id];
    const t2 = TEAM_NAMES[d.team2Id];
    if (!t1 && !t2) continue;
    const upd: any = {};
    if (t1) upd.team1Name = t1;
    if (t2) upd.team2Name = t2;
    console.log(`${tag}MATCH ${m.id}: ${d.team1Name}→${upd.team1Name ?? d.team1Name} | ${d.team2Name}→${upd.team2Name ?? d.team2Name}`);
    if (APPLY) await m.ref.update(upd);
  }

  console.log(APPLY ? "\n✅ Applied." : "\n🟡 Dry run — re-run with --apply.");
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
