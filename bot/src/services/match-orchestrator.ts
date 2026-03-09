import {
  Client,
  Guild,
  TextChannel,
  ChannelType,
  VoiceChannel,
  PermissionsBitField,
} from "discord.js";
import {
  QueueDoc,
  LobbyDoc,
  MatchPlayer,
  saveLobby,
  updateLobby,
  getLobby,
  updateQueue,
  getQueue,
  saveDailyRecord,
} from "./firebase";
import { getDotaBot } from "./dota-gc";
import { fetchMatchResult, requestMatchParse, MatchResult } from "./opendota";
import { lobbyEmbed, matchResultEmbed } from "../utils/embeds";
import { inviteMeButton, lobbyControlRow1, lobbyControlRow2, lobbyControlRow3 } from "../utils/buttons";

const tempVoiceChannels: string[] = [];
let waitingRoomId: string | null = null;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── PHASE 1: 10 min before — warning + waiting room VC ──────

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
    tempVoiceChannels.push(wr.id);

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
    discordId: p.discordId, username: p.username, steamId: p.steamId, steam32Id: p.steam32Id, steamName: p.steamName,
  }));

  const lobbyName = process.env.DEFAULT_LOBBY_NAME || "IEsports Lobby";
  const password = String(Math.floor(100 + Math.random() * 900));
  const gameMode = process.env.DEFAULT_GAME_MODE || "CM";
  const region = process.env.DEFAULT_SERVER_REGION || "India";
  let gcLobbyId: string | null = null;

  try {
    const bot = getDotaBot();
    if (bot.isReady()) {
      const result = await bot.createLobby(lobbyName, password, gameMode, region);
      gcLobbyId = result.lobbyId;
      console.log(`[Match] Dota lobby created: ${gcLobbyId}`);
    } else { console.log("[Match] Dota bot not ready — manual lobby needed"); }
  } catch (err: any) { console.error("[Match] Lobby creation failed:", err.message); }

  const firestoreLobbyId = await saveLobby({
    queueId: queue.id, gcLobbyId, lobbyName, password, gameMode, serverRegion: region,
    radiant: [], dire: [], spectators: allPlayers,
    status: "waiting", dotaMatchId: null, winner: null, mvp: null,
    duration: null, playerStats: null, createdAt: new Date().toISOString(), completedAt: null,
  });

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

  try {
    const bot = getDotaBot();
    if (bot.isReady()) {
      const ids = allPlayers.map((p) => p.steam32Id).filter((id): id is string => !!id);
      bot.inviteAll(ids);
      console.log(`[Match] Invited ${ids.length} players`);
    }
  } catch (err: any) { console.error("[Match] Invite error:", err.message); }

  for (const player of allPlayers) {
    try {
      const member = await guild.members.fetch(player.discordId);
      await member.send(
        `**IEsports Match Starting NOW!**\nLobby: \`${lobbyName}\`\nPassword: \`${password}\`\n` +
        `Server: ${region} | Mode: ${gameMode}\n\nOpen Dota 2 → Play → Custom Lobby → Find Lobby\n` +
        `Teams will be decided in the lobby.`
      );
    } catch { /* DMs closed */ }
  }

  const queueChannelId = process.env.QUEUE_CHANNEL_ID;
  if (queueChannelId) {
    try {
      const ch = (await client.channels.fetch(queueChannelId)) as TextChannel;
      await ch.send(`🏟️ **Lobby Created!**\nName: \`${lobbyName}\`\nPassword: \`${password}\`\nServer: ${region} | Mode: ${gameMode}\n\nJoin in Dota 2 now! Teams decided in-game.`);
    } catch { /* */ }
  }

  monitorLobbyForTeams(client, firestoreLobbyId, queue, allPlayers);

  await saveDailyRecord(todayKey(), {
    date: todayKey(), queueId: queue.id, lobbyId: firestoreLobbyId,
    playerCount: allPlayers.length, type: queue.type, entryFee: queue.entryFee, createdAt: new Date().toISOString(),
  });

  return firestoreLobbyId;
}

// ── PHASE 3: Monitor GC — match starts → read teams → create VCs ─

function monitorLobbyForTeams(client: Client, lobbyDocId: string, queue: QueueDoc, allPlayers: MatchPlayer[]): void {
  const bot = getDotaBot();
  if (!bot.isReady()) { console.log("[Monitor] Dota bot not ready"); return; }

  let matchDetected = false;

  const handler = async (lobbyState: any) => {
    if (matchDetected) return;
    const matchId = lobbyState?.match_id?.toString();
    if (matchId && matchId !== "0") {
      matchDetected = true;
      bot.removeListener("lobbyUpdate", handler);
      console.log(`[Monitor] Match started! ID: ${matchId}`);

      const radiant: MatchPlayer[] = [];
      const dire: MatchPlayer[] = [];

      if (lobbyState?.members) {
        for (const member of lobbyState.members) {
          const steam32 = member.id?.toString();
          const player = allPlayers.find((p) => p.steam32Id === steam32);
          if (!player) continue;
          if (member.team === 0) radiant.push(player);
          else if (member.team === 1) dire.push(player);
        }
      }

      await updateLobby(lobbyDocId, { status: "active", dotaMatchId: matchId, radiant, dire });

      if (radiant.length > 0 || dire.length > 0) {
        try {
          const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
          const { radiantCh, direCh } = await createTeamVoiceChannels(guild, radiant, dire);
          tempVoiceChannels.push(radiantCh.id, direCh.id);

          await movePlayersToVoice(guild, radiant, radiantCh);
          await movePlayersToVoice(guild, dire, direCh);

          if (waitingRoomId) {
            try { const wr = await guild.channels.fetch(waitingRoomId); if (wr) await wr.delete("Teams assigned"); } catch {}
            waitingRoomId = null;
          }

          const qch = process.env.QUEUE_CHANNEL_ID;
          if (qch) {
            const ch = (await client.channels.fetch(qch)) as TextChannel;
            await ch.send(
              `⚔️ **Match is LIVE!**\n\n` +
              `🟢 **Radiant:** ${radiant.map((p) => `<@${p.discordId}>`).join(", ")}\n` +
              `🔴 **Dire:** ${dire.map((p) => `<@${p.discordId}>`).join(", ")}\n\n` +
              `🟢 Radiant VC: <#${radiantCh.id}>\n🔴 Dire VC: <#${direCh.id}>`
            );
          }
        } catch (err: any) { console.error("[Monitor] VC error:", err.message); }
      }

      pollForMatchResult(client, lobbyDocId, matchId, queue.entryFee || 0);
    }
  };

  bot.on("lobbyUpdate", handler);
  setTimeout(() => { if (!matchDetected) bot.removeListener("lobbyUpdate", handler); }, 60 * 60 * 1000);
}

// ── Voice Channels ───────────────────────────────────────────

async function createTeamVoiceChannels(guild: Guild, radiant: MatchPlayer[], dire: MatchPlayer[]): Promise<{ radiantCh: VoiceChannel; direCh: VoiceChannel }> {
  const categoryId = process.env.VOICE_CATEGORY_ID;
  const baseOpts: any = { type: ChannelType.GuildVoice, userLimit: 6 };
  if (categoryId) baseOpts.parent = categoryId;

  const radiantCh = (await guild.channels.create({
    name: "🟢 Radiant", ...baseOpts,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
      ...radiant.map((p) => ({ id: p.discordId, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Speak] })),
    ],
  })) as VoiceChannel;

  const direCh = (await guild.channels.create({
    name: "🔴 Dire", ...baseOpts,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
      ...dire.map((p) => ({ id: p.discordId, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Speak] })),
    ],
  })) as VoiceChannel;

  return { radiantCh, direCh };
}

async function movePlayersToVoice(guild: Guild, players: MatchPlayer[], channel: VoiceChannel): Promise<void> {
  for (const p of players) {
    try { const m = await guild.members.fetch(p.discordId); if (m.voice.channel) await m.voice.setChannel(channel); } catch {}
  }
}

// ── OpenDota Polling + Match Complete ─────────────────────────

async function pollForMatchResult(client: Client, lobbyDocId: string, dotaMatchId: string, stakes: number): Promise<void> {
  await requestMatchParse(dotaMatchId);
  let attempts = 0;
  const interval = setInterval(async () => {
    attempts++;
    try {
      const result = await fetchMatchResult(dotaMatchId);
      if (result) { clearInterval(interval); await handleMatchComplete(client, lobbyDocId, result, stakes); }
      else if (attempts >= 20) { clearInterval(interval); }
    } catch (err: any) { console.error("[Poll]", err.message); }
  }, 60000);
}

async function handleMatchComplete(client: Client, lobbyDocId: string, result: MatchResult, stakes: number): Promise<void> {
  const lobby = await getLobby(lobbyDocId);
  if (!lobby) return;

  await updateLobby(lobbyDocId, { status: "completed", winner: result.winner, mvp: result.mvp, duration: result.duration, playerStats: result.players, completedAt: new Date().toISOString() });
  await updateQueue(lobby.queueId, { status: "completed" });

  const rch = process.env.RESULTS_CHANNEL_ID;
  if (rch) {
    try { const ch = (await client.channels.fetch(rch)) as TextChannel; await ch.send({ embeds: [matchResultEmbed(result, lobby, stakes)] }); }
    catch (err: any) { console.error("[Match] Results error:", err.message); }
  }

  await cleanupVoiceChannels(client);
  await saveDailyRecord(todayKey(), { winner: result.winner, dotaMatchId: result.matchId, duration: result.duration, mvp: result.mvp?.steamName, completedAt: new Date().toISOString() });
  console.log(`[Match] Complete. Winner: ${result.winner}`);
}

export async function cleanupVoiceChannels(client: Client): Promise<void> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return;
  const guild = await client.guilds.fetch(guildId);
  for (const chId of tempVoiceChannels) { try { const ch = await guild.channels.fetch(chId); if (ch) await ch.delete("Match ended"); } catch {} }
  tempVoiceChannels.length = 0;
  waitingRoomId = null;
}