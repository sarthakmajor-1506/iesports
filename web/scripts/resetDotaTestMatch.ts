/**
 * Reset the Major-vs-Shrey test match back to "pending" so the admin
 * panel can re-trigger "Set Lobby & Notify" from scratch.
 *
 * What it does:
 *   1. Deletes the associated `botQueues` doc — without this the
 *      /api/valorant/match-update route short-circuits with
 *      "Lobby already being created by the bot for this match."
 *   2. Strips the lobby-related fields off the match doc and zeroes scores.
 *
 *   npx tsx scripts/resetDotaTestMatch.ts            # dry-run
 *   npx tsx scripts/resetDotaTestMatch.ts --apply    # actually reset
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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

const TID = "dota-test-major-shrey";
const MID = "r1-match-1";
const APPLY = process.argv.includes("--apply");

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);

  const matchRef = db.collection("tournaments").doc(TID).collection("matches").doc(MID);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) throw new Error(`tournaments/${TID}/matches/${MID} not found`);
  const m = matchSnap.data() as any;
  console.log(`\nMatch before reset:`);
  console.log(`  status=${m.status}  lobbyName=${m.lobbyName ?? "—"}  lobbyPassword=${m.lobbyPassword ?? "—"}`);
  console.log(`  botQueueId=${m.botQueueId ?? "—"}  lobbyStatus=${m.lobbyStatus ?? "—"}`);
  console.log(`  scores: ${m.team1Score ?? 0}-${m.team2Score ?? 0}`);

  // Collect every botQueues doc tied to this match — usually 1 (g1) but in
  // theory a multi-game BO could leave multiple stale rows.
  const queueSnap = await db.collection("botQueues")
    .where("tournamentId", "==", TID)
    .where("tournamentMatchId", "==", MID)
    .get();
  console.log(`\nbotQueues docs to delete: ${queueSnap.size}`);
  for (const q of queueSnap.docs) {
    const x: any = q.data();
    console.log(`  ${q.id}  status=${x.status}  lobbyId=${x.lobbyId ?? "—"}`);
  }

  if (!APPLY) {
    console.log("\n🟡 DRY RUN — pass --apply to commit.");
    return;
  }

  const batch = db.batch();

  for (const q of queueSnap.docs) batch.delete(q.ref);

  batch.update(matchRef, {
    status: "pending",
    team1Score: 0,
    team2Score: 0,
    // Lobby/queue artefacts — wipe so the admin panel returns to the
    // "Set Lobby & Notify" first-time state.
    botQueueId: FieldValue.delete(),
    lobbyName: FieldValue.delete(),
    lobbyPassword: FieldValue.delete(),
    lobbyMode: FieldValue.delete(),
    lobbyStatus: FieldValue.delete(),
    lobbySetAt: FieldValue.delete(),
    team1Subs: FieldValue.delete(),
    team2Subs: FieldValue.delete(),
    // Veto / toss state lives only after `action: "toss"` runs — clear
    // pre-emptively so a stale partial veto doesn't carry over.
    vetoState: FieldValue.delete(),
    // If a previous game ran and stamped scores, those lived under
    // `game1` (Dota) / `games.gameN` (Valorant). Strip both shapes.
    game1: FieldValue.delete(),
    games: FieldValue.delete(),
    winnerTeamId: FieldValue.delete(),
    completedAt: FieldValue.delete(),
    startedAt: FieldValue.delete(),
    dotaMatchId: FieldValue.delete(),
    durationSec: FieldValue.delete(),
    dataSource: FieldValue.delete(),
  });

  await batch.commit();
  console.log("\n✅ Reset complete — match is `pending` and queue rows are gone.");
  console.log("    Admin panel will now show the empty 'Set Lobby & Notify' state for this match.");
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
