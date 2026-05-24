/**
 * Throwaway: find Major + Shrey user docs.
 *
 *   npx tsx scripts/_findMajorShrey.ts
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

async function run() {
  const snap = await db.collection("users").get();
  const needles = ["major", "shrey"];
  for (const d of snap.docs) {
    const u: any = d.data();
    const blob = [
      u.fullName, u.discordUsername, u.steamName, u.name,
      u.persona, u.username, u.handle,
    ].filter(Boolean).join(" | ").toLowerCase();
    for (const n of needles) {
      if (blob.includes(n)) {
        console.log(
          `${n.toUpperCase()} candidate:`,
          d.id,
          `| full=${u.fullName || "-"}`,
          `| steam=${u.steamName || "-"} (${u.steamId || "-"})`,
          `| disc=${u.discordUsername || "-"} (${u.discordId || "-"})`,
          `| rankTier=${u.dotaRankTier || "-"} bracket=${u.dotaBracket || "-"}`,
        );
      }
    }
  }
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
