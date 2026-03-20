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
    discordId: p.discordId, username: p.username, steamId: p.steamId,
    steam32Id: p.steam32Id, steamName: p.steamName,
  }));

  const lobbyName = process.env.DEFAULT_LOBBY_NAME || "IEsports Lobby";
  const password = String(Math.floor(100 + Math.random() * 900));
  const gameMode = process.env.DEFAULT_GAME_MODE || "CM";
  const region = process.env.DEFAULT_SERVER_REGION || "India";

  // ── Step 1: Create GC Lobby ─────────────────────────────────
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
  // The GC lobbyUpdate event is unreliable — instead we poll Firestore
  // every 5s for up to 90 minutes waiting for radiant/dire to be populated.
  // Teams get written to Firestore either by the admin shuffle/flip flow
  // or manually. Once they appear, VCs are created and players are moved.
  pollFirestoreForTeams(client, firestoreLobbyId, allPlayers);

  await saveDailyRecord(todayKey(), {
    date: todayKey(), queueId: queue.id, lobbyId: firestoreLobbyId,
    playerCount: allPlayers.length, type: queue.type, entryFee: queue.entryFee,
    createdAt: new Date().toISOString(),
  });

  return firestoreLobbyId;
}

// ── PHASE 3: Watch for teams via GC lobbyUpdate events + Firestore poll ─────
//
// TWO mechanisms so both manual in-game team selection AND shuffle/flip work:
//
// 1. GC lobbyUpdate (real-time): dota-gc.ts now parses msgType 7388 and emits
//    "lobbyUpdate" with a members list { id: steam32, team: 0|1|4 }.
//    We match those steam32 IDs to our allPlayers list and sync to Firestore.
//    This handles the case where players move teams manually in-game.
//
// 2. Firestore poll (fallback every 10s): catches shuffle/flip button writes
//    and any edge cases where the GC event was missed.

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
    console.log(`[Teams] ✅ Teams ready — Radiant: ${radiant.length}, Dire: ${dire.length}`);
    // Persist to Firestore so button-handler and embeds stay in sync
    await updateLobby(lobbyDocId, { radiant, dire, spectators: [] });
    await createVCsAndMovePlayers(client, lobbyDocId, radiant, dire);
  };

  // ── Mechanism 1: real-time GC lobbyUpdate ──────────────────
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
      if (m.team === 0) radiant.push(player); // Radiant
      if (m.team === 1) dire.push(player);    // Dire
    }

    // Only act when both teams have players (avoids firing on partial updates)
    if (radiant.length > 0 && dire.length > 0) {
      bot.removeListener("lobbyUpdate", gcHandler);
      clearInterval(pollInterval);
      await finish(radiant, dire);
    }
  };

  if (bot.isReady()) {
    bot.on("lobbyUpdate", gcHandler);
    // Auto-remove after 90 min to avoid leaks
    setTimeout(() => bot.removeListener("lobbyUpdate", gcHandler), 90 * 60 * 1000);
  }

  // ── Mechanism 2: Firestore poll every 10s (catches shuffle/flip) ──────────
  let attempts = 0;
  const pollInterval = setInterval(async () => {
    if (vcDone) { clearInterval(pollInterval); return; }
    attempts++;
    if (attempts > 540) { // 90 min
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
        clearInterval(pollInterval);
        bot.removeListener("lobbyUpdate", gcHandler);
        await finish(radiant, dire);
      }
    } catch (err: any) {
      console.error("[Teams] Poll error:", err.message);
    }
  }, 10000);
}

// ── Shared VC creation + player movement (used by poll AND button) ────────────

export async function createVCsAndMovePlayers(
  client: Client,
  lobbyDocId: string,
  radiant: MatchPlayer[],
  dire: MatchPlayer[]
): Promise<{ radiantCh: VoiceChannel; direCh: VoiceChannel }> {
  const guildId = process.env.DISCORD_GUILD_ID!;
  const guild = await client.guilds.fetch(guildId);
  const categoryId = process.env.VOICE_CATEGORY_ID;

  const makeVC = async (name: string, players: MatchPlayer[]): Promise<VoiceChannel> => {
    const opts: any = {
      name,
      type: ChannelType.GuildVoice,
      userLimit: 6,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
        ...players.map((p) => ({
          id: p.discordId,
          allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Speak],
        })),
      ],
    };
    if (categoryId) opts.parent = categoryId;
    return (await guild.channels.create(opts)) as VoiceChannel;
  };

  const radiantCh = await makeVC("🟢 Radiant", radiant);
  const direCh    = await makeVC("🔴 Dire",    dire);

  tempVoiceChannels.push(radiantCh.id, direCh.id);

  // Move players who are already in any voice channel
  let movedR = 0, movedD = 0;
  for (const p of radiant) {
    try {
      const m = await guild.members.fetch(p.discordId);
      if (m.voice.channel) { await m.voice.setChannel(radiantCh); movedR++; }
    } catch {}
  }
  for (const p of dire) {
    try {
      const m = await guild.members.fetch(p.discordId);
      if (m.voice.channel) { await m.voice.setChannel(direCh); movedD++; }
    } catch {}
  }

  console.log(`[Teams] Moved ${movedR}/${radiant.length} Radiant, ${movedD}/${dire.length} Dire`);

  // Delete waiting room
  if (waitingRoomId) {
    try {
      const wr = await guild.channels.fetch(waitingRoomId);
      if (wr) await wr.delete("Teams assigned");
    } catch {}
    waitingRoomId = null;
  }

  // Announce in #queue
  const queueChannelId = process.env.QUEUE_CHANNEL_ID;
  if (queueChannelId) {
    try {
      const ch = (await client.channels.fetch(queueChannelId)) as TextChannel;
      await ch.send(
        `⚔️ **Teams are set! Get into your voice channels!**\n\n` +
        `🟢 **Radiant:** ${radiant.map((p) => `<@${p.discordId}>`).join(", ")}\n` +
        `🔊 Radiant VC: <#${radiantCh.id}>\n\n` +
        `🔴 **Dire:** ${dire.map((p) => `<@${p.discordId}>`).join(", ")}\n` +
        `🔊 Dire VC: <#${direCh.id}>`
      );
    } catch {}
  }

  return { radiantCh, direCh };
}

// ── Voice channel cleanup ─────────────────────────────────────

export async function cleanupVoiceChannels(client: Client): Promise<void> {
  const guildId = process.env.DISCORD_GUILD_ID!;
  try {
    const guild = await client.guilds.fetch(guildId);
    for (const chId of tempVoiceChannels) {
      try { const ch = await guild.channels.fetch(chId); if (ch) await ch.delete("Match ended"); } catch {}
    }
    tempVoiceChannels.length = 0;
    waitingRoomId = null;
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

        await cleanupVoiceChannels(client);
        console.log(`[Match] ✅ Result recorded: ${result.winner} wins`);
      }
    } catch (err: any) {
      console.error("[Poll] Error:", err.message);
    }

    if (attempts >= 72) { // 72 × 5min = 6 hours
      clearInterval(interval);
      console.log("[Poll] Timed out after 6 hours");
    }
  }, 5 * 60 * 1000);
}