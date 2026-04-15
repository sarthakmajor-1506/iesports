import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();
const TID = "league-of-rising-stars-ascension";

async function run() {
  const ref = db.collection("valorantTournaments").doc(TID);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error("Tournament not found");
    process.exit(1);
  }
  const d = snap.data()!;
  console.log("=== Tournament doc ===");
  console.log(JSON.stringify(
    {
      name: d.name,
      status: d.status,
      slotsBooked: d.slotsBooked,
      totalSlots: d.totalSlots,
      registrationDeadline: d.registrationDeadline,
      registrationDeadlineUnix: d.registrationDeadlineUnix,
      schedule: d.schedule,
      bracketsComputed: d.bracketsComputed,
      teamsGenerated: d.teamsGenerated,
    },
    null,
    2
  ));

  const teamsSnap = await db
    .collection("valorantTeams")
    .where("tournamentId", "==", TID)
    .get();
  console.log(`\n=== Teams: ${teamsSnap.size} ===`);
  for (const t of teamsSnap.docs) {
    const td = t.data();
    console.log(`  ${t.id}  name=${td.name || td.teamName}  members=${(td.members || []).length}`);
  }

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
