/**
 * Rewrite the 6 active Ascension Wall of Shame warning messages to be funnier
 * and non-repeating. Updates docs in place by uid match.
 *
 *   npx tsx scripts/updateAscensionShameMessages.ts            ← dry-run
 *   npx tsx scripts/updateAscensionShameMessages.ts --write    ← commit
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
const write = process.argv.includes("--write");

const NEW_REASONS: Record<string, string> = {
  // oNuz / harsh30 — overslept
  "discord_434297152664109077":
    "Set five alarms. Slept through five alarms. Match kickoff came and went, oNuz was still deep in REM doing dream warmups. The bracket waited; the dream did not get interrupted.",

  // Zorohunter / Jayesh — ignored calls + DMs
  "discord_1236462584505438208":
    "Captains called. Teammates called. Customer care would've called too if they had the number. Zero pickups, zero replies, full ghost-mode — and then Zorohunter strolled in late anyway, completely unbothered.",

  // SullieD — ignored calls + DMs (different angle)
  "discord_601601191893532696":
    "Phone clearly on airplane mode, brain clearly on lunch break. Pings stacked up like an unread inbox at year-end. Rocked up late with the swagger of a man who has never once heard a notification chime.",

  // OmeGaJOD / Naitik — texted but still came late
  "discord_549242125892714517":
    "Full marks for the courtesy 'running late' text. Zero marks for actually showing up on time. The text said 'almost there' — the timestamps say otherwise. Match started late so Naitik could finish his chai in peace.",

  // Palli — said on my way, took forever
  "discord_540619628510969866":
    "Said 'on my way' the way most of us say 'I'll start the gym Monday.' Bracket frozen, captains pacing, lobby music on its 47th loop — Palli was apparently circumnavigating the country.",

  // Orcus / Pranav — vanished all week, last-minute Jaipur excuse
  "discord_741592452485480488":
    "MIA the entire week. Resurfaced at his own match time with a single dramatic 'bhai Jaipur se aa raha hu, exhausted hu, nahi aa paunga.' Bro, that's not an RSVP — that's a hostage note with extra steps. The team and the bracket deserved better.",
};

async function run() {
  const shameCol = db
    .collection("valorantTournaments").doc(TID)
    .collection("wallOfShame");
  const snap = await shameCol.get();

  const updates: { docId: string; uid: string; playerName: string; oldReason: string; newReason: string }[] = [];
  const missing: string[] = [];

  const seenUids = new Set<string>();
  for (const d of snap.docs) {
    const x = d.data();
    if (x.archived === true) continue;
    if (!NEW_REASONS[x.uid]) continue;
    if (seenUids.has(x.uid)) continue; // first active match only
    seenUids.add(x.uid);
    updates.push({
      docId: d.id,
      uid: x.uid,
      playerName: x.playerName || x.uid,
      oldReason: x.reason || "",
      newReason: NEW_REASONS[x.uid],
    });
  }
  for (const uid of Object.keys(NEW_REASONS)) {
    if (!seenUids.has(uid)) missing.push(uid);
  }

  console.log(`Will update ${updates.length} docs:\n`);
  for (const u of updates) {
    console.log(`── ${u.playerName} (${u.docId}) ──`);
    console.log(`  OLD: ${u.oldReason}`);
    console.log(`  NEW: ${u.newReason}\n`);
  }
  if (missing.length) {
    console.log(`⚠ No active doc found for uids:`);
    for (const m of missing) console.log(`  ${m}`);
    console.log();
  }

  if (!write) {
    console.log(`🟡 DRY RUN — pass --write to apply.`);
    process.exit(0);
  }

  const batch = db.batch();
  for (const u of updates) {
    batch.update(shameCol.doc(u.docId), {
      reason: u.newReason,
      updatedAt: new Date().toISOString(),
    });
  }
  await batch.commit();
  console.log(`✅ Updated ${updates.length} reasons.`);
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
