/**
 * One-off, 2 Aug 2026.
 *
 * Horizon: drop the two players who registered before the payment gate existed
 * and were therefore never charged.
 *
 * CS2 Prelims: reset to a clean, correctly-priced tournament — ₹500 entry,
 * 20 slots, ₹8,000 prize pool, Sunday 13 September 2026, no registrations.
 * It currently holds a ₹1 test price and two test registrations (one of them
 * from the live payment test).
 *
 * Unregistering rewrites three places per player — the tournament's players
 * subcollection, its slot count, and the user's registered-tournaments array —
 * so it is done here rather than by hand.
 *
 *   npx tsx scripts/ad-hoc/_resetPrelimsAndHorizon.ts
 *   npx tsx scripts/ad-hoc/_resetPrelimsAndHorizon.ts --apply
 */
import { config } from "dotenv";
import * as path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

config({ path: path.resolve(__dirname, "../../.env.local") });

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

/** Remove every solo registration from a tournament and zero its slot count. */
async function clearPlayers(collection: string, id: string, registeredField: string) {
  const ref = db.collection(collection).doc(id);
  const players = await ref.collection("soloPlayers").get();

  console.log(`  ${players.size} registration(s) to remove`);
  for (const p of players.docs) {
    const u = await db.collection("users").doc(p.id).get();
    console.log(`    - ${p.id}  ${(u.data() as any)?.fullName || "?"}`);
    if (!APPLY) continue;
    await p.ref.delete();
    await db.collection("users").doc(p.id).update({ [registeredField]: FieldValue.arrayRemove(id) }).catch(() => {});
  }
  if (APPLY) await ref.update({ slotsBooked: 0 });
}

(async () => {
  console.log(`=== Horizon — remove unpaid registrations ===`);
  await clearPlayers("valorantTournaments", "league-of-rising-stars-horizon", "registeredValorantTournaments");

  console.log(`\n=== CS2 Prelims — reset ===`);
  await clearPlayers("cs2Tournaments", "cs2-prelims-april-2026", "registeredCS2Tournaments");

  // Sunday 13 September 2026. First match 11:00 IST, per the round-robin
  // schedule (11:00 / 13:00 / 15:00, then the BO3 final).
  const update = {
    entryFee: 500,
    totalSlots: 20,
    prizePool: "8,000",
    startDate: "2026-09-13T11:00:00+05:30",
    endDate: "2026-09-13T19:00:00+05:30",
    registrationDeadline: "2026-09-11T23:59:00+05:30",
    status: "upcoming",
  };
  console.log(`  applying:`, JSON.stringify(update, null, 2).replace(/\n/g, "\n  "));
  if (APPLY) await db.collection("cs2Tournaments").doc("cs2-prelims-april-2026").update(update);

  // The paid-entry grants from testing must go too, or those accounts would
  // still hold a claim to a free slot in the reset tournament.
  const ents = await db.collection("paidEntries").where("tournamentId", "==", "cs2-prelims-april-2026").get();
  console.log(`\n  ${ents.size} test entitlement(s) to clear`);
  for (const e of ents.docs) {
    console.log(`    - ${e.id}`);
    if (APPLY) await e.ref.delete();
  }

  console.log(APPLY ? "\ndone." : "\nDRY RUN — re-run with --apply");
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
