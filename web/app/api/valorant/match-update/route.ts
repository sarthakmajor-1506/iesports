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
 * Sends a message to a Discord channel.
 */
async function sendMessage(channelId: string, payload: any): Promise<boolean> {
  const res = await discordFetch(`/channels/${channelId}/messages`, "POST", payload);
  if (res.ok) {
    console.log(`[Discord] ✅ Message sent to channel ${channelId}`);
    return true;
  } else {
    const errBody = await res.text();
    console.error(`[Discord] ❌ Send message failed: ${res.status} — ${errBody}`);
    return false;
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
      tournamentId, adminKey, matchId, action,
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

    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
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

    const notifyChannelId = testChannelOverride
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

      let discordSent = false;
      let discordSkipReason = "";
      let waitingRoomVcId: string | null = null;

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

          discordSent = await sendMessage(notifyChannelId, messagePayload);

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

      let team1VcId: string | null = null;
      let team2VcId: string | null = null;

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

          // ── Delete waiting room VC if it exists ─────────────────────────
          const waitingRoomVcId = matchData.waitingRoomVcId;
          if (waitingRoomVcId) {
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

            await sendMessage(notifyChannelId, {
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
          }

        } catch (discordErr: any) {
          console.error("[Discord] start error:", discordErr.message);
        }
      }

      await matchRef.update(startUpdateData);

      return NextResponse.json({
        success: true,
        matchId,
        action: "start",
        team1VcId,
        team2VcId,
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

      for (const vcId of vcsToDelete) {
        await maybeDeleteChannel(vcId);
      }

      await matchRef.update({
        waitingRoomVcId: null,
        team1VcId: null,
        team2VcId: null,
      });

      return NextResponse.json({
        success: true,
        matchId,
        action: "cleanup-vcs",
        deletedChannels: vcsToDelete.length,
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

          discordSent = await sendMessage(notifyChannelId, messagePayload);
        } catch (discordErr: any) {
          discordSkipReason = `Discord error: ${discordErr.message}`;
          console.error("[Discord] next-game error:", discordErr.message);
        }
      }

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
            title: "🎲 COIN TOSS — Random Maps",
            description: [
              `**${matchData.team1Name}** vs **${matchData.team2Name}**`,
              ``,
              `🏆 Toss winner: **${winnerName}**`,
              `🎲 Mode: **Random Maps** (no bans, no side advantage — pure RNG)`,
              ``,
              mapPoolLine,
              ``,
              `▶️ **${winnerName}** captain, click below to reveal your map first.`,
              `Once you pick, **${tossWinner === "team1" ? matchData.team2Name : matchData.team1Name}** gets their reveal button.`,
              `Total maps to reveal: **${bo}**`,
            ].join("\n"),
            color: 0x22c55e,
            footer: { text: `BO${bo} · Only ${winnerName} captain can click next` },
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
        // the decider.
        const otherName = tossWinner === "team1" ? matchData.team2Name : matchData.team1Name;
        tossRes = await discordFetch(`/channels/${notifyChannelId}/messages`, "POST", {
          content: `<@${winnerCaptainTag}>`,
          embeds: [{
            title: "🎲 COIN TOSS — Traditional Veto",
            description: [
              `**${matchData.team1Name}** vs **${matchData.team2Name}**`,
              ``,
              `🏆 Toss winner: **${winnerName}**`,
              `🎯 Mode: **Traditional Veto** (alternating bans + picks)`,
              ``,
              mapPoolLine,
              ``,
              `**${winnerName}**, pick your advantage:`,
              `• **🎯 Ban First** — you take the first ban. Side pick on the decider goes to **${otherName}**.`,
              `• **🗺️ Pick Side on Decider** — **${otherName}** bans first. You get the side of your choice on the decider.`,
            ].join("\n"),
            color: 0xff4655,
            footer: { text: `BO${bo} · Only ${winnerName} captain can choose` },
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
                label: "Pick Side on Decider",
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