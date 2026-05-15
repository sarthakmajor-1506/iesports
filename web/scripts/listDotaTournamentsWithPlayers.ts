/**
 * One-off: list Dota 2 tournaments with their registered-player counts and
 * a sample of player Discord IDs. Helps pick which tournament to wire up
 * a private text channel for.
 *
 * Run: npx tsx scripts/listDotaTournamentsWithPlayers.ts
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

async function main() {
  const db = getFirestore();

  // Collect from both Dota 5v5 (`tournaments`) and Dota solo (`soloTournaments`)
  // by querying users with the respective `registered*` arrays.
  const usersSnap = await db.collection("users").get();
  const t5Count = new Map<string, number>();
  const soloCount = new Map<string, number>();
  for (const u of usersSnap.docs) {
    const d = u.data() as any;
    if (!d.discordId) continue;
    for (const tid of d.registeredTournaments || []) t5Count.set(tid, (t5Count.get(tid) || 0) + 1);
    for (const tid of d.registeredSoloTournaments || []) soloCount.set(tid, (soloCount.get(tid) || 0) + 1);
  }

  // Resolve names for each tournament id
  const fmt = async (counts: Map<string, number>, coll: string, label: string) => {
    console.log(`\n═══ ${label} (${coll}) ═══`);
    if (counts.size === 0) return console.log("  (none)");
    const rows: { id: string; name: string; status: string; players: number }[] = [];
    for (const [id, n] of counts) {
      const doc = await db.collection(coll).doc(id).get();
      const d = doc.data() as any;
      rows.push({ id, name: d?.name || id, status: d?.status || "?", players: n });
    }
    rows.sort((a, b) => b.players - a.players);
    rows.forEach(r => console.log(`  [${r.players.toString().padStart(2)} players]  ${r.status.padEnd(10)} ${r.name}  (${r.id})`));
  };

  await fmt(t5Count, "tournaments", "Dota 5v5");
  await fmt(soloCount, "soloTournaments", "Dota Solo");

  // Also check if there's a `soloPool` (the player-pool tournaments)
  const soloPoolSnap = await db.collection("soloPool").get();
  if (soloPoolSnap.size > 0) {
    console.log(`\n═══ Dota Solo Pool ═══`);
    soloPoolSnap.forEach(d => {
      const dt = d.data() as any;
      console.log(`  ${dt.name || d.id}  (${d.id})  members=${(dt.members || []).length}`);
    });
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
