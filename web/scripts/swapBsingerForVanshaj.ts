/**
 * Swap Bsinger back to Vanshaj on the Dota test tournament + reset
 * r1-match-1 so the next admin "Set Lobby & Notify" hits a clean slate.
 *
 *   npx tsx scripts/swapBsingerForVanshaj.ts            # dry-run
 *   npx tsx scripts/swapBsingerForVanshaj.ts --apply    # write Firestore + Discord
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

const TID = "dota-test-major-shrey";
const APPLY = process.argv.includes("--apply");

// Out
const BSINGER = {
  uid: "steam_76561198329575612",
  discordId: "673154894060060682",
};
// In
const VANSHAJ = {
  uid: "discord_1364667323860127815",
  fullName: "vanshaj khasgiwala",
  steamId: "76561199718644468",
  steamName: "Bubble",
  steamAvatar: "",
  discordId: "1364667323860127815",
  discordUsername: "phuddipakad",
  dotaRankTier: 13,
  dotaBracket: "herald_guardian",
};
const MAJOR_UID = "discord_1302366375263735808";

const DISCORD_API = "https://discord.com/api/v10";
const PERMS = {
  VIEW_CHANNEL: 1 << 10, SEND_MESSAGES: 1 << 11, EMBED_LINKS: 1 << 14,
  ATTACH_FILES: 1 << 15, READ_MESSAGE_HISTORY: 1 << 16, ADD_REACTIONS: 1 << 6,
};
const MEMBER_ALLOW = (
  PERMS.VIEW_CHANNEL | PERMS.SEND_MESSAGES | PERMS.EMBED_LINKS |
  PERMS.ATTACH_FILES | PERMS.READ_MESSAGE_HISTORY | PERMS.ADD_REACTIONS
).toString();

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);

  const vDoc = await db.collection("users").doc(VANSHAJ.uid).get();
  if (!vDoc.exists) throw new Error(`Vanshaj user doc ${VANSHAJ.uid} not found`);
  VANSHAJ.steamAvatar = (vDoc.data() as any)?.steamAvatar || "";

  const tRef = db.collection("tournaments").doc(TID);
  const tData: any = (await tRef.get()).data();
  console.log(`\nTournament: ${tData.name}`);
  console.log(`  visibleToUids: ${JSON.stringify(tData.visibleToUids)}`);
  console.log(`  discordChannelId: ${tData.discordChannelId}`);
  console.log(`\nSwap:`);
  console.log(`  OUT  Bsinger  ${BSINGER.uid}  (discord ${BSINGER.discordId})`);
  console.log(`  IN   Vanshaj  ${VANSHAJ.uid}  (discord ${VANSHAJ.discordId})`);

  if (!APPLY) { console.log("\n🟡 DRY RUN — pass --apply."); return; }

  const batch = db.batch();

  batch.set(tRef, {
    name: "Dota Internal Test — Major vs Vanshaj",
    visibleToUids: [MAJOR_UID, VANSHAJ.uid],
  }, { merge: true });

  const team2Ref = tRef.collection("teams").doc("team-2");
  batch.set(team2Ref, {
    id: "team-2", tournamentId: TID, teamIndex: 2,
    teamName: VANSHAJ.fullName, captainUid: VANSHAJ.uid,
    bracket: VANSHAJ.dotaBracket, avgMMR: 0, totalMMR: 0,
    avgRankTier: VANSHAJ.dotaRankTier, avgSkillLevel: 0,
    roleCoverage: { safe_lane: true, mid: true, off_lane: true, soft_support: true, hard_support: true },
    members: [{
      uid: VANSHAJ.uid, fullName: VANSHAJ.fullName,
      steamName: VANSHAJ.steamName, steamId: VANSHAJ.steamId, steamAvatar: VANSHAJ.steamAvatar,
      discordId: VANSHAJ.discordId, discordUsername: VANSHAJ.discordUsername,
      dotaRankTier: VANSHAJ.dotaRankTier, dotaBracket: VANSHAJ.dotaBracket, dotaMMR: 0,
      iesportsRank: VANSHAJ.dotaBracket, iesportsTier: VANSHAJ.dotaRankTier,
      iesportsRating: 0, skillLevel: 0,
      rolePreferences: ["mid"], assignedRole: "mid", assignedRoleLabel: "Mid",
    }],
  });

  batch.delete(tRef.collection("players").doc(BSINGER.uid));
  batch.set(tRef.collection("players").doc(VANSHAJ.uid), {
    uid: VANSHAJ.uid, fullName: VANSHAJ.fullName,
    steamName: VANSHAJ.steamName, steamId: VANSHAJ.steamId, steamAvatar: VANSHAJ.steamAvatar,
    discordId: VANSHAJ.discordId, discordUsername: VANSHAJ.discordUsername,
    dotaRankTier: VANSHAJ.dotaRankTier, dotaBracket: VANSHAJ.dotaBracket, dotaMMR: 0,
    rolePreferences: ["mid"], registeredAt: new Date().toISOString(),
  });

  batch.set(db.collection("users").doc(BSINGER.uid),
    { registeredTournaments: FieldValue.arrayRemove(TID) }, { merge: true });
  batch.set(db.collection("users").doc(VANSHAJ.uid),
    { registeredTournaments: FieldValue.arrayUnion(TID) }, { merge: true });

  // Reset match doc + delete any stale queue rows.
  const matchRef = tRef.collection("matches").doc("r1-match-1");
  const queueSnap = await db.collection("botQueues")
    .where("tournamentId", "==", TID)
    .where("tournamentMatchId", "==", "r1-match-1").get();
  batch.update(matchRef, {
    team2Name: VANSHAJ.fullName,
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
    team1VcId: FieldValue.delete(), team2VcId: FieldValue.delete(),
    discordOpsMessageIds: FieldValue.delete(), waitingRoomVcId: FieldValue.delete(),
    vcStatus: FieldValue.delete(),
  });
  for (const q of queueSnap.docs) batch.delete(q.ref);

  await batch.commit();
  console.log("\n✅ Firestore swap + reset committed.");

  const channelId = tData.discordChannelId;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!channelId || !botToken) return;

  const ops = await Promise.all([
    fetch(`${DISCORD_API}/channels/${channelId}/permissions/${BSINGER.discordId}`, {
      method: "DELETE", headers: { Authorization: `Bot ${botToken}` },
    }).then(async r => ({ ok: r.ok || r.status === 404, what: `DELETE perm(Bsinger)`, status: r.status })),
    fetch(`${DISCORD_API}/channels/${channelId}/permissions/${VANSHAJ.discordId}`, {
      method: "PUT", headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: 1, allow: MEMBER_ALLOW, deny: "0" }),
    }).then(async r => ({ ok: r.ok, what: `PUT perm(Vanshaj)`, status: r.status })),
    fetch(`${DISCORD_API}/channels/${channelId}`, {
      method: "PATCH", headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "dota-test-major-vanshaj",
        topic: "Internal Dota dry-run channel — visible only to Major + Vanshaj + bot. All admin-panel-driven comms for the test tournament land here.",
      }),
    }).then(async r => ({ ok: r.ok, what: "PATCH channel name", status: r.status })),
  ]);
  for (const r of ops) console.log(`  ${r.ok ? "✓" : "✗"} ${r.what} (${r.status})`);

  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      content: [
        `# 🔁 Roster swap`,
        ``,
        `<@${VANSHAJ.discordId}> — you're back on this dry-run tournament with <@${MAJOR_UID.replace("discord_", "")}>.`,
        ``,
        `Match \`r1-match-1\` is reset to pending — admin will fire Set Lobby & Notify when ready.`,
      ].join("\n"),
    }),
  });

  await tRef.set({ discordChannelName: "dota-test-major-vanshaj" }, { merge: true });
  console.log("\nDone.");
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
