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

  // 1) Build the seed → team map from standings. Sort MUST match the public
  //    standings page tiebreaker so seed numbers in the bracket line up with
  //    seed numbers in the standings table. Without this, ties on points were
  //    being broken arbitrarily (Firestore docId order) — putting team #3 in
  //    seed slot #4 etc.
  //
  //    Sort order (matches valorant/tournament/[id]/page.tsx + dota equivalent):
  //      1. points desc
  //      2. round differential (rw - rl) desc   (valorant)
  //         / kill differential desc            (dota)
  //         / map differential desc              (both fall back here)
  //      3. wins desc                            (last-resort stable tiebreaker)
  const standingsSnap = await tref.collection("standings").get();
  const sorted = standingsSnap.docs
    .map(d => ({ id: d.id, ...d.data() } as any))
    .sort((a, b) => {
      if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0);
      const diffA = (a.roundsWon ?? a.killsFor ?? 0) - (a.roundsLost ?? a.killsAgainst ?? 0);
      const diffB = (b.roundsWon ?? b.killsFor ?? 0) - (b.roundsLost ?? b.killsAgainst ?? 0);
      if (diffB !== diffA) return diffB - diffA;
      const mapDiffA = (a.mapsWon ?? 0) - (a.mapsLost ?? 0);
      const mapDiffB = (b.mapsWon ?? 0) - (b.mapsLost ?? 0);
      if (mapDiffB !== mapDiffA) return mapDiffB - mapDiffA;
      return (b.wins ?? 0) - (a.wins ?? 0);
    });
  const teamBySeed: Record<number, { teamId: string; teamName: string }> = {};
  sorted.forEach((s, i) => {
    teamBySeed[i + 1] = { teamId: s.id || s.teamId || s.teamName, teamName: s.teamName };
  });
  console.log(`Seeds resolved from standings (${sorted.length}):`);
  sorted.forEach((s, i) => console.log(`  #${i + 1}  ${s.teamName}`));

  // 2) Walk every bracket match. For every slot that has an embedded `seed`
  //    (or parses a seed from the team name), force the team to be whatever
  //    team is at THAT seed rank in the standings sort. This fixes BOTH:
  //    - leftover "Rank N" placeholders (initial pass)
  //    - mismatches where the bracket was generated against a different
  //      tiebreaker than the public standings page (CHOOZE in seed #3 slot
  //      when MUTH should be there)
  //    Slots with no seed at all (e.g. TBD waiting for a winner) are left alone.
  const ms = await tref.collection("matches").where("isBracket", "==", true).get();
  let updated = 0, skipped = 0;
  for (const md of ms.docs) {
    const m: any = md.data();
    const updates: any = {};
    const slotFix = (rawName: string | undefined, embeddedSeed: number, currentId: string | undefined, label: "team1" | "team2") => {
      const pm = rawName ? rawName.match(RE) : null;
      const seed = embeddedSeed || (pm ? Number(pm[1]) : 0);
      if (!seed) return; // No way to look up, leave as TBD
      const team = teamBySeed[seed];
      if (!team) return;
      // Only emit an update if the slot doesn't already hold the correct team
      if (currentId === team.teamId && rawName === team.teamName) return;
      updates[`${label}Name`] = team.teamName;
      updates[`${label}Id`] = team.teamId;
      updates[`${label}`] = { ...(m[label] || {}), teamId: team.teamId, teamName: team.teamName, seed };
    };
    slotFix(m.team1Name, m.team1?.seed || 0, m.team1Id, "team1");
    slotFix(m.team2Name, m.team2?.seed || 0, m.team2Id, "team2");
    if (Object.keys(updates).length > 0) {
      console.log(`\n  ${md.id}:`);
      Object.entries(updates).forEach(([k, v]) => {
        const before = (m as any)[k];
        const beforeStr = typeof before === "object" ? JSON.stringify(before) : String(before ?? "");
        console.log(`    ${k}: ${beforeStr.slice(0, 30)} → ${typeof v === "object" ? JSON.stringify(v) : v}`);
      });
      if (!DRY) await md.ref.set(updates, { merge: true });
      updated++;
    } else {
      skipped++;
    }
  }
  console.log(`\n${DRY ? "Would update" : "Updated"} ${updated} match docs; ${skipped} already correct.`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
