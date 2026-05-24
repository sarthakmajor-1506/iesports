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
const TID = "dota-test-major-shrey";

(async () => {
  const tRef = db.collection("tournaments").doc(TID);
  const t1 = (await tRef.collection("teams").doc("team-1").get()).data() as any;
  const t2 = (await tRef.collection("teams").doc("team-2").get()).data() as any;
  if (!t1 || !t2) throw new Error("teams not found");
  console.log(`team-1: ${t1.teamName}   team-2: ${t2.teamName}`);

  const existing = await tRef.collection("matches").get();
  console.log(`Existing matches: ${existing.size} (${existing.docs.map(d => d.id).join(", ")})`);

  // Add r1-match-2..5 — 4 fresh test matches, all pending, no scheduledTime
  // (avoid auto-firing; admin uses Set Lobby & Notify when ready)
  const newIds = ["r1-match-2", "r1-match-3", "r1-match-4", "r1-match-5"];
  for (const id of newIds) {
    if (existing.docs.some(d => d.id === id)) { console.log(`  skip ${id} (exists)`); continue; }
    await tRef.collection("matches").doc(id).set({
      id,
      tournamentId: TID,
      matchDay: 1,
      matchIndex: parseInt(id.split("-").pop()!, 10),
      team1Id: "team-1",
      team2Id: "team-2",
      team1Name: t1.teamName,
      team2Name: t2.teamName,
      team1Score: 0,
      team2Score: 0,
      status: "pending",
      isBracket: false,
      bestOf: 1,
      createdAt: new Date().toISOString(),
    });
    console.log(`  ✓ added ${id}`);
  }
  console.log("\nDone. Use admin panel → select tournament → pick a match → Set Lobby & Notify.");
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
