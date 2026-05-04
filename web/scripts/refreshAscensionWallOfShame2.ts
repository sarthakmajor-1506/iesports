/**
 * Second refresh of the Ascension Wall of Shame.
 *
 * 1. Archives every currently-active entry (sets archived: true) — they vanish
 *    from the UI but the docs stay for audit. The /api/valorant/wall-of-shame
 *    GET handler already filters by archived !== true.
 * 2. Adds 6 new "warning" entries for the players the operator flagged this
 *    week (oNuz/harsh30, Jayesh, Naitik, Palli, Pranav/Orcus, SullieD).
 *
 *   npx tsx scripts/refreshAscensionWallOfShame2.ts            ← dry-run
 *   npx tsx scripts/refreshAscensionWallOfShame2.ts --write    ← commit
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

type Seed = { uid: string; reason: string; label: string };

const SEEDS: Seed[] = [
  {
    uid: "discord_434297152664109077", // oNuz / Harsh Agrawal — "harsh30"
    label: "oNuz",
    reason: "Hit snooze a few too many times. Slept right past kickoff and rolled in late — the lobby isn't your bedside table, set an alarm.",
  },
  {
    uid: "discord_1236462584505438208", // Zorohunter / Jayesh Saxena
    label: "Zorohunter",
    reason: "Calls went unanswered, messages got left on read, zero heads-up about being late. The bracket isn't a guessing game — pick up the phone.",
  },
  {
    uid: "discord_601601191893532696", // SullieD
    label: "SullieD",
    reason: "Phone ignored, DMs ignored, captains left in the dark. Showed up late with no warning — the lobby is not on your schedule.",
  },
  {
    uid: "discord_549242125892714517", // OmeGaJOD / Naitik Mandani
    label: "OmeGaJOD",
    reason: "Sent a 'running late' text and still managed to roll in well after kickoff. The whole match started late because of it — texts don't pause the bracket.",
  },
  {
    uid: "discord_540619628510969866", // Palli
    label: "Palli",
    reason: "Texted that he was on his way, then took the scenic route. Match start got pushed because Palli was 'almost there' for way too long.",
  },
  {
    uid: "discord_741592452485480488", // Orcus / Pranav Nama
    label: "Orcus",
    reason: "Zero info all week. At his own match time on tourney day, dropped a 'just got back from Jaipur bro, exhausted, can't make it' message. Tournament RSVPs aren't optional — that's a no-show with extra steps.",
  },
];

async function run() {
  const tournRef = db.collection("valorantTournaments").doc(TID);
  const tournSnap = await tournRef.get();
  if (!tournSnap.exists) {
    console.error(`Tournament ${TID} not found`);
    process.exit(1);
  }
  const shameCol = tournRef.collection("wallOfShame");

  // ── Inspect current entries ────────────────────────────────────────────
  const existing = await shameCol.get();
  const active = existing.docs.filter((d) => d.data().archived !== true);
  const alreadyArchived = existing.docs.filter((d) => d.data().archived === true);
  console.log(`Tournament: ${tournSnap.data()?.name || TID}`);
  console.log(`Existing wallOfShame docs: ${existing.size}  (active=${active.length}, archived=${alreadyArchived.length})\n`);

  console.log("── Will archive (active → archived: true) ──");
  for (const d of active) {
    const x = d.data();
    console.log(`  ${(x.type || "?").padEnd(8)} ${(x.playerName || x.uid).padEnd(20)} ${d.id}`);
  }
  console.log();

  // ── Resolve new entries from users collection ──────────────────────────
  console.log("── Will create new warnings ──");
  const newEntries: any[] = [];
  for (const s of SEEDS) {
    const u = (await db.collection("users").doc(s.uid).get()).data();
    if (!u) {
      console.warn(`  ⚠ skip: user ${s.uid} (${s.label}) not found`);
      continue;
    }
    const playerName = u.riotGameName || u.steamName || u.fullName || u.discordUsername || s.uid;
    const playerAvatar = u.riotAvatar || u.discordAvatar || u.steamAvatar || "";
    const riotGameName = u.riotGameName || "";
    const riotTagLine = u.riotTagLine || "";
    newEntries.push({
      uid: s.uid,
      playerName,
      playerAvatar,
      riotGameName,
      riotTagLine,
      type: "warning",
      reason: s.reason,
      createdAt: new Date().toISOString(),
      createdBy: "refresh2-script",
      tomatoCount: 0,
      bailCount: 0,
    });
    console.log(`  warning  ${playerName.padEnd(20)} ← ${s.reason}`);
  }
  console.log();

  if (!write) {
    console.log(`🟡 DRY RUN — pass --write to apply.`);
    process.exit(0);
  }

  // ── Archive ───────────────────────────────────────────────────────────
  const archiveBatch = db.batch();
  for (const d of active) {
    archiveBatch.update(d.ref, {
      archived: true,
      archivedAt: new Date().toISOString(),
    });
  }
  await archiveBatch.commit();
  console.log(`✓ Archived ${active.length} active entries`);

  // ── Create new ────────────────────────────────────────────────────────
  for (const e of newEntries) {
    const added = await shameCol.add(e);
    console.log(`✓ Created warning  ${e.playerName} (${added.id})`);
  }
  console.log(`\n✅ Done — ${newEntries.length} new warnings live, ${active.length} previous entries archived.`);
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
