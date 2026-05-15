/**
 * Inverse of demoteShreyFromVoicePanel.ts — restores shrey as an owner of
 * the active voice panel channel.
 *
 * Steps:
 *   1. Add shrey back to `discordVoicePanels/main.ownerDiscordIds`
 *   2. PUT shrey's per-user permission overwrite on the channel with
 *      allow SPEAK (the same overwrite create-time gives every owner)
 *   3. Also clear any server-mute on shrey, since being an owner means
 *      never muted by the panel.
 *
 * Run: npx tsx scripts/restoreShreyAsVoicePanelOwner.ts
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const SHREY_ID = "746803954767364147";
const DISCORD_API = "https://discord.com/api/v10";
const SPEAK = (1 << 21).toString(); // "2097152"

async function main() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_SERVER_ID;
  if (!botToken || !guildId) { console.error("❌ DISCORD_BOT_TOKEN or DISCORD_SERVER_ID missing"); process.exit(1); }

  const db = getFirestore();
  const ref = db.collection("discordVoicePanels").doc("main");
  const snap = await ref.get();
  if (!snap.exists) { console.error("❌ No `discordVoicePanels/main` doc."); process.exit(1); }
  const data = snap.data()!;
  const channelId = data.channelId as string;
  if (!channelId) { console.error("❌ Doc has no channelId."); process.exit(1); }

  // 1. Firestore: add shrey back
  await ref.update({
    ownerDiscordIds: FieldValue.arrayUnion(SHREY_ID),
    speakers: FieldValue.arrayRemove(SHREY_ID), // owners aren't tracked in speakers
    updatedAt: new Date().toISOString(),
  });
  console.log(`✅ Added ${SHREY_ID} to ownerDiscordIds`);

  // 2. Discord: PUT owner overwrite (allow SPEAK)
  const overRes = await fetch(`${DISCORD_API}/channels/${channelId}/permissions/${SHREY_ID}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: 1, allow: SPEAK, deny: "0" }),
  });
  if (!overRes.ok) { console.error(`❌ Overwrite ${overRes.status}: ${await overRes.text()}`); process.exit(1); }
  console.log(`✅ Restored owner SPEAK overwrite on channel ${channelId}`);

  // 3. Clear any server-mute
  const smRes = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${SHREY_ID}`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mute: false }),
  });
  if (smRes.ok || smRes.status === 400 /* not in voice */) {
    console.log(`✅ Server-mute cleared${smRes.status === 400 ? " (skipped — not in voice)" : ""}`);
  } else {
    console.warn(`⚠️  Server-mute clear: ${smRes.status} ${await smRes.text()}`);
  }

  console.log(`\nDone. Shrey is again an owner. Remember to also uncomment his ID in the API constant.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
