/**
 * Set up the Dota test tournament with fresh accounts that aren't stuck in
 * Dota 2's "Back to Lobby" state:
 *
 *   1. Major (discord_1302366375263735808):
 *        steamId: 76561198129242599 (Major)  →  76561198205104951 (Major O)
 *      Updates users doc + team-1 member entry + players subcollection.
 *
 *   2. Team-2: Vanshaj  →  Bsinger (bRiSINGR)
 *      Delegated to the existing swapVanshajForBsinger.ts logic, inlined here.
 *
 *   3. Resets r1-match-1 to pending + wipes any stale botQueues docs.
 *
 *   npx tsx scripts/_testAccountSwaps.ts            # dry-run
 *   npx tsx scripts/_testAccountSwaps.ts --apply    # commit
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
const db = getFirestore();
const APPLY = process.argv.includes("--apply");
const TID = "dota-test-major-shrey";

// ───── Major Steam swap ────────────────────────────────────────────────────
const MAJOR = {
  uid: "discord_1302366375263735808",
  discordId: "1302366375263735808",
  OLD_steamId: "76561198129242599",
  OLD_steamName: "Major",
  NEW_steamId: "76561198205104951",   // "Major O" — verified via Discord
  NEW_steamName: "Major O",
};

// ───── Vanshaj  →  Bsinger ─────────────────────────────────────────────────
const VANSHAJ = { uid: "discord_1364667323860127815", discordId: "1364667323860127815" };
const BSINGER = {
  uid: "steam_76561198329575612",
  fullName: "Mohit Taparia",
  steamId: "76561198329575612",
  steamName: "bRiSINGR",
  discordId: "673154894060060682",
  discordUsername: "brisingr07021996",
  dotaRankTier: 42,
  dotaBracket: "crusader_archon",
};

// Try to fetch Steam avatar for Major O from Steam API
async function fetchSteamAvatar(steam64: string): Promise<string> {
  const key = process.env.STEAM_API_KEY;
  if (!key) return "";
  try {
    const r = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${steam64}`);
    const j: any = await r.json();
    return j?.response?.players?.[0]?.avatarfull || "";
  } catch { return ""; }
}

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  // ── 1. MAJOR: fetch new avatar + show old/new ─────────────────────────────
  const majorRef = db.collection("users").doc(MAJOR.uid);
  const majorSnap = await majorRef.get();
  const majorBefore: any = majorSnap.data() || {};
  const majorNewAvatar = await fetchSteamAvatar(MAJOR.NEW_steamId);
  console.log("=== Major Steam swap ===");
  console.log(`  uid:          ${MAJOR.uid}`);
  console.log(`  steamName:    ${majorBefore.steamName}  →  ${MAJOR.NEW_steamName}`);
  console.log(`  steamId:      ${majorBefore.steamId}  →  ${MAJOR.NEW_steamId}`);
  console.log(`  steamAvatar:  ${(majorBefore.steamAvatar || "").slice(0, 60)}…  →  ${majorNewAvatar ? majorNewAvatar.slice(0, 60) + "…" : "(empty)"}\n`);

  // ── 2. BSINGER: fetch avatar from existing user doc ──────────────────────
  const bDoc = await db.collection("users").doc(BSINGER.uid).get();
  if (!bDoc.exists) throw new Error(`Bsinger user doc ${BSINGER.uid} not found`);
  const bData: any = bDoc.data() || {};
  const bsingerAvatar: string = bData.steamAvatar || "";
  console.log("=== Team-2: Vanshaj → Bsinger ===");
  console.log(`  Out: Vanshaj (${VANSHAJ.uid})`);
  console.log(`  In:  ${BSINGER.fullName} (${BSINGER.uid}, ${BSINGER.steamName})\n`);

  // ── 3. Match reset preview ────────────────────────────────────────────────
  const tRef = db.collection("tournaments").doc(TID);
  const tData: any = (await tRef.get()).data() || {};
  const matchSnap = await tRef.collection("matches").doc("r1-match-1").get();
  const m: any = matchSnap.data() || {};
  const queueSnap = await db.collection("botQueues")
    .where("tournamentId", "==", TID)
    .where("tournamentMatchId", "==", "r1-match-1").get();
  console.log("=== Match reset ===");
  console.log(`  r1-match-1 status: ${m.status} → pending`);
  console.log(`  botQueueId: ${m.botQueueId || "—"} → wiped`);
  console.log(`  botQueues docs to delete: ${queueSnap.size}\n`);

  if (!APPLY) { console.log("🟡 DRY RUN — pass --apply to commit."); return; }

  const batch = db.batch();

  // ── 1. Major user doc — swap Steam fields ─────────────────────────────────
  batch.set(majorRef, {
    steamId: MAJOR.NEW_steamId,
    steamName: MAJOR.NEW_steamName,
    steamAvatar: majorNewAvatar,
    // Wipe stale rank/match data tied to the old Steam account
    recentMatches: FieldValue.delete(),
    dotaMMR: 0,
    rankFetchedAt: FieldValue.delete(),
  }, { merge: true });

  // ── 1b. team-1 members entry for Major ────────────────────────────────────
  const team1Ref = tRef.collection("teams").doc("team-1");
  const team1Doc = (await team1Ref.get()).data() as any;
  if (team1Doc?.members?.length) {
    const updatedMembers = team1Doc.members.map((mem: any) =>
      mem.uid === MAJOR.uid
        ? { ...mem, steamId: MAJOR.NEW_steamId, steamName: MAJOR.NEW_steamName, steamAvatar: majorNewAvatar }
        : mem
    );
    batch.set(team1Ref, { members: updatedMembers }, { merge: true });
  }

  // ── 1c. players subcollection entry for Major ─────────────────────────────
  const majorPlayerRef = tRef.collection("players").doc(MAJOR.uid);
  batch.set(majorPlayerRef, {
    steamId: MAJOR.NEW_steamId,
    steamName: MAJOR.NEW_steamName,
    steamAvatar: majorNewAvatar,
  }, { merge: true });

  // ── 2. Tournament doc — keep visibleToUids updated for Bsinger ────────────
  batch.set(tRef, {
    name: "Dota Internal Test — Major vs Bsinger",
    visibleToUids: [MAJOR.uid, BSINGER.uid],
  }, { merge: true });

  // ── 2b. team-2 — full rewrite to Bsinger ─────────────────────────────────
  const team2Ref = tRef.collection("teams").doc("team-2");
  batch.set(team2Ref, {
    id: "team-2", tournamentId: TID, teamIndex: 2,
    teamName: BSINGER.fullName, captainUid: BSINGER.uid,
    bracket: BSINGER.dotaBracket, avgMMR: 0, totalMMR: 0,
    avgRankTier: BSINGER.dotaRankTier, avgSkillLevel: 0,
    roleCoverage: { safe_lane: true, mid: true, off_lane: true, soft_support: true, hard_support: true },
    members: [{
      uid: BSINGER.uid, fullName: BSINGER.fullName,
      steamName: BSINGER.steamName, steamId: BSINGER.steamId, steamAvatar: bsingerAvatar,
      discordId: BSINGER.discordId, discordUsername: BSINGER.discordUsername,
      dotaRankTier: BSINGER.dotaRankTier, dotaBracket: BSINGER.dotaBracket, dotaMMR: 0,
      iesportsRank: BSINGER.dotaBracket, iesportsTier: BSINGER.dotaRankTier, iesportsRating: 0,
      skillLevel: 0, rolePreferences: ["mid"], assignedRole: "mid", assignedRoleLabel: "Mid",
    }],
  });

  // ── 2c. Players subcollection — remove Vanshaj, add Bsinger ───────────────
  batch.delete(tRef.collection("players").doc(VANSHAJ.uid));
  batch.set(tRef.collection("players").doc(BSINGER.uid), {
    uid: BSINGER.uid, fullName: BSINGER.fullName,
    steamName: BSINGER.steamName, steamId: BSINGER.steamId, steamAvatar: bsingerAvatar,
    discordId: BSINGER.discordId, discordUsername: BSINGER.discordUsername,
    dotaRankTier: BSINGER.dotaRankTier, dotaBracket: BSINGER.dotaBracket, dotaMMR: 0,
    rolePreferences: ["mid"], registeredAt: new Date().toISOString(),
  });

  // ── 2d. registeredTournaments fields ──────────────────────────────────────
  batch.set(db.collection("users").doc(VANSHAJ.uid), {
    registeredTournaments: FieldValue.arrayRemove(TID),
  }, { merge: true });
  batch.set(db.collection("users").doc(BSINGER.uid), {
    registeredTournaments: FieldValue.arrayUnion(TID),
  }, { merge: true });

  // ── 3. Reset r1-match-1 + delete stale botQueues ──────────────────────────
  const matchRef = tRef.collection("matches").doc("r1-match-1");
  batch.update(matchRef, {
    team2Name: BSINGER.fullName,
    status: "pending", team1Score: 0, team2Score: 0,
    botQueueId: FieldValue.delete(), lobbyName: FieldValue.delete(),
    lobbyPassword: FieldValue.delete(), lobbyMode: FieldValue.delete(),
    lobbyStatus: FieldValue.delete(), lobbySetAt: FieldValue.delete(),
    team1Subs: FieldValue.delete(), team2Subs: FieldValue.delete(),
    vetoState: FieldValue.delete(), game1: FieldValue.delete(),
    games: FieldValue.delete(), winnerTeamId: FieldValue.delete(),
    completedAt: FieldValue.delete(), startedAt: FieldValue.delete(),
    dotaMatchId: FieldValue.delete(), durationSec: FieldValue.delete(),
    dataSource: FieldValue.delete(),
  });
  for (const q of queueSnap.docs) batch.delete(q.ref);

  await batch.commit();
  console.log("✅ Firestore swap committed.\n");

  // ── 4. Discord — swap Vanshaj's channel perm for Bsinger's, rename ────────
  const channelId = tData.discordChannelId;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!channelId || !botToken) {
    console.log("⚠️  No discordChannelId or DISCORD_BOT_TOKEN — skipping Discord perm swap.");
    return;
  }
  const DISCORD_API = "https://discord.com/api/v10";
  const PERMS = {
    VIEW_CHANNEL: 1 << 10, SEND_MESSAGES: 1 << 11, EMBED_LINKS: 1 << 14,
    ATTACH_FILES: 1 << 15, READ_MESSAGE_HISTORY: 1 << 16, ADD_REACTIONS: 1 << 6,
  };
  const ALLOW = (PERMS.VIEW_CHANNEL | PERMS.SEND_MESSAGES | PERMS.EMBED_LINKS |
    PERMS.ATTACH_FILES | PERMS.READ_MESSAGE_HISTORY | PERMS.ADD_REACTIONS).toString();

  const r1 = await fetch(`${DISCORD_API}/channels/${channelId}/permissions/${VANSHAJ.discordId}`, {
    method: "DELETE", headers: { Authorization: `Bot ${botToken}` },
  });
  console.log(`  ${r1.ok || r1.status === 404 ? "✓" : "✗"} DELETE perm(Vanshaj) status=${r1.status}`);

  const r2 = await fetch(`${DISCORD_API}/channels/${channelId}/permissions/${BSINGER.discordId}`, {
    method: "PUT", headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: 1, allow: ALLOW, deny: "0" }),
  });
  console.log(`  ${r2.ok ? "✓" : "✗"} PUT perm(Bsinger) status=${r2.status}`);

  const r3 = await fetch(`${DISCORD_API}/channels/${channelId}`, {
    method: "PATCH", headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "dota-test-major-bsinger",
      topic: "Dota dry-run channel — Major (Major O Steam) vs Bsinger. Test bot lobby flow without stuck Back-to-Lobby state.",
    }),
  });
  console.log(`  ${r3.ok ? "✓" : "✗"} PATCH channel name status=${r3.status}`);

  await tRef.set({ discordChannelName: "dota-test-major-bsinger" }, { merge: true });

  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST", headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      content: [
        `# 🔁 Test setup`,
        ``,
        `<@${MAJOR.discordId}>: now using **Major O** Steam (${MAJOR.NEW_steamId}) — your main "Major" Steam was stuck on Back-to-Lobby. Switch your Dota 2 client to Major O account.`,
        `<@${BSINGER.discordId}>: you're back on this test tournament — Vanshaj is out (also stuck on Back-to-Lobby).`,
        ``,
        `Tournament: https://iesports.in/tournament/${TID}`,
        `Match \`r1-match-1\` is reset to pending — admin will fire Set Lobby & Notify when ready.`,
      ].join("\n"),
    }),
  });

  console.log("\nDone.");
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
