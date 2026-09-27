/**
 * Hide Valorant Horizon from every public list (27 Sep 2026).
 *
 * Registration closed on 24 Sep with no teams, so the landing page was still
 * leading with an event nobody entered. `isTestTournament` is the flag the
 * landing page (lib/featuredTournaments.ts) and /api/tournaments/list already
 * respect — the admin panel calls it "hidden from users". The detail page stays
 * reachable by direct link, which the refund conversations still point at.
 *
 * Reversible: `npx tsx scripts/ad-hoc/_hideHorizon.ts --unhide`.
 */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const ID = "league-of-rising-stars-horizon";

(async () => {
  const { adminDb } = await import("../../lib/firebaseAdmin");
  const { FieldValue } = await import("firebase-admin/firestore");
  const ref = adminDb.collection("valorantTournaments").doc(ID);
  const unhide = process.argv.includes("--unhide");
  const teams = (await ref.collection("teams").count().get()).data().count;
  if (!unhide && teams > 0) throw new Error(`${ID} has ${teams} team(s) — not hiding a tournament people are in`);
  await ref.update(unhide
    ? { isTestTournament: FieldValue.delete(), hiddenReason: FieldValue.delete() }
    : { isTestTournament: true, hiddenReason: "No teams registered; hidden 27 Sep 2026" });
  const t = (await ref.get()).data()!;
  console.log(ID, { isTestTournament: t.isTestTournament ?? null, hiddenReason: t.hiddenReason ?? null });
  process.exit(0);
})();
