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
(async () => {
  const matches = await db.collection("tournaments").doc(TID).collection("matches").get();
  const rows: any[] = [];
  matches.docs.forEach(d => {
    const m = d.data() as any;
    rows.push({ id: d.id, matchDay: m.matchDay, status: m.status, scheduledTime: m.scheduledTime, team1: m.team1Name, team2: m.team2Name, isBracket: !!m.isBracket });
  });
  rows.sort((a, b) => String(a.scheduledTime || "z").localeCompare(String(b.scheduledTime || "z")));
  console.log("--- ALL MATCHES ---");
  rows.forEach(r => {
    const dt = r.scheduledTime ? new Date(r.scheduledTime) : null;
    const isoIST = dt ? new Date(dt.getTime() + 5.5 * 3600 * 1000).toISOString().replace("Z", "+05:30") : null;
    console.log(`  ${r.id} | day=${r.matchDay} | status=${r.status} | ${r.scheduledTime} ${isoIST ? `(IST ${isoIST})` : ""} | ${r.team1} vs ${r.team2} | bracket=${r.isBracket}`);
  });
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
