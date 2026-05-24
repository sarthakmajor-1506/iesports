/**
 * SOFT reset of a tournament match — clears ONLY the admin-side match
 * doc fields (status, lobby creds, scores) so the admin panel shows it as
 * pending. Does NOT:
 *   - destroy the bot's active Dota lobby
 *   - touch botLobbyControl/state
 *   - delete the botQueue
 *   - touch existing Discord VCs
 *
 * Use when you want a fresh admin view but the bot lobby is still live
 * or you don't want to disturb players already in voice.
 *
 *   npx tsx scripts/_softResetMatch.ts <tournamentId> <matchId>
 *   npx tsx scripts/_softResetMatch.ts domin8-ultimate-tilt-proof-tournament r2-match-2
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
const db = getFirestore();

const TID = process.argv[2];
const MID = process.argv[3];
if (!TID || !MID) {
  console.error("Usage: npx tsx scripts/_softResetMatch.ts <tournamentId> <matchId>");
  process.exit(1);
}

(async () => {
  const ref = db.collection("tournaments").doc(TID).collection("matches").doc(MID);
  const before = (await ref.get()).data() as any;
  if (!before) { console.error(`Match ${TID}/${MID} not found`); process.exit(1); }
  console.log(`BEFORE: status=${before.status}, lobbyName=${before.lobbyName || "—"}, botQueueId=${before.botQueueId || "—"}`);

  await ref.update({
    status: "pending",
    botQueueId: FieldValue.delete(),
    lobbyName: FieldValue.delete(),
    lobbyPassword: FieldValue.delete(),
    lobbyMode: FieldValue.delete(),
    lobbyStatus: FieldValue.delete(),
    lobbySetAt: FieldValue.delete(),
    team1Subs: FieldValue.delete(),
    team2Subs: FieldValue.delete(),
  });
  console.log(`\n✅ ${TID}/${MID} soft-reset. Bot lobby + VCs + queue UNTOUCHED.`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
