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
  const TID = "domin8-ultimate-tilt-proof-tournament";
  const ms = await db.collection("tournaments").doc(TID).collection("matches").get();
  console.log(`Total matches: ${ms.size}\n`);
  for (const m of ms.docs) {
    const d: any = m.data();
    console.log(`${m.id}:`);
    console.log(`  status:       ${d.status}`);
    console.log(`  isBracket:    ${d.isBracket || false}`);
    console.log(`  matchDay:     ${d.matchDay}  matchIndex: ${d.matchIndex}`);
    console.log(`  teams:        ${d.team1Name} vs ${d.team2Name}`);
    console.log(`  score:        ${d.team1Score ?? "—"}-${d.team2Score ?? "—"}`);
    console.log(`  winner:       ${d.winner || "—"}`);
    console.log(`  dotaMatchId:  ${d.dotaMatchId || "—"}`);
    console.log(`  completedAt:  ${d.completedAt || "—"}`);
    console.log(`  hasPlayerStats: ${Array.isArray(d.game1?.playerStats) ? d.game1.playerStats.length + " players" : "no"}`);
    console.log("");
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
