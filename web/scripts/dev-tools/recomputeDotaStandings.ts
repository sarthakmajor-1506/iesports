/**
 * Recompute Domin8 standings from scratch based on every completed match.
 * Also backfills the `winner` field on matches that have scores but no
 * winner stamped (old matches before the winner pipeline existed).
 *
 * Wins = 3 pts, Draw = 1 pt, Loss = 0 pts (standard Swiss).
 * Kills tally from playerStats when present; otherwise just W/L.
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
const TID = "domin8-ultimate-tilt-proof-tournament";

(async () => {
  const tref = db.collection("tournaments").doc(TID);

  // 1) Load all completed matches
  const msnap = await tref.collection("matches").where("status", "==", "completed").get();
  const matches: any[] = msnap.docs.map(d => ({ id: d.id, _ref: d.ref, ...d.data() }));
  console.log(`Found ${matches.length} completed matches.\n`);

  // 2) Backfill missing winner fields from scores
  for (const m of matches) {
    if (!m.winner) {
      const t1 = m.team1Score ?? 0;
      const t2 = m.team2Score ?? 0;
      let w: "team1" | "team2" | null = null;
      if (t1 > t2) w = "team1"; else if (t2 > t1) w = "team2";
      if (w) {
        await m._ref.set({ winner: w }, { merge: true });
        m.winner = w;
        const wn = w === "team1" ? m.team1Name : m.team2Name;
        console.log(`  ✓ backfilled ${m.id}.winner = ${w} (${wn})`);
      }
    }
  }

  // 3) Aggregate per-team stats
  type S = {
    teamId: string; teamName: string;
    played: number; wins: number; losses: number; draws: number;
    points: number;
    killsFor: number; killsAgainst: number;
    mapsWon: number; mapsLost: number;
  };
  const std: Record<string, S> = {};
  const init = (tid: string, name: string) => {
    if (!std[tid]) std[tid] = {
      teamId: tid, teamName: name,
      played: 0, wins: 0, losses: 0, draws: 0, points: 0,
      killsFor: 0, killsAgainst: 0,
      mapsWon: 0, mapsLost: 0,
    };
  };

  for (const m of matches) {
    if (!m.team1Id || !m.team2Id) continue;
    init(m.team1Id, m.team1Name);
    init(m.team2Id, m.team2Name);
    const a = std[m.team1Id];
    const b = std[m.team2Id];
    a.played++; b.played++;

    // map-level (each completed match = 1 map for BO1)
    const t1Maps = m.team1Score || 0;
    const t2Maps = m.team2Score || 0;
    a.mapsWon += t1Maps; a.mapsLost += t2Maps;
    b.mapsWon += t2Maps; b.mapsLost += t1Maps;

    if (m.winner === "team1") { a.wins++; b.losses++; a.points += 3; }
    else if (m.winner === "team2") { b.wins++; a.losses++; b.points += 3; }
    else { a.draws++; b.draws++; a.points++; b.points++; }

    // kill totals from playerStats when present
    const ps: any[] = m.game1?.playerStats || m.playerStats || [];
    if (Array.isArray(ps) && ps.length > 0) {
      // each playerStat has side: "radiant"|"dire". Map to team via result.team1Side
      const team1Side = m.result?.team1Side || m.game1?.team1Side;
      let t1Kills = 0, t2Kills = 0;
      for (const p of ps) {
        const k = p.kills || 0;
        if (team1Side) {
          if (p.side === team1Side) t1Kills += k; else t2Kills += k;
        } else if (p.teamId) {
          if (p.teamId === m.team1Id) t1Kills += k;
          else if (p.teamId === m.team2Id) t2Kills += k;
        }
      }
      a.killsFor += t1Kills; a.killsAgainst += t2Kills;
      b.killsFor += t2Kills; b.killsAgainst += t1Kills;
    }
  }

  // 4) Write back
  console.log("\n=== New standings ===");
  const batch = db.batch();
  for (const tid of Object.keys(std)) {
    const s = std[tid];
    const killDiff = s.killsFor - s.killsAgainst;
    console.log(`  ${s.teamName.padEnd(24)} ${s.played}P  ${s.wins}W-${s.losses}L-${s.draws}D  ${s.points}pts  K:${s.killsFor}/${s.killsAgainst} (${killDiff > 0 ? "+" : ""}${killDiff})`);
    batch.set(tref.collection("standings").doc(tid), {
      ...s, killDiff,
    }, { merge: true });
  }
  await batch.commit();
  console.log(`\n✅ ${Object.keys(std).length} standings rows written.`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
