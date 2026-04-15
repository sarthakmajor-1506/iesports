/**
 * markTournamentHonors.ts
 *
 * After a tournament concludes, run this script with the tournament id to:
 *   1. Compute the bracket MVPs (top KDA per Valorant rank tier — Immortal,
 *      Ascendant, Diamond, ...) — same logic as the public leaderboard page.
 *   2. Read championMembers from the tournament doc (set when the Grand
 *      Final concludes by /api/valorant/match-fetch).
 *   3. Clear `mvpBracket` / `isChampion` / `honorTournamentId` from every
 *      user that's currently honored from a DIFFERENT tournament — honors
 *      are point-in-time, not cumulative.
 *   4. Stamp the new honors onto the affected user docs.
 *
 * Usage:
 *   npx tsx scripts/markTournamentHonors.ts <tournamentId>
 *   npx tsx scripts/markTournamentHonors.ts league-of-rising-stars-prelims
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
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

const RANK_ORDER = [
  "Radiant",
  "Immortal",
  "Ascendant",
  "Diamond",
  "Platinum",
  "Gold",
  "Silver",
  "Bronze",
  "Iron",
  "Unranked",
];

function baseRankOf(p: any): string {
  const display = p.iesportsRank || p.riotRank || "";
  const base = String(display).split(" ")[0];
  return RANK_ORDER.includes(base) ? base : "Unranked";
}

function kdaScore(lb: any): number {
  const k = lb.totalKills || 0;
  const a = lb.totalAssists || 0;
  const d = Math.max(1, lb.totalDeaths || 1);
  return (k + 0.5 * a) / d;
}

async function run() {
  const tournamentId = process.argv[2];
  if (!tournamentId) {
    console.error("Usage: npx tsx scripts/markTournamentHonors.ts <tournamentId>");
    process.exit(1);
  }

  const tRef = db.collection("valorantTournaments").doc(tournamentId);
  const tSnap = await tRef.get();
  if (!tSnap.exists) {
    console.error(`Tournament ${tournamentId} not found`);
    process.exit(1);
  }
  const tData = tSnap.data()!;
  const tournamentName = tData.name || tournamentId;
  console.log(`Tournament: ${tournamentName} (${tournamentId})`);

  // ── Load registered players + leaderboard in parallel ────────────────
  const [playersSnap, lbSnap] = await Promise.all([
    tRef.collection("soloPlayers").get(),
    tRef.collection("leaderboard").get(),
  ]);
  const players = playersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as any));
  const leaderboard = lbSnap.docs.map(d => ({ uid: d.id, ...d.data() } as any));
  console.log(`Players: ${players.length}, Leaderboard entries: ${leaderboard.length}`);

  // ── Compute MVP per base-rank bracket (highest KDA, tiebreak kills) ──
  const baseRankByUid: Record<string, string> = {};
  for (const p of players) {
    const uid = p.uid || p.id;
    if (uid) baseRankByUid[uid] = baseRankOf(p);
  }

  const grouped: Record<string, any[]> = {};
  for (const lb of leaderboard) {
    const uid = lb.uid || lb.id;
    if (!uid) continue;
    const bracket = baseRankByUid[uid] || "Unranked";
    if (!grouped[bracket]) grouped[bracket] = [];
    grouped[bracket].push(lb);
  }

  type MvpEntry = { uid: string; bracket: string };
  const mvps: MvpEntry[] = [];
  for (const bracket of Object.keys(grouped)) {
    const sorted = grouped[bracket].sort((a, b) => {
      const diff = kdaScore(b) - kdaScore(a);
      if (Math.abs(diff) > 0.01) return diff;
      return (b.totalKills || 0) - (a.totalKills || 0);
    });
    if (sorted.length > 0) {
      mvps.push({ uid: sorted[0].uid || sorted[0].id, bracket });
    }
  }
  console.log(`Computed ${mvps.length} bracket MVPs:`);
  for (const m of mvps) {
    const p = players.find(p => p.uid === m.uid);
    console.log(`  ${m.bracket.padEnd(10)} → ${p?.riotGameName || m.uid}`);
  }

  // ── Champions ────────────────────────────────────────────────────────
  // Prefer the cached championMembers array (set by match-fetch when the
  // Grand Final concludes). Older tournaments that ended before that code
  // landed may have an empty array — fall back to reading the championship
  // team's members from the teams subcollection.
  let championMembers: any[] = tData.championMembers || [];
  if (championMembers.length === 0 && tData.championTeamId) {
    const teamDoc = await tRef.collection("teams").doc(tData.championTeamId).get();
    if (teamDoc.exists) {
      championMembers = (teamDoc.data()?.members || []) as any[];
      console.log(`(backfilled championMembers from teams/${tData.championTeamId})`);
    }
  }
  const championUids = new Set<string>(
    championMembers.map((m: any) => m?.uid).filter(Boolean)
  );
  console.log(`Champions: ${championUids.size} (team: ${tData.championTeamName || "—"})`);

  // ── Clear stale honors from prior tournaments ────────────────────────
  // Find every user whose current honor came from a DIFFERENT tournament
  // and wipe their honor fields. Point-in-time semantics: only one
  // tournament's honors live on the user doc at a time.
  const staleQuery = await db
    .collection("users")
    .where("honorTournamentId", "!=", tournamentId)
    .get();
  console.log(`Found ${staleQuery.size} users with stale honors to clear`);

  const clearChunks: FirebaseFirestore.DocumentReference[][] = [];
  let curClear: FirebaseFirestore.DocumentReference[] = [];
  for (const d of staleQuery.docs) {
    curClear.push(d.ref);
    if (curClear.length >= 450) {
      clearChunks.push(curClear);
      curClear = [];
    }
  }
  if (curClear.length > 0) clearChunks.push(curClear);

  for (const chunk of clearChunks) {
    const batch = db.batch();
    for (const ref of chunk) {
      batch.update(ref, {
        mvpBracket: FieldValue.delete(),
        isChampion: FieldValue.delete(),
        honorTournamentId: FieldValue.delete(),
        honorTournamentName: FieldValue.delete(),
        honorUpdatedAt: FieldValue.delete(),
      });
    }
    await batch.commit();
  }
  console.log(`✓ Cleared stale honors from ${staleQuery.size} users`);

  // ── Stamp new honors ─────────────────────────────────────────────────
  const honoredUids = new Set<string>([
    ...mvps.map(m => m.uid),
    ...Array.from(championUids),
  ]);
  const updatedAt = new Date().toISOString();
  const mvpByUid = new Map<string, string>(mvps.map(m => [m.uid, m.bracket]));

  let setCount = 0;
  let stampChunks: { uid: string; data: any }[] = Array.from(honoredUids).map(uid => ({
    uid,
    data: {
      mvpBracket: mvpByUid.get(uid) || null,
      isChampion: championUids.has(uid) || null,
      honorTournamentId: tournamentId,
      honorTournamentName: tournamentName,
      honorUpdatedAt: updatedAt,
    },
  }));

  while (stampChunks.length > 0) {
    const chunk = stampChunks.splice(0, 450);
    const batch = db.batch();
    for (const { uid, data } of chunk) {
      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        console.warn(`  ! user ${uid} not found, skipping`);
        continue;
      }
      // Strip nulls from set payload — Firestore prefers undefined/missing.
      const payload: any = {
        honorTournamentId: data.honorTournamentId,
        honorTournamentName: data.honorTournamentName,
        honorUpdatedAt: data.honorUpdatedAt,
      };
      if (data.mvpBracket) payload.mvpBracket = data.mvpBracket;
      else payload.mvpBracket = FieldValue.delete();
      if (data.isChampion) payload.isChampion = true;
      else payload.isChampion = FieldValue.delete();
      batch.update(userRef, payload);
      setCount++;
    }
    await batch.commit();
  }
  console.log(`✓ Stamped honors on ${setCount} users`);

  console.log("\nDone.");
  process.exit(0);
}

run().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
