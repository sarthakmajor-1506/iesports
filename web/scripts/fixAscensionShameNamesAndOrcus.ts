/**
 * Two fixes on the Ascension Wall of Shame:
 * 1. Promote Orcus from "warning" to "wanted".
 * 2. Strip the one real-name leak ("Naitik" → "OmeGaJOD") in the OmeGaJOD entry.
 *
 *   npx tsx scripts/fixAscensionShameNamesAndOrcus.ts            ← dry-run
 *   npx tsx scripts/fixAscensionShameNamesAndOrcus.ts --write    ← commit
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
const ORCUS_UID = "discord_741592452485480488";
const OMEGA_UID = "discord_549242125892714517";
const write = process.argv.includes("--write");

const NEW_OMEGA_REASON =
  "Full marks for the courtesy 'running late' text. Zero marks for actually showing up on time. The text said 'almost there' — the timestamps said otherwise. Match started late so OmeGaJOD could finish his chai in peace.";

const NEW_ORCUS_REASON =
  "Ghosted the entire week. Resurfaced at his own match time with a single dramatic 'bhai Jaipur se aa raha hu, exhausted hu, nahi aa paunga.' Bro, that's not an RSVP — that's a hostage note with extra steps. The team and the bracket deserved better.";

async function run() {
  const shameCol = db
    .collection("valorantTournaments").doc(TID)
    .collection("wallOfShame");
  const snap = await shameCol.get();
  const active = snap.docs.filter((d) => d.data().archived !== true);

  const orcusDocs = active.filter((d) => d.data().uid === ORCUS_UID);
  const omegaDocs = active.filter((d) => d.data().uid === OMEGA_UID);

  console.log(`Active entries for Orcus: ${orcusDocs.length}`);
  console.log(`Active entries for OmeGaJOD: ${omegaDocs.length}\n`);

  for (const d of orcusDocs) {
    const x = d.data();
    console.log(`── ${x.playerName} (${d.id}) ──`);
    console.log(`  type: ${x.type} → wanted`);
    console.log(`  OLD reason: ${x.reason}`);
    console.log(`  NEW reason: ${NEW_ORCUS_REASON}\n`);
  }
  for (const d of omegaDocs) {
    const x = d.data();
    console.log(`── ${x.playerName} (${d.id}) ──`);
    console.log(`  OLD reason: ${x.reason}`);
    console.log(`  NEW reason: ${NEW_OMEGA_REASON}\n`);
  }

  if (!write) {
    console.log(`🟡 DRY RUN — pass --write to apply.`);
    process.exit(0);
  }

  const batch = db.batch();
  for (const d of orcusDocs) {
    batch.update(d.ref, { type: "wanted", reason: NEW_ORCUS_REASON, updatedAt: new Date().toISOString() });
  }
  for (const d of omegaDocs) {
    batch.update(d.ref, { reason: NEW_OMEGA_REASON, updatedAt: new Date().toISOString() });
  }
  await batch.commit();
  console.log(`✅ Updated ${orcusDocs.length} Orcus + ${omegaDocs.length} OmeGaJOD doc(s).`);
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
