import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

async function seed() {
  const tournamentId = "blr-lan-apr25";

  await db.collection("valorantTournaments").doc(tournamentId).set({
    id: tournamentId,
    name: "Valorant Ascendant+ LAN — Bangalore",
    game: "valorant",
    format: "shuffle",
    status: "upcoming",
    bracketsComputed: false,
    isTestTournament: false,
    registrationDeadline: "2026-04-23T23:59:00+05:30",
    startDate: "2026-04-25T10:00:00+05:30",
    endDate: "2026-04-25T16:00:00+05:30",
    totalSlots: 20,
    slotsBooked: 0,
    entryFee: 600,
    prizePool: "₹12,000",
    teamCount: 4,
    playersPerTeam: 5,
    rules: [
      "Ascendant 1 or above required — verified via Riot ID.",
      "Teams shuffled by IE Sports for balanced matchups.",
      "Map pool follows current VCT rotation. Captains veto.",
      "All matches on LAN. No online substitutions.",
      "Account sharing or boosted accounts = DQ, no refund.",
      "No refunds within 48 hours of event.",
      "Admin decisions are final.",
    ],
    desc: "20 players. 4 teams. 6 hours of competitive Valorant on LAN in Jayanagar, Bangalore.",
    schedule: {
      registrationOpens: "2026-04-18T00:00:00+05:30",
      registrationCloses: "2026-04-23T23:59:00+05:30",
      squadCreation: "2026-04-25T10:00:00+05:30",
      groupStageStart: "2026-04-25T10:45:00+05:30",
      groupStageEnd: "2026-04-25T16:00:00+05:30",
    },
  });

  console.log(`Seeded LAN tournament: ${tournamentId}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
