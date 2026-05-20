/**
 * Third refresh of the Ascension Wall of Shame.
 *
 * 1. Archives every currently-active entry (archived: true) — they vanish
 *    from the UI but the docs stay for audit. The /api/valorant/wall-of-shame
 *    GET filters archived !== true.
 * 2. Adds 6 new "warning" entries for this week's latecomers
 *    (Sarvagya, Omegajod, Harsh30/oNuz, Sahil/PooKiePiGGiE, Cudder, Harsh Jashnani).
 *
 * Notification badge: the WallOfShame component flags any entry with an ID
 * not in the user's localStorage seen-set, so fresh docs auto-trigger the
 * badge. The localStorage version was also bumped (v2 → v3) in the component
 * to force a re-light for everyone, including users who'd dismissed v2.
 *
 *   npx tsx scripts/refreshAscensionWallOfShame3.ts            ← dry-run
 *   npx tsx scripts/refreshAscensionWallOfShame3.ts --write    ← commit
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

type Seed = { uid: string; label: string; reason: string };

const SEEDS: Seed[] = [
  {
    uid: "discord_1050616956329402369", // Tremolo#Migs / playwithforge / Sarvagya Jain
    label: "Sarvagya",
    reason: "Late again — and still not a single 'sorry' or heads-up. Pure 'jo karna hai karlo' energy. The bracket isn't waiting on your shrug — show up on time or send a damn message.",
  },
  {
    uid: "discord_549242125892714517", // OmeGaJOD / Naitik Mandani
    label: "OmeGaJOD",
    reason: "Second strike. 'Ghar door hai' was the reason last week too — at this point it's not an excuse, it's a pattern. Leave earlier or the lobby leaves without you.",
  },
  {
    uid: "discord_434297152664109077", // oNuz / Harsh Agrawal — harsh30
    label: "oNuz (harsh30)",
    reason: "Saturday-night plans cost Sunday morning's match its start time. Hangover ke chakkar mein lobby ka chakkar miss ho gaya — set an alarm, not just a tab.",
  },
  {
    uid: "discord_825094685873668166", // PooKiePiGGiE#619 / babypiggie. / Sahil Kataria
    label: "PooKiePiGGiE (Sahil)",
    reason: "Slept clean through kickoff. Phone alarm vs nap — nap won, captains lost. The bedroom isn't a lobby; set the alarm and actually get there.",
  },
  {
    uid: "discord_1162674846765940766", // cudder0507#5481
    label: "cudder0507",
    reason: "Rolled in late, no heads-up, lobby left waiting. The bracket runs on a clock, not on vibes — a one-line 'I'm late' text isn't that hard.",
  },
  {
    uid: "discord_770374213239963658", // SpiriT#1210 / spirit6904 / Harsh Jashnani
    label: "SpiriT (Harsh Jashnani)",
    reason: "Late to the lobby with the whole match waiting on you. Five seconds to send 'I'm running late' — that's all it takes to keep your captains and 9 other players in the loop.",
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
    console.log(`  ${(x.type || "?").padEnd(8)} ${(x.playerName || x.uid).padEnd(24)} ${d.id}`);
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
      createdBy: "refresh3-script",
      tomatoCount: 0,
      bailCount: 0,
    });
    console.log(`  warning  ${playerName.padEnd(24)} ← ${s.reason.slice(0, 110)}${s.reason.length > 110 ? "…" : ""}`);
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
