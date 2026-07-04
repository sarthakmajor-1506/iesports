/**
 * CS2 Prelims (cs2-prelims-april-2026): move tournament date to 2026-07-28,
 * registration deadline to 2026-07-25, and expand capacity 20 -> 40 slots.
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

const updates = {
  totalSlots: 40,
  startDate: "2026-07-28T18:00:00+05:30",
  endDate: "2026-07-28T23:00:00+05:30",
  registrationDeadline: "2026-07-25T23:59:00+05:30",
  schedule: {
    registrationOpens: "2026-04-27T00:00:00+05:30",
    registrationCloses: "2026-07-25T23:59:00+05:30",
    squadCreation: "2026-07-28T16:00:00+05:30",
    groupStageStart: "2026-07-28T18:00:00+05:30",
    groupStageEnd: "2026-07-28T21:00:00+05:30",
    tourneyStageStart: "2026-07-28T21:00:00+05:30",
    tourneyStageEnd: "2026-07-28T23:00:00+05:30",
  },
};

(async () => {
  const ref = db.collection("cs2Tournaments").doc(TID);
  const snap = await ref.get();
  if (!snap.exists) { console.error("Tournament not found"); process.exit(1); }
  const before = snap.data() as any;
  console.log("BEFORE:", JSON.stringify({ totalSlots: before.totalSlots, startDate: before.startDate, endDate: before.endDate, registrationDeadline: before.registrationDeadline, schedule: before.schedule }, null, 2));

  await ref.set(updates, { merge: true });
  console.log("\n✅ Updated. totalSlots=40, tournament date 28 Jul 2026, reg deadline 25 Jul 2026.");
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
