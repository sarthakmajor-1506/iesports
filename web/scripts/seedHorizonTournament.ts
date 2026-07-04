/**
 * Seed "LEAGUE OF RISING STARS - HORIZON" — the online counterpart to the
 * LAN-based Ascension season. Same shuffle format / bracket structure,
 * scaled to 40 players (8 teams of 5), no venue constraint since it's online.
 */
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

const TID = "league-of-rising-stars-horizon";

(async () => {
  await db.collection("valorantTournaments").doc(TID).set({
    name: "LEAGUE OF RISING STARS - HORIZON",
    game: "valorant",
    format: "shuffle",
    status: "upcoming",
    bracketsComputed: false,
    teamsGenerated: false,
    isTestTournament: false,

    registrationDeadline: "2026-07-19T23:59:00+05:30",
    startDate: "2026-07-20T18:00:00+05:30",
    endDate: "2026-08-30T23:00:00+05:30",

    totalSlots: 40,
    slotsBooked: 0,
    entryFee: 0,
    prizePool: "TBD",

    totalTeams: 8,
    playersPerTeam: 5,
    upperBracketTeams: 4,
    lowerBracketTeams: 4,
    bracketFormat: "double_elimination",
    bracketBestOf: 3,
    grandFinalBestOf: 5,
    lbFinalBestOf: 5,
    eliminationBestOf: 2,
    groupStageRounds: 5,
    matchesPerRound: 2,
    swissRounds: 5,
    currentMatchDay: 0,

    schedule: {
      registrationOpens: "2026-07-05T00:00:00+05:30",
      registrationCloses: "2026-07-19T23:59:00+05:30",
      squadCreation: "2026-07-20T18:00:00+05:30",
      groupStageStart: "2026-07-21T00:00:00+05:30",
      groupStageEnd: "2026-08-16T23:59:00+05:30",
      tourneyStageStart: "2026-08-17T00:00:00+05:30",
      tourneyStageEnd: "2026-08-30T23:00:00+05:30",
    },

    rules: [
      "Shuffle-Based Teams (Tier-balanced)",
      "100% Online — play from home, no venue required",
      "Register solo — teams are auto-generated with balanced skill levels after registration closes",
      "5th July - Registration Opens",
      "20th July - Team Formation",
      "21st July - Group Stage (Begins)",
      "17th August - Tourney Stage (Begins)",
      "Prize pool to be announced",
      "Rank Requirement: Gold → Immortal",
    ],
    desc: "LEAGUE OF RISING STARS - HORIZON — a fully online, shuffle-based Valorant tournament. Register solo, get drafted into a tier-balanced team, and battle it out from wherever you play. Powered by iesports.",
    createdAt: new Date().toISOString(),
  }, { merge: true });

  console.log(`✅ Created valorantTournaments/${TID}`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
