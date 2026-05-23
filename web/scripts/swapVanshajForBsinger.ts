/**
 * Replace Vanshaj with Bsinger (bRiSINGR / Mohit Taparia) on the Dota
 * test tournament. Then reset r1-match-1 to pending so admin can fire
 * Set Lobby & Notify cleanly.
 *
 *   - Updates tournament doc (visibleToUids, displayed name)
 *   - Rewrites team-2 captainUid / members / bracket / avgRankTier
 *   - Players subcollection: removes Vanshaj, adds Bsinger
 *   - users.registeredTournaments updated on both sides
 *   - Discord channel: removes Vanshaj's perm overwrite, adds Bsinger's
 *     and renames the channel for accuracy
 *   - Resets r1-match-1 to pending state and clears the botQueues entry
 *
 *   npx tsx scripts/swapVanshajForBsinger.ts            # dry-run
 *   npx tsx scripts/swapVanshajForBsinger.ts --apply    # write Firestore + Discord
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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

const TID = "dota-test-major-shrey";  // doc id stays — only displayed name changes
const APPLY = process.argv.includes("--apply");

// Out
const VANSHAJ = {
  uid: "discord_1364667323860127815",
  discordId: "1364667323860127815",
};
// In
const BSINGER = {
  uid: "steam_76561198329575612",
  fullName: "Mohit Taparia",
  steamId: "76561198329575612",
  steamName: "bRiSINGR",
  steamAvatar: "",  // filled from users doc below
  discordId: "673154894060060682",
  discordUsername: "brisingr07021996",
  dotaRankTier: 42,
  dotaBracket: "crusader_archon",
};
const MAJOR_UID = "discord_1302366375263735808";

const DISCORD_API = "https://discord.com/api/v10";
const PERMS = {
  VIEW_CHANNEL:         1 << 10,
  SEND_MESSAGES:        1 << 11,
  EMBED_LINKS:          1 << 14,
  ATTACH_FILES:         1 << 15,
  READ_MESSAGE_HISTORY: 1 << 16,
  ADD_REACTIONS:        1 << 6,
};
const MEMBER_ALLOW = (
  PERMS.VIEW_CHANNEL | PERMS.SEND_MESSAGES | PERMS.EMBED_LINKS |
  PERMS.ATTACH_FILES | PERMS.READ_MESSAGE_HISTORY | PERMS.ADD_REACTIONS
).toString();

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);

  // Pull fresh user data for avatar.
  const bDoc = await db.collection("users").doc(BSINGER.uid).get();
  if (!bDoc.exists) throw new Error(`Bsinger user doc ${BSINGER.uid} not found`);
  const b: any = bDoc.data() || {};
  BSINGER.steamAvatar = b.steamAvatar || "";

  const tRef = db.collection("tournaments").doc(TID);
  const tDoc = await tRef.get();
  if (!tDoc.exists) throw new Error(`Tournament ${TID} not found`);
  const tData: any = tDoc.data() || {};
  console.log(`\nTournament: ${tData.name}`);
  console.log(`  current visibleToUids: ${JSON.stringify(tData.visibleToUids)}`);
  console.log(`  discordChannelId: ${tData.discordChannelId || "—"}`);

  const team2 = (await tRef.collection("teams").doc("team-2").get()).data();
  console.log(`\nteam-2 before: ${team2?.teamName} (captain=${team2?.captainUid})`);
  console.log(`\nSwap:`);
  console.log(`  OUT  ${VANSHAJ.uid}  (Vanshaj, discord ${VANSHAJ.discordId})`);
  console.log(`  IN   ${BSINGER.uid}  (${BSINGER.fullName}, discord ${BSINGER.discordId}, steam ${BSINGER.steamId})`);

  // Match reset preview
  const matchSnap = await tRef.collection("matches").doc("r1-match-1").get();
  const m: any = matchSnap.data() || {};
  const queueSnap = await db.collection("botQueues")
    .where("tournamentId", "==", TID)
    .where("tournamentMatchId", "==", "r1-match-1")
    .get();
  console.log(`\nMatch reset:  status=${m.status} → pending; botQueueId=${m.botQueueId || "—"} → wiped; queue docs to delete: ${queueSnap.size}`);

  if (!APPLY) {
    console.log("\n🟡 DRY RUN — pass --apply to commit.");
    return;
  }

  const batch = db.batch();

  // ── 1. Tournament doc ─────────────────────────────────────────────────────
  batch.set(tRef, {
    name: "Dota Internal Test — Major vs Bsinger",
    visibleToUids: [MAJOR_UID, BSINGER.uid],
  }, { merge: true });

  // ── 2. team-2 rewrite ─────────────────────────────────────────────────────
  const team2Ref = tRef.collection("teams").doc("team-2");
  batch.set(team2Ref, {
    id: "team-2",
    tournamentId: TID,
    teamIndex: 2,
    teamName: BSINGER.fullName,
    captainUid: BSINGER.uid,
    bracket: BSINGER.dotaBracket,
    avgMMR: 0,
    totalMMR: 0,
    avgRankTier: BSINGER.dotaRankTier,
    avgSkillLevel: 0,
    roleCoverage: { safe_lane: true, mid: true, off_lane: true, soft_support: true, hard_support: true },
    members: [{
      uid: BSINGER.uid,
      fullName: BSINGER.fullName,
      steamName: BSINGER.steamName,
      steamId: BSINGER.steamId,
      steamAvatar: BSINGER.steamAvatar,
      discordId: BSINGER.discordId,
      discordUsername: BSINGER.discordUsername,
      dotaRankTier: BSINGER.dotaRankTier,
      dotaBracket: BSINGER.dotaBracket,
      dotaMMR: 0,
      iesportsRank: BSINGER.dotaBracket,
      iesportsTier: BSINGER.dotaRankTier,
      iesportsRating: 0,
      skillLevel: 0,
      rolePreferences: ["mid"],
      assignedRole: "mid",
      assignedRoleLabel: "Mid",
    }],
  });

  // ── 3. Players subcollection ─────────────────────────────────────────────
  batch.delete(tRef.collection("players").doc(VANSHAJ.uid));
  batch.set(tRef.collection("players").doc(BSINGER.uid), {
    uid: BSINGER.uid,
    fullName: BSINGER.fullName,
    steamName: BSINGER.steamName,
    steamId: BSINGER.steamId,
    steamAvatar: BSINGER.steamAvatar,
    discordId: BSINGER.discordId,
    discordUsername: BSINGER.discordUsername,
    dotaRankTier: BSINGER.dotaRankTier,
    dotaBracket: BSINGER.dotaBracket,
    dotaMMR: 0,
    rolePreferences: ["mid"],
    registeredAt: new Date().toISOString(),
  });

  // ── 4. users.registeredTournaments ───────────────────────────────────────
  batch.set(db.collection("users").doc(VANSHAJ.uid), {
    registeredTournaments: FieldValue.arrayRemove(TID),
  }, { merge: true });
  batch.set(db.collection("users").doc(BSINGER.uid), {
    registeredTournaments: FieldValue.arrayUnion(TID),
  }, { merge: true });

  // ── 5. Reset match doc + delete stale queue rows ──────────────────────────
  const matchRef = tRef.collection("matches").doc("r1-match-1");
  batch.update(matchRef, {
    team2Name: BSINGER.fullName,
    status: "pending",
    team1Score: 0,
    team2Score: 0,
    botQueueId: FieldValue.delete(),
    lobbyName: FieldValue.delete(),
    lobbyPassword: FieldValue.delete(),
    lobbyMode: FieldValue.delete(),
    lobbyStatus: FieldValue.delete(),
    lobbySetAt: FieldValue.delete(),
    team1Subs: FieldValue.delete(),
    team2Subs: FieldValue.delete(),
    vetoState: FieldValue.delete(),
    game1: FieldValue.delete(),
    games: FieldValue.delete(),
    winnerTeamId: FieldValue.delete(),
    completedAt: FieldValue.delete(),
    startedAt: FieldValue.delete(),
    dotaMatchId: FieldValue.delete(),
    durationSec: FieldValue.delete(),
    dataSource: FieldValue.delete(),
  });
  for (const q of queueSnap.docs) batch.delete(q.ref);

  await batch.commit();
  console.log("\n✅ Firestore swap + reset committed.");

  // ── 6. Discord channel ────────────────────────────────────────────────────
  const channelId = tData.discordChannelId;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!channelId || !botToken) {
    console.log("\n⚠️  No discordChannelId or DISCORD_BOT_TOKEN — skipping Discord perm swap.");
    return;
  }

  const ops: Array<Promise<{ ok: boolean; what: string; status?: number; text?: string }>> = [];

  ops.push(fetch(`${DISCORD_API}/channels/${channelId}/permissions/${VANSHAJ.discordId}`, {
    method: "DELETE",
    headers: { Authorization: `Bot ${botToken}` },
  }).then(async r => ({ ok: r.ok || r.status === 404, what: `DELETE perm(Vanshaj ${VANSHAJ.discordId})`, status: r.status, text: r.ok ? "" : await r.text() })));

  ops.push(fetch(`${DISCORD_API}/channels/${channelId}/permissions/${BSINGER.discordId}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: 1, allow: MEMBER_ALLOW, deny: "0" }),
  }).then(async r => ({ ok: r.ok, what: `PUT perm(Bsinger ${BSINGER.discordId})`, status: r.status, text: r.ok ? "" : await r.text() })));

  ops.push(fetch(`${DISCORD_API}/channels/${channelId}`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "dota-test-major-bsinger",
      topic: "Internal Dota dry-run channel — visible only to Major + Bsinger + bot. All admin-panel-driven comms for the test tournament land here.",
    }),
  }).then(async r => ({ ok: r.ok, what: "PATCH channel name", status: r.status, text: r.ok ? "" : await r.text() })));

  const results = await Promise.all(ops);
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.what} (status=${r.status}) ${r.text ? "— " + r.text.slice(0, 200) : ""}`);
  }

  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      content: [
        `# 🔁 Roster swap`,
        ``,
        `<@${BSINGER.discordId}> — you're now the test partner for <@${MAJOR_UID.replace("discord_", "")}> on this Dota dry-run tournament.`,
        ``,
        `Tournament: https://iesports.in/tournament/${TID}  (only the two of you can see it)`,
        `All admin-panel actions for this test will post here.`,
        ``,
        `Match \`r1-match-1\` is reset to pending — admin will fire Set Lobby & Notify when ready.`,
      ].join("\n"),
    }),
  });

  await tRef.set({
    discordChannelName: "dota-test-major-bsinger",
  }, { merge: true });

  console.log("\nDone.");
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
