/**
 * Read the monthly draft board back exactly the way the GET route does, and
 * check the period helpers against the calendar. Read-only.
 *
 *   npx tsx scripts/ad-hoc/_verifyDraftMonthlyBoard.ts
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";
import { monthKey, monthLabel, msUntilMonthReset } from "../../lib/draftLadder";

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

/* Month boundaries, including the ones that bite: a 31-day month, a 30-day
 * month, December (year roll) and February in a leap year. */
const BOUNDARIES: [string, string, string][] = [
  ["2026-09-21T03:20:00Z", "2026-09", "2026-10-01"], // today, IST 08:50
  ["2026-09-30T18:29:00Z", "2026-09", "2026-10-01"], // IST 23:59 on the 30th
  ["2026-09-30T18:31:00Z", "2026-10", "2026-11-01"], // IST 00:01 on the 1st
  ["2026-10-31T12:00:00Z", "2026-10", "2026-11-01"], // a 31st — the overflow trap
  ["2026-12-31T12:00:00Z", "2026-12", "2027-01-01"], // year roll
  ["2028-02-29T12:00:00Z", "2028-02", "2028-03-01"], // leap day
];

const istDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

async function main() {
  console.log("— period helpers —");
  let bad = 0;
  for (const [iso, wantKey, wantReset] of BOUNDARIES) {
    const at = new Date(iso);
    const got = monthKey(at);
    const resetAt = istDate(at.getTime() + msUntilMonthReset(at));
    const ok = got === wantKey && resetAt === wantReset;
    if (!ok) bad++;
    console.log(
      `  ${ok ? "ok  " : "FAIL"} ${iso}  key=${got} (want ${wantKey})  resets ${resetAt} (want ${wantReset})`
    );
  }

  const month = monthKey();
  console.log(`\n— board as the route reads it: ${MONTHLY}/${month} — "${monthLabel(month)}" —`);
  const snap = await db.collection(MONTHLY).doc(month).collection("players")
    .orderBy("coins", "desc").limit(25).get();

  let total = 0;
  snap.docs.forEach((d, i) => {
    const x = d.data();
    total += x.coins ?? 0;
    console.log(
      `  ${String(i + 1).padStart(2)}. ${String(x.coins ?? 0).padStart(5)} coins  ` +
      `${String(x.games ?? 0).padStart(3)}g ${String(x.wins ?? 0).padStart(2)}W  ` +
      `${(x.name ?? "?").padEnd(20)} mergedFrom=[${(x.mergedFrom ?? []).join(",")}]`
    );
  });

  const days = msUntilMonthReset() / 86400000;
  console.log(`\n  ${snap.size} rows, ${total} coins.  Resets in ${days.toFixed(1)} days.`);
  console.log(bad ? `\n${bad} boundary check(s) FAILED.` : "\nAll boundary checks passed.");
}

const MONTHLY = "draftlabLadderMonthly";
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
