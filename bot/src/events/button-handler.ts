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
  MatchPlayer,
} from "../services/firebase";
import { getDotaBot } from "../services/dota-gc";
import { cleanupVoiceChannels, createVCsAndMovePlayers } from "../services/match-orchestrator";
import { queueEmbed } from "../utils/embeds";
import { queueButtons } from "../utils/buttons";

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const [action, id] = interaction.customId.split(":");

  switch (action) {
    case "queue_join":    await handleQueueJoin(interaction, id);    break;
    case "queue_leave":   await handleQueueLeave(interaction, id);   break;
    case "create_queue":  await handleCreateQueue(interaction);      break;
    case "lobby_start":   await handleLobbyStart(interaction, id);   break;
    case "lobby_shuffle": await handleLobbyShuffle(interaction, id); break;
    case "lobby_flip":    await handleLobbyFlip(interaction, id);    break;
    case "lobby_invite":  await handleLobbyInviteAll(interaction, id); break;
    case "lobby_inviteme":await handleInviteMe(interaction, id);     break;
    case "lobby_movevc":  await handleMoveToVC(interaction, id);     break;
    case "lobby_destroy": await handleLobbyDestroy(interaction, id); break;
    case "lobby_leave":   await handleLobbyLeave(interaction, id);   break;
    case "lobby_restart": await handleBotRestart(interaction);       break;
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

// ─── Create Queue (admin only) ───────────────────────────────

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
      new TextInputBuilder().setCustomId("queue_name").setLabel("Queue Name")
        .setPlaceholder("e.g. 9 PM LOBBY, WAGER LOBBY").setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("queue_type").setLabel("Type (free / wager / sponsored)")
        .setPlaceholder("free").setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("queue_fee").setLabel("Entry Fee (₹, 0 for free)")
        .setPlaceholder("0").setStyle(TextInputStyle.Short).setRequired(false)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("queue_time").setLabel("Scheduled Time IST (e.g. 9:00 PM, 21:00)")
        .setPlaceholder("9:00 PM").setStyle(TextInputStyle.Short).setRequired(false)
    )
  );

  await interaction.showModal(modal);
}

// ─── Lobby Controls (admin only) ─────────────────────────────

function isAdmin(interaction: ButtonInteraction): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

async function handleLobbyStart(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  await interaction.deferReply({ ephemeral: true });
  try {
    const bot = getDotaBot();
    if (bot.isReady()) {
      bot.startGame();
      await interaction.editReply("▶️ Start signal sent! Game should begin shortly.");
    } else {
      await interaction.editReply("❌ Dota bot not connected.");
    }
  } catch (err: any) { await interaction.editReply(`❌ ${err.message}`); }
}

// ─── Shuffle: split all players randomly into Radiant/Dire, write to Firestore ───

async function handleLobbyShuffle(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  await interaction.deferReply({ ephemeral: true });

  try {
    const bot = getDotaBot();
    if (!bot.isReady()) { await interaction.editReply("❌ Dota bot not connected."); return; }

    const lobby = await getLobby(lobbyId);
    if (!lobby) { await interaction.editReply("❌ Lobby not found."); return; }

    // Collect ALL players regardless of current team
    const allPlayers: MatchPlayer[] = [
      ...(lobby.spectators ?? []),
      ...(lobby.radiant   ?? []),
      ...(lobby.dire      ?? []),
    ];

    if (allPlayers.length < 2) {
      await interaction.editReply("⚠️ Not enough players to shuffle (need at least 2).");
      return;
    }

    // Randomly shuffle the array
    const shuffled = [...allPlayers].sort(() => Math.random() - 0.5);
    const half     = Math.ceil(shuffled.length / 2);
    const radiant  = shuffled.slice(0, half);
    const dire     = shuffled.slice(half);

    // Write teams to Firestore immediately — no GC parsing needed
    await updateLobby(lobbyId, { radiant, dire, spectators: [] });
    console.log(`[Shuffle] Lobby ${lobbyId}: Radiant=${radiant.map(p => p.username).join(",")}, Dire=${dire.map(p => p.username).join(",")}`);

    // Also send GC shuffle so in-game lobby reflects the assignment
    bot.shuffleTeams();

    await interaction.editReply(
      `🔀 **Teams assigned!**\n\n` +
      `🟢 **Radiant (${radiant.length}):** ${radiant.map(p => p.username).join(", ")}\n` +
      `🔴 **Dire (${dire.length}):** ${dire.map(p => p.username).join(", ")}\n\n` +
      `Click **Move to VCs** to move players to voice channels.`
    );

  } catch (err: any) {
    await interaction.editReply(`❌ Failed: ${err.message}`);
  }
}

// ─── Flip: swap Radiant ↔ Dire in Firestore ──────────────────

async function handleLobbyFlip(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  await interaction.deferReply({ ephemeral: true });

  try {
    const bot = getDotaBot();
    if (!bot.isReady()) { await interaction.editReply("❌ Dota bot not connected."); return; }

    const lobby = await getLobby(lobbyId);
    if (!lobby) { await interaction.editReply("❌ Lobby not found."); return; }

    const radiant = lobby.radiant ?? [];
    const dire    = lobby.dire    ?? [];

    if (radiant.length === 0 && dire.length === 0) {
      await interaction.editReply("⚠️ No teams to flip. Run Shuffle first.");
      return;
    }

    // Swap Radiant ↔ Dire in Firestore immediately — no GC parsing needed
    await updateLobby(lobbyId, { radiant: dire, dire: radiant });
    console.log(`[Flip] Lobby ${lobbyId}: Radiant↔Dire swapped in Firestore`);

    // Also send GC flip so in-game lobby reflects the swap
    bot.flipTeams();

    await interaction.editReply(
      `🔄 **Teams flipped!**\n\n` +
      `🟢 **Radiant (${dire.length}):** ${dire.map(p => p.username).join(", ")}\n` +
      `🔴 **Dire (${radiant.length}):** ${radiant.map(p => p.username).join(", ")}\n\n` +
      `Click **Move to VCs** to move players to voice channels.`
    );

  } catch (err: any) {
    await interaction.editReply(`❌ Failed: ${err.message}`);
  }
}
// ─── Move to VCs ─────────────────────────────────────────────

async function handleMoveToVC(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  await interaction.deferReply({ ephemeral: true });

  try {
    const lobby = await getLobby(lobbyId);
    if (!lobby) { await interaction.editReply("❌ Lobby not found."); return; }

    const radiant = lobby.radiant ?? [];
    const dire    = lobby.dire    ?? [];

    if (radiant.length === 0 && dire.length === 0) {
      await interaction.editReply(
        "⚠️ No teams assigned yet.\n\nClick **Shuffle** first to assign teams, then click Move to VCs."
      );
      return;
    }

    await createVCsAndMovePlayers(interaction.client, lobbyId, radiant, dire);

    await interaction.editReply(
      `✅ Done! Voice channels created and players moved.\n` +
      `🟢 Radiant: ${radiant.length} players | 🔴 Dire: ${dire.length} players\n\n` +
      `Players not currently in any voice channel need to join manually.`
    );
  } catch (err: any) {
    console.error("[MoveToVC]", err);
    await interaction.editReply(`❌ Failed: ${err.message}`);
  }
}

// ─── Invite All ──────────────────────────────────────────────

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

// ─── Invite Me ───────────────────────────────────────────────

async function handleInviteMe(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const tag = `[InviteMe:${interaction.user.username}]`;
  const bot = getDotaBot();

  if (!bot.isReady()) {
    const lobby = await getLobby(lobbyId);
    await interaction.editReply(
      `⚠️ Bot is offline. Join manually:\n` +
      `**Lobby:** \`${lobby?.lobbyName ?? "IEsports Lobby"}\`\n` +
      `**Password:** \`${lobby?.password ?? "—"}\``
    );
    return;
  }

  const webUser = await findUserByDiscordId(interaction.user.id);
  if (!webUser) {
    await interaction.editReply(`❌ Your Discord isn't linked to any account.\n\nGo to **iesports.in** → Log in → Connect Discord.`);
    return;
  }
  if (!webUser.steamId) {
    await interaction.editReply(`❌ No Steam account linked.\n\nGo to **iesports.in** → Connect Steam first.`);
    return;
  }

  let steam32: string;
  try {
    const steam64 = webUser.steamId.trim();
    if (!steam64.startsWith("7656")) throw new Error(`Not a valid steam64 (got "${steam64}")`);
    const val = BigInt(steam64) - BigInt("76561197960265728");
    if (val <= 0n) throw new Error(`Subtraction gave non-positive value: ${val}`);
    steam32 = val.toString();
  } catch (err: any) {
    await interaction.editReply(`❌ Your Steam ID looks corrupted. Please re-link at **iesports.in**.`);
    return;
  }

  console.log(`${tag} steam64=${webUser.steamId} → steam32=${steam32}`);
  bot.invitePlayer(steam32);

  await interaction.editReply(
    `✅ Invite sent to your Steam!\n\n` +
    `**If it doesn't appear in Dota 2:**\n` +
    `• Make sure Dota 2 is open\n` +
    `• Play → Custom Lobby → Browse Lobbies\n` +
    `• Search: \`IEsports Lobby\``
  );
}

// ─── Destroy Lobby ───────────────────────────────────────────

async function handleLobbyDestroy(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  await interaction.deferReply({ ephemeral: true });
  try {
    const bot = getDotaBot();
    if (bot.isReady()) {
      await bot.destroyLobby();
    }
    await updateLobby(lobbyId, { status: "cancelled" });
    await cleanupVoiceChannels(interaction.client);
    await interaction.editReply(
      bot.isReady() ? "💥 Lobby destroyed in Dota 2 and cleaned up." : "🗑️ Lobby record cleared. (Bot not connected — destroy manually in Dota 2)"
    );
  } catch (err: any) {
    await interaction.editReply(`❌ ${err.message}`);
  }
}

// ─── Leave (bot → unassigned) ────────────────────────────────

async function handleLobbyLeave(interaction: ButtonInteraction, _lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  try {
    getDotaBot().kickBotFromTeam();
    await interaction.reply({ content: "🔄 Bot moved to Unassigned.", ephemeral: true });
  } catch { await interaction.reply({ content: "❌ Failed.", ephemeral: true }); }
}

// ─── Restart Bot ─────────────────────────────────────────────

async function handleBotRestart(interaction: ButtonInteraction): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  await interaction.reply({ content: "🔄 Reconnecting Dota bot...", ephemeral: true });
  try {
    const bot = getDotaBot();
    bot.disconnect();
    await bot.connect();
    await interaction.editReply("✅ Dota bot reconnected!");
  } catch (err: any) { await interaction.editReply(`❌ ${err.message}`); }
}

// ─── Manual Result ───────────────────────────────────────────

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