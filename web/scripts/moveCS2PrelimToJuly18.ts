/**
 * Move "CS2 Prelims" (cs2-prelims-april-2026) from 2026-05-23 → 2026-07-18.
 * 3rd Saturday of July 2026. All times of day stay unchanged.
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

const TID = "cs2-prelims-april-2026";
const OLD = "2026-05-23";
const OLDPREV = "2026-05-22"; // day before for reg deadline
const NEW = "2026-07-18";
const NEWPREV = "2026-07-17";

(async () => {
  const ref = db.collection("cs2Tournaments").doc(TID);
  const snap = await ref.get();
  if (!snap.exists) { console.error("Tournament not found"); process.exit(1); }
  const t = snap.data() as any;

  const shift = (s: string) =>
    typeof s === "string"
      ? s.startsWith(OLDPREV) ? s.replace(OLDPREV, NEWPREV)
      : s.startsWith(OLD) ? s.replace(OLD, NEW)
      : s
      : s;

  const updates: any = {
    startDate: shift(t.startDate),
    endDate: shift(t.endDate),
    registrationDeadline: shift(t.registrationDeadline),
    schedule: { ...t.schedule },
  };
  for (const k of Object.keys(t.schedule || {})) {
    updates.schedule[k] = shift(t.schedule[k]);
  }

  console.log("BEFORE:");
  console.log(`  startDate:            ${t.startDate}`);
  console.log(`  endDate:              ${t.endDate}`);
  console.log(`  registrationDeadline: ${t.registrationDeadline}`);
  console.log(`  schedule:             ${JSON.stringify(t.schedule, null, 4)}`);
  console.log("\nAFTER:");
  console.log(`  startDate:            ${updates.startDate}`);
  console.log(`  endDate:              ${updates.endDate}`);
  console.log(`  registrationDeadline: ${updates.registrationDeadline}`);
  console.log(`  schedule:             ${JSON.stringify(updates.schedule, null, 4)}`);

  await ref.set(updates, { merge: true });
  console.log("\n✅ Updated. Tournament moved to Sat July 18, 2026.");
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
