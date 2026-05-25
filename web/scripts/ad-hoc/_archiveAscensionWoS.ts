/**
 * Archive this week's wall-of-shame entries on the Ascension Valorant
 * tournament so the thanks-mode view starts from an empty wall, but
 * nothing is lost — copies live to a dated archive subcollection.
 *
 * After this runs:
 *   - valorantTournaments/{tid}/wallOfShame/                  (live, EMPTIED)
 *   - valorantTournaments/{tid}/wallOfShameArchive/{weekId}/entries/...
 *     (preserved, immutable record of who was on the wall this week)
 *
 * Each archive bucket also gets a top-level metadata doc with the
 * archive date, source week, and original entry count so it's easy to
 * find/restore later via the admin panel.
 *
 *   Dry run:  npx tsx scripts/ad-hoc/_archiveAscensionWoS.ts
 *   Apply:    npx tsx scripts/ad-hoc/_archiveAscensionWoS.ts --apply
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
const db = getFirestore();

const TID = "league-of-rising-stars-ascension";
const COLLECTION = "valorantTournaments";
const APPLY = process.argv.includes("--apply");

// Week identifier — ISO week format e.g. "2026-W22". Used as archive doc id.
function isoWeek(d: Date): string {
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

(async () => {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN (pass --apply to commit)"}\n`);

  const tref = db.collection(COLLECTION).doc(TID);
  const liveSnap = await tref.collection("wallOfShame").get();
  console.log(`Live entries on wall: ${liveSnap.size}`);
  if (liveSnap.empty) {
    console.log("Nothing to archive. Done.");
    return;
  }

  const weekId = isoWeek(new Date()); // e.g. 2026-W22
  const archiveRef = tref.collection("wallOfShameArchive").doc(weekId);
  console.log(`Archive bucket: wallOfShameArchive/${weekId}`);

  let copied = 0;
  for (const d of liveSnap.docs) {
    const data = d.data();
    console.log(`  • ${d.id}  kind=${data.kind || "?"}  reportedBy=${data.reportedBy || "?"}`);
    if (APPLY) {
      // Copy main entry
      await archiveRef.collection("entries").doc(d.id).set({
        ...data,
        _archivedAt: new Date().toISOString(),
        _originalId: d.id,
      });
      // Copy the votes subcollection too (preserves community vote history)
      const votesSnap = await d.ref.collection("votes").get();
      for (const v of votesSnap.docs) {
        await archiveRef.collection("entries").doc(d.id).collection("votes").doc(v.id).set(v.data());
      }
      copied++;
    } else {
      copied++;
    }
  }

  if (APPLY) {
    // Write archive metadata
    await archiveRef.set({
      tournamentId: TID,
      weekId,
      archivedAt: new Date().toISOString(),
      entryCount: copied,
      reason: "Replaced with thanks-mode for week starting 2026-05-25",
    });
    // Wipe the live entries (votes subcollections too — Firestore needs
    // explicit delete since subcollections aren't cascaded)
    for (const d of liveSnap.docs) {
      const votesSnap = await d.ref.collection("votes").get();
      for (const v of votesSnap.docs) await v.ref.delete();
      await d.ref.delete();
    }
    console.log(`\n✅ Archived ${copied} entries → wallOfShameArchive/${weekId}/entries`);
    console.log(`✅ Live wallOfShame collection emptied. Thanks-mode panel will render with no carry-over.`);
  } else {
    console.log(`\n🟡 DRY RUN — would archive ${copied} entries to wallOfShameArchive/${weekId}/entries`);
    console.log("Re-run with --apply to commit.");
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
