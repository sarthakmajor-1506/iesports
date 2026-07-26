import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
})});
const db = getFirestore();
const now = Date.now();
const dayMs = 86400000;

(async () => {
  console.log("=== iesports — state of platform as of " + new Date().toISOString().slice(0, 10) + " ===\n");

  // ── USERS ─────────────────────────────────────────────────────
  const usersSnap = await db.collection("users").get();
  const users = usersSnap.docs.map(d => d.data() as any);
  const total = users.length;
  const withSteam = users.filter(u => u.steamId).length;
  const withDiscord = users.filter(u => u.discordId).length;
  const withRiot = users.filter(u => u.riotPuuid || u.riotGameName).length;
  const withPhone = users.filter(u => u.phone).length;
  const withFullName = users.filter(u => u.fullName).length;
  const verifiedDota = users.filter(u => u.dotaRankTier > 0).length;
  const verifiedVal  = users.filter(u => u.riotTier > 0).length;

  // Earliest/latest by createdAt where present
  const created = users.map(u => u.createdAt ? Date.parse(u.createdAt) : 0).filter(t => t > 0).sort();
  const oldestUser = created.length ? new Date(created[0]).toISOString().slice(0, 10) : "—";
  const newestUser = created.length ? new Date(created[created.length-1]).toISOString().slice(0, 10) : "—";
  const last30d = created.filter(t => now - t < 30 * dayMs).length;
  const last7d  = created.filter(t => now - t < 7 * dayMs).length;

  console.log("USERS");
  console.log(`  Total registered:              ${total}`);
  console.log(`    with Steam linked:           ${withSteam}`);
  console.log(`    with Discord linked:         ${withDiscord}`);
  console.log(`    with Riot linked:            ${withRiot}`);
  console.log(`    with Phone verified:         ${withPhone}`);
  console.log(`    with fullName:               ${withFullName}`);
  console.log(`    Dota rank verified (tier>0): ${verifiedDota}`);
  console.log(`    Valorant rank verified:      ${verifiedVal}`);
  console.log(`  Oldest user (by createdAt):    ${oldestUser}`);
  console.log(`  Newest user (by createdAt):    ${newestUser}`);
  console.log(`  Signups last 7 days:           ${last7d}`);
  console.log(`  Signups last 30 days:          ${last30d}`);

  // ── TOURNAMENTS ───────────────────────────────────────────────
  const dotaT = await db.collection("tournaments").get();
  const valT  = await db.collection("valorantTournaments").get();
  const cs2T  = await db.collection("cs2Tournaments").get();
  const soloT = await db.collection("soloTournaments").get();

  const byStatus = (snap: any) => {
    const out: Record<string, number> = {};
    snap.docs.forEach((d: any) => {
      const st = (d.data() as any).status || "(none)";
      out[st] = (out[st] || 0) + 1;
    });
    return out;
  };

  console.log("\nTOURNAMENTS");
  console.log(`  Dota 2 (tournaments):         ${dotaT.size}`);
  console.log(`    by status: ${JSON.stringify(byStatus(dotaT))}`);
  console.log(`  Valorant (valorantTournaments): ${valT.size}`);
  console.log(`    by status: ${JSON.stringify(byStatus(valT))}`);
  console.log(`  CS2 (cs2Tournaments):         ${cs2T.size}`);
  console.log(`    by status: ${JSON.stringify(byStatus(cs2T))}`);
  console.log(`  Dota solo (soloTournaments):  ${soloT.size}`);

  // ── ACTIVE TOURNAMENT DEEP DIVE ────────────────────────────────
  console.log("\nACTIVE TOURNAMENTS (status: ongoing or upcoming)");
  for (const [name, snap] of [["Dota 2", dotaT], ["Valorant", valT], ["CS2", cs2T]] as any) {
    for (const d of snap.docs) {
      const t = d.data() as any;
      if (t.status === "completed" || t.status === "ended" || t.isTestTournament) continue;
      console.log(`  [${name}] ${d.id}`);
      console.log(`    name: ${t.name}`);
      console.log(`    status: ${t.status}, slots: ${t.slotsBooked || 0}/${t.totalSlots || 0}, teams: ${t.teamCount || 0}`);
      console.log(`    format: ${t.format}, prizePool: ${t.prizePool || 0}, entryFee: ${t.entryFee || 0}`);
      console.log(`    start: ${t.startDate}, end: ${t.endDate}`);
    }
  }

  // ── MATCHES ──────────────────────────────────────────────────
  let totalMatches = 0, completedMatches = 0, dotaMatchIds = new Set<string>();
  for (const td of dotaT.docs) {
    const ms = await td.ref.collection("matches").get();
    totalMatches += ms.size;
    ms.docs.forEach(m => {
      const md = m.data() as any;
      if (md.status === "completed") completedMatches++;
      if (md.dotaMatchId) dotaMatchIds.add(String(md.dotaMatchId));
    });
  }
  let valMatchesTotal = 0, valCompleted = 0, valBracket = 0;
  for (const tv of valT.docs) {
    const ms = await tv.ref.collection("matches").get();
    valMatchesTotal += ms.size;
    ms.docs.forEach(m => {
      const md = m.data() as any;
      if (md.status === "completed") valCompleted++;
      if (md.isBracket === true) valBracket++;
    });
  }
  console.log("\nMATCHES PLAYED");
  console.log(`  Dota 2 total match docs:      ${totalMatches}`);
  console.log(`  Dota 2 completed matches:     ${completedMatches}`);
  console.log(`  Unique Dota match IDs captured: ${dotaMatchIds.size}`);
  console.log(`  Valorant total match docs:    ${valMatchesTotal}`);
  console.log(`  Valorant completed:           ${valCompleted}`);
  console.log(`  Valorant bracket matches:     ${valBracket}`);

  // ── COMMUNITY / BOT ──────────────────────────────────────────
  const teams = await db.collection("teams").get();
  const valorantTeams = await db.collection("valorantTeams").get();
  const lobbies = await db.collection("botLobbies").get();
  const queues = await db.collection("botQueues").get();
  const completedQueues = queues.docs.filter(q => (q.data() as any).status === "completed").length;
  console.log("\nINFRASTRUCTURE / BOT");
  console.log(`  Dota teams collection:        ${teams.size}`);
  console.log(`  Valorant teams collection:    ${valorantTeams.size}`);
  console.log(`  Bot lobbies created (all-time): ${lobbies.size}`);
  console.log(`  Bot queues (all-time):        ${queues.size}`);
  console.log(`  Bot queues completed:         ${completedQueues}`);

  // ── REGISTRATIONS (per-tournament soloPlayers) ───────────────
  let activeRegistrations = 0;
  for (const td of valT.docs) {
    const t = td.data() as any;
    if (t.status === "completed" || t.status === "ended" || t.isTestTournament) continue;
    const sp = await td.ref.collection("soloPlayers").get();
    activeRegistrations += sp.size;
  }
  console.log(`\nACTIVE TOURNAMENT REGISTRATIONS (Valorant solo entries on non-completed tournaments): ${activeRegistrations}`);
  
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
