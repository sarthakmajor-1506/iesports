/**
 * Repair: the Horizon tournament's denormalized playersSnapshot still listed
 * two players after they were removed.
 *
 * The unregister route refreshes that snapshot correctly; the ad-hoc cleanup
 * script I used to clear these registrations deleted the soloPlayers documents
 * directly and never refreshed it, so the Players tab kept rendering names for
 * a tournament reporting 0/20.
 *
 *   npx tsx scripts/ad-hoc/_fixHorizonSnapshot.ts --apply
 */
import { config } from "dotenv";
import * as path from "path";
config({ path: path.resolve(__dirname, "../../.env.local") });

const APPLY = process.argv.includes("--apply");

(async () => {
  const { adminDb } = await import("../../lib/firebaseAdmin");
  const { syncPlayerSnapshot } = await import("../../lib/valorantPlayerSnapshot");
  const TID = "league-of-rising-stars-horizon";

  const ref = adminDb.collection("valorantTournaments").doc(TID);
  const before: any = (await ref.get()).data();
  const players = await ref.collection("soloPlayers").get();

  console.log(`soloPlayers (source of truth): ${players.size}`);
  console.log(`playersSnapshot (denormalized): ${(before.playersSnapshot || []).length}`);

  if (!APPLY) { console.log("DRY RUN — re-run with --apply"); return; }

  await syncPlayerSnapshot(TID);
  const after: any = (await ref.get()).data();
  console.log(`→ playersSnapshot now: ${(after.playersSnapshot || []).length}`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
