/**
 * Inspect the Domin8 Dota tournament: format, status, teams, matches,
 * standings — to understand what the admin Tournament Ops needs.
 * Run: npx tsx scripts/inspectDotaTournamentForOps.ts
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }) });
}

const TID = "domin8-ultimate-tilt-proof-tournament";

async function main() {
  const db = getFirestore();
  const tRef = db.collection("tournaments").doc(TID);
  const tSnap = await tRef.get();
  if (!tSnap.exists) { console.log("❌ not found in `tournaments`"); process.exit(1); }
  const t = tSnap.data() as any;

  console.log("═══ tournaments/" + TID + " ═══");
  console.log(JSON.stringify({
    name: t.name, game: t.game, format: t.format, status: t.status,
    totalSlots: t.totalSlots, slotsBooked: t.slotsBooked,
    bracketFormat: t.bracketFormat, matchesPerRound: t.matchesPerRound,
    groupStageRounds: t.groupStageRounds, bracketBestOf: t.bracketBestOf,
    teamsShuffled: t.teamsShuffled, bracketsComputed: t.bracketsComputed,
    discordChannelId: t.discordChannelId,
  }, null, 2));

  const teams = await tRef.collection("teams").get();
  console.log(`\nteams subcollection: ${teams.size} docs`);
  teams.docs.slice(0, 3).forEach(d => {
    const td = d.data() as any;
    console.log(`  ${d.id}: ${td.teamName || "(no name)"} members=${(td.members || []).length} bracket=${td.bracket || "-"}`);
  });

  const matches = await tRef.collection("matches").get();
  console.log(`\nmatches subcollection: ${matches.size} docs`);
  matches.docs.slice(0, 5).forEach(d => console.log(`  ${d.id}: ${JSON.stringify(d.data()).slice(0, 150)}`));

  const standings = await tRef.collection("standings").get();
  console.log(`\nstandings subcollection: ${standings.size} docs`);

  // Top-level `teams` collection (Dota 5v5 teams live here, not subcollection)
  const topTeams = await db.collection("teams").where("tournamentId", "==", TID).get();
  console.log(`\ntop-level teams where tournamentId==${TID}: ${topTeams.size} docs`);
  topTeams.docs.slice(0, 5).forEach(d => {
    const td = d.data() as any;
    console.log(`  ${d.id}: captain=${td.captainUid} members=${(td.members || []).length} status=${td.status} code=${td.teamCode}`);
  });
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
