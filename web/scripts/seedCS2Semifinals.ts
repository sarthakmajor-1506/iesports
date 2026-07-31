/**
 * Seed the CS2 semifinal slots from whichever group has finished.
 *
 * The settle cascade already calls maybeSeedCS2Semifinals after every group
 * result, so this exists for the case where a result was corrected by hand or
 * a group finished before the seeding logic could fill its slots. Idempotent:
 * only slots still reading "TBD" are written.
 *
 *   npx tsx scripts/seedCS2Semifinals.ts
 *   npx tsx scripts/seedCS2Semifinals.ts --tid=cs2-royal-sports-league
 */
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, "\n"),
  })});
}
const db = getFirestore(getApp());
import { maybeSeedCS2Semifinals } from "../lib/settleCS2Match";

const TID = process.argv.find(a => a.startsWith("--tid="))?.slice(6) || "cs2-royal-sports-league";

(async () => {
  const r = await maybeSeedCS2Semifinals(db as any, TID);
  console.log(JSON.stringify(r, null, 1));
  const ms = await db.collection("cs2Tournaments").doc(TID).collection("matches").get();
  console.log("\nBRACKET");
  ms.docs.map(d => d.data() as any).filter(m => m.isBracket)
    .sort((a, b) => String(a.matchIndex).localeCompare(String(b.matchIndex)))
    .forEach(m => console.log(`  ${String(m.bracketLabel).padEnd(6)} ${String(m.team1Name).padEnd(20)} vs ${m.team2Name}   ${String(m.scheduledTime||"").slice(11,16)}`));
  process.exit(0);
})();
