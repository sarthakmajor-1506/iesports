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

const TOURNAMENT_NAME = "LEAGUE OF RISING STARS - ASCENSION";
const NEEDLES = ["zneako", "chai", "dinero"];

async function run() {
  const tournSnap = await db.collection("valorantTournaments").get();
  const tournDoc = tournSnap.docs.find((d) => d.data().name === TOURNAMENT_NAME);
  if (!tournDoc) {
    console.error(`Tournament "${TOURNAMENT_NAME}" not found.`);
    process.exit(1);
  }
  const tournamentId = tournDoc.id;
  console.log(`Tournament: ${TOURNAMENT_NAME} (${tournamentId})\n`);

  const playersSnap = await db
    .collection("valorantTournaments")
    .doc(tournamentId)
    .collection("soloPlayers")
    .get();

  console.log(`Total registered: ${playersSnap.size}\n`);

  for (const needle of NEEDLES) {
    const matches = playersSnap.docs.filter((d) => {
      const data = d.data();
      const name = (data.riotGameName || "").toLowerCase();
      const tag = (data.riotTagLine || "").toLowerCase();
      return name.includes(needle) || tag.includes(needle);
    });
    console.log(`── "${needle}" (${matches.length} match${matches.length === 1 ? "" : "es"}) ──`);
    if (matches.length === 0) {
      console.log(`  (no match)`);
    } else {
      for (const m of matches) {
        const d = m.data();
        console.log(
          `  ${d.riotGameName}#${d.riotTagLine}  uid=${m.id}  tier=${d.iesportsTier ?? d.riotTier ?? "?"}  rank=${d.iesportsRank || d.riotRank || "?"}`
        );
      }
    }
    console.log();
  }

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
