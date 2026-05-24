/**
 * Swap team-2: Bsinger (Mohit Taparia / bRiSINGR)  →  Money (.kiluminati.)
 * on the Dota Internal Test tournament.
 *
 * - Tournament name + visibleToUids
 * - team-2 captain/members rewrite
 * - players subcollection: Bsinger removed, Money added
 * - users.registeredTournaments updated on both sides
 * - Discord channel: Bsinger perm removed, Money's added, channel renamed
 *
 *   npx tsx scripts/_swapBsingerForMoney.ts          # dry-run
 *   npx tsx scripts/_swapBsingerForMoney.ts --apply  # commit
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

const BSINGER = { uid: "steam_76561198329575612", discordId: "673154894060060682" };
const MONEY = {
  uid: "discord_444438240095633408",
  fullName: "Money",
  steamId: "76561198244275992",
  steamName: "Kiluminati..!",
  discordId: "444438240095633408",
  discordUsername: ".kiluminati.",
  dotaRankTier: 52,
  dotaBracket: "legend_ancient",
};
const MAJOR_UID = "discord_1302366375263735808";
const MAJOR_DISCORD_ID = "1302366375263735808";

async function run() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  // Fetch Money's avatar from his user doc
  const mDoc = await db.collection("users").doc(MONEY.uid).get();
  const mData: any = mDoc.data() || {};
  const moneyAvatar: string = mData.steamAvatar || "";

  console.log("=== Swap ===");
  console.log(`  OUT  ${BSINGER.uid}  (Bsinger / bRiSINGR, discord ${BSINGER.discordId})`);
  console.log(`  IN   ${MONEY.uid}  (${MONEY.fullName} / ${MONEY.steamName}, discord ${MONEY.discordId}, steam ${MONEY.steamId})\n`);

  const tRef = db.collection("tournaments").doc(TID);
  const tData: any = (await tRef.get()).data() || {};
  console.log(`Tournament: ${tData.name}`);
  console.log(`  discordChannelId: ${tData.discordChannelId || "—"}\n`);

  if (!APPLY) { console.log("🟡 DRY RUN — pass --apply to commit."); return; }

  const batch = db.batch();

  // Tournament doc
  batch.set(tRef, {
    name: "Dota Internal Test — Major vs Money",
    visibleToUids: [MAJOR_UID, MONEY.uid],
  }, { merge: true });

  // team-2 rewrite
  batch.set(tRef.collection("teams").doc("team-2"), {
    id: "team-2", tournamentId: TID, teamIndex: 2,
    teamName: MONEY.fullName, captainUid: MONEY.uid,
    bracket: MONEY.dotaBracket, avgMMR: 0, totalMMR: 0,
    avgRankTier: MONEY.dotaRankTier, avgSkillLevel: 0,
    roleCoverage: { safe_lane: true, mid: true, off_lane: true, soft_support: true, hard_support: true },
    members: [{
      uid: MONEY.uid, fullName: MONEY.fullName,
      steamName: MONEY.steamName, steamId: MONEY.steamId, steamAvatar: moneyAvatar,
      discordId: MONEY.discordId, discordUsername: MONEY.discordUsername,
      dotaRankTier: MONEY.dotaRankTier, dotaBracket: MONEY.dotaBracket, dotaMMR: 0,
      iesportsRank: MONEY.dotaBracket, iesportsTier: MONEY.dotaRankTier, iesportsRating: 0,
      skillLevel: 0, rolePreferences: ["mid"], assignedRole: "mid", assignedRoleLabel: "Mid",
    }],
  });

  // Players subcollection
  batch.delete(tRef.collection("players").doc(BSINGER.uid));
  batch.set(tRef.collection("players").doc(MONEY.uid), {
    uid: MONEY.uid, fullName: MONEY.fullName,
    steamName: MONEY.steamName, steamId: MONEY.steamId, steamAvatar: moneyAvatar,
    discordId: MONEY.discordId, discordUsername: MONEY.discordUsername,
    dotaRankTier: MONEY.dotaRankTier, dotaBracket: MONEY.dotaBracket, dotaMMR: 0,
    rolePreferences: ["mid"], registeredAt: new Date().toISOString(),
  });

  // registeredTournaments
  batch.set(db.collection("users").doc(BSINGER.uid), {
    registeredTournaments: FieldValue.arrayRemove(TID),
  }, { merge: true });
  batch.set(db.collection("users").doc(MONEY.uid), {
    registeredTournaments: FieldValue.arrayUnion(TID),
  }, { merge: true });

  // Update r1-match-2..5 team2Name (since match docs cache the team names)
  for (const id of ["r1-match-2", "r1-match-3", "r1-match-4", "r1-match-5"]) {
    batch.set(tRef.collection("matches").doc(id), { team2Name: MONEY.fullName }, { merge: true });
  }
  // r1-match-1 stays as-is — it has the live match data with Bsinger's name on it.
  // Don't overwrite — that match record is from the prior test.

  await batch.commit();
  console.log("✅ Firestore swap committed.\n");

  // Discord perms
  const channelId = tData.discordChannelId;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!channelId || !botToken) { console.log("⚠️  No channelId/bot token — skipping Discord."); return; }
  const DISCORD_API = "https://discord.com/api/v10";
  const ALLOW = ((1<<10)|(1<<11)|(1<<14)|(1<<15)|(1<<16)|(1<<6)).toString();

  const r1 = await fetch(`${DISCORD_API}/channels/${channelId}/permissions/${BSINGER.discordId}`, {
    method: "DELETE", headers: { Authorization: `Bot ${botToken}` },
  });
  console.log(`  ${r1.ok || r1.status === 404 ? "✓" : "✗"} DELETE perm(Bsinger) status=${r1.status}`);

  const r2 = await fetch(`${DISCORD_API}/channels/${channelId}/permissions/${MONEY.discordId}`, {
    method: "PUT", headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: 1, allow: ALLOW, deny: "0" }),
  });
  console.log(`  ${r2.ok ? "✓" : "✗"} PUT perm(Money) status=${r2.status}`);

  const r3 = await fetch(`${DISCORD_API}/channels/${channelId}`, {
    method: "PATCH", headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "dota-test-major-money",
      topic: "Dota dry-run channel — Major (Major O Steam) vs Money (.kiluminati.). Bot lobby flow testing.",
    }),
  });
  console.log(`  ${r3.ok ? "✓" : "✗"} PATCH channel name status=${r3.status}`);

  await tRef.set({ discordChannelName: "dota-test-major-money" }, { merge: true });

  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST", headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      content: [
        `# 🔁 Test partner swap`,
        ``,
        `<@${MAJOR_DISCORD_ID}> + <@${MONEY.discordId}>: you two are paired up for the next Dota bot-lobby tests.`,
        ``,
        `Bsinger is out — Money is in.`,
        `Tournament: https://iesports.in/tournament/${TID}`,
        ``,
        `Matches available: **r1-match-2** through **r1-match-5** (r1-match-1 has the prior live game).`,
        `Admin will fire **Set Lobby & Notify** on r1-match-2 — both of you will get auto Steam invites in Dota 2.`,
      ].join("\n"),
    }),
  });

  console.log("\nDone.");
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
