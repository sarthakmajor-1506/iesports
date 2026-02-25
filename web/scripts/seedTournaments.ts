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

const brackets = {
  herald_guardian:  { slotsTotal: 40, slotsBooked: 0 },
  crusader_archon:  { slotsTotal: 40, slotsBooked: 0 },
  legend_ancient:   { slotsTotal: 40, slotsBooked: 0 },
  divine_immortal:  { slotsTotal: 40, slotsBooked: 0 },
};

const tournaments = [
  {
    name: "Dota 2 April Invitational",
    game: "dota2",
    month: "April 2026",
    status: "ended",
    prizePool: "₹25,000",
    entry: "Free",
    startDate: "Apr 26, 2026",
    endDate: "Apr 27, 2026",
    registrationDeadline: "Apr 23, 2026",
    totalSlots: 160,
    slotsBooked: 160,
    brackets,
    desc: "Our first ever Dota 2 tournament. All ranks welcome.",
    rules: [
      "All players must have Steam account linked",
      "Teams of 5 players each",
      "Rank verified at time of registration",
      "No switching accounts during tournament",
      "Match results must be screenshot and submitted",
    ],
  },
  {
    name: "Dota 2 May Championship",
    game: "dota2",
    month: "May 2026",
    status: "upcoming",
    prizePool: "₹40,000",
    entry: "Free",
    startDate: "May 31, 2026",
    endDate: "Jun 1, 2026",
    registrationDeadline: "May 28, 2026",
    totalSlots: 160,
    slotsBooked: 0,
    brackets,
    desc: "Monthly championship. Rank-locked brackets. Fast UPI payouts.",
    rules: [
      "All players must have Steam account linked",
      "Teams of 5 players each",
      "Rank verified at time of registration",
      "No switching accounts during tournament",
      "Match results must be screenshot and submitted",
    ],
  },
  {
    name: "Dota 2 June Showdown",
    game: "dota2",
    month: "June 2026",
    status: "upcoming",
    prizePool: "₹40,000",
    entry: "Free",
    startDate: "Jun 28, 2026",
    endDate: "Jun 29, 2026",
    registrationDeadline: "Jun 25, 2026",
    totalSlots: 160,
    slotsBooked: 0,
    brackets,
    desc: "Monthly championship. Steam-verified. Prize via UPI.",
    rules: [
      "All players must have Steam account linked",
      "Teams of 5 players each",
      "Rank verified at time of registration",
      "No switching accounts during tournament",
      "Match results must be screenshot and submitted",
    ],
  },
  {
    name: "Dota 2 July Cup",
    game: "dota2",
    month: "July 2026",
    status: "upcoming",
    prizePool: "₹40,000",
    entry: "Free",
    startDate: "Jul 26, 2026",
    endDate: "Jul 27, 2026",
    registrationDeadline: "Jul 23, 2026",
    totalSlots: 160,
    slotsBooked: 0,
    brackets,
    desc: "Monthly championship. Rank-locked brackets. Fast UPI payouts.",
    rules: [
      "All players must have Steam account linked",
      "Teams of 5 players each",
      "Rank verified at time of registration",
      "No switching accounts during tournament",
      "Match results must be screenshot and submitted",
    ],
  },
];

async function seed() {
  const db = getFirestore();

  // Delete existing tournaments first
  const existing = await db.collection("tournaments").get();
  for (const d of existing.docs) {
    await d.ref.delete();
    console.log(`Deleted: ${d.data().name}`);
  }

  // Add new ones
  for (const t of tournaments) {
    await db.collection("tournaments").add(t);
    console.log(`Added: ${t.name}`);
  }

  console.log("Done!");
  process.exit(0);
}

seed();