/**
 * Resolve Ascension Round 5 TBD pairings from post-Round-4 standings.
 * Mirrors the canonical logic in app/api/valorant/resolve-round/route.ts
 * (Swiss: sort by points → map diff → teamIndex; pair adjacent; avoid rematches).
 *
 *   npx tsx scripts/resolveAscensionRound5.ts            # dry-run (no writes)
 *   npx tsx scripts/resolveAscensionRound5.ts --apply    # write to Firestore
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

const TID = "league-of-rising-stars-ascension";
const COMPLETED_ROUND = 4;
const NEXT_ROUND = COMPLETED_ROUND + 1;
const APPLY = process.argv.includes("--apply");

function fmtIST(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit",
    month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

async function main() {
  const tRef = db.collection("valorantTournaments").doc(TID);

  // CLAUDE.md Coding Rule #4: bracket matches reuse `matchDay`, so the Swiss
  // logic must exclude isBracket===true docs (e.g. lb-semi also has matchDay=4).
  const isSwiss = (d: FirebaseFirestore.QueryDocumentSnapshot) =>
    d.data().isBracket !== true;

  // ── Guard: all completed-round Swiss matches must be done ────────────────
  const completed = (await tRef.collection("matches")
    .where("matchDay", "==", COMPLETED_ROUND).get()).docs.filter(isSwiss);
  const allDone = completed.length > 0 && completed.every((d) => d.data().status === "completed");
  if (!allDone) {
    throw new Error(`Round ${COMPLETED_ROUND} Swiss matches not fully completed — aborting.`);
  }

  // ── Next-round TBD docs ──────────────────────────────────────────────────
  const nextSnap = await tRef.collection("matches").where("matchDay", "==", NEXT_ROUND).get();
  const tbdDocs = nextSnap.docs
    .filter((d) => isSwiss(d) && d.data().isTBD === true)
    .sort((a, b) => a.data().matchIndex - b.data().matchIndex);
  if (!tbdDocs.length) throw new Error(`No TBD matches for round ${NEXT_ROUND}.`);

  // ── Standings ────────────────────────────────────────────────────────────
  const stSnap = await tRef.collection("standings").get();
  const standings: Record<string, { points: number; teamName: string; mapsWon: number; mapsLost: number }> = {};
  for (const d of stSnap.docs) {
    const x = d.data();
    standings[d.id] = {
      points: x.points || 0, teamName: x.teamName || d.id,
      mapsWon: x.mapsWon || 0, mapsLost: x.mapsLost || 0,
    };
  }

  // ── Teams ────────────────────────────────────────────────────────────────
  const teamsSnap = await tRef.collection("teams").orderBy("teamIndex").get();
  const teams = teamsSnap.docs.map((d) => ({
    id: d.id, teamName: d.data().teamName, teamIndex: d.data().teamIndex,
  }));

  // ── Past pairings (avoid rematches) ──────────────────────────────────────
  const allMatches = await tRef.collection("matches").get();
  const past = new Set<string>();
  for (const d of allMatches.docs) {
    if (!isSwiss(d)) continue;
    const x = d.data();
    if (x.team1Id !== "TBD" && x.team2Id !== "TBD" && x.team1Id && x.team2Id) {
      past.add(`${x.team1Id}-${x.team2Id}`);
      past.add(`${x.team2Id}-${x.team1Id}`);
    }
  }

  // ── Swiss sort ───────────────────────────────────────────────────────────
  const sorted = [...teams].sort((a, b) => {
    const pa = standings[a.id]?.points || 0, pb = standings[b.id]?.points || 0;
    if (pb !== pa) return pb - pa;
    const da = (standings[a.id]?.mapsWon || 0) - (standings[a.id]?.mapsLost || 0);
    const dbb = (standings[b.id]?.mapsWon || 0) - (standings[b.id]?.mapsLost || 0);
    if (dbb !== da) return dbb - da;
    return a.teamIndex - b.teamIndex;
  });

  const used = new Set<string>();
  const pairings: { team1: typeof teams[0]; team2: typeof teams[0]; rematch: boolean }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(sorted[i].id)) continue;
    let paired = false;
    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(sorted[j].id)) continue;
      if (!past.has(`${sorted[i].id}-${sorted[j].id}`)) {
        pairings.push({ team1: sorted[i], team2: sorted[j], rematch: false });
        used.add(sorted[i].id); used.add(sorted[j].id); paired = true; break;
      }
    }
    if (!paired && !used.has(sorted[i].id)) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (!used.has(sorted[j].id)) {
          pairings.push({ team1: sorted[i], team2: sorted[j], rematch: true });
          used.add(sorted[i].id); used.add(sorted[j].id); break;
        }
      }
    }
  }

  // ── Break rematches ──────────────────────────────────────────────────────
  // For each rematch pairing, find a swap with another pairing such that BOTH
  // resulting pairings are fresh; prefer the swap that least disturbs seeding
  // (smallest |index distance| of the swapped-in team).
  const isPast = (a: string, b: string) => past.has(`${a}-${b}`);
  const seedIdx = new Map(sorted.map((t, i) => [t.id, i]));
  for (let a = 0; a < pairings.length; a++) {
    const pa = pairings[a];
    if (!pa.rematch) continue;
    let best: { b: number; swapTeam2OfA: boolean; cost: number } | null = null;
    for (let b = 0; b < pairings.length; b++) {
      if (b === a) continue;
      const pb = pairings[b];
      // Try swapping pa.team2 with pb.team1, and pa.team2 with pb.team2
      const trials: [boolean, typeof pa.team1, typeof pa.team1][] = [
        [true, pb.team1, pb.team2], // pa.team2 <-> pb.team1
        [false, pb.team2, pb.team1], // pa.team2 <-> pb.team2
      ];
      for (const [swapT1, incoming, partner] of trials) {
        // resulting pa: pa.team1 vs incoming ; resulting pb: partner vs pa.team2
        if (isPast(pa.team1.id, incoming.id)) continue;
        if (isPast(partner.id, pa.team2.id)) continue;
        const cost = Math.abs((seedIdx.get(incoming.id)!) - (seedIdx.get(pa.team2.id)!));
        if (!best || cost < best.cost) best = { b, swapTeam2OfA: swapT1, cost };
      }
    }
    if (best) {
      const pb = pairings[best.b];
      const out = pa.team2;
      if (best.swapTeam2OfA) {
        pa.team2 = pb.team1; pb.team1 = out;
      } else {
        pa.team2 = pb.team2; pb.team2 = out;
      }
      pa.rematch = isPast(pa.team1.id, pa.team2.id);
      pb.rematch = isPast(pb.team1.id, pb.team2.id);
      console.log(`Broke rematch in match${a + 1}: swapped ${out.teamName} ↔ ${(best.swapTeam2OfA ? "team1" : "team2")} of match${best.b + 1}`);
    } else {
      console.log(`⚠️ Could not break rematch in match${a + 1} (no clean swap exists)`);
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────
  console.log(`Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);
  console.log(`\nStandings after Round ${COMPLETED_ROUND} (seed order):`);
  sorted.forEach((t, i) => {
    const s = standings[t.id];
    console.log(`  ${String(i + 1).padStart(2)}. ${String(s.teamName).padEnd(28)} ` +
      `pts=${s.points} mapDiff=${(s.mapsWon - s.mapsLost >= 0 ? "+" : "")}${s.mapsWon - s.mapsLost}`);
  });

  console.log(`\nRound ${NEXT_ROUND} pairings:`);
  const n = Math.min(pairings.length, tbdDocs.length);
  for (let i = 0; i < n; i++) {
    const p = pairings[i];
    const doc = tbdDocs[i];
    console.log(`  ${doc.id}  (${fmtIST(doc.data().scheduledTime)} IST)`);
    console.log(`     ${p.team1.teamName}  vs  ${p.team2.teamName}` +
      (p.rematch ? "   ⚠️ REMATCH (no unplayed opponent available)" : ""));
  }

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to write.");
    return;
  }

  const batch = db.batch();
  for (let i = 0; i < n; i++) {
    const p = pairings[i];
    batch.update(tbdDocs[i].ref, {
      team1Id: p.team1.id, team2Id: p.team2.id,
      team1Name: p.team1.teamName, team2Name: p.team2.teamName,
      isTBD: false,
    });
  }
  batch.update(tRef, { currentMatchDay: NEXT_ROUND });
  await batch.commit();
  console.log(`\n✅ Wrote ${n} Round ${NEXT_ROUND} pairings + currentMatchDay=${NEXT_ROUND}.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
