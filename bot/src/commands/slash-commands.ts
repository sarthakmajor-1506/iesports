import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { findUserByDiscordId, getActiveLobby, updateLobby, updateQueue, getDb } from "../services/firebase";
import { fetchMatchResult, requestMatchParse } from "../services/opendota";
import { matchResultEmbed } from "../utils/embeds";
import { cleanupVoiceChannels } from "../services/match-orchestrator";

// ─── /linksteam ──────────────────────────────────────────────

export const linksteamData = new SlashCommandBuilder()
  .setName("linksteam")
  .setDescription("Link your Steam account for auto-invites")
  .addStringOption((opt) =>
    opt.setName("steam_id").setDescription("Your Steam64 ID (find at steamid.io)").setRequired(true)
  );

export async function linksteamExecute(interaction: ChatInputCommandInteraction): Promise<void> {
  const steamId = interaction.options.getString("steam_id", true).trim();

  if (!/^7656\d{13}$/.test(steamId)) {
    await interaction.reply({
      content: "❌ Invalid Steam64 ID. Go to [steamid.io](https://steamid.io) and copy your **Steam64 ID** (starts with `7656`).",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Fetch Steam name via Steam Web API
    let steamName = "Unknown";
    const steamApiKey = process.env.STEAM_API_KEY;
    if (steamApiKey) {
      try {
        const axios = require("axios");
        const res = await axios.get(
          `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${steamApiKey}&steamids=${steamId}`
        );
        steamName = res.data?.response?.players?.[0]?.personaname || "Unknown";
      } catch { /* use fallback */ }
    }

    // Update or create user record in Firestore
    const snap = await getDb()
      .collection("users")
      .where("discordId", "==", interaction.user.id)
      .limit(1)
      .get();

    if (!snap.empty) {
      await snap.docs[0].ref.update({ steamId, steamName });
    } else {
      await getDb().collection("users").add({
        discordId: interaction.user.id,
        steamId,
        steamName,
        createdAt: new Date().toISOString(),
      });
    }

    const steam32 = (BigInt(steamId) - BigInt("76561197960265728")).toString();

    await interaction.editReply(
      `✅ Steam linked!\n**Name:** ${steamName}\n**Steam64:** \`${steamId}\`\n**Steam32:** \`${steam32}\`\n\nYou'll now get auto-invited to lobbies.`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await interaction.editReply(`❌ Failed: ${message}`);
  }
}

// ─── /matchresult ────────────────────────────────────────────

export const matchresultData = new SlashCommandBuilder()
  .setName("matchresult")
  .setDescription("Record match result or auto-detect from OpenDota (Admin)")
  .addStringOption((opt) =>
    opt
      .setName("winner")
      .setDescription("Which team won?")
      .setRequired(false)
      .addChoices(
        { name: "Radiant", value: "radiant" },
        { name: "Dire", value: "dire" },
        { name: "Auto-detect", value: "auto" }
      )
  )
  .addStringOption((opt) =>
    opt.setName("match_id").setDescription("Dota match ID (for auto-detect)").setRequired(false)
  );

export async function matchresultExecute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "❌ Admin only.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const winner = interaction.options.getString("winner") || "auto";
  const matchIdInput = interaction.options.getString("match_id");

  const lobby = await getActiveLobby();
  if (!lobby) {
    await interaction.editReply("❌ No active lobby found.");
    return;
  }

  if (winner === "auto") {
    const dotaMatchId = matchIdInput || lobby.dotaMatchId;
    if (!dotaMatchId) {
      await interaction.editReply("❌ No match ID. Provide one with `match_id` option or wait for the match to register.");
      return;
    }

    await requestMatchParse(dotaMatchId);
    await interaction.editReply(`🔍 Fetching match ${dotaMatchId} from OpenDota...`);

    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      const result = await fetchMatchResult(dotaMatchId);
      if (result) {
        await updateLobby(lobby.id, {
          status: "completed",
          winner: result.winner,
          mvp: result.mvp,
          duration: result.duration,
          playerStats: result.players,
          dotaMatchId,
          completedAt: new Date().toISOString(),
        });
        await updateQueue(lobby.queueId, { status: "completed" });

        const embed = matchResultEmbed(result, lobby, 0);
        await interaction.editReply({ content: "✅ Match result found!", embeds: [embed] });

        const rch = process.env.RESULTS_CHANNEL_ID;
        if (rch) {
          const ch = (await interaction.client.channels.fetch(rch)) as TextChannel;
          await ch.send({ embeds: [embed] });
        }

        await cleanupVoiceChannels(interaction.client);
        return;
      }
    }

    await interaction.editReply("⏳ Match not yet parsed on OpenDota. Try again in a few minutes.");
  } else {
    const w = winner as "radiant" | "dire";
    await updateLobby(lobby.id, { status: "completed", winner: w, completedAt: new Date().toISOString() });
    await updateQueue(lobby.queueId, { status: "completed" });
    await cleanupVoiceChannels(interaction.client);

    const label = w === "radiant" ? "🟢 Radiant" : "🔴 Dire";
    await interaction.editReply(`✅ **${label}** wins! Result recorded.`);
  }
}