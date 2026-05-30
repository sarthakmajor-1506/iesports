import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
})});
const db = getFirestore();
const TID = "league-of-rising-stars-ascension";
const APPLY = process.argv.includes("--apply");

// Sunday 2026-05-31, IST → UTC (subtract 5:30)
const PLAN: Array<{ id: string; iso: string; istLabel: string }> = [
  { id: "wb-r1-m1",   iso: "2026-05-31T05:00:00Z", istLabel: "Sun May 31, 10:30 AM IST (Game 1)" },
  { id: "wb-semi-m1", iso: "2026-05-31T07:30:00Z", istLabel: "Sun May 31, 01:00 PM IST (Game 2)" },
  { id: "wb-r1-m2",   iso: "2026-05-31T10:00:00Z", istLabel: "Sun May 31, 03:30 PM IST (Game 3)" },
  { id: "wb-semi-m2", iso: "2026-05-31T12:30:00Z", istLabel: "Sun May 31, 06:00 PM IST (Game 4)" },
];

(async () => {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN (pass --apply to commit)"}\n`);
  for (const p of PLAN) {
    const ref = db.collection("valorantTournaments").doc(TID).collection("matches").doc(p.id);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`  SKIP ${p.id} (not found)`); continue; }
    const cur = snap.data() as any;
    console.log(`  ${p.id}: ${cur.scheduledTime || "(unscheduled)"} → ${p.iso}  [${p.istLabel}]  ${cur.team1Name || "TBD"} vs ${cur.team2Name || "TBD"}`);
    if (APPLY) await ref.set({ scheduledTime: p.iso, matchDay: 6 }, { merge: true });
  }
  console.log(APPLY ? "\nApplied." : "\nDry-run only. Re-run with --apply.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
