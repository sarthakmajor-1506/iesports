/**
 * Domin8 Day-2 schedule (23 May 2026 IST onward).
 *
 * Day 1 left r1-match-4 (10k ke Pohe vs Dog Tamers) un-played. Day 2 plays
 * that carryover plus a fresh Round-2 rematch of the same pair back-to-back,
 * then three Round-2 fixtures involving the other two teams. 1.5-hour slots
 * starting 11 PM IST on 23 May.
 *
 *   M1  23 May 23:00 IST       r1-match-4  10k ke Pohe vs Dog Tamers      (carryover from Day 1)
 *   M2  24 May 00:30 IST       r2-match-1  10k ke Pohe vs Dog Tamers      (R2 rematch in continuation)
 *   M3  24 May 02:00 IST       r2-match-2  Versatile Dogs vs 10k ke Pohe
 *   M4  24 May 03:30 IST       r2-match-3  Versatile Dogs vs Toxic but Talented
 *   M5  24 May 05:00 IST       r2-match-4  Toxic but Talented vs Dog Tamers
 *
 *   npx tsx scripts/seedDomin8Day2Schedule.ts            # dry-run
 *   npx tsx scripts/seedDomin8Day2Schedule.ts --apply    # write Firestore
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
const TID = "domin8-ultimate-tilt-proof-tournament";
const APPLY = process.argv.includes("--apply");

// 23 May 23:00 IST = 17:30 UTC. Each slot is +1.5h.
const SLOTS_ISO_UTC = [
  "2026-05-23T17:30:00Z",  // 23 May 23:00 IST
  "2026-05-23T19:00:00Z",  // 24 May 00:30 IST
  "2026-05-23T20:30:00Z",  // 24 May 02:00 IST
  "2026-05-23T22:00:00Z",  // 24 May 03:30 IST
  "2026-05-23T23:30:00Z",  // 24 May 05:00 IST
];

// Slot 1 is the existing carryover doc (updated, not recreated). Slots 2–4
// are brand-new Round-2 fixtures. Round-robin pairing chosen so each of the
// 4 teams plays exactly twice on Day 2 — see header comment.
type Plan = {
  matchDocId: string;
  scheduledTime: string;
  matchDay: number;       // round number, not calendar day
  matchIndex: number;
  team1Id: string;
  team2Id: string;
  isExisting: boolean;
};

// Slot 1 is r1-match-4 (carryover). Slot 2 is a fresh Round-2 rematch of the
// same pair so the lobby/format can run back-to-back without disrupting the
// other teams. Slots 3–5 are the originally planned VD/TbT round-robin.
// r2-match-1 deliberately mirrors r1-match-4's matchup (10k vs DT) — that's
// the user-requested "2 times in continuation" pattern.
const PLAN: Plan[] = [
  { matchDocId: "r1-match-4", scheduledTime: SLOTS_ISO_UTC[0], matchDay: 1, matchIndex: 4, team1Id: "team-1", team2Id: "team-4", isExisting: true },
  { matchDocId: "r2-match-1", scheduledTime: SLOTS_ISO_UTC[1], matchDay: 2, matchIndex: 1, team1Id: "team-1", team2Id: "team-4", isExisting: false },
  { matchDocId: "r2-match-2", scheduledTime: SLOTS_ISO_UTC[2], matchDay: 2, matchIndex: 2, team1Id: "team-3", team2Id: "team-1", isExisting: false },
  { matchDocId: "r2-match-3", scheduledTime: SLOTS_ISO_UTC[3], matchDay: 2, matchIndex: 3, team1Id: "team-3", team2Id: "team-2", isExisting: false },
  { matchDocId: "r2-match-4", scheduledTime: SLOTS_ISO_UTC[4], matchDay: 2, matchIndex: 4, team1Id: "team-2", team2Id: "team-4", isExisting: false },
];

const fmtIST = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`Tournament: ${TID}\n`);

  const tRef = db.collection("tournaments").doc(TID);
  const tDoc = await tRef.get();
  if (!tDoc.exists) throw new Error(`Tournament ${TID} not found`);

  // Pull team docs to resolve names + logos for the new fixtures.
  const teamsSnap = await tRef.collection("teams").get();
  const teams = new Map<string, { name: string; logo: string }>();
  for (const d of teamsSnap.docs) {
    const td: any = d.data();
    teams.set(d.id, { name: td.teamName || td.name || d.id, logo: td.logo || "" });
  }

  // Sanity: every team referenced exists.
  for (const p of PLAN) {
    if (!teams.has(p.team1Id) || !teams.has(p.team2Id)) {
      throw new Error(`Plan references unknown team(s) — ${p.matchDocId}: ${p.team1Id} / ${p.team2Id}`);
    }
  }

  // Match-count per team. The carryover-then-rematch sequence (M1+M2 both
  // 10k vs DT) pushes those two teams to 3 matches today by design — VD/TbT
  // sit at 2. Print for visibility, don't enforce.
  const tally: Record<string, number> = {};
  for (const p of PLAN) {
    tally[p.team1Id] = (tally[p.team1Id] || 0) + 1;
    tally[p.team2Id] = (tally[p.team2Id] || 0) + 1;
  }
  console.log("Day-2 match count per team:");
  for (const [tid, n] of Object.entries(tally)) console.log(`  ${(teams.get(tid)?.name || tid).padEnd(22)} ${n}`);
  console.log();

  console.log("Schedule:");
  for (const p of PLAN) {
    const a = teams.get(p.team1Id)!.name, b = teams.get(p.team2Id)!.name;
    console.log(`  ${p.matchDocId}  ${fmtIST(p.scheduledTime).padEnd(22)}  ${a.padEnd(22)} vs ${b.padEnd(22)}  ${p.isExisting ? "(update)" : "(create)"}`);
  }

  if (!APPLY) {
    console.log("\n🟡 DRY RUN — pass --apply to commit.");
    return;
  }

  const batch = db.batch();

  for (const p of PLAN) {
    const t1 = teams.get(p.team1Id)!, t2 = teams.get(p.team2Id)!;
    const ref = tRef.collection("matches").doc(p.matchDocId);

    if (p.isExisting) {
      // Carryover: keep team identifiers as-is, just bump the time. The
      // existing r1-match-4 is already 10k vs Dog Tamers; we don't disturb
      // status/scores/etc., only the scheduledTime.
      batch.set(ref, { scheduledTime: p.scheduledTime }, { merge: true });
    } else {
      batch.set(ref, {
        id: p.matchDocId,
        tournamentId: TID,
        team1Id: p.team1Id, team2Id: p.team2Id,
        team1Name: t1.name, team2Name: t2.name,
        team1Logo: t1.logo, team2Logo: t2.logo,
        team1Score: 0, team2Score: 0,
        bestOf: 1,
        matchDay: p.matchDay,
        matchIndex: p.matchIndex,
        isBracket: false,
        status: "pending",
        scheduledTime: p.scheduledTime,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Bump tournament-level metadata: groupStageRounds → 2 so the UI knows
  // Round 2 exists, and stamp a Day-2 schedule entry on the schedule blob.
  const tData: any = tDoc.data() || {};
  const schedule = { ...(tData.schedule || {}) };
  schedule.day2Start = SLOTS_ISO_UTC[0];
  schedule.day2End = SLOTS_ISO_UTC[SLOTS_ISO_UTC.length - 1];
  batch.set(tRef, {
    groupStageRounds: 2,
    schedule,
  }, { merge: true });

  await batch.commit();
  const updateCount = PLAN.filter(p => p.isExisting).length;
  const createCount = PLAN.length - updateCount;
  console.log(`\n✅ Wrote Day-2 schedule (${updateCount} update + ${createCount} creates + tournament meta).`);
  console.log(`   Slots span ${fmtIST(SLOTS_ISO_UTC[0])} → ${fmtIST(SLOTS_ISO_UTC[SLOTS_ISO_UTC.length - 1])} IST.`);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
