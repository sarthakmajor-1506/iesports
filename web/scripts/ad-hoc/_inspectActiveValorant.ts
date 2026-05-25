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
(async () => {
  const ts = await db.collection("valorantTournaments").get();
  for (const d of ts.docs) {
    const t: any = d.data();
    if (t.status === "ended" || t.status === "completed") continue;
    console.log(`\n=== ${d.id} (${t.name}) ===  status=${t.status}`);
    const standings = await d.ref.collection("standings").get();
    console.log(`Standings (${standings.size}):`);
    const sorted = standings.docs.map(s => ({ id: s.id, ...s.data() as any })).sort((a: any, b: any) => (b.points ?? 0) - (a.points ?? 0));
    sorted.forEach((s: any, i) => {
      console.log(`  #${i + 1}  ${s.teamName || s.id}  pts=${s.points ?? '?'}  W-L=${s.wins ?? '?'}-${s.losses ?? '?'}`);
    });
    const ms = await d.ref.collection("matches").get();
    const bracketMs = ms.docs.filter(m => (m.data() as any).isBracket === true);
    console.log(`Bracket matches: ${bracketMs.length}`);
    for (const m of bracketMs.slice(0, 5)) {
      const md: any = m.data();
      console.log(`  ${m.id}: ${md.team1Name} (seed=${md.team1?.seed || '-'}) vs ${md.team2Name} (seed=${md.team2?.seed || '-'})  status=${md.status}`);
    }
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
