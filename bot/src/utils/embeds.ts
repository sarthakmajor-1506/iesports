import { EmbedBuilder, Colors } from "discord.js";
import { QueueDoc, QueuePlayer, LobbyDoc, MatchPlayer } from "../services/firebase";
import { MatchResult, PlayerMatchStats, formatDamage } from "../services/opendota";

const BRAND = 0xf05a28;

// ─── Queue Embed (like IDPL wager lobby card) ────────────────

export function queueEmbed(q: QueueDoc): EmbedBuilder {
  const typeEmoji = q.type === "wager" ? "💰" : q.type === "sponsored" ? "💰" : "🎮";
  const title = q.name || `${typeEmoji} ${q.type.toUpperCase()} LOBBY`;

  const embed = new EmbedBuilder()
    .setTitle(`${typeEmoji} ${title}`)
    .setColor(BRAND);

  // Schedule + type + player count row
  const meta: string[] = [];
  if (q.scheduledTime) {
    const dt = new Date(q.scheduledTime);
    const timeStr = dt.toLocaleString("en-IN", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
    });
    meta.push(`📅 Scheduled Time: **${timeStr} IST**`);
  }
  meta.push(`🏷️ Type: **${q.type}**`);
  meta.push(`👥 Players: **${q.players.length}/${q.maxPlayers}**`);

  if (q.entryFee > 0) {
    meta.push(`💰 Stakes: Entry Fee ₹${q.entryFee}`);
  }
  if (q.bonus > 0) {
    meta.push(`🎁 Bonus: ₹${q.bonus}${q.sponsorId ? ` (sponsored by <@${q.sponsorId}>)` : ""}`);
  }

  embed.setDescription(meta.join("\n"));

  // Player list
  if (q.players.length > 0) {
    const playerList = q.players
      .map((p, i) => {
        const steamInfo = p.steamName ? ` (${p.steamName})` : "";
        return `${i + 1}. <@${p.discordId}>${steamInfo}`;
      })
      .join("\n");
    embed.addFields({ name: "📋 Joined Players", value: playerList, inline: false });
  } else {
    embed.addFields({ name: "📋 Joined Players", value: "*No players yet*", inline: false });
  }

  // Status
  const statusEmoji: Record<string, string> = {
    open: "🟢", locked: "🔒", in_progress: "🎮", completed: "🔴",
  };
  embed.setFooter({ text: `Status: ${statusEmoji[q.status] || ""} ${q.status.charAt(0).toUpperCase() + q.status.slice(1)}` });
  embed.setTimestamp();

  return embed;
}

// ─── Lobby Embed (like IDPL lobby status card) ───────────────

export function lobbyEmbed(lobby: LobbyDoc): EmbedBuilder {
  // Crisp tournament-channel card. Players need: password + 1-click
  // re-invite. Mode/region as a single subtitle line. Roster + spectator
  // lists are noise (Dota client shows them) so they live in the admin
  // panel now, not in chat.
  return new EmbedBuilder()
    .setTitle(`🏟️ ${lobby.lobbyName || "iesports Lobby"}`)
    .setDescription(
      `**Password:** \`${lobby.password}\`\n` +
      `${lobby.gameMode} · ${lobby.serverRegion}\n\n` +
      `_No Steam invite? Tap_ **🎮 Invite Me** _below._`
    )
    .setColor(Colors.Green)
    .setTimestamp();
}

// ─── Lobby Control Panel Embed ───────────────────────────────

export function lobbyControlEmbed(lobby: LobbyDoc | null): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("🎮 Lobby Control")
    .setColor(BRAND);

  if (lobby) {
    embed.setDescription("A lobby is currently active. Use the buttons below to manage it.");
    embed.addFields(
      { name: "Lobby", value: lobby.lobbyName, inline: true },
      { name: "Status", value: lobby.status, inline: true },
      { name: "Password", value: `\`${lobby.password}\``, inline: true }
    );
  } else {
    embed.setDescription("No active lobby. Create a queue first, then the lobby will be auto-created.");
  }

  embed.setFooter({ text: "iesports Hub" });
  return embed;
}

// ─── Match Result Embed (like IDPL match complete card) ──────

export function matchResultEmbed(
  result: MatchResult,
  lobby: LobbyDoc,
  stakes?: number
): EmbedBuilder {
  const winnerEmoji = result.winner === "radiant" ? "🟢" : "🔴";
  const winnerLabel = result.winner === "radiant" ? "Radiant" : "Dire";

  const embed = new EmbedBuilder()
    .setTitle(`🎮 Match #${result.matchId} Complete`)
    .setColor(result.winner === "radiant" ? Colors.Green : Colors.Red);

  // Header line
  const headerLines = [
    `${winnerEmoji} **${winnerLabel} Victory** • Duration: **${result.duration}**`,
  ];

  // MVP
  if (result.mvp) {
    headerLines.push(
      `⭐ **MVP: ${result.mvp.steamName}** (${result.mvp.hero}) — ${result.mvp.kills}/${result.mvp.deaths}/${result.mvp.assists} • ${formatDamage(result.mvp.heroDamage)} dmg • ${result.mvp.gpm} GPM`
    );
  }

  // Stakes
  if (stakes && stakes > 0) {
    headerLines.push(`\n💰 **Stakes**\n₹${stakes}`);
  }

  embed.setDescription(headerLines.join("\n"));

  // Radiant players
  const radiantPlayers = result.players
    .filter((p) => p.isRadiant)
    .map((p) => `**${p.steamName}** (${p.hero}) – ${p.kills}/${p.deaths}/${p.assists} • ${formatDamage(p.heroDamage)} dmg | ${p.gpm} GPM`)
    .join("\n");

  const radiantTitle = result.winner === "radiant" ? "🟢 Radiant ✓" : "🟢 Radiant";
  embed.addFields({ name: radiantTitle, value: radiantPlayers || "No data", inline: false });

  // Dire players
  const direPlayers = result.players
    .filter((p) => !p.isRadiant)
    .map((p) => `**${p.steamName}** (${p.hero}) – ${p.kills}/${p.deaths}/${p.assists} • ${formatDamage(p.heroDamage)} dmg | ${p.gpm} GPM`)
    .join("\n");

  const direTitle = result.winner === "dire" ? "🔴 Dire ✓" : "🔴 Dire";
  embed.addFields({ name: direTitle, value: direPlayers || "No data", inline: false });

  embed.setTimestamp();
  return embed;
}

// ─── Welcome Embed ───────────────────────────────────────────

export function welcomeEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Welcome to iesports! 🎮")
    .setColor(BRAND)
    .setDescription(
      `**Get started:**\n` +
      `• Click **Join Queue** on any active queue\n` +
      `• Queue opens daily — check #queue\n\n` +
      `Lobbies are fully automated. Once the queue fills, we create the Dota 2 lobby, invite everyone, shuffle teams, and post results — all automatically.`
    );
}
