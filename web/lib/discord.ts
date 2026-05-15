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
  /** Override the default Valorant channel — used by test tournaments to
   *  keep all Discord traffic routed to a single isolated channel. */
  channelIdOverride?: string;
}) {
  const channelId = opts.channelIdOverride || getValorantChannelId();
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
  /** Override the default Valorant channel — see sendGameResult. */
  channelIdOverride?: string;
}) {
  const channelId = opts.channelIdOverride || getValorantChannelId();
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

/** Send a registration confirmation DM to a player. Fire-and-forget — never fails the registration. */
export async function sendRegistrationDM(opts: {
  discordId: string;
  playerName: string;
  tournamentName: string;
  tournamentId: string;
  startDate: string;
  registrationDeadline?: string;
  format: string;
  prizePool: string;
  slotsBooked: number;
  totalSlots: number;
  iesportsRank: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const formatDate = (iso: string) => {
      try {
        const d = new Date(iso);
        return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
      } catch { return iso; }
    };

    const startFormatted = formatDate(opts.startDate);

    const nextSteps = opts.format === "shuffle"
      ? `Once registration closes, teams will be **shuffled** — balanced squads based on rank. You don't need to find a team. We handle it.`
      : opts.format === "auction"
      ? `Captains will **auction-draft** players after registration closes. Show up, get picked, and prove your worth.`
      : `Make sure your team is ready before the tournament starts. Coordinate with your squad.`;

    const deadlineStr = opts.registrationDeadline
      ? `\n> Registration closes: **${formatDate(opts.registrationDeadline)}**`
      : "";

    const message = [
      `# You're in. Game on.\n`,
      `**${opts.playerName}**, you're officially registered for **${opts.tournamentName}**.\n`,
      `> Rank: **${opts.iesportsRank}**`,
      `> Format: **${opts.format === "shuffle" ? "Shuffle" : opts.format === "auction" ? "Auction" : "Standard"}**`,
      `> Prize Pool: **₹${opts.prizePool}**`,
      `> Tournament starts: **${startFormatted}**${deadlineStr}\n`,
      `**What happens next?**`,
      `${nextSteps}\n`,
      `**About the Leaderboard**`,
      `Every match counts. Your kills, deaths, ACS — all tracked automatically. Top performers on the leaderboard win **bonus prizes** on top of the tournament prize pool. Play every round like it matters.\n`,
      `Stay sharp. Stay online. When it's game time, we expect you to show up ready.\n`,
      `📎 **Tournament details:** https://iesports.in/valorant/tournament/${opts.tournamentId}`,
      `\nSee you on the leaderboard.`,
      `**— IEsports**`,
    ].join("\n");

    return await sendDM(opts.discordId, message);
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ─── Voice channel + permission overwrite helpers ────────────────────────────
// Used by the Voice Panel admin tab to manage a private "test" voice channel
// where owners always have access and other users are toggled on/off.

/** Discord permission bit constants we care about. All fit in 32 bits so plain
 *  Number math is safe (Discord's full permission set spans more bits, but
 *  we never OR in the higher ones). Sent as decimal strings to the REST API. */
export const DISCORD_PERMS = {
  VIEW_CHANNEL: 1 << 10,    // 1024
  CONNECT: 1 << 20,         // 1048576
  SPEAK: 1 << 21,           // 2097152
  MUTE_MEMBERS: 1 << 22,    // 4194304
  MOVE_MEMBERS: 1 << 24,    // 16777216
};

const FULL_ACCESS_ALLOW = (DISCORD_PERMS.VIEW_CHANNEL | DISCORD_PERMS.CONNECT | DISCORD_PERMS.SPEAK).toString();
const ACCESS_NO_SPEAK_ALLOW = (DISCORD_PERMS.VIEW_CHANNEL | DISCORD_PERMS.CONNECT).toString();

interface PermOverwrite { id: string; type: 0 | 1; allow: string; deny: string }

/** Create a private voice channel. @everyone is denied VIEW_CHANNEL; each
 *  owner gets View+Connect+Speak. Returns the new channel id. */
export async function createPrivateVoiceChannel(opts: {
  guildId: string;
  name: string;
  ownerUserIds: string[];
  parentId?: string;
}): Promise<{ ok: true; channelId: string } | { ok: false; error: string }> {
  const botToken = getBotToken();
  if (!botToken) return { ok: false, error: "Missing bot token" };

  const overwrites: PermOverwrite[] = [
    // @everyone role id is the guild id by Discord convention
    { id: opts.guildId, type: 0, allow: "0", deny: DISCORD_PERMS.VIEW_CHANNEL.toString() },
    ...opts.ownerUserIds.map((uid): PermOverwrite => ({
      id: uid, type: 1, allow: FULL_ACCESS_ALLOW, deny: "0",
    })),
  ];

  const res = await fetch(`${DISCORD_API}/guilds/${opts.guildId}/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: opts.name,
      type: 2, // voice
      parent_id: opts.parentId,
      permission_overwrites: overwrites,
    }),
  });
  if (!res.ok) return { ok: false, error: `Discord ${res.status}: ${await res.text()}` };
  const ch = await res.json();
  return { ok: true, channelId: ch.id };
}

/** Patch a channel (rename, change parent, etc). */
export async function patchChannel(channelId: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const botToken = getBotToken();
  if (!botToken) return { ok: false, error: "Missing bot token" };
  const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, error: `Discord ${res.status}: ${await res.text()}` };
  return { ok: true };
}

/** Delete a channel. */
export async function deleteChannel(channelId: string): Promise<{ ok: boolean; error?: string }> {
  const botToken = getBotToken();
  if (!botToken) return { ok: false, error: "Missing bot token" };
  const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
    method: "DELETE",
    headers: { Authorization: `Bot ${botToken}` },
  });
  if (!res.ok && res.status !== 404) return { ok: false, error: `Discord ${res.status}: ${await res.text()}` };
  return { ok: true };
}

/** Set a user's voice-channel overwrite with a specific allow mask.
 *  Helper used by grant (no speak), unmute (with speak), and mute (no speak). */
async function putVoiceOverwrite(channelId: string, userId: string, allow: string): Promise<{ ok: boolean; error?: string }> {
  const botToken = getBotToken();
  if (!botToken) return { ok: false, error: "Missing bot token" };
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/permissions/${userId}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: 1, allow, deny: "0" }),
  });
  if (!res.ok) return { ok: false, error: `Discord ${res.status}: ${await res.text()}` };
  return { ok: true };
}

/** Grant a user View+Connect (no Speak — muted by default). */
export async function grantVoiceAccess(channelId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  return putVoiceOverwrite(channelId, userId, ACCESS_NO_SPEAK_ALLOW);
}

/** Add SPEAK to a user's existing overwrite (gives mic). */
export async function unmuteVoiceUser(channelId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  return putVoiceOverwrite(channelId, userId, FULL_ACCESS_ALLOW);
}

/** Drop SPEAK from a user's overwrite (takes away mic, keeps them in channel). */
export async function muteVoiceUser(channelId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  return putVoiceOverwrite(channelId, userId, ACCESS_NO_SPEAK_ALLOW);
}

/** Revoke a user's permission overwrite — back to @everyone defaults (no access). */
export async function revokeVoiceAccess(channelId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const botToken = getBotToken();
  if (!botToken) return { ok: false, error: "Missing bot token" };
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/permissions/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bot ${botToken}` },
  });
  // 404 = no overwrite existed = already not granted; treat as success
  if (!res.ok && res.status !== 404) return { ok: false, error: `Discord ${res.status}: ${await res.text()}` };
  return { ok: true };
}

/** Disconnect a user from voice (sets channel_id = null on their voice state). */
export async function kickFromVoice(guildId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const botToken = getBotToken();
  if (!botToken) return { ok: false, error: "Missing bot token" };
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${userId}`, {
    method: "PATCH",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel_id: null }),
  });
  // 404 / not connected → no-op
  if (!res.ok && res.status !== 404 && res.status !== 400) return { ok: false, error: `Discord ${res.status}: ${await res.text()}` };
  return { ok: true };
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
