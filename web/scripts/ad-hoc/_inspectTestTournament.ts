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
const TID = "dota-test-major-shrey";
(async () => {
  const tref = db.collection("tournaments").doc(TID);
  const t = await tref.get();
  console.log("=== Tournament doc ===");
  if (!t.exists) { console.log("  NOT FOUND"); process.exit(1); }
  const td = t.data() as any;
  console.log(`  name: ${td.name}`);
  console.log(`  game: ${td.game}`);
  console.log(`  isTestTournament: ${td.isTestTournament}`);
  console.log(`  visibleToUids: ${JSON.stringify(td.visibleToUids)}`);
  console.log(`  discordChannelId: ${td.discordChannelId}`);
  console.log(`  testDiscordChannelId: ${td.testDiscordChannelId}`);
  console.log(`  status: ${td.status}`);

  console.log("\n=== Teams ===");
  const teams = await tref.collection("teams").get();
  for (const d of teams.docs) {
    const tm = d.data() as any;
    console.log(`  ${d.id}: ${tm.teamName}`);
    console.log(`    members: ${JSON.stringify(tm.members)}`);
  }

  console.log("\n=== Matches ===");
  const matches = await tref.collection("matches").get();
  for (const d of matches.docs) {
    const m = d.data() as any;
    console.log(`  ${d.id}: ${m.team1Name} (${m.team1Id}) vs ${m.team2Name} (${m.team2Id})`);
    console.log(`    status=${m.status} bracket=${m.isBracket} scheduledTime=${m.scheduledTime}`);
    if (m.vetoState) console.log(`    vetoState: ${JSON.stringify(m.vetoState)}`);
    if (m.lobbyName) console.log(`    lobbyName=${m.lobbyName} pw=${m.lobbyPassword}`);
  }

  console.log("\n=== Major + Shrey user docs ===");
  for (const uid of ["discord_1302366375263735808", "steam_76561198089387830"]) {
    const u = await db.collection("users").doc(uid).get();
    if (u.exists) {
      const ud = u.data() as any;
      console.log(`  ${uid}: ${ud.fullName || ud.steamName || ud.discordUsername} | steamId=${ud.steamId} | discordId=${ud.discordId}`);
    } else {
      console.log(`  ${uid}: NOT FOUND`);
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
