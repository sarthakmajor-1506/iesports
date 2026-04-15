/**
 * addPlayersToAscensionChannel.ts
 *
 * 1. Saves the Discord channel ID/name on the Ascension tournament doc so
 *    future routes can look it up without hardcoding.
 * 2. Grants every registered Ascension player VIEW/SEND/etc. permission on
 *    that Discord channel via a permission overwrite.
 *
 * Resolves each player's Discord ID by:
 *   - Using the uid suffix directly if it starts with `discord_`, OR
 *   - Reading `discordId` from the user doc otherwise.
 *
 * Players with no linked Discord account are reported and skipped.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

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
const TOURNAMENT_ID = "league-of-rising-stars-ascension";
const DISCORD_CHANNEL_ID = "1493936270060027974";
const DISCORD_CHANNEL_NAME = "league-of-rising-stars-ascension";

// VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY | EMBED_LINKS | ATTACH_FILES | ADD_REACTIONS
// Using BigInt() constructor (not 1n literals) to stay compatible with
// TypeScript targets below ES2020 — Next.js typechecks this file during
// the production build even though it only runs standalone.
const PERMISSION_ALLOW =
  (BigInt(1) << BigInt(10)) |
  (BigInt(1) << BigInt(11)) |
  (BigInt(1) << BigInt(16)) |
  (BigInt(1) << BigInt(14)) |
  (BigInt(1) << BigInt(15)) |
  (BigInt(1) << BigInt(6));

async function resolveDiscordId(uid: string): Promise<string | null> {
  if (uid.startsWith("discord_")) {
    return uid.replace(/^discord_/, "");
  }
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) return null;
  const d = userDoc.data()!;
  return d.discordId || null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function grantChannelAccess(channelId: string, discordUserId: string): Promise<{ ok: boolean; status: number; error?: string }> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, status: 0, error: "DISCORD_BOT_TOKEN not set" };
  // Retry on 429 with server-provided backoff. The per-route rate limit for
  // channel-permission PUT is ~5 per 5s, so we spread writes out even on
  // success to avoid bunching.
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/permissions/${discordUserId}`, {
      method: "PUT",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: 1, allow: PERMISSION_ALLOW.toString(), deny: "0" }),
    });
    if (res.status === 204) return { ok: true, status: 204 };
    if (res.status === 429) {
      const body = await res.json().catch(() => ({ retry_after: 2 }));
      const waitMs = Math.ceil(((body as any).retry_after || 2) * 1000) + 250;
      await sleep(waitMs);
      continue;
    }
    const errText = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: errText };
  }
  return { ok: false, status: 429, error: "max retries exceeded" };
}

async function run() {
  const tRef = db.collection("valorantTournaments").doc(TOURNAMENT_ID);
  const tSnap = await tRef.get();
  if (!tSnap.exists) {
    console.error(`Tournament ${TOURNAMENT_ID} not found`);
    process.exit(1);
  }

  // 1. Persist the channel on the tournament doc
  await tRef.update({
    discordChannelId: DISCORD_CHANNEL_ID,
    discordChannelName: DISCORD_CHANNEL_NAME,
  });
  console.log(`✓ Saved discordChannelId on ${TOURNAMENT_ID}`);

  // 2. Grant channel access to every registered player
  const playersSnap = await tRef.collection("soloPlayers").get();
  console.log(`Found ${playersSnap.size} registered players\n`);

  let added = 0;
  let skipped = 0;
  let failed = 0;
  for (const d of playersSnap.docs) {
    const p = d.data() as any;
    const uid = d.id;
    const name = p.riotGameName || p.steamName || "(unknown)";
    const discordId = await resolveDiscordId(uid);
    if (!discordId) {
      console.log(`  - ${name} (${uid}) — no Discord link, skipped`);
      skipped++;
      continue;
    }
    const result = await grantChannelAccess(DISCORD_CHANNEL_ID, discordId);
    if (result.ok) {
      console.log(`  ✓ ${name} (${discordId})`);
      added++;
    } else {
      console.log(`  ✗ ${name} (${discordId}) — ${result.status} ${result.error}`);
      failed++;
    }
    // Pace successive writes — stays well under the ~5 per 5s per-route cap.
    await sleep(400);
  }

  console.log(`\nDone. Added: ${added}, skipped (no Discord): ${skipped}, failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
