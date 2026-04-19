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

const TOURNAMENT_ID = "league-of-rising-stars-ascension";

type SeedEntry = {
  uid: string;
  type: "wanted" | "warning";
  reason: string;
};

const SEEDS: SeedEntry[] = [
  {
    uid: "discord_601601191893532696", // SullieD
    type: "wanted",
    reason: "Ghosted ALPHAS on match day. Never joined the lobby, never messaged, just vanished into the night.",
  },
  {
    uid: "discord_784460891843461142", // CMX AryenG
    type: "warning",
    reason: "Strolled into the TOOFANI CHOKERS Round 1 lobby 30 minutes late. Held up the whole bracket — alarms exist, buddy.",
  },
];

async function run() {
  const tournRef = db.collection("valorantTournaments").doc(TOURNAMENT_ID);
  const tournSnap = await tournRef.get();
  if (!tournSnap.exists) {
    console.error(`Tournament "${TOURNAMENT_ID}" not found.`);
    process.exit(1);
  }
  console.log(`Seeding Wall of Shame for: ${tournSnap.data()?.name || TOURNAMENT_ID}\n`);

  const shameCol = tournRef.collection("wallOfShame");

  for (const seed of SEEDS) {
    const userSnap = await db.collection("users").doc(seed.uid).get();
    if (!userSnap.exists) {
      console.warn(`  skip: user ${seed.uid} not found`);
      continue;
    }
    const u = userSnap.data() || {};
    const playerName = u.riotGameName || u.steamName || u.fullName || u.discordUsername || seed.uid;
    const playerAvatar = u.riotAvatar || u.discordAvatar || u.steamAvatar || "";
    const riotGameName = u.riotGameName || "";
    const riotTagLine = u.riotTagLine || "";

    // Avoid dupes — if an entry for this uid + type exists, update it instead.
    const existing = await shameCol
      .where("uid", "==", seed.uid)
      .where("type", "==", seed.type)
      .limit(1)
      .get();

    const payload = {
      uid: seed.uid,
      playerName,
      playerAvatar,
      riotGameName,
      riotTagLine,
      type: seed.type,
      reason: seed.reason,
      createdAt: new Date().toISOString(),
      createdBy: "seed-script",
    };

    if (!existing.empty) {
      const doc = existing.docs[0];
      await doc.ref.update(payload);
      console.log(`  update ${seed.type.padEnd(7)} ${playerName} (${doc.id})`);
    } else {
      const added = await shameCol.add({
        ...payload,
        tomatoCount: 0,
        bailCount: 0,
      });
      console.log(`  create ${seed.type.padEnd(7)} ${playerName} (${added.id})`);
    }
  }

  console.log("\nDone.");
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
