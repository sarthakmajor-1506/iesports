/**
 * Shared Discord messaging helpers.
 *
 * All messages go through the Discord Bot API.
 * Channel messages require the bot to have Send Messages permission.
 * DMs require the user to share a server with the bot and have DMs enabled.
 */

const DISCORD_API = "https://discord.com/api/v10";

function getBotToken() {
  return process.env.DISCORD_BOT_TOKEN || "";
}

function getValorantChannelId() {
  return process.env.Valorant_lobby || process.env.LOBBY_CONTROL_CHANNEL_ID || process.env.RESULTS_CHANNEL_ID || "";
}

/** Send a message to a Discord channel. Returns true on success. */
export async function sendChannelMessage(channelId: string, content: string): Promise<{ ok: boolean; error?: string }> {
  const botToken = getBotToken();
  if (!botToken || !channelId) return { ok: false, error: "Missing bot token or channel ID" };

  // Discord has 2000 char limit — split if needed
  const chunks = splitMessage(content, 2000);
  for (const chunk of chunks) {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: chunk }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Discord API ${res.status}: ${errText}` };
    }
  }
  return { ok: true };
}

/** Send a DM to a Discord user by their Discord ID. */
export async function sendDM(discordId: string, content: string): Promise<{ ok: boolean; error?: string }> {
  const botToken = getBotToken();
  if (!botToken || !discordId) return { ok: false, error: "Missing bot token or discord ID" };

  // Open DM channel
  const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: { "Authorization": `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: discordId }),
  });
  if (!dmRes.ok) {
    const errText = await dmRes.text();
    return { ok: false, error: `DM channel open failed ${dmRes.status}: ${errText}` };
  }
  const dmChannel = await dmRes.json();

  return sendChannelMessage(dmChannel.id, content);
}

/** Send a per-game result to the Valorant channel. */
export async function sendGameResult(opts: {
  team1Name: string;
  team2Name: string;
  gameNumber: number;
  mapName: string;
  team1RoundsWon: number;
  team2RoundsWon: number;
  gameWinner: "team1" | "team2" | null;
  team1SeriesScore: number;
  team2SeriesScore: number;
  bo: number;
  mvp: { name: string; kills: number; deaths: number; assists: number; acs: number } | null;
  topPerformers: { name: string; kills: number; deaths: number; acs: number }[];
  isBracket?: boolean;
  bracketLabel?: string;
}) {
  const channelId = getValorantChannelId();
  if (!channelId) return { ok: false, error: "No channel ID configured" };

  const winnerName = opts.gameWinner === "team1" ? opts.team1Name : opts.team2Name;
  const roundScore = `${Math.max(opts.team1RoundsWon, opts.team2RoundsWon)}-${Math.min(opts.team1RoundsWon, opts.team2RoundsWon)}`;
  const matchLabel = opts.bracketLabel || `${opts.team1Name} vs ${opts.team2Name}`;

  const lines = [
    `⚔️ **${matchLabel}** — Game ${opts.gameNumber} [${opts.team1SeriesScore}-${opts.team2SeriesScore} in BO${opts.bo}]`,
    `🗺️ ${opts.mapName} — **${winnerName}** wins **${roundScore}**`,
  ];

  if (opts.mvp) {
    lines.push(`\n🏅 **MVP: ${opts.mvp.name}** — ${opts.mvp.kills}K/${opts.mvp.deaths}D/${opts.mvp.assists}A | ${opts.mvp.acs} ACS`);
  }

  if (opts.topPerformers.length > 0) {
    lines.push(`**Top Performers:**`);
    for (const p of opts.topPerformers) {
      lines.push(`• ${p.name} — ${p.kills}K/${p.deaths}D | ${p.acs} ACS`);
    }
  }

  return sendChannelMessage(channelId, lines.join("\n"));
}

/** Send the Grand Final / tournament completion announcement. */
export async function sendTournamentComplete(opts: {
  tournamentName: string;
  tournamentId: string;
  winnerName: string;
  winnerTags: string;
  prizePool: string;
  team1Name: string;
  team2Name: string;
  team1SeriesScore: number;
  team2SeriesScore: number;
  gameSummaries: string[];
  leaderboardTop3: { tag: string; name: string; kd: number; acs: number }[];
}) {
  const channelId = getValorantChannelId();
  if (!channelId) return { ok: false, error: "No channel ID configured" };

  const medals = ["🥇", "🥈", "🥉"];
  const lbLines = opts.leaderboardTop3.map((p, i) =>
    `${medals[i]} ${p.tag} **${p.name}** — K/D: **${p.kd}** | ACS: ${p.acs}`
  );

  const message = [
    `🏆 **TOURNAMENT CHAMPIONS — ${opts.winnerName}** 🏆`,
    `💰 **Prize: ₹${opts.prizePool}**\n`,
    opts.winnerTags + "\n",
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚔️ **GRAND FINAL** — ${opts.team1Name} vs ${opts.team2Name} (${opts.team1SeriesScore}-${opts.team2SeriesScore})\n`,
    opts.gameSummaries.join("\n"),
    `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📊 **TOP 3 LEADERBOARD** (by K/D)\n`,
    lbLines.join("\n"),
    `\n📎 https://iesports.in/valorant/tournament/${opts.tournamentId}`,
  ].join("\n");

  return sendChannelMessage(channelId, message);
}

/** Split a message into chunks that fit Discord's character limit. */
function splitMessage(content: string, maxLength: number): string[] {
  if (content.length <= maxLength) return [content];
  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    // Try to split at a newline
    let splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt < maxLength * 0.5) splitAt = maxLength;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }
  return chunks;
}
