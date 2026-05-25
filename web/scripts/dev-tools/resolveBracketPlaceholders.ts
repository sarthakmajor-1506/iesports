/**
 * Replace "Rank N" placeholder team names on bracket matches with the
 * actual seeded team from current standings.
 *
 * For pre-bracket slots only (R1 matches that get fixed teams). Later
 * round matches (semis/finals) where team1Name is "TBD" remain TBD —
 * they get populated when their feeder match completes.
 *
 *   npx tsx scripts/dev-tools/resolveBracketPlaceholders.ts <collection> <tournamentId>
 *
 * Examples:
 *   npx tsx scripts/dev-tools/resolveBracketPlaceholders.ts valorantTournaments league-of-rising-stars-ascension
 *   npx tsx scripts/dev-tools/resolveBracketPlaceholders.ts tournaments domin8-...
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
const RE = /^(?:rank|seed)\s*#?\s*(\d+)$/i;

const COL = process.argv[2];
const TID = process.argv[3];
const DRY = !process.argv.includes("--apply");
if (!COL || !TID) {
  console.error("Usage: npx tsx scripts/dev-tools/resolveBracketPlaceholders.ts <collection> <tournamentId> [--apply]");
  process.exit(1);
}

(async () => {
  console.log(`Mode: ${DRY ? "DRY-RUN (pass --apply to commit)" : "APPLY"}\n`);
  const tref = db.collection(COL).doc(TID);

  // 1) Build the seed → team map from standings (sorted by points desc)
  const standingsSnap = await tref.collection("standings").get();
  const sorted = standingsSnap.docs
    .map(d => ({ id: d.id, ...d.data() } as any))
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  const teamBySeed: Record<number, { teamId: string; teamName: string }> = {};
  sorted.forEach((s, i) => {
    teamBySeed[i + 1] = { teamId: s.id || s.teamId || s.teamName, teamName: s.teamName };
  });
  console.log(`Seeds resolved from standings (${sorted.length}):`);
  sorted.forEach((s, i) => console.log(`  #${i + 1}  ${s.teamName}`));

  // 2) Walk every bracket match, replace "Rank N" placeholders
  const ms = await tref.collection("matches").where("isBracket", "==", true).get();
  let updated = 0, skipped = 0;
  for (const md of ms.docs) {
    const m: any = md.data();
    const updates: any = {};
    const slotFix = (rawName: string | undefined, embeddedSeed: number, label: "team1" | "team2") => {
      const pm = rawName ? rawName.match(RE) : null;
      if (!pm) return;
      const seed = embeddedSeed || Number(pm[1]);
      const team = teamBySeed[seed];
      if (!team) return;
      updates[`${label}Name`] = team.teamName;
      updates[`${label}Id`] = team.teamId;
      // Also stamp the embedded seed for completeness
      updates[`${label}`] = { ...(m[label] || {}), teamId: team.teamId, teamName: team.teamName, seed };
    };
    slotFix(m.team1Name, m.team1?.seed || 0, "team1");
    slotFix(m.team2Name, m.team2?.seed || 0, "team2");
    if (Object.keys(updates).length > 0) {
      console.log(`\n  ${md.id}:`);
      Object.entries(updates).forEach(([k, v]) => {
        console.log(`    ${k} = ${typeof v === "object" ? JSON.stringify(v) : v}`);
      });
      if (!DRY) await md.ref.set(updates, { merge: true });
      updated++;
    } else {
      skipped++;
    }
  }
  console.log(`\n${DRY ? "Would update" : "Updated"} ${updated} match docs; ${skipped} had no placeholder names.`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
