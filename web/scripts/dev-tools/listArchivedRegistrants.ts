/**
 * Dump the archived registrants of a tournament — the people who had signed up
 * before a registry wipe, kept so they can be invited back.
 *
 * Written for the September 2026 paid relaunch (see
 * `scripts/ad-hoc/_relaunchSep2026Paid.ts`), but works for any tournament that
 * has an `archivedRegistrants` subcollection.
 *
 * Read-only. Prints a table plus CSV you can paste into a messaging tool.
 *
 *   npx tsx scripts/dev-tools/listArchivedRegistrants.ts
 *   npx tsx scripts/dev-tools/listArchivedRegistrants.ts cs2Tournaments cs2-prelims-april-2026
 *   npx tsx scripts/dev-tools/listArchivedRegistrants.ts --pending   # not yet messaged
 *   npx tsx scripts/dev-tools/listArchivedRegistrants.ts --csv       # CSV only
 */

import { config } from "dotenv";
import * as path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

const DEFAULTS: Array<[string, string]> = [
  ["cs2Tournaments", "cs2-prelims-april-2026"],
  ["valorantTournaments", "league-of-rising-stars-horizon"],
];

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const positional = args.filter((a) => !a.startsWith("--"));
const PENDING_ONLY = flags.includes("--pending");
const CSV_ONLY = flags.includes("--csv");

const targets: Array<[string, string]> =
  positional.length >= 2 ? [[positional[0], positional[1]]] : DEFAULTS;

(async () => {
  const csvRows: string[] = ["tournament,uid,name,handle,phone,discord,source,outreachStatus"];

  for (const [collection, tid] of targets) {
    const ref = db.collection(collection).doc(tid);
    const t = (await ref.get()).data() || {};
    let snap = await ref.collection("archivedRegistrants").get();

    let docs = snap.docs;
    if (PENDING_ONLY) docs = docs.filter((d) => (d.data().outreachStatus || "pending") === "pending");

    if (!CSV_ONLY) {
      console.log(`\n${t.name || tid}  (${collection}/${tid})`);
      console.log(`${docs.length} archived registrant(s)${PENDING_ONLY ? " pending outreach" : ""}\n`);
    }

    for (const d of docs) {
      const a = d.data();
      const handle = a.riotGameName
        ? `${a.riotGameName}#${a.riotTagLine}`
        : a.steamName || "";
      const discord = a.discordUsername || a.discordId || "";

      if (!CSV_ONLY) {
        console.log(
          `  ${String(a.fullName || "-").padEnd(24)} ${String(handle).padEnd(26)} ` +
          `${String(a.phone || "-").padEnd(16)} ${String(discord || "-").padEnd(22)} ` +
          `${String(a.source || "-").padEnd(12)} ${a.outreachStatus || "pending"}`
        );
      }

      csvRows.push(
        [t.name || tid, d.id, a.fullName || "", handle, a.phone || "", discord, a.source || "", a.outreachStatus || "pending"]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      );
    }

    if (!CSV_ONLY) {
      const noContact = docs.filter((d) => !d.data().phone && !d.data().discordId).length;
      if (noContact > 0) console.log(`\n  ${noContact} of these have no phone and no Discord — unreachable.`);
    }
  }

  if (CSV_ONLY || flags.includes("--with-csv")) {
    console.log(`\n${csvRows.join("\n")}`);
  } else {
    console.log(`\nRe-run with --csv for a paste-ready CSV.`);
  }
})()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
