/**
 * Draft board: fold the old weekly buckets into the new monthly ones.
 *
 * WHY. The board was keyed by week (`draftlabLadderWeekly/{Monday-IST}`). On
 * Monday 21 Sep 2026 the key rolled and the board went blank — not because
 * anything was deleted, but because the only bucket that had ever been written
 * (`2026-09-14`, four players, 747 coins, all earned on 20 Sep) was no longer
 * the bucket being read. The board is now keyed by calendar month
 * (`draftlabLadderMonthly/{YYYY-MM}`), so that evening belongs in `2026-09`.
 *
 * WHICH MONTH A WEEK BELONGS TO. Its Monday's month. A week that straddles a
 * month boundary therefore lands wholly in the month it started in. That is a
 * real approximation and it cannot be improved: the weekly documents are
 * aggregates — coins, games, wins — with no per-game dates to split on.
 *
 * ADDITIVE, AND SAFE TO RUN TWICE. Coins are summed into whatever the monthly
 * document already holds (a player may have played today, after the roll), so
 * a blind re-run would double them. Each monthly document therefore records
 * the week ids already folded into it in `mergedFrom`, and a week already
 * listed there is skipped.
 *
 * Nothing is deleted. `draftlabLadderWeekly` is left exactly as it is, as the
 * backup this script is reversible against.
 *
 *   npx tsx scripts/ad-hoc/_mergeDraftWeeklyIntoMonthly.ts            # dry run
 *   npx tsx scripts/ad-hoc/_mergeDraftWeeklyIntoMonthly.ts --apply    # writes
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();
const WEEKLY = "draftlabLadderWeekly";
const MONTHLY = "draftlabLadderMonthly";
const APPLY = process.argv.includes("--apply");

/** A week bucket id (its Monday, `YYYY-MM-DD`) to the month it belongs to. */
const monthOfWeek = (weekId: string): string => weekId.slice(0, 7);

type Row = {
  uid?: string; name?: string; avatar?: string | null;
  coins?: number; games?: number; wins?: number;
  lastAt?: Timestamp; mergedFrom?: string[];
};

async function main() {
  const weeks = (await db.collection(WEEKLY).listDocuments()).map((d) => d.id).sort();
  if (!weeks.length) {
    console.log("No weekly buckets found — nothing to merge.");
    return;
  }
  console.log(`${APPLY ? "APPLYING" : "DRY RUN"} — week buckets: ${weeks.join(", ")}\n`);

  let written = 0, skipped = 0;

  for (const week of weeks) {
    const month = monthOfWeek(week);
    const players = await db.collection(WEEKLY).doc(week).collection("players").get();
    console.log(`${week} → ${month}  (${players.size} players)`);

    for (const doc of players.docs) {
      const src = doc.data() as Row;
      const uid = src.uid ?? doc.id;
      const destRef = db.collection(MONTHLY).doc(month).collection("players").doc(uid);
      const destSnap = await destRef.get();
      const dest = (destSnap.exists ? destSnap.data() : {}) as Row;

      const already = dest.mergedFrom ?? [];
      if (already.includes(week)) {
        console.log(`   skip  ${(src.name ?? uid).padEnd(20)} — ${week} already merged`);
        skipped++;
        continue;
      }

      // The later of the two timestamps, so "last played" never goes backwards.
      const srcLast = src.lastAt, destLast = dest.lastAt;
      const lastAt = !destLast ? srcLast
        : !srcLast ? destLast
        : srcLast.toMillis() > destLast.toMillis() ? srcLast : destLast;

      const next = {
        uid,
        // The monthly row's own identity wins when it has one: it was written
        // more recently, by the same account lookup (draftIdentity.ts).
        name: dest.name ?? src.name ?? "Anonymous",
        avatar: dest.avatar ?? src.avatar ?? null,
        coins: (dest.coins ?? 0) + (src.coins ?? 0),
        games: (dest.games ?? 0) + (src.games ?? 0),
        wins: (dest.wins ?? 0) + (src.wins ?? 0),
        ...(lastAt ? { lastAt } : {}),
        mergedFrom: [...already, week],
      };

      console.log(
        `   ${APPLY ? "write" : "would"} ${(next.name ?? uid).padEnd(20)}` +
        ` coins ${dest.coins ?? 0} + ${src.coins ?? 0} = ${next.coins}` +
        `   games ${next.games}  wins ${next.wins}`
      );

      if (APPLY) await destRef.set(next, { merge: true });
      written++;
    }
  }

  console.log(`\n${APPLY ? "Wrote" : "Would write"} ${written} row(s); skipped ${skipped} already-merged.`);
  if (!APPLY) console.log("Re-run with --apply to write.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
