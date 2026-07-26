/**
 * Ad-hoc: R3 ops for domin8-ultimate-tilt-proof-tournament
 *  1. Revert r3-match-1 (stuck "live" since May 30) back to upcoming/pending (mirror admin hard-reset field wipe + delete botQueues rows).
 *  2. Change r3-match-2 fixture: 10k ke Pohe (team-1) -> Toxic but Talented (team-2), vs Versatile Dogs (team-3).
 *  3. Reschedule the night (IST -> UTC):
 *       r3-match-2 (Toxic v Versatile)   game1  6 Jun 11:00 PM IST = 2026-06-06T17:30:00Z
 *       r3-match-4 (Toxic v Versatile)   game2  7 Jun 12:30 AM IST = 2026-06-06T19:00:00Z
 *       r3-match-3 (Pohe v Dog Tamers)   game3  7 Jun 02:00 AM IST = 2026-06-06T20:30:00Z
 *       r3-match-1 (Pohe v Toxic)        game4  7 Jun 03:30 AM IST = 2026-06-06T22:00:00Z
 *       r3-match-5 (Toxic v Dog Tamers)  game5  7 Jun 05:00 AM IST = 2026-06-06T23:30:00Z
 *
 *   npx tsx scripts/ad-hoc/_reschedDotaR3.ts          # dry-run
 *   npx tsx scripts/ad-hoc/_reschedDotaR3.ts --apply  # commit
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
})});
const db = getFirestore();
const TID = "domin8-ultimate-tilt-proof-tournament";
const APPLY = process.argv.includes("--apply");
const col = db.collection("tournaments").doc(TID).collection("matches");

const SLOT: Record<string, string> = {
  "r3-match-2": "2026-06-06T17:30:00Z", // 11:00 PM IST, 6 Jun  (game 1)
  "r3-match-4": "2026-06-06T19:00:00Z", // 12:30 AM IST, 7 Jun  (game 2)
  "r3-match-3": "2026-06-06T20:30:00Z", // 02:00 AM IST, 7 Jun  (game 3)
  "r3-match-1": "2026-06-06T22:00:00Z", // 03:30 AM IST, 7 Jun  (game 4)
  "r3-match-5": "2026-06-06T23:30:00Z", // 05:00 AM IST, 7 Jun  (game 5)
};
const ist = (z: string) => new Date(z).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  // ---- 1. revert r3-match-1 to upcoming (hard wipe of live cruft) ----
  const m1ref = col.doc("r3-match-1");
  const m1 = (await m1ref.get()).data() as any;
  console.log(`r3-match-1 BEFORE: status=${m1.status} dotaMatchId=${m1.dotaMatchId ?? "—"} lobbyStatus=${m1.lobbyStatus ?? "—"} startedAt=${m1.startedAt ?? "—"}`);
  const wipe = {
    status: "pending", team1Score: 0, team2Score: 0,
    botQueueId: FieldValue.delete(), lobbyName: FieldValue.delete(), lobbyPassword: FieldValue.delete(),
    lobbyMode: FieldValue.delete(), lobbyStatus: FieldValue.delete(), lobbySetAt: FieldValue.delete(),
    lastSetLobbyDiag: FieldValue.delete(), team1Subs: FieldValue.delete(), team2Subs: FieldValue.delete(),
    vetoState: FieldValue.delete(), game1: FieldValue.delete(), games: FieldValue.delete(),
    dotaMatchId: FieldValue.delete(), winner: FieldValue.delete(), winnerTeamId: FieldValue.delete(),
    completedAt: FieldValue.delete(), startedAt: FieldValue.delete(), durationSec: FieldValue.delete(),
    dataSource: FieldValue.delete(), result: FieldValue.delete(), playerStats: FieldValue.delete(),
    waitingRoomVcId: FieldValue.delete(), team1VcId: FieldValue.delete(), team2VcId: FieldValue.delete(),
    vcStatus: FieldValue.delete(), vcLiveStatus: FieldValue.delete(), discordOpsMessageIds: FieldValue.delete(),
    resultMessageId: FieldValue.delete(), resultMessageChannelId: FieldValue.delete(),
    scheduledTime: SLOT["r3-match-1"],
  };

  // stale botQueues rows for r3-match-1
  const q = await db.collection("botQueues").where("tournamentId", "==", TID).where("tournamentMatchId", "==", "r3-match-1").get();
  console.log(`  botQueues rows to delete for r3-match-1: ${q.size}`);

  // ---- 2. fixture change r3-match-2 ----
  const m2ref = col.doc("r3-match-2");
  const m2 = (await m2ref.get()).data() as any;
  console.log(`\nr3-match-2 BEFORE: ${m2.team1Name} (${m2.team1Id}) vs ${m2.team2Name} (${m2.team2Id})`);
  const m2fix = { team1Id: "team-2", team1Name: "Toxic but Talented", scheduledTime: SLOT["r3-match-2"] };
  console.log(`r3-match-2 AFTER : Toxic but Talented (team-2) vs ${m2.team2Name} (${m2.team2Id})  ⚠ duplicates r3-match-4`);

  // ---- 3. reschedule M3, M4, M5 (time only) ----
  const timeOnly = ["r3-match-3", "r3-match-4", "r3-match-5"];

  console.log("\n=== FINAL R3 NIGHT ORDER ===");
  const order = ["r3-match-2","r3-match-4","r3-match-3","r3-match-1","r3-match-5"];
  let g = 1;
  for (const id of order) {
    const d = (await col.doc(id).get()).data() as any;
    const t1 = id === "r3-match-2" ? "Toxic but Talented" : d.team1Name;
    console.log(`  game ${g++}: ${id.padEnd(11)} ${ist(SLOT[id])}  ${t1} vs ${d.team2Name}`);
  }

  if (!APPLY) { console.log("\n🟡 DRY-RUN — pass --apply to commit."); return; }

  const batch = db.batch();
  batch.update(m1ref, wipe);
  for (const d of q.docs) batch.delete(d.ref);
  batch.update(m2ref, m2fix);
  for (const id of timeOnly) batch.update(col.doc(id), { scheduledTime: SLOT[id] });
  await batch.commit();
  console.log("\n✅ Applied: r3-match-1 reverted to upcoming, r3-match-2 fixture changed, night rescheduled.");
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
