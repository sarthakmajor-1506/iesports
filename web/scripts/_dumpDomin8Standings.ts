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
  const tref = db.collection("tournaments").doc(TID);

  console.log("=== Standings docs ===");
  const st = await tref.collection("standings").get();
  for (const d of st.docs) {
    console.log(`${d.id}:`);
    console.log(JSON.stringify(d.data(), null, 2));
  }

  console.log("\n=== All matches (compact) ===");
  const ms = await tref.collection("matches").orderBy("matchDay").get();
  for (const m of ms.docs) {
    const d: any = m.data();
    console.log(`${m.id}: ${d.status}  ${d.team1Name} (${d.team1Score ?? "?"}) vs ${d.team2Name} (${d.team2Score ?? "?"})  winner=${d.winner || "—"}`);
  }
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
