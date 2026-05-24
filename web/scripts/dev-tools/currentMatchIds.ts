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
  for (const tid of ["dota-test-major-shrey", "domin8-ultimate-tilt-proof-tournament"]) {
    console.log(`\n=== ${tid} ===`);
    const ms = await db.collection("tournaments").doc(tid).collection("matches").orderBy("matchDay").get();
    for (const m of ms.docs) {
      const d: any = m.data();
      if (d.dotaMatchId || d.status === "live" || d.status === "completed") {
        console.log(`  ${m.id}: status=${d.status}  dotaMatchId=${d.dotaMatchId || "—"}  winner=${d.winner || "—"}  ${d.team1Name} vs ${d.team2Name}`);
      }
    }
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
