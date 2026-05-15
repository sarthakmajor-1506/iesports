/**
 * One-off: demote shrey from the Voice Panel owners so he can be
 * mute/unmuted/kicked for testing.
 *
 * Steps:
 *   1. Read `discordVoicePanels/main`
 *   2. Remove shrey from the doc's `ownerDiscordIds` array
 *   3. DELETE shrey's per-user permission overwrite on the Discord channel
 *      (so he falls back to @everyone DENY SPEAK like a normal joiner)
 *
 * Reversible: add shrey back to VOICE_PANEL_OWNER_IDS in the API route and
 * delete + recreate the channel, OR write the inverse script.
 *
 * Run: npx tsx scripts/demoteShreyFromVoicePanel.ts
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

async function main() {
  const db = getFirestore();
  const ref = db.collection("discordVoicePanels").doc("main");
  const snap = await ref.get();
  if (!snap.exists) {
    console.error("❌ No `discordVoicePanels/main` doc. Create a channel first.");
    process.exit(1);
  }
  const data = snap.data()!;
  const channelId = data.channelId as string;
  if (!channelId) {
    console.error("❌ Doc has no channelId.");
    process.exit(1);
  }

  // 1. Remove shrey from ownerDiscordIds in Firestore
  await ref.update({
    ownerDiscordIds: FieldValue.arrayRemove(SHREY_ID),
    updatedAt: new Date().toISOString(),
  });
  console.log(`✅ Removed ${SHREY_ID} from Firestore ownerDiscordIds`);

  // 2. Delete shrey's permission overwrite on the channel
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    console.error("❌ DISCORD_BOT_TOKEN missing — couldn't clear channel overwrite.");
    process.exit(1);
  }
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/permissions/${SHREY_ID}`, {
    method: "DELETE",
    headers: { Authorization: `Bot ${botToken}` },
  });
  if (res.ok || res.status === 404) {
    console.log(`✅ Removed shrey's permission overwrite from channel ${channelId}${res.status === 404 ? " (404 — was already gone)" : ""}`);
  } else {
    console.error(`❌ Discord ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  console.log("\nDone. Shrey now defaults to muted on join and can be Mute/Unmute/Kicked from the panel.");
}

main().catch((e) => { console.error(e); process.exit(1); });
