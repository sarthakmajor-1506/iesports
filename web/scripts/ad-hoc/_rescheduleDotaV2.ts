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
const TID = "domin8-ultimate-tilt-proof-tournament";
const APPLY = process.argv.includes("--apply");
const PLAN: Array<{ id: string; iso: string; istLabel: string }> = [
  { id: "r2-match-5", iso: "2026-05-30T17:30:00Z", istLabel: "Sat May 30, 11:00 PM IST" },
  { id: "r2-match-6", iso: "2026-05-30T19:00:00Z", istLabel: "Sun May 31, 12:30 AM IST" },
  { id: "r3-match-4", iso: "2026-05-30T20:30:00Z", istLabel: "Sun May 31, 02:00 AM IST" },
  { id: "r3-match-5", iso: "2026-05-30T22:00:00Z", istLabel: "Sun May 31, 03:30 AM IST" },
  { id: "r3-match-6", iso: "2026-05-30T23:30:00Z", istLabel: "Sun May 31, 05:00 AM IST" },
  { id: "r3-match-1", iso: "2026-06-06T17:30:00Z", istLabel: "Sat Jun 6, 11:00 PM IST" },
  { id: "r3-match-2", iso: "2026-06-06T19:00:00Z", istLabel: "Sun Jun 7, 12:30 AM IST" },
  { id: "r3-match-3", iso: "2026-06-06T20:30:00Z", istLabel: "Sun Jun 7, 02:00 AM IST" },
];
(async () => {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN (pass --apply to commit)"}\n`);
  for (const p of PLAN) {
    const ref = db.collection("tournaments").doc(TID).collection("matches").doc(p.id);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`  SKIP ${p.id} (not found)`); continue; }
    const cur = snap.data() as any;
    if (cur.status === "completed") { console.log(`  SKIP ${p.id} (completed)`); continue; }
    console.log(`  ${p.id}: ${cur.scheduledTime} → ${p.iso}  [${p.istLabel}]  ${cur.team1Name} vs ${cur.team2Name}`);
    if (APPLY) await ref.set({ scheduledTime: p.iso }, { merge: true });
  }
  console.log(APPLY ? "\nApplied." : "\nDry-run only. Re-run with --apply.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
