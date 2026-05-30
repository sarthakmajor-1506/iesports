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
import { handleTossChoice, handleVetoMap, handleRandomReveal, handleSidePick } from "../services/map-veto";
import { queueEmbed } from "../utils/embeds";
import { queueButtons } from "../utils/buttons";

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  // ── Dota 2 toss buttons (multi-part customId) ────────────────
  if (
    interaction.customId.startsWith("dota_toss_side:") ||
    interaction.customId.startsWith("dota_toss_pick:")
  ) {
    await handleDotaTossClick(interaction);
    return;
  }

  // ── Valorant map veto buttons (multi-part customId) ──────────
  if (
    interaction.customId.startsWith("toss_") ||
    interaction.customId.startsWith("veto_") ||
    interaction.customId.startsWith("random_") ||
    interaction.customId.startsWith("side_pick")
  ) {
    const parts = interaction.customId.split(":");
    const action = parts[0];
    const tournamentId = parts[1];
    const matchId = parts[2];
    const data = parts[3];

    if (action === "toss_choice") {
      await handleTossChoice(interaction, tournamentId, matchId, data);
    } else if (action === "veto_map") {
      await handleVetoMap(interaction, tournamentId, matchId, parseInt(data));
    } else if (action === "random_reveal") {
      await handleRandomReveal(interaction, tournamentId, matchId);
    } else if (action === "side_pick") {
      await handleSidePick(interaction, tournamentId, matchId, data);
    } else {
      await interaction.reply({ content: "Unknown veto action.", ephemeral: true });
    }
    return;
  }

  // ── Existing Dota lobby / queue buttons ──────────────────────
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

// Discord IDs allowed to use lobby controls WITHOUT a guild Administrator
// role — these people run lobbies manually. Shrey is a fixed controller;
// extend via the LOBBY_CONTROLLER_IDS env var (comma-separated) if needed.
const LOBBY_CONTROLLER_IDS = new Set<string>([
  "746803954767364147", // Shrey (shrey8169)
  ...(process.env.LOBBY_CONTROLLER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
]);

function isAdmin(interaction: ButtonInteraction): boolean {
  if (LOBBY_CONTROLLER_IDS.has(interaction.user.id)) return true;
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

// ─── Shuffle ─────────────────────────────────────────────────
// New flow:
// 1. Send GC BalancedShuffle
// 2. Wait for GC to respond with new positions (up to 8s)
// 3. If GC gave us positions → use them; otherwise fall back to live state
// 4. Map steam32 → Firestore players, write teams, move to VCs

async function handleLobbyShuffle(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  await interaction.deferReply({ ephemeral: true });

  try {
    const bot = getDotaBot();
    if (!bot.isReady()) { await interaction.editReply("❌ Dota bot not connected."); return; }

    const lobby = await getLobby(lobbyId);
    if (!lobby) { await interaction.editReply("❌ Lobby not found."); return; }

    const allPlayers: MatchPlayer[] = [
      ...(lobby.spectators ?? []),
      ...(lobby.radiant   ?? []),
      ...(lobby.dire      ?? []),
    ];

    if (allPlayers.length < 2) {
      await interaction.editReply("⚠️ Not enough players in lobby (need at least 2).");
      return;
    }

    // Send GC shuffle and wait for response
    const gcMembers = await bot.shuffleTeams();
    const botSteam32 = (bot as any).botSteam32 as number;

    // Try to map GC response to our player list
    let radiant: MatchPlayer[] = [];
    let dire: MatchPlayer[] = [];

    if (gcMembers.length > 0) {
      for (const m of gcMembers) {
        if (m.id === botSteam32) continue; // skip the bot
        const player = allPlayers.find(p => p.steam32Id === String(m.id));
        if (!player) continue;
        if (m.team === 0) radiant.push(player);
        if (m.team === 1) dire.push(player);
      }
    }

    // If GC mapping worked (players are on teams in-game), use it
    // If not (everyone still unassigned), fall back to local random split
    if (radiant.length === 0 && dire.length === 0) {
      console.log("[Shuffle] GC returned no team assignments — using local random split");
      const shuffled = [...allPlayers].sort(() => Math.random() - 0.5);
      const half = Math.ceil(shuffled.length / 2);
      radiant = shuffled.slice(0, half);
      dire    = shuffled.slice(half);
    }

    // Write to Firestore
    await updateLobby(lobbyId, { radiant, dire, spectators: [] });
    console.log(`[Shuffle] Lobby ${lobbyId}: Radiant=[${radiant.map(p => p.username).join(",")}] Dire=[${dire.map(p => p.username).join(",")}]`);

    // Move to VCs immediately
    try {
      await createVCsAndMovePlayers(interaction.client, lobbyId, radiant, dire);
      await interaction.editReply(
        `🔀 **Shuffled & moved!**\n\n` +
        `🟢 **Radiant (${radiant.length}):** ${radiant.map(p => p.username).join(", ")}\n` +
        `🔴 **Dire (${dire.length}):** ${dire.map(p => p.username).join(", ")}\n\n` +
        `✅ Players moved to voice channels.`
      );
    } catch {
      await interaction.editReply(
        `🔀 **Teams assigned!**\n\n` +
        `🟢 **Radiant (${radiant.length}):** ${radiant.map(p => p.username).join(", ")}\n` +
        `🔴 **Dire (${dire.length}):** ${dire.map(p => p.username).join(", ")}\n\n` +
        `Click **Move to VCs** to move players.`
      );
    }

  } catch (err: any) {
    await interaction.editReply(`❌ Failed: ${err.message}`);
  }
}

// ─── Flip ─────────────────────────────────────────────────────
// Sends GC flip, waits for response, swaps teams in Firestore, moves VCs

async function handleLobbyFlip(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  await interaction.deferReply({ ephemeral: true });

  try {
    const bot = getDotaBot();
    if (!bot.isReady()) { await interaction.editReply("❌ Dota bot not connected."); return; }

    const lobby = await getLobby(lobbyId);
    if (!lobby) { await interaction.editReply("❌ Lobby not found."); return; }

    const oldRadiant = lobby.radiant ?? [];
    const oldDire    = lobby.dire    ?? [];

    if (oldRadiant.length === 0 && oldDire.length === 0) {
      await interaction.editReply("⚠️ No teams to flip. Run Shuffle first.");
      return;
    }

    // Send GC flip and wait for response
    await bot.flipTeams();

    // Swap in Firestore
    await updateLobby(lobbyId, { radiant: oldDire, dire: oldRadiant });
    console.log(`[Flip] Lobby ${lobbyId}: swapped — new Radiant=[${oldDire.map(p => p.username).join(",")}]`);

    // Move to VCs immediately
    try {
      await createVCsAndMovePlayers(interaction.client, lobbyId, oldDire, oldRadiant);
      await interaction.editReply(
        `🔄 **Flipped & moved!**\n\n` +
        `🟢 **Radiant (${oldDire.length}):** ${oldDire.map(p => p.username).join(", ")}\n` +
        `🔴 **Dire (${oldRadiant.length}):** ${oldRadiant.map(p => p.username).join(", ")}\n\n` +
        `✅ Players moved to voice channels.`
      );
    } catch {
      await interaction.editReply(
        `🔄 **Teams flipped!**\n\n` +
        `🟢 **Radiant (${oldDire.length}):** ${oldDire.map(p => p.username).join(", ")}\n` +
        `🔴 **Dire (${oldRadiant.length}):** ${oldRadiant.map(p => p.username).join(", ")}\n\n` +
        `Click **Move to VCs** to move players.`
      );
    }

  } catch (err: any) {
    await interaction.editReply(`❌ Failed: ${err.message}`);
  }
}

// ─── Move to VCs ──────────────────────────────────────────────
// Reads live Dota lobby state first, then falls back to Firestore

async function handleMoveToVC(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  if (!isAdmin(interaction)) { await interaction.reply({ content: "❌ Admin only.", ephemeral: true }); return; }
  await interaction.deferReply({ ephemeral: true });

  try {
    const lobby = await getLobby(lobbyId);
    if (!lobby) { await interaction.editReply("❌ Lobby not found."); return; }

    const bot = getDotaBot();
    const allPlayers: MatchPlayer[] = [
      ...(lobby.spectators ?? []),
      ...(lobby.radiant   ?? []),
      ...(lobby.dire      ?? []),
    ];

    let radiant: MatchPlayer[] = lobby.radiant ?? [];
    let dire: MatchPlayer[]    = lobby.dire    ?? [];

    // Try to read live positions from GC first
    if (bot.isReady()) {
      const gcMembers = bot.getLobbyMembers();
      const botSteam32 = (bot as any).botSteam32 as number;

      if (gcMembers.length > 0) {
        const gcRadiant: MatchPlayer[] = [];
        const gcDire:    MatchPlayer[] = [];

        for (const m of gcMembers) {
          if (m.id === botSteam32) continue;
          const player = allPlayers.find(p => p.steam32Id === String(m.id));
          if (!player) continue;
          if (m.team === 0) gcRadiant.push(player);
          if (m.team === 1) gcDire.push(player);
        }

        if (gcRadiant.length > 0 || gcDire.length > 0) {
          radiant = gcRadiant;
          dire    = gcDire;
          // Sync to Firestore so embeds stay accurate
          await updateLobby(lobbyId, { radiant, dire, spectators: [] });
          console.log(`[MoveToVC] Using live GC state — Radiant: ${radiant.length}, Dire: ${dire.length}`);
        }
      }
    }

    if (radiant.length === 0 && dire.length === 0) {
      await interaction.editReply(
        "⚠️ No teams assigned yet.\n\nHave players join Radiant/Dire in Dota 2, then click **Shuffle** or **Move to VCs**."
      );
      return;
    }

    await createVCsAndMovePlayers(interaction.client, lobbyId, radiant, dire);

    await interaction.editReply(
      `✅ **Done!**\n` +
      `🟢 Radiant: ${radiant.length} players | 🔴 Dire: ${dire.length} players\n\n` +
      `Players not in a voice channel need to join manually.`
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
      `**Lobby:** \`${lobby?.lobbyName ?? "iesports Lobby"}\`\n` +
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

  // Guard: only invite if the bot actually has an active lobby.
  // Sending a GC invite without a live lobby puts the player in a broken
  // Dota 2 state ("Back to Lobby" for ~10 min with no lobby to join).
  const lobbyState = bot.getLobbyState();
  if (lobbyState < 0) {
    const lobby = await getLobby(lobbyId);
    await interaction.editReply(
      `⚠️ No active lobby yet — the bot hasn't created one.\n\n` +
      `**Join manually in Dota 2:**\n` +
      `**Lobby:** \`${lobby?.lobbyName ?? "iesports Lobby"}\`\n` +
      `**Password:** \`${lobby?.password ?? "—"}\`\n` +
      `_Open Dota 2 → Play → Custom Lobbies → search the lobby name above_`
    );
    return;
  }

  bot.invitePlayer(steam32);

  await interaction.editReply(
    `✅ Invite sent to your Steam!\n\n` +
    `**If it doesn't appear in Dota 2:**\n` +
    `• Make sure Dota 2 is open\n` +
    `• Play → Custom Lobby → Browse Lobbies\n` +
    `• Search: \`iesports Lobby\``
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
    await cleanupVoiceChannels(interaction.client, lobbyId);
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
// ─── Dota 2 toss click ──────────────────────────────────────────────
// Custom ID shapes:
//   dota_toss_side:<tournamentId>:<matchId>:<radiant|dire>
//   dota_toss_pick:<tournamentId>:<matchId>:<first|last>
//
// Validates that the clicker is a member of the team that's allowed to act,
// then calls back to the web admin API so the toss state machine + Discord
// embed updates happen in one place. The web API also re-renders the embed.
async function handleDotaTossClick(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  const kind = parts[0]; // dota_toss_side | dota_toss_pick
  const tournamentId = parts[1];
  const matchId = parts[2];
  const choice = parts[3];

  await interaction.deferReply({ ephemeral: true });

  try {
    // Find which tournament collection this match lives in. Tournaments now
    // span dota (tournaments) and valorant (valorantTournaments), but Dota
    // tosses only target Dota tournaments. Default to tournaments.
    const tournamentCollection = "tournaments";

    // Fetch match doc to validate the clicker's team membership.
    const { getDb } = await import("../services/firebase");
    const db = getDb();
    const matchSnap = await db.collection(tournamentCollection).doc(tournamentId).collection("matches").doc(matchId).get();
    if (!matchSnap.exists) {
      await interaction.editReply({ content: "Match not found." });
      return;
    }
    const match = matchSnap.data() as any;
    const veto = match.vetoState || {};
    const team1Id = match.team1Id, team2Id = match.team2Id;

    // Identify the clicker's team.
    const webUser = await findUserByDiscordId(interaction.user.id);
    if (!webUser) {
      await interaction.editReply({ content: "Link your Discord on iesports.in first." });
      return;
    }
    const team1Snap = await db.collection(tournamentCollection).doc(tournamentId).collection("teams").doc(team1Id).get();
    const team2Snap = await db.collection(tournamentCollection).doc(tournamentId).collection("teams").doc(team2Id).get();
    // Members are stored as objects with a .uid field on Dota tournaments
    // and as plain UID strings on some legacy Valorant tournaments. Accept
    // both shapes; otherwise validation rejects every Dota clicker.
    const extractUids = (raw: any[]): string[] => raw.map((m: any) => typeof m === "string" ? m : m?.uid).filter((s: any): s is string => typeof s === "string" && s.length > 0);
    const team1Members = team1Snap.exists ? extractUids(((team1Snap.data() as any)?.members || []) as any[]) : [];
    const team2Members = team2Snap.exists ? extractUids(((team2Snap.data() as any)?.members || []) as any[]) : [];
    let clickerTeam: "team1" | "team2" | null = null;
    if (team1Members.includes(webUser.uid)) clickerTeam = "team1";
    else if (team2Members.includes(webUser.uid)) clickerTeam = "team2";
    if (!clickerTeam) {
      await interaction.editReply({ content: "You are not on either team in this match." });
      return;
    }

    // Permission check based on state.
    if (kind === "dota_toss_side") {
      if (veto.status !== "toss_started") {
        await interaction.editReply({ content: `Toss is not awaiting a side choice (current state: ${veto.status || "none"}).` });
        return;
      }
      if (clickerTeam !== veto.tossWinner) {
        await interaction.editReply({ content: `Only ${match[veto.tossWinner + "Name"]} (toss winner) can choose side.` });
        return;
      }
    } else {
      if (veto.status !== "side_chosen") {
        await interaction.editReply({ content: `Toss is not awaiting a pick-order choice (current state: ${veto.status || "none"}).` });
        return;
      }
      if (clickerTeam !== veto.tossLoser) {
        await interaction.editReply({ content: `Only ${match[veto.tossLoser + "Name"]} (toss loser) can choose pick order.` });
        return;
      }
    }

    // Update Firestore + edit Discord message directly from the bot.
    // We used to call back to /api/admin/dota-toss with ADMIN_SECRET, but
    // that requires shared-secret parity between Railway and Vercel which
    // is fragile. The bot already has Admin SDK access to Firestore and a
    // Discord client, so do it locally for resilience.
    const teamName = (t: "team1" | "team2") => match[t + "Name"] as string;
    const rivalOf = (t: "team1" | "team2"): "team1" | "team2" => t === "team1" ? "team2" : "team1";

    const TOSS_COLOR = 0xff4655, RADIANT_COLOR = 0x3ae37d, DIRE_COLOR = 0xd84a4a;

    const buildPickPromptEmbed = (winnerName: string, loserName: string, chosenSide: "radiant" | "dire") => {
      const winnerSide = chosenSide === "radiant" ? "⚔️ Radiant" : "🔥 Dire";
      const loserSide  = chosenSide === "radiant" ? "🔥 Dire"    : "⚔️ Radiant";
      const L = loserName.toUpperCase();
      return {
        embeds: [{
          title: `🎯 ${L} — PICK YOUR ORDER`,
          description: [
            `✅ **${winnerName}** took ${winnerSide}`,
            `➡️ **${loserName}** plays ${loserSide}`,
            ``,
            `Now **${L}**, choose:`,
            `🥇 **First Pick**  or  🥈 **Last Pick**`,
            ``,
            `**${winnerName}** gets the opposite.`,
            ``,
            `⏳ *Waiting for ${loserName} to click below…*`,
          ].join("\n"),
          color: chosenSide === "radiant" ? RADIANT_COLOR : DIRE_COLOR,
          footer: { text: `Only ${loserName} can click. ${winnerName} takes the leftover slot.` },
        }],
        components: [{
          type: 1, components: [
            { type: 2, style: 1, label: "🥇 First Pick", custom_id: `dota_toss_pick:${tournamentId}:${matchId}:first` },
            { type: 2, style: 2, label: "🥈 Last Pick",  custom_id: `dota_toss_pick:${tournamentId}:${matchId}:last` },
          ],
        }],
      };
    };

    const buildCompleteEmbed = (winnerName: string, loserName: string, radiantName: string, direName: string, firstPickName: string) => {
      const radiantOrder = firstPickName === radiantName ? "🥇 First Pick" : "🥈 Last Pick";
      const direOrder    = firstPickName === direName    ? "🥇 First Pick" : "🥈 Last Pick";
      return {
        embeds: [{
          title: `🏁 Toss locked in`,
          description: [
            `⚔️ **Radiant** — **${radiantName}** · ${radiantOrder}`,
            `🔥 **Dire**    — **${direName}** · ${direOrder}`,
            ``,
            `Lobby first-pick is set. Wait for the admin to start the lobby.`,
          ].join("\n"),
          color: RADIANT_COLOR,
          footer: { text: `${winnerName} chose side · ${loserName} chose pick order` },
        }],
        components: [],
      };
    };

    const matchRef = db.collection(tournamentCollection).doc(tournamentId).collection("matches").doc(matchId);
    const winnerName = teamName(veto.tossWinner as "team1" | "team2");
    const loserName  = teamName(veto.tossLoser as "team1" | "team2");

    try {
      if (kind === "dota_toss_side") {
        const sidePick = choice as "radiant" | "dire";
        const radiantTeam: "team1" | "team2" = sidePick === "radiant" ? veto.tossWinner : veto.tossLoser;
        const direTeam = rivalOf(radiantTeam);
        const newVeto = {
          ...veto,
          status: "side_chosen",
          sideChosenSide: sidePick,
          radiantTeam,
          direTeam,
          sideChosenAt: new Date().toISOString(),
        };
        await matchRef.set({ vetoState: newVeto }, { merge: true });
        // Edit the toss embed message in place.
        try {
          await interaction.message.edit(buildPickPromptEmbed(winnerName, loserName, sidePick) as any);
        } catch (editErr: any) {
          console.warn(`[dota toss] edit message failed: ${editErr?.message || editErr}`);
        }
      } else {
        const pickOrder = choice as "first" | "last";
        const firstPickTeam: "team1" | "team2" = pickOrder === "first" ? veto.tossLoser : veto.tossWinner;
        const lastPickTeam = rivalOf(firstPickTeam);
        // cm_pick: 1 = Radiant first pick, 2 = Dire first pick
        const cmPick: 1 | 2 = firstPickTeam === veto.radiantTeam ? 1 : 2;
        const radiantName = teamName(veto.radiantTeam as "team1" | "team2");
        const direName    = teamName(veto.direTeam as "team1" | "team2");
        const firstPickName = teamName(firstPickTeam);
        const newVeto = {
          ...veto,
          status: "completed",
          pickOrderChoice: pickOrder,
          firstPickTeam,
          lastPickTeam,
          cmPick,
          completedAt: new Date().toISOString(),
        };
        await matchRef.set({ vetoState: newVeto }, { merge: true });
        try {
          await interaction.message.edit(buildCompleteEmbed(winnerName, loserName, radiantName, direName, firstPickName) as any);
        } catch (editErr: any) {
          console.warn(`[dota toss] edit message failed: ${editErr?.message || editErr}`);
        }
      }
    } catch (writeErr: any) {
      console.error("[dota toss] firestore write failed:", writeErr?.message || writeErr);
      await interaction.editReply({ content: `Recording your pick failed: ${writeErr?.message || "unknown"}. Try again.` });
      return;
    }

    const labelMap: Record<string, string> = {
      radiant: "⚔️ Radiant", dire: "🔥 Dire", first: "🥇 First Pick", last: "🥈 Last Pick",
    };
    await interaction.editReply({ content: `✅ Recorded your pick: ${labelMap[choice] || choice}` });
  } catch (e: any) {
    console.error("[dota toss click]", e?.message || e);
    try { await interaction.editReply({ content: `Error: ${e?.message || "unknown"}` }); } catch {}
  }
}
