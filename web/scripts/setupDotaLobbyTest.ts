/**
 * Set up a controlled 1v1 Dota lobby test in the `zz-test-dota-lobby-flow`
 * tournament: team-1 = bubble, team-2 = major, plus one match between them.
 *
 * Step 1 (always): verify both have a linked Steam ID (required for the
 *   GC invite). Prints a loud warning if not.
 * Step 2 (only with --create): write the 2 teams + 1 match.
 *
 * Run: npx tsx scripts/setupDotaLobbyTest.ts            # check only
 *      npx tsx scripts/setupDotaLobbyTest.ts --create   # check + create
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

const TID = "zz-test-dota-lobby-flow";
const DO_CREATE = process.argv.includes("--create");
const STEAM64_BASE = BigInt("76561197960265728");

// From the earlier voice-panel owner lookup.
const PEOPLE = {
  bubble: { uid: "discord_760183283182206987", label: "bubble (Shay / bubble_subu)" },
  major:  { uid: "discord_1302366375263735808", label: "major (Sarthak / major1506_31908)" },
};

async function main() {
  const db = getFirestore();

  // ── Step 1: verify Steam linkage ──────────────────────────────────────────
  const resolved: Record<string, any> = {};
  for (const [key, p] of Object.entries(PEOPLE)) {
    const u = (await db.collection("users").doc(p.uid).get()).data();
    if (!u) { console.log(`❌ ${p.label}: user doc ${p.uid} NOT FOUND`); process.exit(1); }
    const steamId = u.steamId || null;
    const steam32 = steamId ? (BigInt(steamId) - STEAM64_BASE).toString() : null;
    resolved[key] = {
      uid: p.uid, label: p.label,
      fullName: u.fullName, discordId: u.discordId || null,
      steamId, steam32, steamName: u.steamName || null,
    };
    const ok = !!steam32;
    console.log(`${ok ? "✅" : "⚠️ "} ${p.label}`);
    console.log(`     discord=${u.discordId || "—"}  steam64=${steamId || "— (NOT LINKED)"}  steam32=${steam32 || "—"}  steamName=${u.steamName || "—"}`);
  }

  const bothHaveSteam = resolved.bubble.steam32 && resolved.major.steam32;
  if (!bothHaveSteam) {
    console.log(`\n⚠️  At least one player has NO linked Steam. The bot's GC invite is`);
    console.log(`    Steam-based — that player will only get the Discord DM, not an`);
    console.log(`    in-Dota invite. You can still test, but the invite check will`);
    console.log(`    only pass for the Steam-linked player.`);
  } else {
    console.log(`\n✅ Both players have a resolvable Steam ID — GC invites can be sent to both.`);
  }

  if (!DO_CREATE) {
    console.log(`\n🟡 Check only. Re-run with --create to write the teams + match.`);
    return;
  }

  // ── Step 2: write teams + match ───────────────────────────────────────────
  const tRef = db.collection("tournaments").doc(TID);
  if (!(await tRef.get()).exists) { console.log(`❌ tournaments/${TID} not found`); process.exit(1); }
  const now = new Date().toISOString();

  const mkTeam = (idx: number, who: any) => ({
    id: `team-${idx}`,
    tournamentId: TID,
    teamIndex: idx,
    teamName: idx === 1 ? "TEAM BUBBLE" : "TEAM MAJOR",
    captainUid: who.uid,
    bracket: "crusader_archon",
    isDummy: true,
    members: [{
      uid: who.uid,
      fullName: who.fullName || who.label,
      discordId: who.discordId || "",
      steamName: who.steamName || "",
    }],
    createdAt: now,
  });

  const team1 = mkTeam(1, resolved.bubble);
  const team2 = mkTeam(2, resolved.major);
  await tRef.collection("teams").doc("team-1").set(team1);
  await tRef.collection("teams").doc("team-2").set(team2);

  const match = {
    id: "r1-match-1",
    tournamentId: TID,
    team1Id: "team-1", team1Name: "TEAM BUBBLE", team1Logo: "",
    team2Id: "team-2", team2Name: "TEAM MAJOR", team2Logo: "",
    scheduledTime: now,
    bestOf: 1,
    matchDay: 1, matchIndex: 1,
    isBracket: false,
    status: "pending",
    team1Score: 0, team2Score: 0,
    isDummy: true,
    createdAt: now,
  };
  await tRef.collection("matches").doc("r1-match-1").set(match);

  console.log(`\n✅ Created team-1 (bubble) + team-2 (major) + match r1-match-1`);
  console.log(`   Tournament: [DOTA2] ZZ Test Dota Lobby Flow`);
  console.log(`   When you click "Set Lobby & Notify" on this match, the synthesized`);
  console.log(`   queue id will be: tournament_${TID}_r1-match-1_g1`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
