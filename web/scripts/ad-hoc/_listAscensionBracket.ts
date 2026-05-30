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
(async () => {
  const matches = await db.collection("valorantTournaments").doc(TID).collection("matches").where("isBracket", "==", true).get();
  matches.docs.forEach(d => {
    const m = d.data() as any;
    console.log(`  ${d.id} | ${m.team1Name || m.team1?.teamName || "TBD"} (${m.team1Id || m.team1?.teamId || "?"}) vs ${m.team2Name || m.team2?.teamName || "TBD"} (${m.team2Id || m.team2?.teamId || "?"}) | scheduledTime=${m.scheduledTime || "-"} | status=${m.status || "-"} | bracketType=${m.bracketType || "-"} | round=${m.bracketRound || m.round || "-"}`);
  });
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
