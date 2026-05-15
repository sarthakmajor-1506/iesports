import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdmin } from "@/lib/verifyAdmin";
import {
  createPublicMutedVoiceChannel,
  patchChannel,
  deleteChannel,
  muteVoiceUser,
  unmuteVoiceUser,
  setServerMute,
  kickFromVoice,
} from "@/lib/discord";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Voice Panel admin endpoint — one route, action-dispatched.
 *
 * Backing Firestore doc: `discordVoicePanels/main`
 *   channelId, guildId, name, tournamentId, ownerDiscordIds, allowedDiscordIds, members
 *
 * Owners always have access (set as permission overwrites at channel-create time).
 * `allowedDiscordIds` tracks the dynamic guest list — toggle on = full access,
 * toggle off = overwrite deleted (back to @everyone deny VIEW_CHANNEL).
 *
 * The bot mirrors live voice membership into `members` via voiceStateUpdate.
 */

// shrey, bubble, major — confirmed in the admin clarification flow.
// Keep co-located so it's obvious where to edit if owners change.
const VOICE_PANEL_OWNER_IDS = [
  "746803954767364147",   // shrey8169 — Shrey Jain
  "760183283182206987",   // bubble_subu — Shay
  "1302366375263735808",  // major1506_31908 — Sarthak
];

const DOC_ID = "main";
const COLL = "discordVoicePanels";

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try { await verifyAdmin({ adminKey: body.adminKey, authToken: body.authToken }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const guildId = process.env.DISCORD_SERVER_ID;
  if (!guildId) return NextResponse.json({ error: "DISCORD_SERVER_ID not configured" }, { status: 500 });

  const action = body.action as string;
  const docRef = adminDb.collection(COLL).doc(DOC_ID);

  // Helper: load the current doc state to include in every successful response.
  // Lets the UI render the new state without a second round-trip.
  const loadState = async () => {
    const s = await docRef.get();
    return s.exists ? s.data() : null;
  };

  switch (action) {
    case "get": {
      // Pure read — used by the panel UI to load + poll state since the
      // `discordVoicePanels` collection doesn't have client-side Firestore
      // read rules yet.
      return NextResponse.json({ ok: true, state: await loadState() });
    }

    case "create": {
      const name = sanitizeChannelName(body.name);
      if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

      const existing = await docRef.get();
      if (existing.exists && existing.data()?.channelId) {
        return NextResponse.json({ error: "Channel already exists. Delete it first." }, { status: 409 });
      }

      const created = await createPublicMutedVoiceChannel({
        guildId,
        name,
        ownerUserIds: VOICE_PANEL_OWNER_IDS,
        parentId: body.parentId,
      });
      if (!created.ok) return NextResponse.json({ error: created.error }, { status: 502 });

      await docRef.set({
        channelId: created.channelId,
        guildId,
        name,
        tournamentId: body.tournamentId || null,
        ownerDiscordIds: VOICE_PANEL_OWNER_IDS,
        speakers: [],  // who currently has SPEAK perm (besides owners, who always do)
        members: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, channelId: created.channelId, state: await loadState() });
    }

    case "rename": {
      const snap = await docRef.get();
      const data = snap.data();
      if (!snap.exists || !data?.channelId) return NextResponse.json({ error: "No channel" }, { status: 404 });
      const name = sanitizeChannelName(body.name);
      if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

      const r = await patchChannel(data.channelId, { name });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });

      await docRef.update({ name, tournamentId: body.tournamentId || null, updatedAt: new Date().toISOString() });
      return NextResponse.json({ ok: true, state: await loadState() });
    }

    case "unmute": {
      const snap = await docRef.get();
      const data = snap.data();
      if (!snap.exists || !data?.channelId) return NextResponse.json({ error: "No channel" }, { status: 404 });
      const userId = String(body.userId || "").trim();
      if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
      if (VOICE_PANEL_OWNER_IDS.includes(userId)) {
        return NextResponse.json({ error: "Owners are always unmuted" }, { status: 400 });
      }

      // Two-layer unmute: channel SPEAK perm (persists across rejoins) +
      // clear any existing server-mute (live in-voice fix). Either alone
      // leaves visible "muted" states; doing both is what users expect.
      const perm = await unmuteVoiceUser(data.channelId, userId);
      if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: 502 });
      const sm = await setServerMute(guildId, userId, false);
      if (!sm.ok) return NextResponse.json({ error: sm.error }, { status: 502 });

      await docRef.update({
        speakers: FieldValue.arrayUnion(userId),
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, state: await loadState() });
    }

    case "mute": {
      const snap = await docRef.get();
      const data = snap.data();
      if (!snap.exists || !data?.channelId) return NextResponse.json({ error: "No channel" }, { status: 404 });
      const userId = String(body.userId || "").trim();
      if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
      if (VOICE_PANEL_OWNER_IDS.includes(userId)) {
        return NextResponse.json({ error: "Cannot mute an owner" }, { status: 400 });
      }

      // Mirror unmute: drop SPEAK perm + apply server-mute. Belt-and-suspenders.
      const perm = await muteVoiceUser(data.channelId, userId);
      if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: 502 });
      const sm = await setServerMute(guildId, userId, true);
      if (!sm.ok) return NextResponse.json({ error: sm.error }, { status: 502 });

      await docRef.update({
        speakers: FieldValue.arrayRemove(userId),
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, state: await loadState() });
    }

    case "kick": {
      const snap = await docRef.get();
      const data = snap.data();
      if (!snap.exists || !data?.channelId) return NextResponse.json({ error: "No channel" }, { status: 404 });
      const userId = String(body.userId || "").trim();
      if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
      if (VOICE_PANEL_OWNER_IDS.includes(userId)) {
        return NextResponse.json({ error: "Cannot kick an owner" }, { status: 400 });
      }

      // Disconnect them from voice (they can rejoin since the channel is public)
      const r = await kickFromVoice(guildId, userId);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
      return NextResponse.json({ ok: true, state: await loadState() });
    }

    case "delete": {
      const snap = await docRef.get();
      const data = snap.data();
      if (!snap.exists || !data?.channelId) {
        // nothing to delete — treat as success so panel can be reset
        await docRef.delete().catch(() => {});
        return NextResponse.json({ ok: true });
      }
      const r = await deleteChannel(data.channelId);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
      await docRef.delete();
      return NextResponse.json({ ok: true, state: await loadState() });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

/** Discord channel names: lowercase, ≤100 chars, no spaces (replaced with `-`). */
function sanitizeChannelName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.toLowerCase().trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "")
    .slice(0, 100);
  return cleaned || null;
}
