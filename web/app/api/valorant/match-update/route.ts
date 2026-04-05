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
const PERM_VIEW_CONNECT_SPEAK = String(
  BigInt(PERM_VIEW_CHANNEL) | BigInt(PERM_CONNECT) | BigInt(PERM_SPEAK)
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
      notifyDiscord, scheduledTime,
    } = await req.json();

    if (!tournamentId || !adminKey || !matchId || !action) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (adminKey !== process.env.ADMIN_SECRET) {
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
    const notifyChannelId = process.env.Valorant_lobby
      || process.env.LOBBY_CONTROL_CHANNEL_ID
      || process.env.RESULTS_CHANNEL_ID;


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
          const allDiscordIds = [...team1Players, ...team2Players]
            .map(p => p.discordId)
            .filter(Boolean);
          const allMentions = allDiscordIds.map(id => `<@${id}>`);

          // ── Create Waiting Room VC ───────────────────────────────────────
          const wrName = `🎮 ${matchData.team1Name} vs ${matchData.team2Name}`;
          waitingRoomVcId = await createVoiceChannel(
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
                "",
                `Please join the custom game lobby in Valorant.${vcLine}`,
              ].join("\n"),
              color: 0xff4655,
              footer: { text: "IEsports Tournament" },
              timestamp: new Date().toISOString(),
            }],
          };

          discordSent = await sendMessage(notifyChannelId, messagePayload);

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

          const team1DiscordIds = team1Players.map(p => p.discordId).filter(Boolean);
          const team2DiscordIds = team2Players.map(p => p.discordId).filter(Boolean);
          const allDiscordIds = [...team1DiscordIds, ...team2DiscordIds];

          // ── Create Team 1 VC ────────────────────────────────────────────
          team1VcId = await createVoiceChannel(
            guildId,
            `🔴 ${matchData.team1Name}`,
            voiceCategoryId,
            allDiscordIds, // both teams can see both channels
          );

          // ── Create Team 2 VC ────────────────────────────────────────────
          team2VcId = await createVoiceChannel(
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
              await moveToVoice(guildId, id, team1VcId);
            }
          }
          if (team2VcId) {
            for (const id of team2DiscordIds) {
              await moveToVoice(guildId, id, team2VcId);
            }
          }

          // ── Delete waiting room VC if it exists ─────────────────────────
          const waitingRoomVcId = matchData.waitingRoomVcId;
          if (waitingRoomVcId) {
            await deleteChannel(waitingRoomVcId);
            startUpdateData.waitingRoomVcId = null; // clean up reference
          }

          // ── Announce team VCs ───────────────────────────────────────────
          if (notifyChannelId) {
            const team1VcMention = team1VcId ? `<#${team1VcId}>` : "—";
            const team2VcMention = team2VcId ? `<#${team2VcId}>` : "—";
            const team1Mentions = team1DiscordIds.map(id => `<@${id}>`).join(", ") || "—";
            const team2Mentions = team2DiscordIds.map(id => `<@${id}>`).join(", ") || "—";

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
        await deleteChannel(vcId);
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

    } else if (action === "set-time") {
      await matchRef.update({ scheduledTime: scheduledTime || null });
      return NextResponse.json({ success: true, matchId, action: "set-time", scheduledTime });
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    console.error("Match update error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}