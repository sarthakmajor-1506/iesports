import { Client, Guild, Events } from "discord.js";
import { getDb } from "./firebase";

/**
 * VC Tracker — writes real-time voice channel status to Firestore match docs.
 *
 * Listens for voiceStateUpdate events, checks if the channel belongs to an
 * active Valorant match, and writes member list + mic/deafen status to the
 * match doc's `vcLiveStatus` field.  The admin panel reads this via onSnapshot.
 */

interface VcRef {
  tournamentId: string;
  matchId: string;
}

// In-memory cache: channelId → match reference
const vcMap = new Map<string, VcRef>();
let cacheReady = false;

/** Refresh the channelId → match mapping from Firestore. */
async function refreshCache(): Promise<void> {
  try {
    const db = getDb();
    const snap = await db.collection("valorantTournaments").where("status", "==", "active").get();
    const newMap = new Map<string, VcRef>();

    for (const tDoc of snap.docs) {
      // Any match with a VC ID assigned is worth tracking — waiting rooms get
      // created during the `scheduled` phase (set-lobby), well before the
      // match flips to `live`, so filtering on status here used to miss the
      // entire pre-match voice activity window.
      const matchesSnap = await tDoc.ref.collection("matches").get();

      for (const mDoc of matchesSnap.docs) {
        const d = mDoc.data();
        if (d.status === "completed") continue; // post-match, VCs torn down
        const ref: VcRef = { tournamentId: tDoc.id, matchId: mDoc.id };
        if (d.waitingRoomVcId) newMap.set(d.waitingRoomVcId, ref);
        if (d.team1VcId) newMap.set(d.team1VcId, ref);
        if (d.team2VcId) newMap.set(d.team2VcId, ref);
      }
    }

    vcMap.clear();
    for (const [k, v] of newMap) vcMap.set(k, v);
    cacheReady = true;
  } catch (err: any) {
    console.error("[VcTracker] Cache refresh error:", err.message);
  }
}

/** Build voice status for a match and write to Firestore. */
async function updateMatchVcStatus(ref: VcRef, guild: Guild): Promise<void> {
  try {
    const db = getDb();
    const matchRef = db
      .collection("valorantTournaments").doc(ref.tournamentId)
      .collection("matches").doc(ref.matchId);

    const matchDoc = await matchRef.get();
    const data = matchDoc.data();
    if (!data) return;

    const vcLiveStatus: Record<string, any> = { updatedAt: new Date().toISOString() };

    const vcPairs: [string, string | null][] = [
      ["waitingRoom", data.waitingRoomVcId || null],
      ["team1", data.team1VcId || null],
      ["team2", data.team2VcId || null],
    ];

    for (const [key, vcId] of vcPairs) {
      if (!vcId) {
        vcLiveStatus[key] = [];
        continue;
      }
      const members: any[] = [];
      guild.voiceStates.cache.forEach(vs => {
        if (vs.channelId === vcId && vs.member && !vs.member.user.bot) {
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
      vcLiveStatus[key] = members;
    }

    await matchRef.update({ vcLiveStatus });
  } catch (err: any) {
    console.error("[VcTracker] Update error:", err.message);
  }
}

/** Register the tracker on a Discord client. Call once after client.login(). */
export function registerVcTracker(client: Client): void {
  // Initial cache load + periodic refresh (every 30s)
  refreshCache();
  setInterval(refreshCache, 30_000);

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (!cacheReady) return;

    const affectedChannels = new Set<string>();
    if (oldState.channelId) affectedChannels.add(oldState.channelId);
    if (newState.channelId) affectedChannels.add(newState.channelId);

    // If none of the affected channels are in cache, the VC may have been
    // created since the last refresh (30s poll). Force one refresh and retry
    // — this is the "user just joined the freshly-created waiting room"
    // case, which used to silently drop until the next interval.
    const anyCached = Array.from(affectedChannels).some((c) => vcMap.has(c));
    if (!anyCached && affectedChannels.size > 0) {
      await refreshCache();
    }

    // Deduplicate by matchId so we don't update the same doc twice
    const matchesToUpdate = new Map<string, VcRef>();
    for (const chId of affectedChannels) {
      const ref = vcMap.get(chId);
      if (ref) matchesToUpdate.set(`${ref.tournamentId}:${ref.matchId}`, ref);
    }

    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    for (const ref of matchesToUpdate.values()) {
      await updateMatchVcStatus(ref, guild);
    }
  });

  console.log("[VcTracker] Registered voice state listener");
}
