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
const DOMIN8 = "domin8-ultimate-tilt-proof-tournament";
const TEST = "dota-test-major-shrey";
const TEST_CHANNEL = "1507408605593206844";

(async () => {
  console.log("=== DOMIN8 TOURNAMENT PREFLIGHT ===\n");

  // 1. Tournament doc
  const tDoc = await db.collection("tournaments").doc(DOMIN8).get();
  if (!tDoc.exists) { console.log("❌ Domin8 tournament not found!"); process.exit(1); }
  const t = tDoc.data() as any;
  console.log("Tournament:");
  console.log(`  id: ${DOMIN8}`);
  console.log(`  name: ${t.name}`);
  console.log(`  game: ${t.game}`);
  console.log(`  status: ${t.status}`);
  console.log(`  isTestTournament: ${t.isTestTournament || false}`);
  console.log(`  discordChannelId: ${t.discordChannelId}`);
  if (t.discordChannelId === TEST_CHANNEL) console.log(`  ⚠️  WARNING: discordChannelId equals TEST channel!`);
  else if (!t.discordChannelId) console.log(`  ⚠️  WARNING: no discordChannelId — will fall back to LOBBY_CONTROL_CHANNEL_ID env var`);
  else console.log(`  ✓ Channel is set and NOT the test channel`);

  // 2. Test tournament check (just to confirm separation)
  const testDoc = await db.collection("tournaments").doc(TEST).get();
  if (testDoc.exists) {
    const tt = testDoc.data() as any;
    console.log(`\nTest tournament (for comparison):`);
    console.log(`  id: ${TEST}`);
    console.log(`  discordChannelId: ${tt.discordChannelId}`);
    console.log(`  isTestTournament: ${tt.isTestTournament}`);
  }

  // 3. Upcoming Domin8 matches tonight
  console.log("\n=== Tonight's Scheduled Matches ===");
  const now = Date.now();
  const matches = await db.collection("tournaments").doc(DOMIN8).collection("matches").get();
  const upcoming: any[] = [];
  matches.docs.forEach(d => {
    const m = d.data() as any;
    if (m.status === "completed") return;
    if (!m.scheduledTime) return;
    const t = Date.parse(m.scheduledTime);
    if (t < now - 3600 * 1000) return; // skip > 1hr ago
    upcoming.push({ id: d.id, t, m });
  });
  upcoming.sort((a, b) => a.t - b.t);
  upcoming.forEach(({ id, t, m }) => {
    const ist = new Date(t + 5.5 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16) + " IST";
    console.log(`  ${id}: ${ist} | ${m.team1Name} vs ${m.team2Name} | status=${m.status}`);
    if (m.vetoState) console.log(`    vetoState status: ${m.vetoState.status}, cmPick: ${m.vetoState.cmPick}`);
    if (m.lobbyName) console.log(`    lobbyName: ${m.lobbyName} pw=${m.lobbyPassword}`);
    if (m.discordOpsMessageIds?.length) console.log(`    discordOpsMessageIds: ${m.discordOpsMessageIds.length} tracked`);
  });

  // 4. Stuck botQueues for Domin8
  console.log("\n=== Stuck botQueues for Domin8 (status=in_progress or pending) ===");
  const qs = await db.collection("botQueues").where("tournamentId", "==", DOMIN8).get();
  let stuck = 0;
  qs.docs.forEach(q => {
    const qd = q.data() as any;
    if (qd.status === "in_progress" || qd.status === "pending" || qd.status === "open") {
      console.log(`  ⚠️  ${q.id}: status=${qd.status} createdAt=${qd.createdAt} lobbyEmbedPosted=${qd.lobbyEmbedPosted} dotaMatchId=${qd.dotaMatchId}`);
      stuck++;
    }
  });
  if (stuck === 0) console.log(`  ✓ No stuck queues for Domin8`);

  // 5. Bot lobby control state
  console.log("\n=== Bot Lobby Control State ===");
  const bot = await db.collection("botLobbyControl").doc("state").get();
  if (bot.exists) {
    const bd = bot.data() as any;
    console.log(`  status: ${bd.status}`);
    console.log(`  gcReady: ${bd.gcReady}`);
    console.log(`  lobbyName: ${bd.lobbyName} | password: ${bd.password}`);
    console.log(`  lobbyMatchId: ${bd.lobbyMatchId}`);
    console.log(`  memberCount: ${bd.memberCount}`);
    console.log(`  updatedAt: ${bd.updatedAt}`);
    if (!bd.gcReady) console.log(`  ⚠️  GC not ready — bot may need Restart Bot click before tournament`);
  } else {
    console.log(`  ⚠️  No botLobbyControl state — bot may not have written heartbeat yet`);
  }

  // 6. Pending bot commands
  const pendingCmds = await db.collection("botLobbyCommands").where("status", "in", ["pending", "processing"]).get();
  if (pendingCmds.size > 0) {
    console.log(`\n=== Pending botLobbyCommands (${pendingCmds.size}) ===`);
    pendingCmds.docs.forEach(c => {
      const cd = c.data() as any;
      console.log(`  ⚠️  ${c.id}: action=${cd.action} status=${cd.status} createdAt=${cd.createdAt}`);
    });
  }

  // 7. Verify Discord channel reachability
  console.log("\n=== Discord Channel Reachability Test ===");
  const channelId = t.discordChannelId;
  if (channelId) {
    const tok = process.env.DISCORD_BOT_TOKEN;
    const r = await fetch(`https://discord.com/api/v10/channels/${channelId}`, { headers: { Authorization: `Bot ${tok}` } });
    if (r.ok) {
      const d = await r.json() as any;
      console.log(`  ✓ Channel exists: name=${d.name}, guild=${d.guild_id}`);
      // permission check via canary message — DRY RUN, don't actually post
      console.log(`  (skipping permission test — bot is already known good)`);
    } else {
      console.log(`  ❌ Channel fetch failed: HTTP ${r.status} ${await r.text()}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
