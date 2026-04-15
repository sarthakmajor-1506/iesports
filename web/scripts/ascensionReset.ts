import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

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

const TID = "league-of-rising-stars-ascension";
const REMOVE_UIDS = [
  { uid: "discord_492009843801063427", label: "Zneako#4285" },
  { uid: "discord_761873895694794752", label: "Chai#JALA" },
  { uid: "discord_759854712429740063", label: "DINERO#888" },
];

// "Open registration till tomorrow" — today is 2026-04-15, so end of day IST tomorrow.
const NEW_DEADLINE_ISO_UTC = "2026-04-16T18:29:00.000Z"; // 2026-04-16 23:59 IST
const NEW_DEADLINE_ISO_IST = "2026-04-16T23:59:00+05:30";

async function run() {
  const tRef = db.collection("valorantTournaments").doc(TID);
  const tSnap = await tRef.get();
  if (!tSnap.exists) throw new Error("Tournament missing");
  const before = tSnap.data()!;
  console.log(
    `Before: slotsBooked=${before.slotsBooked}, deadline=${before.registrationDeadline}, teamsGenerated=${before.teamsGenerated}`
  );

  // 1. Remove players ────────────────────────────────────────────────
  const playersRef = tRef.collection("soloPlayers");
  for (const { uid, label } of REMOVE_UIDS) {
    const pSnap = await playersRef.doc(uid).get();
    if (!pSnap.exists) {
      console.warn(`  ! ${label} (${uid}) not in soloPlayers — skipping delete`);
    } else {
      await playersRef.doc(uid).delete();
      console.log(`  ✓ deleted soloPlayers/${uid} (${label})`);
    }

    const userRef = db.collection("users").doc(uid);
    const uSnap = await userRef.get();
    if (uSnap.exists) {
      await userRef.update({
        registeredValorantTournaments: FieldValue.arrayRemove(TID),
      });
      console.log(`  ✓ removed TID from users/${uid}.registeredValorantTournaments`);
    } else {
      console.log(`  - users/${uid} missing (no update)`);
    }

    const lbDoc = await tRef.collection("leaderboard").doc(uid).get();
    if (lbDoc.exists) {
      await lbDoc.ref.delete();
      console.log(`  ✓ deleted leaderboard/${uid}`);
    }
    const stDoc = await tRef.collection("standings").doc(uid).get();
    if (stDoc.exists) {
      await stDoc.ref.delete();
      console.log(`  ✓ deleted standings/${uid}`);
    }
  }

  // 2. Delete all teams in the subcollection ─────────────────────────
  const teamsSnap = await tRef.collection("teams").get();
  console.log(`\nDeleting ${teamsSnap.size} teams from subcollection...`);
  for (const td of teamsSnap.docs) {
    await td.ref.delete();
    console.log(`  ✓ deleted teams/${td.id}`);
  }

  // Also clean the top-level valorantTeams collection just in case
  // anything lingered there from an older code path.
  const topTeamsSnap = await db
    .collection("valorantTeams")
    .where("tournamentId", "==", TID)
    .get();
  if (topTeamsSnap.size > 0) {
    console.log(`Deleting ${topTeamsSnap.size} team docs from valorantTeams top-level...`);
    for (const td of topTeamsSnap.docs) {
      await td.ref.delete();
      console.log(`  ✓ deleted valorantTeams/${td.id}`);
    }
  }

  // 3. Tournament-level updates ──────────────────────────────────────
  const newSlotsBooked = Math.max(0, (before.slotsBooked || 0) - REMOVE_UIDS.length);
  const updates: Record<string, any> = {
    slotsBooked: newSlotsBooked,
    teamsGenerated: false,
    bracketsComputed: false,
    registrationDeadline: NEW_DEADLINE_ISO_UTC,
    "schedule.registrationCloses": NEW_DEADLINE_ISO_IST,
  };
  await tRef.update(updates);
  console.log(
    `\nTournament updated: slotsBooked=${newSlotsBooked}, deadline=${NEW_DEADLINE_ISO_UTC}, teamsGenerated=false`
  );

  // 4. Recalculate tiers for remaining players ───────────────────────
  const remaining = await playersRef.get();
  if (!remaining.empty) {
    const players = remaining.docs
      .map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          riotTier: data.iesportsTier || data.riotTier || 0,
          registeredAt: data.registeredAt || "",
        };
      })
      .sort(
        (a, b) =>
          b.riotTier - a.riotTier ||
          String(a.registeredAt).localeCompare(String(b.registeredAt))
      );
    const n = players.length;
    const t1 = Math.ceil(n / 4);
    const t2 = Math.ceil((n - t1) / 3);
    const t3 = Math.ceil((n - t1 - t2) / 2);
    const batch = db.batch();
    for (let i = 0; i < n; i++) {
      let tier: number;
      if (i < t1) tier = 1;
      else if (i < t1 + t2) tier = 2;
      else if (i < t1 + t2 + t3) tier = 3;
      else tier = 4;
      batch.update(playersRef.doc(players[i].uid), { skillLevel: tier });
    }
    await batch.commit();
    console.log(`Recalculated tiers for ${n} remaining players`);
  }

  console.log("\nDone.");
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
