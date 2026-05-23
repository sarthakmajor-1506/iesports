/**
 * Replace Shrey with Vanshaj on the Dota test tournament.
 *
 *   - Updates tournament doc (visibleToUids, displayed name)
 *   - Rewrites team-2 captainUid / members / bracket / avgRankTier
 *   - Deletes Shrey's player-subcollection doc, creates Vanshaj's
 *   - Removes TID from Shrey's registeredTournaments, adds to Vanshaj's
 *   - Patches the Discord channel: removes Shrey's permission overwrite,
 *     adds Vanshaj's (and renames the channel for accuracy)
 *
 *   npx tsx scripts/swapShreyForVanshaj.ts            # dry-run
 *   npx tsx scripts/swapShreyForVanshaj.ts --apply    # write Firestore + Discord
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
const SHREY = {
  uid: "steam_76561198089387830",
  discordId: "746803954767364147",
};
// In
const VANSHAJ = {
  uid: "discord_1364667323860127815",
  fullName: "vanshaj khasgiwala",
  steamId: "76561199718644468",
  steamName: "Bubble",
  steamAvatar: "",  // filled in from the user doc below
  discordId: "1364667323860127815",
  discordUsername: "phuddipakad",
  dotaRankTier: 13,
  dotaBracket: "herald_guardian",
};

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

  // Pull the freshest Vanshaj snapshot for avatar etc.
  const vDoc = await db.collection("users").doc(VANSHAJ.uid).get();
  if (!vDoc.exists) throw new Error(`Vanshaj user doc ${VANSHAJ.uid} not found`);
  const v: any = vDoc.data() || {};
  VANSHAJ.steamAvatar = v.steamAvatar || "";

  const tRef = db.collection("tournaments").doc(TID);
  const tDoc = await tRef.get();
  if (!tDoc.exists) throw new Error(`Tournament ${TID} not found`);
  const tData: any = tDoc.data() || {};
  console.log(`\nTournament: ${tData.name}`);
  console.log(`  current visibleToUids: ${JSON.stringify(tData.visibleToUids)}`);
  console.log(`  discordChannelId: ${tData.discordChannelId || "—"}`);

  const team2Ref = tRef.collection("teams").doc("team-2");
  const team2 = (await team2Ref.get()).data();
  console.log(`\nteam-2 before: ${team2?.teamName} (captain=${team2?.captainUid})`);

  console.log(`\nSwap:`);
  console.log(`  OUT  ${SHREY.uid}  (Shrey, discord ${SHREY.discordId})`);
  console.log(`  IN   ${VANSHAJ.uid}  (${VANSHAJ.fullName}, discord ${VANSHAJ.discordId}, steam ${VANSHAJ.steamId})`);

  if (!APPLY) {
    console.log("\n🟡 DRY RUN — pass --apply to commit.");
    return;
  }

  const batch = db.batch();

  // ── 1. Tournament-level fields ─────────────────────────────────────────────
  batch.set(tRef, {
    name: "Dota Internal Test — Major vs Vanshaj",
    visibleToUids: [
      "discord_1302366375263735808",  // Major
      VANSHAJ.uid,
    ],
  }, { merge: true });

  // ── 2. team-2 rewrite ──────────────────────────────────────────────────────
  batch.set(team2Ref, {
    id: "team-2",
    tournamentId: TID,
    teamIndex: 2,
    teamName: VANSHAJ.fullName,
    captainUid: VANSHAJ.uid,
    bracket: VANSHAJ.dotaBracket,
    avgMMR: 0,
    totalMMR: 0,
    avgRankTier: VANSHAJ.dotaRankTier,
    avgSkillLevel: 0,
    roleCoverage: { safe_lane: true, mid: true, off_lane: true, soft_support: true, hard_support: true },
    members: [{
      uid: VANSHAJ.uid,
      fullName: VANSHAJ.fullName,
      steamName: VANSHAJ.steamName,
      steamId: VANSHAJ.steamId,
      steamAvatar: VANSHAJ.steamAvatar,
      discordId: VANSHAJ.discordId,
      discordUsername: VANSHAJ.discordUsername,
      dotaRankTier: VANSHAJ.dotaRankTier,
      dotaBracket: VANSHAJ.dotaBracket,
      dotaMMR: 0,
      iesportsRank: VANSHAJ.dotaBracket,
      iesportsTier: VANSHAJ.dotaRankTier,
      iesportsRating: 0,
      skillLevel: 0,
      rolePreferences: ["mid"],
      assignedRole: "mid",
      assignedRoleLabel: "Mid",
    }],
  });  // full overwrite — no merge — so Shrey is gone

  // ── 3. Players subcollection ──────────────────────────────────────────────
  batch.delete(tRef.collection("players").doc(SHREY.uid));
  batch.set(tRef.collection("players").doc(VANSHAJ.uid), {
    uid: VANSHAJ.uid,
    fullName: VANSHAJ.fullName,
    steamName: VANSHAJ.steamName,
    steamId: VANSHAJ.steamId,
    steamAvatar: VANSHAJ.steamAvatar,
    discordId: VANSHAJ.discordId,
    discordUsername: VANSHAJ.discordUsername,
    dotaRankTier: VANSHAJ.dotaRankTier,
    dotaBracket: VANSHAJ.dotaBracket,
    dotaMMR: 0,
    rolePreferences: ["mid"],
    registeredAt: new Date().toISOString(),
  });

  // ── 4. users.registeredTournaments ────────────────────────────────────────
  batch.set(db.collection("users").doc(SHREY.uid), {
    registeredTournaments: FieldValue.arrayRemove(TID),
  }, { merge: true });
  batch.set(db.collection("users").doc(VANSHAJ.uid), {
    registeredTournaments: FieldValue.arrayUnion(TID),
  }, { merge: true });

  // ── 5. Match doc team-2 labels ────────────────────────────────────────────
  // The team-2 reference (Vanshaj's side) — the test match docs cache
  // team1Name/team2Name; rewrite r1-match-1 so the new name shows up.
  const matchRef = tRef.collection("matches").doc("r1-match-1");
  const matchDoc = (await matchRef.get()).data() as any;
  if (matchDoc) {
    const updates: any = {};
    if (matchDoc.team1Id === "team-2") updates.team1Name = VANSHAJ.fullName;
    if (matchDoc.team2Id === "team-2") updates.team2Name = VANSHAJ.fullName;
    if (Object.keys(updates).length) batch.set(matchRef, updates, { merge: true });
  }

  await batch.commit();
  console.log("\n✅ Firestore swap committed.");

  // ── 6. Discord channel: rotate Shrey out, Vanshaj in ─────────────────────
  const channelId = tData.discordChannelId;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!channelId || !botToken) {
    console.log("\n⚠️  No discordChannelId or DISCORD_BOT_TOKEN — skipping Discord perm swap.");
    return;
  }

  const ops: Array<Promise<{ ok: boolean; what: string; status?: number; text?: string }>> = [];

  // Remove Shrey's overwrite (idempotent — 404 is fine).
  ops.push(fetch(`${DISCORD_API}/channels/${channelId}/permissions/${SHREY.discordId}`, {
    method: "DELETE",
    headers: { Authorization: `Bot ${botToken}` },
  }).then(async r => ({ ok: r.ok || r.status === 404, what: `DELETE perm(Shrey ${SHREY.discordId})`, status: r.status, text: r.ok ? "" : await r.text() })));

  // Add Vanshaj's overwrite.
  ops.push(fetch(`${DISCORD_API}/channels/${channelId}/permissions/${VANSHAJ.discordId}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: 1, allow: MEMBER_ALLOW, deny: "0" }),
  }).then(async r => ({ ok: r.ok, what: `PUT perm(Vanshaj ${VANSHAJ.discordId})`, status: r.status, text: r.ok ? "" : await r.text() })));

  // Rename the channel for accuracy.
  ops.push(fetch(`${DISCORD_API}/channels/${channelId}`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "dota-test-major-vanshaj",
      topic: "Internal Dota dry-run channel — visible only to Major + Vanshaj + bot. All admin-panel-driven comms for the test tournament land here.",
    }),
  }).then(async r => ({ ok: r.ok, what: "PATCH channel name", status: r.status, text: r.ok ? "" : await r.text() })));

  const results = await Promise.all(ops);
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.what} (status=${r.status}) ${r.text ? "— " + r.text.slice(0, 200) : ""}`);
  }

  // Welcome / context message so Vanshaj knows what he's looking at.
  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      content: [
        `# 🔁 Roster swap`,
        ``,
        `<@${VANSHAJ.discordId}> — you're now the test partner for <@1302366375263735808> on this Dota dry-run tournament.`,
        ``,
        `Tournament: https://iesports.in/tournament/${TID}  (only the two of you can see it)`,
        `All admin-panel actions for this test will post here.`,
      ].join("\n"),
    }),
  });

  // Update tournament doc to remember the new channel name (purely descriptive).
  await tRef.set({
    discordChannelName: "dota-test-major-vanshaj",
  }, { merge: true });

  console.log("\nDone.");
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
