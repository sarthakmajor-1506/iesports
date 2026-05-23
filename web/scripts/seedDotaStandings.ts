/**
 * Aggregate Dota tournament team standings from completed matches.
 *
 *   Win = 3 points, Draw = 1, Loss = 0 (BO1 round-robin).
 *
 * Reads tournaments/{id}/matches and tournaments/{id}/teams, computes
 * per-team W/D/L/points/kills-for/against, writes to the standings
 * subcollection that the tournament detail page already renders.
 *
 *   npx tsx scripts/seedDotaStandings.ts            # dry-run
 *   npx tsx scripts/seedDotaStandings.ts --apply    # write
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
const TID = "domin8-ultimate-tilt-proof-tournament";
const APPLY = process.argv.includes("--apply");

type S = {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  killsFor: number;
  killsAgainst: number;
  killDiff: number;
};

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);

  const tRef = db.collection("tournaments").doc(TID);
  const teamsSnap = await tRef.collection("teams").get();
  const teams: Record<string, S> = {};
  for (const d of teamsSnap.docs) {
    const x: any = d.data();
    teams[d.id] = {
      teamId: d.id,
      teamName: x.teamName || x.name || d.id,
      played: 0, wins: 0, draws: 0, losses: 0, points: 0,
      killsFor: 0, killsAgainst: 0, killDiff: 0,
    };
  }

  const matches = await tRef.collection("matches").get();
  for (const m of matches.docs) {
    const md: any = m.data();
    if (md.status !== "completed") continue;
    if (!md.team1Id || !md.team2Id) continue;
    if (!teams[md.team1Id] || !teams[md.team2Id]) continue;

    const t1 = teams[md.team1Id];
    const t2 = teams[md.team2Id];
    t1.played++; t2.played++;

    // Kills come from game1.radiantScore/direScore.
    const g1 = md.game1 || {};
    const radiantTeamId = g1.radiantTeamId;
    let t1Kills = 0, t2Kills = 0;
    if (radiantTeamId === md.team1Id) {
      t1Kills = g1.radiantScore || 0; t2Kills = g1.direScore || 0;
    } else if (radiantTeamId === md.team2Id) {
      t1Kills = g1.direScore || 0; t2Kills = g1.radiantScore || 0;
    }
    t1.killsFor += t1Kills; t1.killsAgainst += t2Kills;
    t2.killsFor += t2Kills; t2.killsAgainst += t1Kills;

    // Series win/loss from team1Score vs team2Score.
    const t1Score = md.team1Score || 0, t2Score = md.team2Score || 0;
    if (t1Score > t2Score) { t1.wins++; t1.points += 3; t2.losses++; }
    else if (t2Score > t1Score) { t2.wins++; t2.points += 3; t1.losses++; }
    else { t1.draws++; t2.draws++; t1.points++; t2.points++; }
  }

  for (const s of Object.values(teams)) s.killDiff = s.killsFor - s.killsAgainst;

  const sorted = Object.values(teams).sort((a, b) =>
    b.points - a.points || b.killDiff - a.killDiff || b.killsFor - a.killsFor
  );

  console.log("\nStandings:");
  console.log("  Pos  Team                       P  W  D  L  Pts  KF  KA  Diff");
  sorted.forEach((s, i) => {
    console.log(
      `  ${(i + 1).toString().padEnd(4)}` +
      ` ${s.teamName.padEnd(26)} ${s.played}  ${s.wins}  ${s.draws}  ${s.losses}  ` +
      ` ${s.points.toString().padEnd(3)}  ${s.killsFor.toString().padEnd(3)} ${s.killsAgainst.toString().padEnd(3)} ${s.killDiff > 0 ? "+" : ""}${s.killDiff}`
    );
  });

  // Write to standings subcollection
  const stCol = tRef.collection("standings");
  const existing = await stCol.get();
  console.log(`\nExisting standings docs: ${existing.size}  (will be replaced)`);
  if (!APPLY) {
    console.log("\n🟡 DRY RUN — pass --apply to commit.");
    return;
  }

  const batch = db.batch();
  existing.docs.forEach(d => batch.delete(d.ref));
  for (const s of sorted) batch.set(stCol.doc(s.teamId), s);
  await batch.commit();
  console.log("✅ Wrote standings.");
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
