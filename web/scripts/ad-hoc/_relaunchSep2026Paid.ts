/**
 * Relaunch CS2 Prelims + Valorant Horizon as paid one-day events on the last
 * weekend of September 2026.
 *
 *   CS2 Prelims                     Sat 26 Sep 2026, 18:00-23:00 IST
 *   LEAGUE OF RISING STARS HORIZON  Sun 27 Sep 2026, 18:00-23:00 IST
 *
 * Both go to 20 slots, 500 rupee entry, 8,000 rupee prize pool (winner takes
 * all). The existing free-entry registry on both is wiped so everyone has to
 * re-register under the new paid terms.
 *
 * Nothing is thrown away. Every registrant and substitute is copied to
 * `<collection>/<tid>/archivedRegistrants/<uid>` first, with their phone,
 * Discord and game handle denormalised onto the archive doc, plus
 * `outreachStatus: "pending"` so the re-register campaign can track who has
 * been messaged. Dump the list with:
 *
 *   npx tsx scripts/dev-tools/listArchivedRegistrants.ts
 *
 * Horizon also drops from 8 teams to 4 (20 players at 5 a side), so its
 * generated teams, matches and standings are cleared: they describe an
 * 8-team, 6-week league that no longer exists.
 *
 * Run:
 *   npx tsx scripts/ad-hoc/_relaunchSep2026Paid.ts            # dry run, writes nothing
 *   npx tsx scripts/ad-hoc/_relaunchSep2026Paid.ts --apply    # commit
 */

import { config } from "dotenv";
import * as path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// web/.env.local is the documented home for the admin creds; fall back to the
// repo root for checkouts that keep it one level up.
config({ path: path.resolve(__dirname, "../../.env.local") });
config({ path: path.resolve(__dirname, "../../../.env.local") });

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
const APPLY = process.argv.includes("--apply");
const ARCHIVE_REASON = "paid-relaunch-sep-2026";

type Target = {
  label: string;
  collection: string;
  tid: string;
  userArrayField: string;
  game: "cs2" | "valorant";
  eventDate: string;   // YYYY-MM-DD, the single day it now runs on
  regCloses: string;   // YYYY-MM-DD, 3 days before, matching prior CS2 practice
  extraSubcollections: string[]; // wiped because they describe the old shape
  fields: Record<string, any>;
};

const IST = "+05:30";
const at = (day: string, hhmm: string) => `${day}T${hhmm}:00${IST}`;

const TARGETS: Target[] = [
  {
    label: "CS2 Prelims",
    collection: "cs2Tournaments",
    tid: "cs2-prelims-april-2026",
    userArrayField: "registeredCS2Tournaments",
    game: "cs2",
    eventDate: "2026-09-26",
    regCloses: "2026-09-23",
    extraSubcollections: ["matches"],
    fields: {
      totalSlots: 20,
      entryFee: 500,
      prizePool: "8,000",
      prizeDistribution: "Winner takes all",
      groupStageRounds: 3,
      desc:
        "CS2 Prelims — a one-day shuffle tournament. 500 rupee entry, 8,000 rupee prize pool, winner takes all. " +
        "Register solo, get drafted into a balanced team, and play it out in a single evening.",
      rules: [
        "All players must have a linked Steam account",
        "Entry fee: 500 rupees per player",
        "Prize pool: 8,000 rupees — winner takes all",
        "20 slots — 4 teams of 5",
        "Teams are formed via balanced shuffle (snake draft by skill level)",
        "CS2 rank will be verified by admin before tournament",
        "One-day event: group stage from 6 PM, playoffs from 9 PM IST",
        "Format: Swiss group stage followed by double elimination playoffs",
        "All matches played on official Valve servers",
      ],
    },
  },
  {
    label: "LEAGUE OF RISING STARS - HORIZON",
    collection: "valorantTournaments",
    tid: "league-of-rising-stars-horizon",
    userArrayField: "registeredValorantTournaments",
    game: "valorant",
    eventDate: "2026-09-27",
    regCloses: "2026-09-24",
    extraSubcollections: ["teams", "matches", "standings"],
    fields: {
      totalSlots: 20,
      entryFee: 500,
      prizePool: "8,000",
      prizeDistribution: "Winner takes all",

      // 20 players at 5 a side is 4 teams, not 8. Bracket halves follow.
      totalTeams: 4,
      playersPerTeam: 5,
      upperBracketTeams: 2,
      lowerBracketTeams: 2,

      // 4 teams play a 3-round round robin, not 5 Swiss rounds.
      groupStageRounds: 3,
      swissRounds: 3,
      matchesPerRound: 2,

      // Compressed to fit a single 6-11 PM evening. A BO3 Valorant series runs
      // ~2.5h, so groups and the early bracket are BO1 with only the grand
      // final at BO3.
      bracketFormat: "double_elimination",
      bracketBestOf: 1,
      eliminationBestOf: 1,
      lbFinalBestOf: 1,
      grandFinalBestOf: 3,

      // Registry is gone, so every derived flag resets with it.
      teamsGenerated: false,
      bracketGenerated: false,
      bracketsComputed: false,
      currentMatchDay: 0,
      playersSnapshot: [],
      playersSnapshotUpdatedAt: null,
      bracketSize: FieldValue.delete(),
      bracketTeams: FieldValue.delete(),
      bracketTeamCount: FieldValue.delete(),
      ubTeamCount: FieldValue.delete(),
      championTeamId: FieldValue.delete(),

      desc:
        "LEAGUE OF RISING STARS - HORIZON — a one-day, fully online, shuffle-based Valorant tournament. " +
        "500 rupee entry, 8,000 rupee prize pool, winner takes all. Register solo, get drafted into a " +
        "tier-balanced team, and settle it in one evening. Powered by iesports.",
      rules: [
        "Shuffle-Based Teams (Tier-balanced)",
        "100% Online — play from home, no venue required",
        "Entry fee: 500 rupees per player",
        "Prize pool: 8,000 rupees — winner takes all",
        "20 slots — 4 teams of 5",
        "Register solo — teams are auto-generated with balanced skill levels after registration closes",
        "24th September - Registration Closes",
        "27th September - Team Formation (4 PM), Group Stage (6 PM), Playoffs (9 PM)",
        "One-day event: everything finishes on 27th September",
        "Rank Requirement: Gold → Immortal",
      ],
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function scheduleFor(t: Target, existingOpens?: string) {
  return {
    // Registration is already open on both, so the open date is preserved
    // rather than pushed forward — re-registration starts the moment this runs.
    registrationOpens: existingOpens || at(t.regCloses, "00:00"),
    registrationCloses: at(t.regCloses, "23:59"),
    squadCreation: at(t.eventDate, "16:00"),
    groupStageStart: at(t.eventDate, "18:00"),
    groupStageEnd: at(t.eventDate, "21:00"),
    tourneyStageStart: at(t.eventDate, "21:00"),
    tourneyStageEnd: at(t.eventDate, "23:00"),
  };
}

/** Copy a registrant plus their contact details onto the archive doc. */
async function archiveEntry(
  t: Target,
  uid: string,
  source: "soloPlayers" | "waitlist",
  entry: Record<string, any>,
  tournamentName: string
) {
  const userSnap = await db.collection("users").doc(uid).get();
  const u = userSnap.data() || {};

  const archived: Record<string, any> = {
    uid,
    source,
    tournamentId: t.tid,
    tournamentName,
    archivedAt: new Date().toISOString(),
    archivedReason: ARCHIVE_REASON,
    outreachStatus: "pending",

    // Contact details, denormalised so the campaign never has to re-join users.
    fullName: u.fullName || entry.fullName || "",
    phone: u.phone || u.phoneNumber || entry.phone || "",
    discordId: u.discordId || entry.discordId || "",
    discordUsername: u.discordUsername || entry.discordUsername || "",

    registeredAt: entry.registeredAt || entry.addedAt || "",
  };

  if (t.game === "valorant") {
    archived.riotGameName = u.riotGameName || entry.riotGameName || "";
    archived.riotTagLine = u.riotTagLine || entry.riotTagLine || "";
    archived.riotRank = entry.riotRank || u.riotRank || "";
    archived.iesportsRating = entry.iesportsRating ?? u.iesportsRating ?? null;
  } else {
    archived.steamId = u.steamId || entry.steamId || "";
    archived.steamName = u.steamName || entry.steamName || "";
  }

  return archived;
}

async function run(t: Target) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`${t.label}  (${t.collection}/${t.tid})`);
  console.log("=".repeat(72));

  const ref = db.collection(t.collection).doc(t.tid);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`  ERROR tournament not found, skipping`);
    return;
  }
  const before = snap.data() || {};

  console.log("\nBEFORE");
  console.log(`  startDate            ${before.startDate}`);
  console.log(`  endDate              ${before.endDate}`);
  console.log(`  registrationDeadline ${before.registrationDeadline}`);
  console.log(`  totalSlots           ${before.totalSlots}`);
  console.log(`  slotsBooked          ${before.slotsBooked}`);
  console.log(`  entryFee             ${before.entryFee}`);
  console.log(`  prizePool            ${before.prizePool}`);

  // ── Collect the registry ──────────────────────────────────────────────────
  const soloSnap = await ref.collection("soloPlayers").get();
  const waitSnap = await ref.collection("waitlist").get();
  console.log(`\nREGISTRY  ${soloSnap.size} registered · ${waitSnap.size} substitutes`);

  const archives: Array<{ uid: string; doc: Record<string, any> }> = [];
  for (const d of soloSnap.docs) {
    archives.push({ uid: d.id, doc: await archiveEntry(t, d.id, "soloPlayers", d.data(), before.name || t.label) });
  }
  for (const d of waitSnap.docs) {
    if (archives.some((a) => a.uid === d.id)) continue; // already captured as a registrant
    archives.push({ uid: d.id, doc: await archiveEntry(t, d.id, "waitlist", d.data(), before.name || t.label) });
  }

  for (const a of archives) {
    const who = t.game === "valorant"
      ? `${a.doc.riotGameName}#${a.doc.riotTagLine}`
      : a.doc.steamName;
    const reach = [a.doc.phone, a.doc.discordUsername || a.doc.discordId].filter(Boolean).join(" · ") || "NO CONTACT";
    console.log(`  archive ${a.doc.source.padEnd(12)} ${a.uid.padEnd(30)} ${String(who).padEnd(26)} ${reach}`);
  }

  // ── Stale subcollections from the old tournament shape ────────────────────
  const staleCounts: Record<string, number> = {};
  for (const sub of t.extraSubcollections) {
    const s = await ref.collection(sub).get();
    staleCounts[sub] = s.size;
    if (s.size > 0) console.log(`  clearing ${s.size} doc(s) from subcollection "${sub}"`);
  }

  // ── New tournament fields ─────────────────────────────────────────────────
  const updates: Record<string, any> = {
    ...t.fields,
    status: "upcoming",
    slotsBooked: 0,
    startDate: at(t.eventDate, "18:00"),
    endDate: at(t.eventDate, "23:00"),
    registrationDeadline: at(t.regCloses, "23:59"),
    schedule: scheduleFor(t, before.schedule?.registrationOpens),
  };

  console.log("\nAFTER");
  console.log(`  startDate            ${updates.startDate}`);
  console.log(`  endDate              ${updates.endDate}`);
  console.log(`  registrationDeadline ${updates.registrationDeadline}`);
  console.log(`  totalSlots           ${updates.totalSlots}`);
  console.log(`  slotsBooked          ${updates.slotsBooked}`);
  console.log(`  entryFee             ${updates.entryFee}`);
  console.log(`  prizePool            ${updates.prizePool} (${updates.prizeDistribution})`);
  console.log(`  schedule             ${JSON.stringify(updates.schedule, null, 4)}`);

  if (!APPLY) {
    console.log(`\n  DRY RUN — nothing written. Re-run with --apply to commit.`);
    return;
  }

  // ── Write: archive first, wipe second, update last ────────────────────────
  for (const a of archives) {
    await ref.collection("archivedRegistrants").doc(a.uid).set(a.doc);
  }
  console.log(`\n  archived ${archives.length} entries -> ${t.collection}/${t.tid}/archivedRegistrants`);

  for (const d of soloSnap.docs) await d.ref.delete();
  for (const d of waitSnap.docs) await d.ref.delete();
  console.log(`  deleted ${soloSnap.size} registrations, ${waitSnap.size} substitute entries`);

  let userUpdates = 0;
  for (const a of archives) {
    if (a.doc.source !== "soloPlayers") continue;
    const userRef = db.collection("users").doc(a.uid);
    if (!(await userRef.get()).exists) continue;
    await userRef.update({ [t.userArrayField]: FieldValue.arrayRemove(t.tid) });
    userUpdates++;
  }
  console.log(`  removed tournament from ${userUpdates} users' ${t.userArrayField}`);

  for (const sub of t.extraSubcollections) {
    if (!staleCounts[sub]) continue;
    const s = await ref.collection(sub).get();
    for (const d of s.docs) await d.ref.delete();
    console.log(`  cleared subcollection "${sub}" (${s.size} docs)`);
  }

  await ref.update(updates);
  console.log(`  tournament doc updated`);
}

(async () => {
  console.log(APPLY ? "MODE: APPLY (writing to production)" : "MODE: DRY RUN (no writes)");
  for (const t of TARGETS) await run(t);
  console.log(
    APPLY
      ? "\nDone. Both tournaments are live on their new dates with an empty registry."
      : "\nDry run complete. Re-run with --apply to commit."
  );
})()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
