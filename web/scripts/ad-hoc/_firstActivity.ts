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
(async () => {
  // Find earliest completed match across all tournaments to know "first real match"
  const earliestByCol: Record<string, { id: string; date: string; teams: string }> = {};
  for (const col of ["tournaments", "valorantTournaments", "cs2Tournaments"]) {
    const ts = await db.collection(col).get();
    for (const td of ts.docs) {
      const ms = await td.ref.collection("matches").where("status", "==", "completed").get();
      for (const m of ms.docs) {
        const data = m.data() as any;
        const t = data.completedAt || data.scheduledTime;
        if (!t) continue;
        if (!earliestByCol[col] || t < earliestByCol[col].date) {
          earliestByCol[col] = { id: `${td.id}/${m.id}`, date: t, teams: `${data.team1Name} vs ${data.team2Name}` };
        }
      }
    }
  }
  for (const [col, info] of Object.entries(earliestByCol)) {
    console.log(`  ${col}: first completed = ${info.date} | ${info.id} | ${info.teams}`);
  }
  // Count recent activity (last 14 days)
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  let recent = 0;
  for (const col of ["tournaments", "valorantTournaments"]) {
    const ts = await db.collection(col).get();
    for (const td of ts.docs) {
      const ms = await td.ref.collection("matches").where("status", "==", "completed").get();
      for (const m of ms.docs) {
        const t = (m.data() as any).completedAt || "";
        if (t > cutoff) recent++;
      }
    }
  }
  console.log(`\nMatches completed in last 14 days: ${recent}`);
  // Distinct users registered to any tournament
  const distinctRegistered = new Set<string>();
  for (const col of ["tournaments", "valorantTournaments"]) {
    const ts = await db.collection(col).get();
    for (const td of ts.docs) {
      const sp = await td.ref.collection("soloPlayers").get();
      sp.docs.forEach(d => distinctRegistered.add(d.id));
      const teams = await td.ref.collection("teams").get();
      teams.docs.forEach(t => {
        const members = (t.data() as any).members || [];
        members.forEach((m: any) => {
          if (m.uid) distinctRegistered.add(m.uid);
          else if (typeof m === "string") distinctRegistered.add(m);
        });
      });
    }
  }
  console.log(`Distinct UIDs ever registered to any tournament: ${distinctRegistered.size}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
