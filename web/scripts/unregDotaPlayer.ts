import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
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

const UID = "discord_1302366375263735808";
const TOURNAMENT_NAME = "Domin8 - Ultimate Tilt Proof Tournament";

async function main() {
  // 1. Find tournament
  const snap = await db.collection("tournaments").get();
  const tournDoc = snap.docs.find(d => d.data().name === TOURNAMENT_NAME);
  if (!tournDoc) {
    console.error(`Tournament "${TOURNAMENT_NAME}" not found. Available:`);
    snap.docs.forEach(d => console.log(`  - ${d.data().name} (${d.id})`));
    process.exit(1);
  }
  const tournamentId = tournDoc.id;
  console.log(`Found tournament: ${tournamentId}`);

  // 2. Delete from players subcollection
  const playerRef = db.collection("tournaments").doc(tournamentId).collection("players").doc(UID);
  const playerDoc = await playerRef.get();
  if (playerDoc.exists) {
    const bracket = playerDoc.data()?.dotaBracket || "";
    await playerRef.delete();
    console.log(`Deleted tournaments/${tournamentId}/players/${UID}`);

    // Decrement slotsBooked
    const updates: Record<string, any> = { slotsBooked: FieldValue.increment(-1) };
    if (bracket) updates[`brackets.${bracket}.slotsBooked`] = FieldValue.increment(-1);
    await db.collection("tournaments").doc(tournamentId).update(updates);
    console.log(`Decremented slotsBooked`);
  } else {
    console.log(`Player not in players subcollection`);
  }

  // 3. Remove from soloPool
  const soloSnap = await db.collection("soloPool")
    .where("tournamentId", "==", tournamentId)
    .where("uid", "==", UID)
    .get();
  for (const doc of soloSnap.docs) {
    await doc.ref.delete();
    console.log(`Deleted soloPool/${doc.id}`);
  }
  if (soloSnap.empty) console.log(`Not in soloPool`);

  // 4. Remove from user's registeredTournaments
  const userRef = db.collection("users").doc(UID);
  const userDoc = await userRef.get();
  if (userDoc.exists) {
    await userRef.update({ registeredTournaments: FieldValue.arrayRemove(tournamentId) });
    console.log(`Removed from user's registeredTournaments`);
  } else {
    console.log(`User doc not found`);
  }

  // 5. Remove from any teams
  const teamsSnap = await db.collection("teams")
    .where("tournamentId", "==", tournamentId)
    .get();
  for (const teamDoc of teamsSnap.docs) {
    const members = teamDoc.data().members || [];
    if (members.includes(UID)) {
      const updated = members.filter((m: string) => m !== UID);
      if (updated.length === 0 || teamDoc.data().captainUid === UID) {
        await teamDoc.ref.delete();
        console.log(`Deleted team ${teamDoc.id} (was captain or last member)`);
      } else {
        await teamDoc.ref.update({ members: updated });
        console.log(`Removed from team ${teamDoc.id}`);
      }
    }
  }

  console.log(`\nDone! ${UID} unregistered from "${TOURNAMENT_NAME}".`);
  process.exit(0);
}

main().catch(err => { console.error("Error:", err); process.exit(1); });
