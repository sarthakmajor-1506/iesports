import { isNotAdmin } from "@/lib/checkAdmin";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

// ── Discord REST API helper ──────────────────────────────────────────────────
const DISCORD_API = "https://discord.com/api/v10";

function discordFetch(endpoint: string, method: string, body?: any) {
  return fetch(`${DISCORD_API}${endpoint}`, {
    method,
    headers: {
      "Authorization": `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Discord channel types: 2 = GUILD_VOICE
const CHANNEL_TYPE_VOICE = 2;

// Permission bits (Discord bitfield values)
const PERM_VIEW_CHANNEL = "1024";
const PERM_CONNECT = "1048576";
const PERM_SPEAK = "2097152";
const PERM_USE_VAD = "33554432";
const PERM_STREAM = "512";
const PERM_VIEW_CONNECT_SPEAK = String(
  BigInt(PERM_VIEW_CHANNEL) | BigInt(PERM_CONNECT) | BigInt(PERM_SPEAK) | BigInt(PERM_USE_VAD) | BigInt(PERM_STREAM)
);

/**
 * Fetches all discord IDs for players on both teams.
 * Returns structured data for both teams.
 */
async function getTeamDiscordData(
  tournamentRef: FirebaseFirestore.DocumentReference,
  matchData: any
) {
  const team1Ref = tournamentRef.collection("teams").doc(matchData.team1Id);
  const team2Ref = tournamentRef.collection("teams").doc(matchData.team2Id);
  const [team1Doc, team2Doc] = await Promise.all([team1Ref.get(), team2Ref.get()]);

  const team1Members = (team1Doc.data()?.members || []) as any[];
  const team2Members = (team2Doc.data()?.members || []) as any[];

  const team1Players: { uid: string; discordId: string; name: string }[] = [];
  const team2Players: { uid: string; discordId: string; name: string }[] = [];

  for (const member of team1Members) {
    try {
      const userDoc = await adminDb.collection("users").doc(member.uid).get();
      const discordId = userDoc.data()?.discordId || "";
      team1Players.push({ uid: member.uid, discordId, name: member.riotGameName || member.uid });
    } catch {
      team1Players.push({ uid: member.uid, discordId: "", name: member.riotGameName || member.uid });
    }
  }

  for (const member of team2Members) {
    try {
      const userDoc = await adminDb.collection("users").doc(member.uid).get();
      const discordId = userDoc.data()?.discordId || "";
      team2Players.push({ uid: member.uid, discordId, name: member.riotGameName || member.uid });
    } catch {
      team2Players.push({ uid: member.uid, discordId: "", name: member.riotGameName || member.uid });
    }
  }

  return { team1Players, team2Players };
}

/**
 * Resolves a list of user UIDs into the Discord/Riot fields used by the
 * lobby pipeline. Used for per-match substitutes — these are picked at
 * lobby time by the admin and stored on the match doc, separate from the
 * team's official roster.
 */
async function resolveUserDiscordData(uids: string[]) {
  const out: { uid: string; discordId: string; name: string; riotPuuid: string }[] = [];
  for (const uid of uids) {
    if (!uid || typeof uid !== "string") continue;
    try {
      const userDoc = await adminDb.collection("users").doc(uid).get();
      const d = userDoc.data() || {};
      out.push({
        uid,
        discordId: d.discordId || "",
        name: d.riotGameName || d.fullName || uid,
        riotPuuid: d.riotPuuid || "",
      });
    } catch {
      out.push({ uid, discordId: "", name: uid, riotPuuid: "" });
    }
  }
  return out;
}

type ResolvedSub = { uid: string; discordId: string; name: string; riotPuuid: string };

/** QueuePlayer shape the bot's `botQueues` pipeline expects (mirrors
 *  bot/src/services/firebase.ts QueuePlayer). */
interface BotQueuePlayer {
  discordId: string;
  username: string;
  steamId: string | null;     // Steam64
  steam32Id: string | null;   // Steam64 - 76561197960265728
  steamName: string | null;
  joinedAt: string;
}

const STEAM64_BASE = BigInt("76561197960265728");

/** Resolve a tournament team's members into bot QueuePlayer objects.
 *  Steam id comes from users/{uid}.steamId, or from a `steam_<id64>` uid
 *  prefix as a fallback. Players with no Steam link are still included
 *  (steamId null) — the bot's inviteAll just skips them, same as queues. */
async function buildDotaQueuePlayers(
  tournamentRef: FirebaseFirestore.DocumentReference,
  matchData: any,
): Promise<BotQueuePlayer[]> {
  const [t1, t2] = await Promise.all([
    tournamentRef.collection("teams").doc(matchData.team1Id).get(),
    tournamentRef.collection("teams").doc(matchData.team2Id).get(),
  ]);
  const members = [
    ...((t1.data()?.members || []) as any[]),
    ...((t2.data()?.members || []) as any[]),
  ];

  const players: BotQueuePlayer[] = [];
  const now = new Date().toISOString();
  for (const m of members) {
    let steamId: string | null = null;
    let steamName: string | null = m.steamName || null;
    let discordId: string = m.discordId || "";
    try {
      const u = (await adminDb.collection("users").doc(m.uid).get()).data() || {};
      steamId = u.steamId || null;
      steamName = steamName || u.steamName || null;
      discordId = discordId || u.discordId || "";
    } catch { /* fall through to uid-prefix */ }
    if (!steamId && typeof m.uid === "string" && m.uid.startsWith("steam_")) {
      steamId = m.uid.slice("steam_".length);
    }
    let steam32Id: string | null = null;
    if (steamId) {
      try { steam32Id = (BigInt(steamId) - STEAM64_BASE).toString(); } catch { steam32Id = null; }
    }
    players.push({
      discordId,
      username: m.fullName || steamName || m.uid,
      steamId,
      steam32Id,
      steamName,
      joinedAt: now,
    });
  }
  return players;
}

/**
 * Creates a Discord voice channel via REST API.
 * Returns the channel ID or null on failure.
 */
async function createVoiceChannel(
  guildId: string,
  name: string,
  categoryId?: string,
  playerDiscordIds?: string[],
): Promise<string | null> {
  // Build permission overwrites:
  // - Deny @everyone from viewing/connecting
  // - Allow specific players to view + connect + speak
  const permissionOverwrites: any[] = [
    {
      id: guildId, // @everyone role ID = guild ID
      type: 0,     // 0 = role
      deny: PERM_VIEW_CONNECT_SPEAK,
      allow: "0",
    },
  ];

  if (playerDiscordIds) {
    for (const discordId of playerDiscordIds) {
      if (!discordId) continue;
      permissionOverwrites.push({
        id: discordId,
        type: 1, // 1 = member
        deny: "0",
        allow: PERM_VIEW_CONNECT_SPEAK,
      });
    }
  }

  const channelPayload: any = {
    name,
    type: CHANNEL_TYPE_VOICE,
    user_limit: 15,
    permission_overwrites: permissionOverwrites,
  };

  if (categoryId) {
    channelPayload.parent_id = categoryId;
  }

  const res = await discordFetch(`/guilds/${guildId}/channels`, "POST", channelPayload);

  if (res.ok) {
    const data = await res.json();
    console.log(`[Discord] ✅ Created VC: ${name} (${data.id})`);
    return data.id;
  } else {
    const errBody = await res.text();
    console.error(`[Discord] ❌ Failed to create VC "${name}": ${res.status} — ${errBody}`);
    return null;
  }
}

/**
 * Deletes a Discord channel by ID.
 */
async function deleteChannel(channelId: string): Promise<void> {
  try {
    const res = await discordFetch(`/channels/${channelId}`, "DELETE");
    if (res.ok) {
      console.log(`[Discord] 🗑️ Deleted channel ${channelId}`);
    } else {
      const errBody = await res.text();
      console.error(`[Discord] Failed to delete channel ${channelId}: ${res.status} — ${errBody}`);
    }
  } catch (e: any) {
    console.error(`[Discord] Delete channel error: ${e.message}`);
  }
}

/**
 * Moves a Discord user to a voice channel.
 * Only works if the user is currently in a voice channel in the guild.
 */
async function moveToVoice(guildId: string, userId: string, channelId: string): Promise<boolean> {
  try {
    const res = await discordFetch(`/guilds/${guildId}/members/${userId}`, "PATCH", {
      channel_id: channelId,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Sends a message to a Discord channel and returns its ID (or null on
 * failure). Caller persists the ID on the match doc so cleanup-vcs can
 * sweep operational chatter at the end of a match without touching the
 * match-result post.
 */
async function sendMessage(channelId: string, payload: any): Promise<string | null> {
  const res = await discordFetch(`/channels/${channelId}/messages`, "POST", payload);
  if (res.ok) {
    const data = await res.json();
    console.log(`[Discord] ✅ Message sent to channel ${channelId} (${data.id})`);
    return data.id || null;
  } else {
    const errBody = await res.text();
    console.error(`[Discord] ❌ Send message failed: ${res.status} — ${errBody}`);
    return null;
  }
}

/**
 * Deletes a single Discord message. Used by cleanup-vcs to remove
 * lobby/toss/veto/start chatter after a match wraps. Best-effort —
 * 404s and 403s are swallowed so a half-cleaned channel state doesn't
 * block the rest of the cleanup.
 */
/**
 * Short, distinguishable team label for tight UI slots (Discord channel
 * names, embed footers). Multi-word teams → uppercased word-initials;
 * single-word teams → first 3 chars uppercased.
 *   "Mohit Taparia" → "MT"
 *   "10k ke Pohe"   → "1KP"
 *   "Major"         → "MAJ"
 *   "Money"         → "MON"
 */
function teamInitials(name: string | undefined | null): string {
  if (!name) return "?";
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map(w => w[0]).join("").toUpperCase().slice(0, 4);
}

async function deleteMessage(channelId: string, messageId: string): Promise<void> {
  try {
    const res = await discordFetch(`/channels/${channelId}/messages/${messageId}`, "DELETE");
    if (res.ok || res.status === 404) {
      console.log(`[Discord] 🗑️ Deleted message ${messageId}`);
    } else {
      const errBody = await res.text();
      console.error(`[Discord] Failed to delete message ${messageId}: ${res.status} — ${errBody}`);
    }
  } catch (e: any) {
    console.error(`[Discord] Delete message error: ${e.message}`);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ROUTE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/valorant/match-update
 *
 * Actions:
 *   "set-lobby"  → Save lobby info + Create Waiting Room VC + Notify Discord
 *   "start"      → Mark match live + Create 2 team VCs + Move players + Delete waiting room
 */
export async function POST(req: NextRequest) {
  try {
    const {
      tournamentId, adminKey, matchId, action, game,
      gameNumber, lobbyName, lobbyPassword,
      notifyDiscord, scheduledTime, bo: bodyBo, vetoMode: bodyVetoMode,
      team1Subs: bodyTeam1Subs, team2Subs: bodyTeam2Subs,
    } = await req.json();

    if (!tournamentId || !adminKey || !matchId || !action) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (await isNotAdmin(adminKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve the tournament's collection. This route was Valorant-only
    // (hardcoded `valorantTournaments`), so every match op silently failed
    // for Dota/CS2. Honor an explicit `game` if the client sends one,
    // otherwise probe the three tournament collections by id (slugs are
    // globally unique, so at most one matches).
    const GAME_COLLECTION: Record<string, string> = {
      valorant: "valorantTournaments", dota2: "tournaments", cs2: "cs2Tournaments",
    };
    let resolvedCollection = GAME_COLLECTION[game] || "valorantTournaments";
    let tournamentRef = adminDb.collection(resolvedCollection).doc(tournamentId);
    if (!game || !GAME_COLLECTION[game]) {
      for (const col of ["valorantTournaments", "tournaments", "cs2Tournaments"]) {
        const candidate = adminDb.collection(col).doc(tournamentId);
        if ((await candidate.get()).exists) { tournamentRef = candidate; resolvedCollection = col; break; }
      }
    }
    const isDotaTournament = resolvedCollection === "tournaments";
    const matchRef = tournamentRef.collection("matches").doc(matchId);
    const matchDoc = await matchRef.get();

    if (!matchDoc.exists) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const matchData = matchDoc.data()!;
    const guildId = process.env.DISCORD_GUILD_ID || process.env.DISCORD_SERVER_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const voiceCategoryId = process.env.VOICE_CATEGORY_ID;

    // Test tournaments can pin all Discord traffic to one isolated channel and
    // optionally skip every VC create/move/delete so staging runs never touch
    // production server state. Override is read once here and flows through
    // the whole request.
    const tournamentDoc = await tournamentRef.get();
    const tournamentData = tournamentDoc.exists ? (tournamentDoc.data() || {}) : {};
    const testChannelOverride: string | undefined = tournamentData.testDiscordChannelId;
    const skipVcOps: boolean = !!tournamentData.skipVcOps;

    // Channel priority: explicit staging override → the tournament's own
    // Discord channel (set per-tournament, e.g. the #domin8 channel) → env
    // fallbacks. This makes EVERY web-side match post (set-lobby, start,
    // next-game, toss/veto) land in the tournament channel when one is set,
    // instead of the global Valorant lobby channel. Tournaments without a
    // discordChannelId keep the old env behaviour unchanged.
    const notifyChannelId = testChannelOverride
      || tournamentData.discordChannelId
      || process.env.Valorant_lobby
      || process.env.LOBBY_CONTROL_CHANNEL_ID
      || process.env.RESULTS_CHANNEL_ID;

    // Wrap the VC helpers so a test tournament with skipVcOps=true becomes
    // a no-op for guild state — useful when you want to exercise the message
    // pipeline without actually creating/moving/deleting voice channels.
    const maybeCreateVoice: typeof createVoiceChannel = async (...args) => {
      if (skipVcOps) { console.log("[test-tournament] skip createVoiceChannel:", args[1]); return null; }
      return createVoiceChannel(...args);
    };
    const maybeMoveToVoice: typeof moveToVoice = async (...args) => {
      if (skipVcOps) { console.log("[test-tournament] skip moveToVoice:", args[1], "→", args[2]); return false; }
      return moveToVoice(...args);
    };
    const maybeDeleteChannel: typeof deleteChannel = async (...args) => {
      if (skipVcOps) { console.log("[test-tournament] skip deleteChannel:", args[0]); return; }
      return deleteChannel(...args);
    };


    // ═══════════════════════════════════════════════════════════════════════
    // ACTION: SET LOBBY
    // → Save lobby info to Firestore
    // → Create a Waiting Room VC (all players from both teams)
    // → Send Discord notification with lobby details + clickable VC link
    // ═══════════════════════════════════════════════════════════════════════
    if (action === "set-lobby") {
      const gameKey = `game${gameNumber || 1}`;
      const updateData: any = {
        lobbyName: lobbyName || "",
        lobbyPassword: lobbyPassword || "",
        lobbySetAt: new Date().toISOString(),
      };

      // ── Resolve per-match substitutes (admin-picked at lobby time) ─────
      // The admin always sends both arrays from the picker, so this also
      // overwrites previously-saved subs on a redo. An empty array clears.
      const team1SubUids: string[] = Array.isArray(bodyTeam1Subs) ? bodyTeam1Subs : [];
      const team2SubUids: string[] = Array.isArray(bodyTeam2Subs) ? bodyTeam2Subs : [];
      const team1Subs: ResolvedSub[] = await resolveUserDiscordData(team1SubUids);
      const team2Subs: ResolvedSub[] = await resolveUserDiscordData(team2SubUids);
      updateData.team1Subs = team1Subs;
      updateData.team2Subs = team2Subs;

      if (matchData.games) {
        updateData[`games.${gameKey}.lobbyName`] = lobbyName || "";
        updateData[`games.${gameKey}.lobbyPassword`] = lobbyPassword || "";
        updateData[`games.${gameKey}.status`] = "lobby_set";
      }

      // ═══════════════════════════════════════════════════════════════════════
      // DOTA 2 → hand off to the bot's existing GC lobby pipeline.
      // We synthesize a `botQueues` doc; the bot cron (every minute) picks up
      // status:"open" + scheduledTime and runs startMatchLobby() which makes
      // iesportsbot create the real Dota lobby, Steam-invite all players,
      // post the Discord lobby embed/DMs, and build Radiant/Dire VCs.
      // The web side does NO Discord here — the bot owns it for Dota.
      // ═══════════════════════════════════════════════════════════════════════
      if (isDotaTournament) {
        const queueId = `tournament_${tournamentId}_${matchId}_g${gameNumber || 1}`;
        const queueRef = adminDb.collection("botQueues").doc(queueId);
        const existing = await queueRef.get();
        const existingStatus = existing.exists ? (existing.data()?.status as string) : null;
        if (existingStatus === "in_progress") {
          return NextResponse.json({
            ok: true, mode: "bot-lobby", queueId,
            message: "Lobby already being created by the bot for this match.",
          });
        }

        const players = await buildDotaQueuePlayers(tournamentRef, matchData);
        const withSteam = players.filter(p => p.steam32Id).length;

        // Create a waiting-room VC + post a notification message in the
        // tournament Discord channel so players know to join the waiting
        // room while the bot spins up the Dota lobby.
        // Waiting-room VC uses short team initials (e.g. "MT vs MO") since
        // Discord channel labels truncate hard; team-named VCs on Start
        // Match use the full names for clarity once the game starts.
        let waitingRoomVcIdDota: string | null = null;
        if (notifyDiscord && botToken && guildId) {
          try {
            const { team1Players, team2Players } = await getTeamDiscordData(tournamentRef, matchData);
            const allDiscordIds = [...team1Players, ...team2Players].map(p => p.discordId).filter(Boolean);
            const wrName = `🎮 ${teamInitials(matchData.team1Name)} vs ${teamInitials(matchData.team2Name)}`;
            const wrId = await maybeCreateVoice(guildId, wrName, voiceCategoryId, allDiscordIds);
            if (wrId) {
              waitingRoomVcIdDota = wrId;
              updateData.waitingRoomVcId = wrId;
              for (const did of allDiscordIds) {
                await maybeMoveToVoice(guildId, did, wrId);
              }
            }
            // Post a "match starting — join waiting room" message in the
            // tournament channel (or the env-configured notify channel).
            const tournamentChannelIdForMsg =
              (await tournamentRef.get()).data()?.discordChannelId || notifyChannelId;
            if (tournamentChannelIdForMsg) {
              const mentions = allDiscordIds.map(id => `<@${id}>`).join(" ");
              const vcLine = wrId
                ? `\n🎙️ **Join the waiting room:** <#${wrId}>`
                : "";
              await sendMessage(tournamentChannelIdForMsg, {
                content: mentions || undefined,
                embeds: [{
                  title: `🎮 ${matchData.team1Name} vs ${matchData.team2Name}`,
                  description: [
                    `**Match starting!** ${withSteam}/${players.length} players will get auto-Steam-invites in Dota 2 in ~1 minute.${vcLine}`,
                    ``,
                    `**${matchData.team1Name}:** ${team1Players.map(p => p.name).join(", ") || "—"}`,
                    `**${matchData.team2Name}:** ${team2Players.map(p => p.name).join(", ") || "—"}`,
                    ``,
                    `If you don't get the Steam invite within 2 min, open Dota 2 → Play → Custom Lobbies and search for the lobby name the bot posts here next.`,
                  ].join("\n"),
                  color: 0xf05a28,
                  footer: { text: "IEsports Tournament" },
                  timestamp: new Date().toISOString(),
                }],
              });
            }
          } catch (e: any) {
            console.error("[Dota set-lobby] waiting-room VC / notify failed:", e?.message || e);
          }
        }
        // Route the bot's lobby embed / announcements to this tournament's
        // private Discord channel (created per-tournament) instead of the
        // global queue channel. Falls back to bot env channels if unset.
        const tournamentChannelId =
          (await tournamentRef.get()).data()?.discordChannelId || null;
        const now = new Date().toISOString();
        await queueRef.set({
          id: queueId,
          name: lobbyName || `${matchData.team1Name} vs ${matchData.team2Name}`,
          type: "free",
          entryFee: 0,
          bonus: 0,
          sponsorId: null,
          players,
          maxPlayers: players.length || 10,
          status: "open",          // cron query is where status == "open"
          createdAt: now,
          createdBy: "tournament-admin",
          lobbyId: null,
          messageId: null,
          scheduledTime: now,      // minsUntil≈0 → cron's start window fires ≤60s
          // Traceability (extra fields; bot only reads the QueueDoc fields above)
          tournamentId,
          tournamentMatchId: matchId,
          tournamentCollection: resolvedCollection,
          tournamentChannelId,
          tournamentGameNumber: gameNumber || 1,
          source: "tournament",
          lobbyPassword: lobbyPassword || "",
        }, { merge: true });

        updateData.botQueueId = queueId;
        updateData.lobbyMode = "bot";
        updateData.lobbyStatus = "bot-queued";
        await matchRef.update(updateData);

        return NextResponse.json({
          ok: true,
          mode: "bot-lobby",
          queueId,
          playersQueued: players.length,
          playersWithSteam: withSteam,
          message: `iesportsbot will create the Dota lobby & invite ${withSteam}/${players.length} players within ~1 minute.`
            + (withSteam < players.length ? ` (${players.length - withSteam} have no linked Steam — they'll get the Discord DM only.)` : ""),
        });
      }

      let discordSent = false;
      let discordSkipReason = "";
      let waitingRoomVcId: string | null = null;
      const opsMessageIds: string[] = Array.isArray(matchData.discordOpsMessageIds)
        ? [...matchData.discordOpsMessageIds]
        : [];

      if (!notifyDiscord) {
        discordSkipReason = "notifyDiscord flag is false";
      } else if (!botToken) {
        discordSkipReason = "DISCORD_BOT_TOKEN env var missing";
      } else if (!guildId) {
        discordSkipReason = "DISCORD_GUILD_ID / DISCORD_SERVER_ID env var missing";
      } else if (!notifyChannelId) {
        discordSkipReason = "Valorant_lobby / LOBBY_CONTROL_CHANNEL_ID / RESULTS_CHANNEL_ID env var missing";
      }

      if (notifyDiscord && botToken && guildId && notifyChannelId) {
        try {
          // ── Fetch team discord data ──────────────────────────────────────
          const { team1Players, team2Players } = await getTeamDiscordData(tournamentRef, matchData);
          const allDiscordIds = [...team1Players, ...team2Players, ...team1Subs, ...team2Subs]
            .map(p => p.discordId)
            .filter(Boolean);
          const allMentions = allDiscordIds.map(id => `<@${id}>`);

          // ── Create Waiting Room VC ───────────────────────────────────────
          const wrName = `🎮 ${matchData.team1Name} vs ${matchData.team2Name}`;
          waitingRoomVcId = await maybeCreateVoice(
            guildId,
            wrName,
            voiceCategoryId,
            allDiscordIds,
          );

          // Store the waiting room VC ID on the match doc for cleanup later
          if (waitingRoomVcId) {
            updateData.waitingRoomVcId = waitingRoomVcId;
          }

          // ── Build notification message ──────────────────────────────────
          const gn = gameNumber || 1;
          const gameLabel = `Game ${gn} (Map ${gn})`;
          const scheduledTime = matchData.games?.[gameKey]?.scheduledTime || matchData.scheduledTime;
          const timeStr = scheduledTime
            ? new Date(scheduledTime).toLocaleTimeString("en-IN", {
                hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
              })
            : "Now";

          const vcLine = waitingRoomVcId
            ? `\n\n🎙️ **Waiting Room:** <#${waitingRoomVcId}>\nJoin the voice channel and hang tight!`
            : "";

          const subsBlock: string[] = [];
          if (team1Subs.length) subsBlock.push(`🔄 **${matchData.team1Name} subs:** ${team1Subs.map(s => s.name).join(", ")}`);
          if (team2Subs.length) subsBlock.push(`🔄 **${matchData.team2Name} subs:** ${team2Subs.map(s => s.name).join(", ")}`);

          const messagePayload = {
            content: allMentions.length > 0 ? allMentions.join(" ") : undefined,
            embeds: [{
              title: `🎮 ${matchData.team1Name} vs ${matchData.team2Name}`,
              description: [
                `**${gameLabel}** — ${matchId}`,
                `⏰ **Time:** ${timeStr} IST`,
                "",
                `**Lobby Name:** \`${lobbyName}\``,
                `**Password:** \`${lobbyPassword}\``,
                "",
                `**${matchData.team1Name}:** ${team1Players.map(p => p.name).join(", ")}`,
                `**${matchData.team2Name}:** ${team2Players.map(p => p.name).join(", ")}`,
                ...(subsBlock.length ? ["", ...subsBlock] : []),
                "",
                `Please join the custom game lobby in Valorant.${vcLine}`,
              ].join("\n"),
              color: 0xff4655,
              footer: { text: "IEsports Tournament" },
              timestamp: new Date().toISOString(),
            }],
          };

          const sentId = await sendMessage(notifyChannelId, messagePayload);
          discordSent = !!sentId;
          if (sentId) opsMessageIds.push(sentId);

          // ── Auto-move players already in a VC to waiting room ──────────
          if (waitingRoomVcId) {
            const inVc: string[] = [];
            const notInVc: string[] = [];
            for (const p of [...team1Players, ...team2Players, ...team1Subs, ...team2Subs]) {
              if (!p.discordId) { notInVc.push(p.name); continue; }
              const moved = await maybeMoveToVoice(guildId, p.discordId, waitingRoomVcId);
              if (moved) inVc.push(p.name);
              else notInVc.push(p.name);
            }
            updateData.vcStatus = { inVc, notInVc, checkedAt: new Date().toISOString() };
          }

        } catch (discordErr: any) {
          discordSkipReason = `Discord error: ${discordErr.message}`;
          console.error("[Discord] set-lobby error:", discordErr.message);
        }
      }

      updateData.discordOpsMessageIds = opsMessageIds;
      await matchRef.update(updateData);

      return NextResponse.json({
        success: true,
        matchId,
        action: "set-lobby",
        gameNumber: gameNumber || 1,
        lobbyName,
        discordNotified: discordSent,
        ...(discordSkipReason ? { discordSkipReason } : {}),
        waitingRoomVcId,
        vcStatus: updateData.vcStatus || null,
      });


    // ═══════════════════════════════════════════════════════════════════════
    // ACTION: START MATCH
    // → Mark match as live
    // → Create 2 team voice channels (named after team names)
    // → Move players from waiting room to their team VC
    // → Delete the waiting room VC
    // → Announce in Discord with clickable team VC links
    // ═══════════════════════════════════════════════════════════════════════
    } else if (action === "start") {
      const startUpdateData: any = {
        status: "live",
        startedAt: new Date().toISOString(),
      };
      const startOpsMessageIds: string[] = Array.isArray(matchData.discordOpsMessageIds)
        ? [...matchData.discordOpsMessageIds]
        : [];

      let team1VcId: string | null = null;
      let team2VcId: string | null = null;

      // DOTA 2 NOTE: web creates the team-named VCs (🔴 {team1}, 🔵 {team2})
      // here on Start Match, same flow as Valorant. The bot used to also
      // create generic "🟢 Radiant" / "🔴 Dire" VCs in pollFirestoreForTeams
      // when it saw both teams populated in the lobby SO, which produced
      // duplicates. The bot side now skips VC creation for tournament queues
      // (queues with tournamentId set) so only web's team-named VCs exist.

      if (botToken && guildId) {
        try {
          // ── Fetch team discord data ──────────────────────────────────────
          const { team1Players, team2Players } = await getTeamDiscordData(tournamentRef, matchData);

          // Per-match subs were saved by set-lobby on the match doc.
          // Add their Discord IDs to their team's VC permissions and moves.
          const team1Subs: ResolvedSub[] = (matchData.team1Subs || []) as ResolvedSub[];
          const team2Subs: ResolvedSub[] = (matchData.team2Subs || []) as ResolvedSub[];

          const team1DiscordIds = [
            ...team1Players.map(p => p.discordId),
            ...team1Subs.map(s => s.discordId),
          ].filter(Boolean);
          const team2DiscordIds = [
            ...team2Players.map(p => p.discordId),
            ...team2Subs.map(s => s.discordId),
          ].filter(Boolean);
          const allDiscordIds = [...team1DiscordIds, ...team2DiscordIds];

          // ── Create Team 1 VC ────────────────────────────────────────────
          team1VcId = await maybeCreateVoice(
            guildId,
            `🔴 ${matchData.team1Name}`,
            voiceCategoryId,
            allDiscordIds, // both teams can see both channels
          );

          // ── Create Team 2 VC ────────────────────────────────────────────
          team2VcId = await maybeCreateVoice(
            guildId,
            `🔵 ${matchData.team2Name}`,
            voiceCategoryId,
            allDiscordIds,
          );

          // Store VC IDs on match doc for cleanup later
          if (team1VcId) startUpdateData.team1VcId = team1VcId;
          if (team2VcId) startUpdateData.team2VcId = team2VcId;

          // ── Move players to their team VCs ──────────────────────────────
          // (only moves users who are currently in a voice channel)
          if (team1VcId) {
            for (const id of team1DiscordIds) {
              await maybeMoveToVoice(guildId, id, team1VcId);
            }
          }
          if (team2VcId) {
            for (const id of team2DiscordIds) {
              await maybeMoveToVoice(guildId, id, team2VcId);
            }
          }

          // ── Evacuate waiting room → Dota General, then delete ──────────
          // Team roster players were already moved to their team VCs above.
          // Anyone STILL in the waiting room is a non-roster straggler (sub,
          // visitor, friend) — bump them to Dota General so they keep voice
          // continuity instead of getting disconnected when the channel
          // dies. We enqueue an `evacuate_vc` Discord-bot command (the bot
          // has gateway voice-state cache; REST can't enumerate voice
          // channel members), wait briefly, then delete.
          const DOTA_GENERAL_VC = process.env.DOTA_GENERAL_VC_ID || "1475549366600073321";
          const waitingRoomVcId = matchData.waitingRoomVcId;
          if (waitingRoomVcId) {
            try {
              const cmdRef = await adminDb.collection("botDiscordCommands").add({
                action: "evacuate_vc",
                params: { vcId: waitingRoomVcId, fallbackVcId: DOTA_GENERAL_VC },
                status: "pending",
                createdAt: new Date().toISOString(),
                createdBy: `start-match:${tournamentId}/${matchId}/waitingroom`,
              });
              // Poll up to 3s for done (bot processes via onSnapshot, ~1s)
              for (let i = 0; i < 6; i++) {
                await new Promise(r => setTimeout(r, 500));
                const s = (await cmdRef.get()).data() as any;
                if (s?.status === "done" || s?.status === "error") break;
              }
            } catch (e: any) {
              console.warn(`[start] evacuate waiting room failed: ${e?.message || e}`);
            }
            await maybeDeleteChannel(waitingRoomVcId);
            startUpdateData.waitingRoomVcId = null; // clean up reference
          }

          // ── Announce team VCs ───────────────────────────────────────────
          if (notifyChannelId) {
            const team1VcMention = team1VcId ? `<#${team1VcId}>` : "—";
            const team2VcMention = team2VcId ? `<#${team2VcId}>` : "—";
            const team1Mentions = team1DiscordIds.map(id => `<@${id}>`).join(", ") || "—";
            const team2Mentions = team2DiscordIds.map(id => `<@${id}>`).join(", ") || "—";
            const subLines: string[] = [];
            if (team1Subs.length) subLines.push(`🔄 **${matchData.team1Name} subs:** ${team1Subs.map(s => s.name).join(", ")}`);
            if (team2Subs.length) subLines.push(`🔄 **${matchData.team2Name} subs:** ${team2Subs.map(s => s.name).join(", ")}`);

            const startMsgId = await sendMessage(notifyChannelId, {
              embeds: [{
                title: `🏟️ Match Started — ${matchData.team1Name} vs ${matchData.team2Name}`,
                description: [
                  `**Match:** ${matchId}`,
                  "",
                  `🔴 **${matchData.team1Name}:** ${team1Mentions}`,
                  `🔊 Voice: ${team1VcMention}`,
                  "",
                  `🔵 **${matchData.team2Name}:** ${team2Mentions}`,
                  `🔊 Voice: ${team2VcMention}`,
                  ...(subLines.length ? ["", ...subLines] : []),
                  "",
                  `Get into your voice channels and good luck! 🎯`,
                ].join("\n"),
                color: 0x16a34a,
                footer: { text: "IEsports Tournament" },
                timestamp: new Date().toISOString(),
              }],
            });
            if (startMsgId) startOpsMessageIds.push(startMsgId);
          }

        } catch (discordErr: any) {
          console.error("[Discord] start error:", discordErr.message);
        }
      }

      // For Dota tournaments, also fire a Launch command to the bot. The bot
      // owns the GC and is the only client that can actually start the
      // practice lobby's match server — without this the lobby just sits in
      // UI state forever waiting for the host to click Start in-client.
      // Posted as a botLobbyCommands doc; bot picks up via onSnapshot in ~1s.
      let launchCmdId: string | null = null;
      if (isDotaTournament) {
        try {
          const ref = await adminDb.collection("botLobbyCommands").add({
            action: "launch",
            params: {},
            status: "pending",
            createdAt: new Date().toISOString(),
            createdBy: `start-match:${tournamentId}/${matchId}`,
          });
          launchCmdId = ref.id;
          console.log(`[Dota start] enqueued launch command ${ref.id}`);
        } catch (e: any) {
          console.error(`[Dota start] launch enqueue failed: ${e?.message || e}`);
        }
      }

      startUpdateData.discordOpsMessageIds = startOpsMessageIds;
      await matchRef.update(startUpdateData);

      return NextResponse.json({
        success: true,
        matchId,
        action: "start",
        team1VcId,
        team2VcId,
        ...(launchCmdId ? { dotaLaunchCmdId: launchCmdId } : {}),
      });


    // ═══════════════════════════════════════════════════════════════════════
    // ACTION: CLEANUP VCS
    // → Deletes team VCs + waiting room VC stored on the match doc
    // → Call this after match completes
    // ═══════════════════════════════════════════════════════════════════════
    } else if (action === "cleanup-vcs") {
      const vcsToDelete = [
        matchData.waitingRoomVcId,
        matchData.team1VcId,
        matchData.team2VcId,
      ].filter(Boolean);

      // Evacuate every VC's actual occupants → Dota General before delete,
      // via the bot's gateway voice cache (REST can't enumerate). The bot
      // moves everyone currently in each VC regardless of whether they're
      // on a roster, on a sub list, or just a friend who hopped in. We
      // enqueue all three evacuate commands first, briefly wait, then delete.
      const DOTA_GENERAL_VC = process.env.DOTA_GENERAL_VC_ID || "1475549366600073321";
      const evacRefs: FirebaseFirestore.DocumentReference[] = [];
      for (const vcId of vcsToDelete) {
        try {
          const ref = await adminDb.collection("botDiscordCommands").add({
            action: "evacuate_vc",
            params: { vcId, fallbackVcId: DOTA_GENERAL_VC },
            status: "pending",
            createdAt: new Date().toISOString(),
            createdBy: `cleanup-vcs:${tournamentId}/${matchId}`,
          });
          evacRefs.push(ref);
        } catch (e: any) {
          console.warn(`[cleanup-vcs] evacuate enqueue for ${vcId} failed: ${e?.message || e}`);
        }
      }
      // Wait briefly for the bot to process all evacuates (parallel, ~1-2s).
      for (let i = 0; i < 8 && evacRefs.length > 0; i++) {
        await new Promise(r => setTimeout(r, 400));
        const states = await Promise.all(evacRefs.map(r => r.get().then(s => (s.data() as any)?.status)));
        if (states.every(s => s === "done" || s === "error")) break;
      }

      for (const vcId of vcsToDelete) {
        await maybeDeleteChannel(vcId);
      }

      // Also sweep the tournament-ops chatter: lobby/start/next-game embeds
      // we tracked, plus the latest active toss/veto/side-pick message. The
      // match-result post is sent from /api/valorant/match-fetch and is NOT
      // in this set, so it stays in the channel.
      const opsIds: string[] = Array.isArray(matchData.discordOpsMessageIds) ? matchData.discordOpsMessageIds : [];
      const liveVetoMsgId: string | null = matchData.vetoState?.messageId || null;
      const allMsgIds = Array.from(new Set([...opsIds, ...(liveVetoMsgId ? [liveVetoMsgId] : [])])).filter(Boolean);
      let deletedMessages = 0;
      if (notifyChannelId && allMsgIds.length > 0) {
        for (const mid of allMsgIds) {
          await deleteMessage(notifyChannelId, mid);
          deletedMessages++;
        }
      }

      await matchRef.update({
        waitingRoomVcId: null,
        team1VcId: null,
        team2VcId: null,
        discordOpsMessageIds: [],
      });

      return NextResponse.json({
        success: true,
        matchId,
        action: "cleanup-vcs",
        deletedChannels: vcsToDelete.length,
        deletedMessages,
      });

    } else if (action === "next-game") {
      // ═══════════════════════════════════════════════════════════════════════
      // ACTION: NEXT GAME (BO2/BO3)
      // → Post a new lobby credentials message to Discord for Game N
      // → Does NOT create/destroy any voice channels — players stay in the
      //   existing team VCs from Game 1. Use this when the series continues
      //   on the same Discord VCs but the Valorant lobby name/password has
      //   changed for the next map.
      // ═══════════════════════════════════════════════════════════════════════
      const gn = gameNumber || 2;
      const gameKey = `game${gn}`;
      const nextUpdateData: any = {
        [`games.${gameKey}.lobbyName`]: lobbyName || "",
        [`games.${gameKey}.lobbyPassword`]: lobbyPassword || "",
        [`games.${gameKey}.status`]: "lobby_set",
        lobbyName: lobbyName || "",
        lobbyPassword: lobbyPassword || "",
        lobbySetAt: new Date().toISOString(),
      };

      let discordSent = false;
      let discordSkipReason = "";
      const nextOpsMessageIds: string[] = Array.isArray(matchData.discordOpsMessageIds)
        ? [...matchData.discordOpsMessageIds]
        : [];

      if (!notifyDiscord) discordSkipReason = "notifyDiscord flag is false";
      else if (!botToken) discordSkipReason = "DISCORD_BOT_TOKEN env var missing";
      else if (!guildId) discordSkipReason = "DISCORD_GUILD_ID / DISCORD_SERVER_ID env var missing";
      else if (!notifyChannelId) discordSkipReason = "notify channel env var missing";

      if (notifyDiscord && botToken && guildId && notifyChannelId) {
        try {
          const { team1Players, team2Players } = await getTeamDiscordData(tournamentRef, matchData);
          const team1Subs: ResolvedSub[] = (matchData.team1Subs || []) as ResolvedSub[];
          const team2Subs: ResolvedSub[] = (matchData.team2Subs || []) as ResolvedSub[];
          const allMentions = [...team1Players, ...team2Players, ...team1Subs, ...team2Subs]
            .map(p => p.discordId).filter(Boolean)
            .map(id => `<@${id}>`);

          const team1Vc = matchData.team1VcId ? `<#${matchData.team1VcId}>` : null;
          const team2Vc = matchData.team2VcId ? `<#${matchData.team2VcId}>` : null;
          const vcLines = (team1Vc || team2Vc)
            ? ["", `🔊 Stay in your team VCs: ${team1Vc || "—"} · ${team2Vc || "—"}`].join("\n")
            : "";

          const subsBlock: string[] = [];
          if (team1Subs.length) subsBlock.push(`🔄 **${matchData.team1Name} subs:** ${team1Subs.map(s => s.name).join(", ")}`);
          if (team2Subs.length) subsBlock.push(`🔄 **${matchData.team2Name} subs:** ${team2Subs.map(s => s.name).join(", ")}`);

          const messagePayload = {
            content: allMentions.length > 0 ? allMentions.join(" ") : undefined,
            embeds: [{
              title: `🗺️ Game ${gn} — ${matchData.team1Name} vs ${matchData.team2Name}`,
              description: [
                `**New Lobby Name:** \`${lobbyName}\``,
                `**Password:** \`${lobbyPassword}\``,
                ...(subsBlock.length ? ["", ...subsBlock] : []),
                "",
                `Create the new custom game in Valorant — teams stay in the same Discord VCs.`,
                vcLines,
              ].join("\n"),
              color: 0x3CCBFF,
              footer: { text: "IEsports Tournament" },
              timestamp: new Date().toISOString(),
            }],
          };

          const nextMsgId = await sendMessage(notifyChannelId, messagePayload);
          discordSent = !!nextMsgId;
          if (nextMsgId) nextOpsMessageIds.push(nextMsgId);
        } catch (discordErr: any) {
          discordSkipReason = `Discord error: ${discordErr.message}`;
          console.error("[Discord] next-game error:", discordErr.message);
        }
      }

      nextUpdateData.discordOpsMessageIds = nextOpsMessageIds;
      await matchRef.update(nextUpdateData);

      return NextResponse.json({
        success: true,
        matchId,
        action: "next-game",
        gameNumber: gn,
        lobbyName,
        discordNotified: discordSent,
        ...(discordSkipReason ? { discordSkipReason } : {}),
        // Hint for admin UI: if these VCs aren't set we should warn them
        hasExistingTeamVcs: !!(matchData.team1VcId && matchData.team2VcId),
      });

    } else if (action === "check-vc") {
      // ═══════════════════════════════════════════════════════════════════════
      // ACTION: CHECK VC STATUS
      // → Re-attempt to move all players to the active VC (waiting room or team VCs)
      // → Returns who is in VC and who is not
      // ═══════════════════════════════════════════════════════════════════════
      const targetVcId = matchData.waitingRoomVcId || matchData.team1VcId;
      if (!targetVcId || !guildId) {
        return NextResponse.json({ error: "No active VC for this match" }, { status: 400 });
      }

      const { team1Players, team2Players } = await getTeamDiscordData(tournamentRef, matchData);
      const team1Subs: ResolvedSub[] = (matchData.team1Subs || []) as ResolvedSub[];
      const team2Subs: ResolvedSub[] = (matchData.team2Subs || []) as ResolvedSub[];
      const team1All = [...team1Players, ...team1Subs];
      const team2All = [...team2Players, ...team2Subs];
      const inVc: string[] = [];
      const notInVc: string[] = [];

      for (const p of [...team1All, ...team2All]) {
        if (!p.discordId) { notInVc.push(p.name); continue; }
        // If waiting room exists, try to move there; otherwise route to the
        // player's own team VC so subs land in the right channel.
        const vc = matchData.waitingRoomVcId || (
          team1All.some(t => t.uid === p.uid) ? matchData.team1VcId : matchData.team2VcId
        );
        if (!vc) { notInVc.push(p.name); continue; }
        const moved = await maybeMoveToVoice(guildId, p.discordId, vc);
        if (moved) inVc.push(p.name);
        else notInVc.push(p.name);
      }

      const vcStatus = { inVc, notInVc, checkedAt: new Date().toISOString() };
      await matchRef.update({ vcStatus });

      return NextResponse.json({ success: true, matchId, action: "check-vc", vcStatus });

    } else if (action === "set-time") {
      await matchRef.update({ scheduledTime: scheduledTime || null });
      return NextResponse.json({ success: true, matchId, action: "set-time", scheduledTime });


    // ═══════════════════════════════════════════════════════════════════════
    // ACTION: TOSS + MAP VETO
    // → Random coin toss → post result with choice buttons
    // → Bot handles interactive veto from there (button-handler.ts)
    // ═══════════════════════════════════════════════════════════════════════
    } else if (action === "toss") {
      const bo = bodyBo || matchData.bo || 3;
      const vetoMode: "veto" | "random" = bodyVetoMode === "random" ? "random" : "veto";

      if (![1, 2, 3, 5].includes(bo)) {
        return NextResponse.json({ error: "bo must be 1, 2, 3, or 5" }, { status: 400 });
      }
      if (!notifyChannelId) {
        return NextResponse.json({ error: "No Discord channel configured" }, { status: 400 });
      }
      if (matchData.vetoState && matchData.vetoState.status !== "complete") {
        return NextResponse.json({ error: "Toss/veto already in progress" }, { status: 400 });
      }

      // ── Look up team captains ──────────────────────────────────────
      const team1TeamRef = tournamentRef.collection("teams").doc(matchData.team1Id);
      const team2TeamRef = tournamentRef.collection("teams").doc(matchData.team2Id);
      const [team1Doc, team2Doc] = await Promise.all([team1TeamRef.get(), team2TeamRef.get()]);

      const team1CaptainUid = team1Doc.data()?.captainUid;
      const team2CaptainUid = team2Doc.data()?.captainUid;

      // Fallback: first member if no captainUid
      const team1FallbackUid = team1CaptainUid || (team1Doc.data()?.members?.[0]?.uid ?? team1Doc.data()?.members?.[0]);
      const team2FallbackUid = team2CaptainUid || (team2Doc.data()?.members?.[0]?.uid ?? team2Doc.data()?.members?.[0]);

      if (!team1FallbackUid || !team2FallbackUid) {
        return NextResponse.json({ error: "Cannot determine team captains" }, { status: 400 });
      }

      const [cap1User, cap2User] = await Promise.all([
        adminDb.collection("users").doc(team1FallbackUid).get(),
        adminDb.collection("users").doc(team2FallbackUid).get(),
      ]);

      const team1CaptainDiscordId = cap1User.data()?.discordId || "";
      const team2CaptainDiscordId = cap2User.data()?.discordId || "";

      if (!team1CaptainDiscordId || !team2CaptainDiscordId) {
        return NextResponse.json({ error: "Both captains must have Discord linked" }, { status: 400 });
      }

      // Collect every teammate's Discord ID so the veto/random buttons
      // accept clicks from any team member — if the captain can't make it
      // the rest of the squad can still drive the toss/veto flow.
      const collectMemberDiscordIds = async (teamDoc: FirebaseFirestore.DocumentSnapshot): Promise<string[]> => {
        const members: any[] = teamDoc.data()?.members || [];
        const uids = members.map((m) => (typeof m === "string" ? m : m?.uid)).filter(Boolean) as string[];
        if (uids.length === 0) return [];
        const docs = await adminDb.getAll(...uids.map((uid) => adminDb.collection("users").doc(uid)));
        return docs.map((d) => d.data()?.discordId || "").filter(Boolean);
      };
      const [team1MemberDiscordIds, team2MemberDiscordIds] = await Promise.all([
        collectMemberDiscordIds(team1Doc),
        collectMemberDiscordIds(team2Doc),
      ]);

      // ── Random toss ────────────────────────────────────────────────
      const tossWinner: "team1" | "team2" = Math.random() < 0.5 ? "team1" : "team2";
      const winnerName = tossWinner === "team1" ? matchData.team1Name : matchData.team2Name;
      const winnerCaptainTag = tossWinner === "team1" ? team1CaptainDiscordId : team2CaptainDiscordId;

      const VALORANT_MAPS = ["Abyss", "Ascent", "Bind", "Haven", "Icebox", "Lotus", "Split"];

      // ── Post toss message, branching on the admin-selected mode ────
      const mapPoolLine = `🗺️ **Map pool:** ${VALORANT_MAPS.join(" · ")}`;
      let tossRes: any;
      let vetoState: any;

      if (vetoMode === "random") {
        // Random mode: no captain choice. Toss winner gets the first reveal
        // button directly; the loser's button appears after the first pick.
        tossRes = await discordFetch(`/channels/${notifyChannelId}/messages`, "POST", {
          content: `<@${winnerCaptainTag}>`,
          embeds: [{
            title: `🎲 ${winnerName} — reveal a map  (1 / ${bo})`,
            description: [
              `**${matchData.team1Name}** vs **${matchData.team2Name}** · BO${bo}`,
              `🏆 Toss: **${winnerName}** · 🎲 **Random Maps** mode (no bans)`,
              ``,
              `**${winnerName}**, click the button below to reveal a random map for **Game 1**.`,
              ``,
              `**How this works:**`,
              `• Teams take turns clicking — toss winner first, then alternate.`,
              `• Each click picks one map at random from the pool.`,
              `• After all ${bo} map${bo > 1 ? "s are" : " is"} revealed, the **opposing team** picks Attack or Defence on each map.`,
              ``,
              mapPoolLine,
            ].join("\n"),
            color: 0x22c55e,
            footer: { text: `Any player on ${winnerName} can click` },
          }],
          components: [{
            type: 1,
            components: [
              {
                type: 2,
                style: 3,
                label: `${winnerName} — Reveal My Map`,
                emoji: { name: "🎲" },
                custom_id: `random_reveal:${tournamentId}:${matchId}`,
              },
            ],
          }],
        });

        vetoState = {
          status: "random",
          bo,
          tossWinner,
          banFirst: null,
          sidePickOnDecider: tossWinner, // first reveal belongs to toss winner
          currentStep: 0,
          actions: [],
          remainingMaps: [...VALORANT_MAPS],
          team1Name: matchData.team1Name,
          team2Name: matchData.team2Name,
          team1CaptainDiscordId,
          team2CaptainDiscordId,
          team1MemberDiscordIds,
          team2MemberDiscordIds,
          channelId: notifyChannelId,
          messageId: "",
        };
      } else {
        // Traditional veto mode: captain chooses between banning first or
        // letting the other side ban first in exchange for side choice on
        // the decider (or, for BO1, side choice on the only map).
        const otherName = tossWinner === "team1" ? matchData.team2Name : matchData.team1Name;
        const isBo1 = bo === 1;
        const sideTargetMap = isBo1 ? "the only map" : "the decider";
        const sideTargetExplain = isBo1
          ? "*the single map you'll play*"
          : "*the final map of the series, played if it's tied*";

        const choiceExplainLines = isBo1
          ? [
              `**🎯 Ban First**`,
              `   You take the first ban. **${otherName}** picks Attack/Defence on the map.`,
              ``,
              `**🗺️ Pick Side**`,
              `   **${otherName}** bans first. You pick Attack/Defence on the map.`,
            ]
          : [
              `**🎯 Ban First**`,
              `   You ban first. The trade-off: **${otherName}** picks the side (Attack/Defence) on the **decider** ${sideTargetExplain}.`,
              ``,
              `**🗺️ Take Side on Decider**`,
              `   **${otherName}** bans first. You pick the side on the decider.`,
            ];

        tossRes = await discordFetch(`/channels/${notifyChannelId}/messages`, "POST", {
          content: `<@${winnerCaptainTag}>`,
          embeds: [{
            title: `🎲 ${winnerName} won the toss — choose your advantage`,
            description: [
              `**${matchData.team1Name}** vs **${matchData.team2Name}** · BO${bo} · Traditional Veto`,
              ``,
              `🏆 **${winnerName}** won the toss.`,
              ``,
              `**${winnerName}**, click one of the buttons below:`,
              ``,
              ...choiceExplainLines,
              ``,
              isBo1 ? "" : `*After the choice, both teams alternate bans + picks. The map nobody picked becomes the decider.*`,
              ``,
              mapPoolLine,
            ].filter(Boolean).join("\n"),
            color: 0xff4655,
            footer: { text: `Any player on ${winnerName} can click` },
          }],
          components: [{
            type: 1,
            components: [
              {
                type: 2,
                style: 1,
                label: "Ban First",
                emoji: { name: "🎯" },
                custom_id: `toss_choice:${tournamentId}:${matchId}:ban_first`,
              },
              {
                type: 2,
                style: 2,
                label: isBo1 ? "Pick Side" : "Take Side on Decider",
                emoji: { name: "🗺️" },
                custom_id: `toss_choice:${tournamentId}:${matchId}:side_first`,
              },
            ],
          }],
        });

        vetoState = {
          status: "toss_choice",
          bo,
          tossWinner,
          banFirst: null,
          sidePickOnDecider: null,
          currentStep: 0,
          actions: [],
          remainingMaps: [...VALORANT_MAPS],
          team1Name: matchData.team1Name,
          team2Name: matchData.team2Name,
          team1CaptainDiscordId,
          team2CaptainDiscordId,
          team1MemberDiscordIds,
          team2MemberDiscordIds,
          channelId: notifyChannelId,
          messageId: "",
        };
      }

      let messageId = "";
      if (tossRes.ok) {
        const data = await tossRes.json();
        messageId = data.id;
      }
      vetoState.messageId = messageId;

      await matchRef.update({ vetoState });

      return NextResponse.json({
        success: true,
        matchId,
        action: "toss",
        tossWinner,
        winnerName,
        bo,
        messageId,
      });

    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    console.error("Match update error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}