/**
 * One-off lookup: find Discord IDs for shrey, bubble, and major
 * by scanning the users collection. Match against fullName,
 * discordUsername, and email (where stored).
 *
 * Run: npx tsx scripts/findVoicePanelOwners.ts
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();
const NEEDLES = ["shrey", "bubble", "major"];

async function find() {
  const snap = await db.collection("users").get();
  console.log(`Scanning ${snap.size} users…\n`);

  const hits: Record<string, any[]> = { shrey: [], bubble: [], major: [] };
  for (const doc of snap.docs) {
    const d = doc.data() as any;
    const haystacks = [
      d.fullName,
      d.discordUsername,
      d.email,
      d.riotGameName,
      d.steamName,
    ]
      .filter(Boolean)
      .map((s: string) => s.toLowerCase());
    if (haystacks.length === 0) continue;

    for (const needle of NEEDLES) {
      if (haystacks.some((h) => h.includes(needle))) {
        hits[needle].push({
          uid: doc.id,
          fullName: d.fullName,
          discordUsername: d.discordUsername,
          discordId: d.discordId,
          riotGameName: d.riotGameName,
          steamName: d.steamName,
          role: d.role,
        });
      }
    }
  }

  for (const needle of NEEDLES) {
    console.log(`\n═══ "${needle}" — ${hits[needle].length} match(es) ═══`);
    hits[needle].forEach((h) => console.log(JSON.stringify(h, null, 2)));
  }
}

find()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
