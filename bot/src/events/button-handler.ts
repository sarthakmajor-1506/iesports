import {
  ButtonInteraction,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  TextChannel,
} from "discord.js";
import {
  getQueue,
  addPlayerToQueue,
  removePlayerFromQueue,
  findUserByDiscordId,
  steamIdToSteam32,
  updateQueue,
  getLobby,
  updateLobby,
  QueuePlayer,
} from "../services/firebase";
import { getDotaBot } from "../services/dota-gc";
import { cleanupVoiceChannels } from "../services/match-orchestrator";
import { queueEmbed } from "../utils/embeds";
import { queueButtons } from "../utils/buttons";
import { ChannelType, VoiceChannel, PermissionsBitField } from "discord.js";
import { MatchPlayer } from "../services/firebase";

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const [action, id] = interaction.customId.split(":");

  switch (action) {
    case "queue_join": await handleQueueJoin(interaction, id); break;
    case "queue_leave": await handleQueueLeave(interaction, id); break;
    case "create_queue": await handleCreateQueue(interaction); break;
    case "lobby_start": await handleLobbyStart(interaction, id); break;
    case "lobby_shuffle": await handleLobbyShuffle(interaction, id); break;
    case "lobby_flip": await handleLobbyFlip(interaction, id); break;
    case "lobby_invite": await handleLobbyInviteAll(interaction, id); break;
    case "lobby_inviteme": await handleInviteMe(interaction, id); break;
    case "lobby_movevc": await handleMoveToVC(interaction, id); break;
    case "lobby_destroy": await handleLobbyDestroy(interaction, id); break;
    case "lobby_leave": await handleLobbyLeave(interaction, id); break;
    case "lobby_restart": await handleBotRestart(interaction); break;
    case "result_radiant":
    case "result_dire":
      await handleManualResult(interaction, id, action === "result_radiant" ? "radiant" : "dire"); break;
    default:
      await interaction.reply({ content: "Unknown action.", ephemeral: true });
  }
}

// ─── Queue Join ──────────────────────────────────────────────

async function handleQueueJoin(interaction: ButtonInteraction, queueId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const webUser = await findUserByDiscordId(interaction.user.id);

  const player: QueuePlayer = {
    discordId: interaction.user.id,
    username: interaction.user.username,
    steamId: webUser?.steamId || null,
    steam32Id: webUser?.steamId ? steamIdToSteam32(webUser.steamId) : null,
    steamName: webUser?.steamName || null,
    joinedAt: new Date().toISOString(),
  };

  const result = await addPlayerToQueue(queueId, player);
  if (!result.success) { await interaction.editReply(`❌ ${result.error}`); return; }

  await interaction.editReply(
    `✅ You're #${result.position} in the queue!${!webUser?.steamId ? "\n⚠️ Link Steam at **iesports.in** to get auto-invited." : ""}`
  );

  await refreshQueueEmbed(interaction, queueId);

  // NOTE: No auto-start on queue full anymore.
  // Match starts based on scheduledTime via cron in index.ts.
  // If you want a "queue full" notification, add it here:
  const queue = await getQueue(queueId);
  if (queue && queue.players.length >= queue.maxPlayers) {
    const queueChannelId = process.env.QUEUE_CHANNEL_ID;
    if (queueChannelId) {
      try {
        const ch = (await interaction.client.channels.fetch(queueChannelId)) as TextChannel;
        await ch.send(`🎉 **Queue is FULL!** ${queue.players.length}/${queue.maxPlayers} players. Match will start at the scheduled time.`);
      } catch {}
    }
  }
}

// ─── Queue Leave ─────────────────────────────────────────────

async function handleQueueLeave(interaction: ButtonInteraction, queueId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const removed = await removePlayerFromQueue(queueId, interaction.user.id);
  await interaction.editReply(removed ? "👋 You left the queue." : "You weren't in the queue.");
  await refreshQueueEmbed(interaction, queueId);
}

// ─── Create Queue (admin only) ──────────────────────────────

async function handleCreateQueue(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "❌ Only admins can create queues.", ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId("create_queue_modal")
    .setTitle("Create Game Queue");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("queue_name")
        .setLabel("Queue Name")
        .setPlaceholder("e.g. 9 PM LOBBY, WAGER LOBBY")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("queue_type")
        .setLabel("Type (free / wager / sponsored)")
        .setPlaceholder("free")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("queue_fee")
        .setLabel("Entry Fee (₹, 0 for free)")
        .setPlaceholder("0")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("queue_time")
        .setLabel("Scheduled Time IST (e.g. 9:00 PM, 21:00)")
        .setPlaceholder("9:00 PM")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    )
  );

  await interaction.showModal(modal);
}

// ─── Lobby Controls (admin only) ─────────────────────────────

function isAdmin(interaction: ButtonInteraction): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}



// REPLACE handleLobbyStart — don't update status until match actually starts
async function handleLobbyStart(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  await interaction.deferReply({ ephemeral: true });
  try {
    const bot = getDotaBot();
    if (bot.isReady()) {
      bot.startGame();
      // Don't update status to "active" here — wait for GC to confirm match started
      await interaction.editReply("▶️ Start signal sent! Game should begin shortly.");
    } else {
      await interaction.editReply("❌ Dota bot not connected.");
    }
  } catch (err: any) { await interaction.editReply(`❌ ${err.message}`); }
}


async function handleLobbyShuffle(interaction: ButtonInteraction, _lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  try { getDotaBot().shuffleTeams(); await interaction.reply({ content: "🔀 Teams shuffled!", ephemeral: true }); }
  catch { await interaction.reply({ content: "❌ Failed.", ephemeral: true }); }
}

async function handleLobbyFlip(interaction: ButtonInteraction, _lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  try { getDotaBot().flipTeams(); await interaction.reply({ content: "🔄 Teams flipped!", ephemeral: true }); }
  catch { await interaction.reply({ content: "❌ Failed.", ephemeral: true }); }
}

async function handleLobbyInviteAll(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  await interaction.deferReply({ ephemeral: true });
  const lobby = await getLobby(lobbyId);
  if (!lobby) { await interaction.editReply("❌ Lobby not found."); return; }
  const all = [...lobby.radiant, ...lobby.dire, ...lobby.spectators];
  const ids = all.map((p) => p.steam32Id).filter((id): id is string => !!id);
  const bot = getDotaBot();
  if (bot.isReady()) { bot.inviteAll(ids); await interaction.editReply(`📨 Invited ${ids.length} players.`); }
  else { await interaction.editReply("❌ Dota bot not connected."); }
}

// ═══════════════════════════════════════════════════════════════
// REPLACE ONLY the handleInviteMe function in button-handler.ts
// ═══════════════════════════════════════════════════════════════

async function handleInviteMe(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const tag = `[InviteMe:${interaction.user.username}]`;

  // ── Step 1: Is the bot connected? ────────────────────────────────────────
  const bot = getDotaBot();
  console.log(`${tag} bot.isReady()=${bot.isReady()}`);

  if (!bot.isReady()) {
    const lobby = await getLobby(lobbyId);
    await interaction.editReply(
      `⚠️ Bot is offline. Join manually:\n` +
      `**Lobby:** \`${lobby?.lobbyName ?? "IEsports Lobby"}\`\n` +
      `**Password:** \`${lobby?.password ?? "—"}\``
    );
    return;
  }

  // ── Step 2: Find user in Firestore by Discord ID ─────────────────────────
  // NOTE: findUserByDiscordId queries users collection for discordId field.
  // This only works if the user linked their Discord on the web app.
  // Users who signed in via Steam only (not Discord) will have discordId=null.
  const webUser = await findUserByDiscordId(interaction.user.id);
  console.log(`${tag} Firestore user: ${JSON.stringify({
    found: !!webUser,
    uid: webUser?.uid,
    hasSteamId: !!webUser?.steamId,
    steamId: webUser?.steamId,
    discordId: webUser?.discordId,
  })}`);

  if (!webUser) {
    await interaction.editReply(
      `❌ Your Discord isn't linked to any account.\n\n` +
      `Go to **iesports.in** → Log in with Steam → Connect Discord.\n` +
      `Then click Invite Me again.`
    );
    return;
  }

  if (!webUser.steamId) {
    await interaction.editReply(
      `❌ No Steam account linked.\n\n` +
      `Go to **iesports.in** → Connect Steam first.`
    );
    return;
  }

  // ── Step 3: Convert steam64 → steam32 ───────────────────────────────────
  // Firestore stores steamId as steam64 (e.g. "76561198129242599")
  // invitePlayer() needs steam32 (e.g. "168976871")
  let steam32: string;
  try {
    const steam64 = webUser.steamId.trim();

    // Guard: if someone stored steam32 by mistake, catch it
    if (!steam64.startsWith("7656")) {
      throw new Error(`Not a valid steam64 (got "${steam64}" — doesn't start with 7656)`);
    }

    const val = BigInt(steam64) - BigInt("76561197960265728");
    if (val <= 0n) throw new Error(`Subtraction gave non-positive value: ${val}`);
    steam32 = val.toString();
  } catch (err: any) {
    console.error(`${tag} Bad steamId "${webUser.steamId}": ${err.message}`);
    await interaction.editReply(
      `❌ Your Steam ID looks corrupted (\`${webUser.steamId}\`).\n` +
      `Please re-link your Steam at **iesports.in**.`
    );
    return;
  }

  console.log(`${tag} steam64=${webUser.steamId} → steam32=${steam32}`);

  // ── Step 4: Send GC invite ───────────────────────────────────────────────
  bot.invitePlayer(steam32);

  await interaction.editReply(
    `✅ Invite sent to your Steam!\n\n` +
    `**If it doesn't appear in Dota 2:**\n` +
    `• Make sure Dota 2 is open\n` +
    `• Play → Custom Lobby → Browse Lobbies\n` +
    `• Search: \`IEsports Lobby\``
  );
}

async function handleMoveToVC(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: "❌ Admin only.", ephemeral: true });
    return;
  }
 
  await interaction.deferReply({ ephemeral: true });
 
  try {
    const lobby = await getLobby(lobbyId);
    if (!lobby) {
      await interaction.editReply("❌ Lobby not found.");
      return;
    }
 
    const radiant = lobby.radiant ?? [];
    const dire = lobby.dire ?? [];
 
    if (radiant.length === 0 && dire.length === 0) {
      await interaction.editReply(
        "⚠️ No teams assigned yet. Teams are read from the Dota 2 lobby once players are on Radiant/Dire.\n" +
        "Make sure players have joined their teams in-game, then click Move to VCs again."
      );
      return;
    }
 
    const guildId = process.env.DISCORD_GUILD_ID!;
    const guild = await interaction.client.guilds.fetch(guildId);
    const categoryId = process.env.VOICE_CATEGORY_ID;
 
    // ── Create or reuse voice channels ──────────────────────────────────────
 
    const makeVC = async (name: string, players: MatchPlayer[]): Promise<VoiceChannel> => {
      const baseOpts: any = {
        name,
        type: ChannelType.GuildVoice,
        userLimit: 6,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel],
          },
          ...players.map((p) => ({
            id: p.discordId,
            allow: [
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.Speak,
            ],
          })),
        ],
      };
      if (categoryId) baseOpts.parent = categoryId;
      return (await guild.channels.create(baseOpts)) as VoiceChannel;
    };
 
    const radiantCh = radiant.length > 0 ? await makeVC("🟢 Radiant", radiant) : null;
    const direCh    = dire.length    > 0 ? await makeVC("🔴 Dire",    dire)    : null;
 
    // ── Move players who are already in any voice channel ───────────────────
 
    let movedRadiant = 0;
    let movedDire    = 0;
 
    if (radiantCh) {
      for (const p of radiant) {
        try {
          const member = await guild.members.fetch(p.discordId);
          if (member.voice.channel) {
            await member.voice.setChannel(radiantCh);
            movedRadiant++;
          }
        } catch {}
      }
    }
 
    if (direCh) {
      for (const p of dire) {
        try {
          const member = await guild.members.fetch(p.discordId);
          if (member.voice.channel) {
            await member.voice.setChannel(direCh);
            movedDire++;
          }
        } catch {}
      }
    }
 
    // ── Post public announcement ─────────────────────────────────────────────
 
    const queueChannelId = process.env.QUEUE_CHANNEL_ID;
    if (queueChannelId) {
      try {
        const ch = (await interaction.client.channels.fetch(queueChannelId)) as TextChannel;
        await ch.send(
          `⚔️ **Teams are set! Get into your voice channels!**\n\n` +
          `🟢 **Radiant:** ${radiant.map((p) => `<@${p.discordId}>`).join(", ")}\n` +
          (radiantCh ? `🔊 Radiant VC: <#${radiantCh.id}>\n` : "") +
          `\n🔴 **Dire:** ${dire.map((p) => `<@${p.discordId}>`).join(", ")}\n` +
          (direCh ? `🔊 Dire VC: <#${direCh.id}>` : "")
        );
      } catch {}
    }
 
    await interaction.editReply(
      `✅ Voice channels created!\n` +
      `🟢 Radiant: moved ${movedRadiant}/${radiant.length} players\n` +
      `🔴 Dire: moved ${movedDire}/${dire.length} players\n\n` +
      `Players not in a voice channel won't be moved — they need to join a VC manually.`
    );
  } catch (err: any) {
    console.error("[MoveToVC]", err);
    await interaction.editReply(`❌ Failed: ${err.message}`);
  }
}
 
async function handleLobbyDestroy(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: "❌ Admin only.", ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    const bot = getDotaBot();
    if (bot.isReady()) {
      await bot.destroyLobby(); // now async — waits for slot move
    } else {
      console.log("[Destroy] Bot not ready — skipping GC destroy");
    }
    await updateLobby(lobbyId, { status: "cancelled" });
    await cleanupVoiceChannels(interaction.client);
    await interaction.editReply(
      bot.isReady()
        ? "💥 Lobby destroyed in Dota 2 and cleaned up."
        : "🗑️ Lobby record cleared. (Bot not connected — destroy manually in Dota 2)"
    );
  } catch (err: any) {
    await interaction.editReply(`❌ ${err.message}`);
  }
}

async function handleLobbyLeave(interaction: ButtonInteraction, _lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  try {
    getDotaBot().kickBotFromTeam();  // ← was leaveLobby()
    await interaction.reply({ content: "🔄 Bot moved to Unassigned.", ephemeral: true });
  } catch { await interaction.reply({ content: "❌ Failed.", ephemeral: true }); }
}

async function handleBotRestart(interaction: ButtonInteraction): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  await interaction.reply({ content: "🔄 Reconnecting Dota bot...", ephemeral: true });
  try { const bot = getDotaBot(); bot.disconnect(); await bot.connect(); await interaction.editReply("✅ Dota bot reconnected!"); }
  catch (err: any) { await interaction.editReply(`❌ ${err.message}`); }
}

async function handleManualResult(interaction: ButtonInteraction, lobbyId: string, winner: "radiant" | "dire"): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  await interaction.deferReply();
  await updateLobby(lobbyId, { status: "completed", winner, completedAt: new Date().toISOString() });
  const lobby = await getLobby(lobbyId);
  if (lobby) await updateQueue(lobby.queueId, { status: "completed" });
  await interaction.editReply(`✅ **${winner === "radiant" ? "🟢 Radiant" : "🔴 Dire"}** wins!`);
  await cleanupVoiceChannels(interaction.client);
}

// ─── Helpers ─────────────────────────────────────────────────

async function refreshQueueEmbed(interaction: ButtonInteraction, queueId: string): Promise<void> {
  const queue = await getQueue(queueId);
  if (!queue || !queue.messageId) return;
  try {
    const queueChannelId = process.env.QUEUE_CHANNEL_ID;
    const ch = queueChannelId
      ? ((await interaction.client.channels.fetch(queueChannelId)) as TextChannel)
      : (interaction.channel as TextChannel);
    const msg = await ch.messages.fetch(queue.messageId);
    await msg.edit({ embeds: [queueEmbed(queue)], components: [queueButtons(queueId)] });
  } catch {}
}