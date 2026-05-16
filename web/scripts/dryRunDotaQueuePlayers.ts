/**
 * DRY RUN — resolves a Dota tournament match's two teams into the
 * bot QueuePlayer[] that the new set-lobby path would write to botQueues.
 * Read-only: no Firestore writes, no bot trigger. Proves Steam-ID
 * resolution works with real tournament data.
 *
 * Run: npx tsx scripts/dryRunDotaQueuePlayers.ts [tournamentId] [matchId]
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

const TID = process.argv[2] || "domin8-ultimate-tilt-proof-tournament";
const MID = process.argv[3] || "r1-match-1";
const STEAM64_BASE = BigInt("76561197960265728");

async function main() {
  const db = getFirestore();
  const tRef = db.collection("tournaments").doc(TID);
  const match = (await tRef.collection("matches").doc(MID).get()).data();
  if (!match) { console.error(`match ${MID} not found`); process.exit(1); }

  console.log(`Match ${MID}: ${match.team1Name} (${match.team1Id}) vs ${match.team2Name} (${match.team2Id})\n`);

  const [t1, t2] = await Promise.all([
    tRef.collection("teams").doc(match.team1Id).get(),
    tRef.collection("teams").doc(match.team2Id).get(),
  ]);
  const members = [
    ...((t1.data()?.members || []) as any[]),
    ...((t2.data()?.members || []) as any[]),
  ];

  const now = new Date().toISOString();
  let withSteam = 0;
  const players = [];
  for (const m of members) {
    let steamId: string | null = null;
    let steamName: string | null = m.steamName || null;
    let discordId: string = m.discordId || "";
    try {
      const u = (await db.collection("users").doc(m.uid).get()).data() || {};
      steamId = u.steamId || null;
      steamName = steamName || u.steamName || null;
      discordId = discordId || u.discordId || "";
    } catch { /* ignore */ }
    if (!steamId && typeof m.uid === "string" && m.uid.startsWith("steam_")) {
      steamId = m.uid.slice("steam_".length);
    }
    let steam32Id: string | null = null;
    if (steamId) { try { steam32Id = (BigInt(steamId) - STEAM64_BASE).toString(); } catch {} }
    if (steam32Id) withSteam++;
    players.push({
      discordId,
      username: m.fullName || steamName || m.uid,
      steamId,
      steam32Id,
      steamName,
      joinedAt: now,
    });
  }

  players.forEach((p, i) =>
    console.log(
      `${(i + 1).toString().padStart(2)}. ${String(p.username).padEnd(22)} ` +
      `discord=${p.discordId || "—"}  steam64=${p.steamId || "—"}  steam32=${p.steam32Id || "—"}`
    )
  );
  console.log(`\n${withSteam}/${players.length} players have a resolvable Steam ID (will get a GC invite).`);
  console.log(`queueId would be: tournament_${TID}_${MID}_g1`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
