import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from "discord.js";

// ─── Queue Buttons (shown on every queue embed) ─────────────

export function queueButtons(queueId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`queue_join:${queueId}`)
      .setLabel("Join Queue")
      .setEmoji("🎮")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`queue_leave:${queueId}`)
      .setLabel("Leave Queue")
      .setEmoji("🚪")
      .setStyle(ButtonStyle.Danger)
  );
}

// ─── Lobby Control Buttons (like IDPL's lobby-control panel) ─

export function lobbyControlRow1(lobbyId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`lobby_start:${lobbyId}`)
      .setLabel("Start")
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`lobby_shuffle:${lobbyId}`)
      .setLabel("Shuffle")
      .setEmoji("🔀")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`lobby_flip:${lobbyId}`)
      .setLabel("Flip")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`lobby_leave:${lobbyId}`)
      .setLabel("Leave")
      .setEmoji("🚪")
      .setStyle(ButtonStyle.Danger)
  );
}

export function lobbyControlRow2(lobbyId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`lobby_settings:${lobbyId}`)
      .setLabel("Settings")
      .setEmoji("⚙️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`lobby_invite:${lobbyId}`)
      .setLabel("Invite")
      .setEmoji("📨")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`lobby_draft:${lobbyId}`)
      .setLabel("Draft Info")
      .setEmoji("📊")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`lobby_movevc:${lobbyId}`)
      .setLabel("Move to VCs")
      .setEmoji("🔊")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`lobby_destroy:${lobbyId}`)
      .setLabel("Destroy")
      .setEmoji("💥")
      .setStyle(ButtonStyle.Danger)
  );
}

export function lobbyControlRow3(lobbyId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`lobby_restart:${lobbyId}`)
      .setLabel("Restart Bot")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary)
  );
}

// ─── Invite Me Button (shown on lobby status) ────────────────

export function inviteMeButton(lobbyId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`lobby_inviteme:${lobbyId}`)
      .setLabel("Invite Me")
      .setEmoji("🎮")
      .setStyle(ButtonStyle.Primary)
  );
}

// ─── Create Queue Button (for #create-queue channel) ─────────

export function createQueueButton(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("create_queue")
      .setLabel("Create Queue")
      .setEmoji("📋")
      .setStyle(ButtonStyle.Success)
  );
}

// ─── Queue Type Select Menu ──────────────────────────────────

export function queueTypeSelect(): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("queue_type_select")
      .setPlaceholder("Select queue type")
      .addOptions(
        { label: "Free Lobby", value: "free", emoji: "🎮", description: "No entry fee" },
        { label: "Wager Lobby", value: "wager", emoji: "💰", description: "Players stake ₹" },
        { label: "Sponsored Lobby", value: "sponsored", emoji: "🎁", description: "With sponsor bonus" }
      )
  );
}

// ─── Match Result Buttons ────────────────────────────────────

export function matchResultButtons(lobbyId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`result_radiant:${lobbyId}`)
      .setLabel("Radiant Won")
      .setEmoji("🟢")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`result_dire:${lobbyId}`)
      .setLabel("Dire Won")
      .setEmoji("🔴")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`result_auto:${lobbyId}`)
      .setLabel("Auto-detect (OpenDota)")
      .setEmoji("🤖")
      .setStyle(ButtonStyle.Primary)
  );
}
