import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
if (!getApps().length) initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

const TID = "league-of-rising-stars-ascension";
const NEEDLES = ["harsh", "harsh30", "jayesh", "naitik", "palli", "pranav", "sullie", "sullied"];

async function run() {
  const playersSnap = await db
    .collection("valorantTournaments").doc(TID)
    .collection("soloPlayers").get();
  console.log(`Total registered: ${playersSnap.size}\n`);

  for (const needle of NEEDLES) {
    const matches = playersSnap.docs.filter((d) => {
      const data = d.data();
      const fields = [
        data.riotGameName,
        data.riotTagLine,
        data.discordUsername,
        data.fullName,
        data.steamName,
      ].map((s: any) => (s || "").toString().toLowerCase());
      return fields.some((f) => f.includes(needle));
    });
    console.log(`── "${needle}" (${matches.length}) ──`);
    if (matches.length === 0) {
      // fallback: also search users collection (since orgs added some via discord-only)
      const userMatches: any[] = [];
      const usersSnap = await db.collection("users").get();
      for (const u of usersSnap.docs) {
        const data = u.data();
        const fieldMap: Record<string, string> = {
          riotGameName: (data.riotGameName || "").toString().toLowerCase(),
          discordUsername: (data.discordUsername || "").toString().toLowerCase(),
          fullName: (data.fullName || "").toString().toLowerCase(),
          steamName: (data.steamName || "").toString().toLowerCase(),
        };
        const matchedField = Object.entries(fieldMap).find(([_, v]) => v.includes(needle))?.[0];
        if (matchedField) userMatches.push({ id: u.id, matchedField, ...data });
      }
      if (userMatches.length === 0) console.log("  (no match)");
      else for (const m of userMatches) {
        console.log(`  [matched ${m.matchedField}] uid=${m.id}  riot=${m.riotGameName || "?"}#${m.riotTagLine || "?"}  discord=${m.discordUsername || "?"}  fullName=${m.fullName || "?"}`);
      }
    } else {
      for (const m of matches) {
        const d = m.data();
        console.log(`  ${d.riotGameName || d.discordUsername || d.fullName}#${d.riotTagLine || ""}  uid=${m.id}  discord=${d.discordUsername || "?"}  fullName=${d.fullName || "?"}`);
      }
    }
    console.log();
  }
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
