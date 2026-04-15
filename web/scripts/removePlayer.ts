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

const PLAYER_NAME = "Default11";
const TOURNAMENT_NAME = "LEAGUE OF RISING STARS - ASCENSION";

async function removePlayer() {
  // 1. Find the tournament
  const tournSnap = await db.collection("valorantTournaments").get();
  const tournDoc = tournSnap.docs.find((d) => d.data().name === TOURNAMENT_NAME);
  if (!tournDoc) {
    console.error(`Tournament "${TOURNAMENT_NAME}" not found. Available:`);
    tournSnap.docs.forEach((d) => console.log(`  - ${d.data().name} (${d.id})`));
    process.exit(1);
  }
  const tournamentId = tournDoc.id;
  console.log(`Found tournament: ${TOURNAMENT_NAME} (${tournamentId})`);

  // 2. Find the player in soloPlayers subcollection
  const playersRef = db.collection("valorantTournaments").doc(tournamentId).collection("soloPlayers");
  const playersSnap = await playersRef.get();
  const playerDoc = playersSnap.docs.find(
    (d) => d.data().riotGameName?.toLowerCase() === PLAYER_NAME.toLowerCase()
  );
  if (!playerDoc) {
    console.error(`Player "${PLAYER_NAME}" not found in soloPlayers. Registered players:`);
    playersSnap.docs.forEach((d) => {
      const data = d.data();
      console.log(`  - ${data.riotGameName}#${data.riotTagLine} (uid: ${d.id})`);
    });
    process.exit(1);
  }
  const uid = playerDoc.id;
  const playerData = playerDoc.data();
  console.log(`Found player: ${playerData.riotGameName}#${playerData.riotTagLine} (uid: ${uid})`);

  // 3. Check for team membership
  const teamsSnap = await db
    .collection("valorantTeams")
    .where("tournamentId", "==", tournamentId)
    .get();
  for (const teamDoc of teamsSnap.docs) {
    const teamData = teamDoc.data();
    const members = teamData.members || [];
    const isMember = members.some((m: any) => m.uid === uid);
    if (isMember) {
      console.log(`Removing from team: ${teamData.name} (${teamDoc.id})`);
      const updatedMembers = members.filter((m: any) => m.uid !== uid);
      if (updatedMembers.length === 0 || teamData.captainUid === uid) {
        // Delete the whole team if player is captain or last member
        await teamDoc.ref.delete();
        console.log(`  Deleted team (player was captain or last member)`);
      } else {
        await teamDoc.ref.update({ members: updatedMembers });
        console.log(`  Removed from team members`);
      }
    }
  }

  // 4. Delete soloPlayer doc
  await playersRef.doc(uid).delete();
  console.log(`Deleted soloPlayers/${uid}`);

  // 5. Decrement slotsBooked
  await db.collection("valorantTournaments").doc(tournamentId).update({
    slotsBooked: FieldValue.increment(-1),
  });
  console.log(`Decremented slotsBooked`);

  // 6. Remove tournament from user's registeredValorantTournaments
  const userRef = db.collection("users").doc(uid);
  const userDoc = await userRef.get();
  if (userDoc.exists) {
    await userRef.update({
      registeredValorantTournaments: FieldValue.arrayRemove(tournamentId),
    });
    console.log(`Removed tournament from user's registeredValorantTournaments`);
  } else {
    console.log(`User doc ${uid} not found — skipping user update`);
  }

  // 7. Recalculate tiers for remaining players
  const remainingSnap = await playersRef.get();
  if (!remainingSnap.empty) {
    const players = remainingSnap.docs
      .map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          riotTier: data.iesportsTier || data.riotTier || 0,
          registeredAt: data.registeredAt || "",
        };
      })
      .sort((a, b) => b.riotTier - a.riotTier || a.registeredAt.localeCompare(b.registeredAt));

    const n = players.length;
    const t1Count = Math.ceil(n / 4);
    const t2Count = Math.ceil((n - t1Count) / 3);
    const t3Count = Math.ceil((n - t1Count - t2Count) / 2);

    const batch = db.batch();
    for (let i = 0; i < n; i++) {
      let tier: number;
      if (i < t1Count) tier = 1;
      else if (i < t1Count + t2Count) tier = 2;
      else if (i < t1Count + t2Count + t3Count) tier = 3;
      else tier = 4;
      batch.update(playersRef.doc(players[i].uid), { skillLevel: tier });
    }
    await batch.commit();
    console.log(`Recalculated tiers for ${n} remaining players`);
  }

  // 8. Check leaderboard subcollection
  const leaderboardRef = db.collection("valorantTournaments").doc(tournamentId).collection("leaderboard");
  const lbDoc = await leaderboardRef.doc(uid).get();
  if (lbDoc.exists) {
    await lbDoc.ref.delete();
    console.log(`Deleted leaderboard entry`);
  }

  // 9. Check standings subcollection
  const standingsRef = db.collection("valorantTournaments").doc(tournamentId).collection("standings");
  const standingsDoc = await standingsRef.doc(uid).get();
  if (standingsDoc.exists) {
    await standingsDoc.ref.delete();
    console.log(`Deleted standings entry`);
  }

  console.log(`\nDone! "${PLAYER_NAME}" has been fully removed from "${TOURNAMENT_NAME}".`);
  process.exit(0);
}

removePlayer().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
