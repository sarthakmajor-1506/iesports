import { config } from 'dotenv';
config({ path: '/Users/sjain/Documents/iesports/iesports/web/.env.local' });
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  })});
}
const db = getFirestore();
(async () => {
  const snap = await db.collection('valorantTournaments').doc('league-of-rising-stars-ascension').collection('matches').get();
  const rows: any[] = [];
  for (const m of snap.docs) {
    const d: any = m.data();
    rows.push({ id: m.id, started: d.startedAt, t1: d.team1Name, t2: d.team2Name, status: d.status });
  }
  rows.sort((a,b) => (a.started || '').localeCompare(b.started || ''));
  for (const r of rows) console.log(`${r.id.padEnd(20)} ${(r.started || '?').padEnd(28)} ${r.t1} vs ${r.t2}`);
})();
