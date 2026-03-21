import {
  Client,
  TextChannel,
  ChannelType,
  VoiceChannel,
  PermissionsBitField,
} from "discord.js";
import {
  QueueDoc,
  MatchPlayer,
  saveLobby,
  updateLobby,
  getLobby,
  updateQueue,
  saveDailyRecord,
} from "./firebase";
import { getDotaBot } from "./dota-gc";
import { fetchMatchResult, requestMatchParse } from "./opendota";
import { lobbyEmbed, matchResultEmbed } from "../utils/embeds";
import { inviteMeButton, lobbyControlRow1, lobbyControlRow2, lobbyControlRow3 } from "../utils/buttons";

// NO global tempVoiceChannels array — VCs are tracked per-lobby in Firestore
// so cleanup is always lobby-specific and survives bot restarts
let waitingRoomId: string | null = null;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── PHASE 1: 10 min before — warning + waiting room VC ───────

export async function sendPreMatchWarning(client: Client, queue: QueueDoc): Promise<void> {
  const guildId = process.env.DISCORD_GUILD_ID!;
  const queueChannelId = process.env.QUEUE_CHANNEL_ID;
  const guild = await client.guilds.fetch(guildId);

  if (queue.players.length === 0) { console.log("[PreMatch] No players, skipping."); return; }

  try {
    const categoryId = process.env.VOICE_CATEGORY_ID;
    const perms: any[] = [
      { id: guild.id, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
      ...queue.players.map((p) => ({
        id: p.discordId,
        allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Speak],
      })),
    ];
    const opts: any = { name: "🎮 Waiting Room", type: ChannelType.GuildVoice, userLimit: queue.maxPlayers + 2, permissionOverwrites: perms };
    if (categoryId) opts.parent = categoryId;

    const wr = (await guild.channels.create(opts)) as VoiceChannel;
    waitingRoomId = wr.id;

    if (queueChannelId) {
      const ch = (await client.channels.fetch(queueChannelId)) as TextChannel;
      const mentions = queue.players.map((p) => `<@${p.discordId}>`).join(" ");
      const timeStr = queue.scheduledTime
        ? new Date(queue.scheduledTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
        : "soon";
      await ch.send(
        `⏰ **GAME STARTING SOON!**\n` +
        `💰 **${queue.name}** starts at **${timeStr} IST**\n\n` +
        `Please be ready to join the lobby.\n\n` +
        `🎙️ Waiting Room: <#${wr.id}>\nJoin the voice channel and hang tight!\n\n` +
        `👥 **Players:**\n${mentions}`
      );
    }
    console.log("[PreMatch] Warning sent + waiting room created");
  } catch (err: any) { console.error("[PreMatch] Error:", err.message); }
}

// ── PHASE 2: Match time — create Dota lobby + invite ─────────

export async function startMatchLobby(client: Client, queue: QueueDoc): Promise<string | null> {
  const guildId = process.env.DISCORD_GUILD_ID!;
  const lobbyChannelId = process.env.LOBBY_CONTROL_CHANNEL_ID;
  const guild = await client.guilds.fetch(guildId);

  await updateQueue(queue.id, { status: "in_progress" });

  const allPlayers: MatchPlayer[] = queue.players.map((p) => ({
    discordId: p.discordId, username: p.username, steamId: p.steamId,
    steam32Id: p.steam32Id, steamName: p.steamName,
  }));

  const lobbyName = process.env.DEFAULT_LOBBY_NAME || "IEsports Lobby";
  const password = String(Math.floor(100 + Math.random() * 900));
  const gameMode = process.env.DEFAULT_GAME_MODE || "CM";
  const region = process.env.DEFAULT_SERVER_REGION || "India";

  // ── Step 1: Create GC Lobby ──────────────────────────────────
  let gcLobbyId: string | null = null;
  let lobbyCreated = false;

  const bot = getDotaBot();
  console.log(`[Match] bot.isReady() = ${bot.isReady()}`);

  if (bot.isReady()) {
    try {
      console.log(`[Match] Creating Dota lobby...`);
      const result = await bot.createLobby(lobbyName, password, gameMode, region);
      gcLobbyId = result.lobbyId;
      lobbyCreated = true;
      console.log(`[Match] ✅ Dota lobby created (gcId=${gcLobbyId})`);
    } catch (err: any) {
      console.error(`[Match] ❌ Lobby creation failed: ${err.message}`);

      // FIX #1/#2: Even if createLobby timed out, check if the lobby
      // was actually created by looking at the bot's live lobby members.
      // The GC often takes >45s to respond but the lobby IS created.
      const liveMembers = bot.getLobbyMembers();
      if (liveMembers.length > 0) {
        console.log(`[Match] 🔄 Lobby appears to exist (${liveMembers.length} members detected) — treating as created`);
        gcLobbyId = "active";
        lobbyCreated = true;
      }
    }
  } else {
    console.log(`[Match] ⚠️  Bot not ready — skipping GC lobby creation (manual mode)`);
  }

  // ── Step 2: Save to Firestore ────────────────────────────────
  const firestoreLobbyId = await saveLobby({
    queueId: queue.id, gcLobbyId, lobbyName, password, gameMode, serverRegion: region,
    radiant: [], dire: [], spectators: allPlayers,
    status: "waiting", dotaMatchId: null, winner: null, mvp: null,
    duration: null, playerStats: null, createdAt: new Date().toISOString(), completedAt: null,
  });
  console.log(`[Match] ✅ Firestore lobby saved: ${firestoreLobbyId}`);

  // ── Step 3: Post lobby embed to Discord ─────────────────────
  if (lobbyChannelId) {
    try {
      const ch = (await client.channels.fetch(lobbyChannelId)) as TextChannel;
      const lob = await getLobby(firestoreLobbyId);
      if (lob) {
        await ch.send({ embeds: [lobbyEmbed(lob)], components: [inviteMeButton(firestoreLobbyId)] });
        await ch.send({ content: "**Admin Controls:**", components: [lobbyControlRow1(firestoreLobbyId), lobbyControlRow2(firestoreLobbyId), lobbyControlRow3(firestoreLobbyId)] });
      }
    } catch (err: any) { console.error("[Match] Lobby embed error:", err.message); }
  }

  // ── Step 4: Invite players ───────────────────────────────────
  // FIX #2: This now runs because lobbyCreated is true even on late confirmation
  if (lobbyCreated && bot.isReady()) {
    try {
      const ids = allPlayers.map(p => p.steam32Id).filter((id): id is string => !!id);
      console.log(`[Match] Sending GC invites to ${ids.length} players...`);
      await bot.inviteAll(ids);
    } catch (err: any) {
      console.error("[Match] GC invite error:", err.message);
    }
  }

  // ── Step 5: DM every player ──────────────────────────────────
  for (const player of allPlayers) {
    try {
      const member = await guild.members.fetch(player.discordId);
      const modeMsg = lobbyCreated
        ? `A Dota 2 invite has been sent to your Steam account.\nIf you don't see it, join manually:`
        : `Please join the lobby manually:`;
      await member.send(
        `🎮 **IEsports Match Starting!**\n\n` +
        `${modeMsg}\n` +
        `Lobby: \`${lobbyName}\`\nPassword: \`${password}\`\n` +
        `Server: ${region} | Mode: ${gameMode}\n\n` +
        `Open Dota 2 → Play → Custom Lobbies → Search for lobby name`
      );
    } catch { /* DMs closed */ }
  }

  // ── Step 6: Announce in #queue ───────────────────────────────
  const queueChannelId = process.env.QUEUE_CHANNEL_ID;
  if (queueChannelId) {
    try {
      const ch = (await client.channels.fetch(queueChannelId)) as TextChannel;
      const statusMsg = lobbyCreated ? `✅ Lobby created! Steam invites sent.` : `⚠️ Bot lobby unavailable — join manually using the details below.`;
      await ch.send(
        `🏟️ **Match Started!**\n${statusMsg}\n` +
        `Name: \`${lobbyName}\` | Password: \`${password}\`\n` +
        `Server: ${region} | Mode: ${gameMode}`
      );
    } catch (err: any) { console.error("[Match] Queue announce error:", err.message); }
  }

  // ── Step 7: Poll Firestore for teams, then move to VCs ───────
  pollFirestoreForTeams(client, firestoreLobbyId, allPlayers);

  await saveDailyRecord(todayKey(), {
    date: todayKey(), queueId: queue.id, lobbyId: firestoreLobbyId,
    playerCount: allPlayers.length, type: queue.type, entryFee: queue.entryFee,
    createdAt: new Date().toISOString(),
  });

  return firestoreLobbyId;
}

// ── PHASE 3: Watch for teams ─────────────────────────────────

export function pollFirestoreForTeams(
  client: Client,
  lobbyDocId: string,
  allPlayers: MatchPlayer[]
): void {
  console.log(`[Teams] Watching lobby ${lobbyDocId} for team assignments...`);

  let vcDone = false;

  const finish = async (radiant: MatchPlayer[], dire: MatchPlayer[]) => {
    if (vcDone) return;
    vcDone = true;
    clearInterval(pollInterval);
    bot.removeListener("lobbyUpdate", gcHandler);
    console.log(`[Teams] ✅ Teams ready — Radiant: ${radiant.length}, Dire: ${dire.length}`);
    await updateLobby(lobbyDocId, { radiant, dire, spectators: [] });
    await createVCsAndMovePlayers(client, lobbyDocId, radiant, dire);
  };

  const bot = getDotaBot();

  const gcHandler = async (lobbyState: any) => {
    if (vcDone) { bot.removeListener("lobbyUpdate", gcHandler); return; }
    const members: Array<{ id: number; team: number }> = lobbyState?.members ?? [];
    const radiant: MatchPlayer[] = [];
    const dire:    MatchPlayer[] = [];
    for (const m of members) {
      const steam32 = m.id?.toString();
      const player  = allPlayers.find(p => p.steam32Id === steam32);
      if (!player) continue;
      if (m.team === 0) radiant.push(player);
      if (m.team === 1) dire.push(player);
    }
    if (radiant.length > 0 && dire.length > 0) {
      await finish(radiant, dire);
    }
  };

  if (bot.isReady()) {
    bot.on("lobbyUpdate", gcHandler);
    setTimeout(() => bot.removeListener("lobbyUpdate", gcHandler), 90 * 60 * 1000);
  }

  let attempts = 0;
  const pollInterval = setInterval(async () => {
    if (vcDone) { clearInterval(pollInterval); return; }
    attempts++;
    if (attempts > 540) {
      clearInterval(pollInterval);
      bot.removeListener("lobbyUpdate", gcHandler);
      return;
    }
    try {
      const lobby = await getLobby(lobbyDocId);
      if (!lobby) { clearInterval(pollInterval); return; }
      if (lobby.status === "cancelled" || lobby.status === "completed") {
        clearInterval(pollInterval);
        bot.removeListener("lobbyUpdate", gcHandler);
        return;
      }
      const radiant = lobby.radiant ?? [];
      const dire    = lobby.dire    ?? [];
      if (radiant.length > 0 && dire.length > 0) {
        await finish(radiant, dire);
      }
    } catch (err: any) {
      console.error("[Teams] Poll error:", err.message);
    }
  }, 10000);
}

// ── VC creation + player movement ────────────────────────────

export async function createVCsAndMovePlayers(
  client: Client,
  lobbyDocId: string,
  radiant: MatchPlayer[],
  dire: MatchPlayer[]
): Promise<{ radiantCh: VoiceChannel; direCh: VoiceChannel }> {
  const guildId = process.env.DISCORD_GUILD_ID!;
  const guild = await client.guilds.fetch(guildId);
  const categoryId = process.env.VOICE_CATEGORY_ID;

  const allDiscordIds = [...radiant, ...dire].map((p) => p.discordId);
  const permsBase: any[] = [
    { id: guild.id, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
    ...allDiscordIds.map((id) => ({
      id,
      allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Speak],
    })),
  ];

  const radiantOpts: any = { name: "🟢 Radiant", type: ChannelType.GuildVoice, userLimit: 6, permissionOverwrites: permsBase };
  const direOpts: any    = { name: "🔴 Dire",    type: ChannelType.GuildVoice, userLimit: 6, permissionOverwrites: permsBase };
  if (categoryId) { radiantOpts.parent = categoryId; direOpts.parent = categoryId; }

  const radiantCh = (await guild.channels.create(radiantOpts)) as VoiceChannel;
  const direCh    = (await guild.channels.create(direOpts))    as VoiceChannel;

  // Save VC IDs to Firestore for cleanup
  await updateLobby(lobbyDocId, { vcRadiantId: radiantCh.id, vcDireId: direCh.id } as any);

  // Move players
  for (const player of radiant) {
    try {
      const member = await guild.members.fetch(player.discordId);
      if (member.voice.channel) await member.voice.setChannel(radiantCh);
    } catch {}
  }
  for (const player of dire) {
    try {
      const member = await guild.members.fetch(player.discordId);
      if (member.voice.channel) await member.voice.setChannel(direCh);
    } catch {}
  }

  // Clean up waiting room
  if (waitingRoomId) {
    try {
      const wr = await guild.channels.fetch(waitingRoomId);
      if (wr) await wr.delete("Teams assigned");
    } catch {}
    waitingRoomId = null;
  }

  // Announce
  const lobbyChId = process.env.LOBBY_CONTROL_CHANNEL_ID;
  if (lobbyChId) {
    try {
      const ch = (await client.channels.fetch(lobbyChId)) as TextChannel;
      await ch.send(
        `🎯 **Teams assigned! Get into your voice channels!**\n\n` +
        `🟢 **Radiant:** ${radiant.map((p) => `<@${p.discordId}>`).join(", ")}\n` +
        `🔊 Radiant VC: <#${radiantCh.id}>\n\n` +
        `🔴 **Dire:** ${dire.map((p) => `<@${p.discordId}>`).join(", ")}\n` +
        `🔊 Dire VC: <#${direCh.id}>`
      );
    } catch {}
  }

  return { radiantCh, direCh };
}

// ── Voice channel cleanup — lobby-specific ────────────────────

export async function cleanupVoiceChannels(client: Client, lobbyDocId?: string): Promise<void> {
  const guildId = process.env.DISCORD_GUILD_ID!;
  try {
    const guild = await client.guilds.fetch(guildId);

    // Delete VCs for this specific lobby from Firestore IDs
    if (lobbyDocId) {
      try {
        const lobby = await getLobby(lobbyDocId);
        if (lobby) {
          const vcIds = [
            (lobby as any).vcRadiantId,
            (lobby as any).vcDireId,
          ].filter(Boolean);
          for (const chId of vcIds) {
            try {
              const ch = await guild.channels.fetch(chId);
              if (ch) await ch.delete("Match ended");
            } catch {}
          }
        }
      } catch {}
    }

    // Delete waiting room if still exists
    if (waitingRoomId) {
      try {
        const wr = await guild.channels.fetch(waitingRoomId);
        if (wr) await wr.delete("Match ended");
      } catch {}
      waitingRoomId = null;
    }

  } catch (err: any) { console.error("[Cleanup] Error:", err.message); }
}

// ── OpenDota Polling + Match Complete ─────────────────────────

export async function pollForMatchResult(client: Client, lobbyDocId: string, dotaMatchId: string, stakes: number): Promise<void> {
  await requestMatchParse(dotaMatchId);
  let attempts = 0;
  const interval = setInterval(async () => {
    attempts++;
    try {
      const result = await fetchMatchResult(dotaMatchId);
      if (result) {
        clearInterval(interval);
        const lobby = await getLobby(lobbyDocId);
        if (!lobby) return;

        await updateLobby(lobbyDocId, {
          status: "completed",
          winner: result.winner,
          mvp: result.mvp,
          duration: result.duration,
          playerStats: result.players,
          completedAt: new Date().toISOString(),
        });
        await updateQueue(lobby.queueId, { status: "completed" });

        const rch = process.env.RESULTS_CHANNEL_ID;
        if (rch) {
          try {
            const ch = (await client.channels.fetch(rch)) as TextChannel;
            await ch.send({ embeds: [matchResultEmbed(result, lobby, stakes)] });
          } catch {}
        }

        await cleanupVoiceChannels(client, lobbyDocId);
        console.log(`[Match] ✅ Result recorded: ${result.winner} wins`);
      }
    } catch (err: any) {
      console.error("[Poll] Error:", err.message);
    }

    if (attempts >= 72) {
      clearInterval(interval);
      console.log("[Poll] Timed out after 6 hours");
    }
  }, 5 * 60 * 1000);
}