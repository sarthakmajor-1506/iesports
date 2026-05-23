/**
 * Restore status=completed + winner on Domin8 r1-match-1 and r1-match-2.
 * These had been manually scored earlier (playerStats present, scores set)
 * but were mistakenly reset to pending by _cleanWrongMatchIds.ts earlier
 * today when it stripped the wrong dotaMatchId stamps.
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
const TID = "domin8-ultimate-tilt-proof-tournament";

(async () => {
  for (const mid of ["r1-match-1", "r1-match-2"]) {
    const ref = db.collection("tournaments").doc(TID).collection("matches").doc(mid);
    const d: any = (await ref.get()).data();
    if (!d) { console.log(`${mid} not found`); continue; }
    const t1 = d.team1Score ?? 0;
    const t2 = d.team2Score ?? 0;
    let winner: "team1" | "team2" | null = null;
    if (t1 > t2) winner = "team1";
    else if (t2 > t1) winner = "team2";
    if (!winner) { console.log(`${mid} score ${t1}-${t2} is a tie, skipping`); continue; }
    const nowIso = new Date().toISOString();
    await ref.set({
      status: "completed",
      winner,
      completedAt: d.completedAt || nowIso, // preserve original time if it had one
    }, { merge: true });
    const wn = winner === "team1" ? d.team1Name : d.team2Name;
    console.log(`✓ ${mid}: status=completed, winner=${winner} (${wn}), score=${t1}-${t2}`);
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
