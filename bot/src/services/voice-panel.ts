import { Client, Events, Guild } from "discord.js";
import { getDb } from "./firebase";

/**
 * Voice Panel mirror — keeps `discordVoicePanels/main.members` in sync with
 * the actual users in the panel's voice channel.
 *
 * The web admin panel performs all Discord channel/permission ops directly via
 * the REST API (see web/lib/discord.ts). This service only mirrors live state
 * back into Firestore so the admin tab can render "who's in right now".
 *
 * Mirrors the pattern in vc-tracker.ts but for a single fixed doc id.
 */

const PANEL_DOC_ID = "main";
const PANEL_COLLECTION = "discordVoicePanels";

let cachedChannelId: string | null = null;
let cachedGuildId: string | null = null;
let cacheReady = false;

/** Refresh the cached channelId from Firestore. */
async function refreshCache(): Promise<void> {
  try {
    const snap = await getDb().collection(PANEL_COLLECTION).doc(PANEL_DOC_ID).get();
    if (!snap.exists) {
      cachedChannelId = null;
      cachedGuildId = null;
      cacheReady = true;
      return;
    }
    const d = snap.data() as any;
    cachedChannelId = d?.channelId || null;
    cachedGuildId = d?.guildId || null;
    cacheReady = true;
  } catch (err: any) {
    console.error("[VoicePanel] cache refresh error:", err.message);
  }
}

/** Build current members list and write it to the doc. */
async function mirrorMembers(guild: Guild): Promise<void> {
  if (!cachedChannelId) return;
  try {
    const members: any[] = [];
    guild.voiceStates.cache.forEach((vs) => {
      if (vs.channelId === cachedChannelId && vs.member && !vs.member.user.bot) {
        members.push({
          discordId: vs.member.id,
          name: vs.member.displayName || vs.member.user.username,
          selfMute: vs.selfMute ?? false,
          selfDeaf: vs.selfDeaf ?? false,
          serverMute: vs.serverMute ?? false,
          serverDeaf: vs.serverDeaf ?? false,
        });
      }
    });
    await getDb().collection(PANEL_COLLECTION).doc(PANEL_DOC_ID).update({
      members,
      membersUpdatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    // If the doc was deleted between cache load and update, that's fine — refresh
    if (err.code === 5 /* NOT_FOUND */) {
      cachedChannelId = null;
      cachedGuildId = null;
      return;
    }
    console.error("[VoicePanel] mirror error:", err.message);
  }
}

export function registerVoicePanel(client: Client): void {
  refreshCache();
  setInterval(refreshCache, 30_000); // catch external doc edits (create/delete/rename)

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (!cacheReady || !cachedChannelId) return;

    // Only react when the panel channel is involved
    const touchedPanel =
      oldState.channelId === cachedChannelId || newState.channelId === cachedChannelId;
    if (!touchedPanel) return;

    const guild = newState.guild || oldState.guild;
    if (!guild || guild.id !== cachedGuildId) return;

    await mirrorMembers(guild);
  });

  console.log("[VoicePanel] Registered voice state mirror");
}
