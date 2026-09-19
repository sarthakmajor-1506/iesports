import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { findUserByDiscordId, getDb } from "../services/firebase";

/**
 * Draft Lab, from Discord.
 *
 * The web ladder's hard problem is that a matchmaking queue at this size is an
 * empty room — the honest expected number of other people waiting at 11pm is
 * zero. What this product has that other daily games do not is that its players
 * are already sitting in one Discord server, so the queue's cold start is
 * solved by asking the room rather than by waiting in it. These two commands
 * are the other half of that: `/draft` opens a seat and posts it here, and
 * `/draftboard` puts today's ladder in the channel so the result is visible to
 * the people who might answer it.
 *
 * A NOTE ON THE DUPLICATION. `createRoom` below mirrors the room document the
 * web app's queue route writes. The bot is a separately built and separately
 * deployed package with its own node_modules — it cannot import from `web/` —
 * so the shape is written twice on purpose. It is small and it is the only
 * thing shared; if it grows, it belongs in Firestore rules or a shared package,
 * not copied a third time.
 *
 * NEW FILE RATHER THAN AN EDIT. slash-commands.ts runs live tournaments. These
 * are additive and touch nothing in it.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1, as the web app does
const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://iesports.in").replace(/\/$/, "");

async function createRoom(host: { uid: string; name: string }, bans: boolean): Promise<string | null> {
  try {
    const db = getDb();
    let code = newCode();
    for (let i = 0; i < 5; i++) {
      const hit = await db.collection("draftlabRooms").doc(code).get();
      if (!hit.exists) break;
      code = newCode();
    }
    await db.collection("draftlabRooms").doc(code).set({
      code,
      status: "waiting",
      // `id` is the per-browser id the web app seats players on. A room opened
      // from Discord has no browser yet, so it gets a marker the web client
      // will never collide with.
      //
      // The uid deliberately does NOT go in here. Room documents are readable
      // by anyone holding the five-character code, and a Discord-login uid is
      // `discord_<their Discord id>` — putting one in a room would publish a
      // player's Discord identity to everyone the link reaches. It goes in
      // draftlabRoomSeats, which no client can read.
      host: { id: `discord:${host.uid}`, name: host.name, avatar: null },
      guest: null,
      bans,
      picks: [],
      turnIndex: 0,
      deadline: null,
      ranked: false,
      hostSignedIn: true,
      settled: false,
      fromDiscord: true,
      createdAt: new Date(),
    });
    await db.collection("draftlabRoomSeats").doc(code).set({ hostUid: host.uid, guestUid: null });
    return code;
  } catch (err) {
    console.error("[draft] room create failed:", err);
    return null;
  }
}

/* ────────────────────────────────────────────────────────────── /draft */

export const draftData = new SlashCommandBuilder()
  .setName("draft")
  .setDescription("Open a ranked Dota draft and let the server know you want a game")
  .addBooleanOption((opt) =>
    opt.setName("bans").setDescription("Draft with 3 bans each (default: straight picks)").setRequired(false)
  );

export async function draftExecute(interaction: ChatInputCommandInteraction): Promise<void> {
  const bans = interaction.options.getBoolean("bans") ?? false;

  const user = await findUserByDiscordId(interaction.user.id);
  if (!user) {
    await interaction.reply({
      content:
        `You need an iesports account first — sign in with Discord at ${appUrl()}/draft and the ladder will know who you are.`,
      ephemeral: true,
    });
    return;
  }

  // The room write is a Firestore round trip, which can outrun Discord's three
  // second reply window on a cold function.
  await interaction.deferReply();

  const name = user.steamName || interaction.user.displayName || interaction.user.username;
  const code = await createRoom({ uid: user.uid, name }, bans);
  if (!code) {
    await interaction.editReply("Could not open a room just now. Try again in a moment.");
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xffd24a)
    .setTitle(`${name} wants to draft`)
    .setDescription(
      `**Ranked** · 30 seconds a turn · ${bans ? "3 bans each" : "straight picks"}\n` +
      `First to open the link takes the seat.`
    )
    .addFields({ name: "Room code", value: `\`${code}\``, inline: true })
    .setURL(`${appUrl()}/draft?live=${code}`)
    .setFooter({ text: "Both players must be signed in for the result to count." });

  await interaction.editReply({
    content: `${appUrl()}/draft?live=${code}`,
    embeds: [embed],
  });
}

/* ───────────────────────────────────────────────────────── /draftboard */

export const draftboardData = new SlashCommandBuilder()
  .setName("draftboard")
  .setDescription("This week's Draft Lab board")
  .addBooleanOption((opt) =>
    opt.setName("alltime").setDescription("Show all-time ranked rating instead of this week's coins").setRequired(false)
  );

/**
 * The Monday (IST) this week's coin board is keyed on.
 *
 * Mirrors lib/draftLadder.ts's `weekKey` on the web side — the bot is a
 * separately built and deployed package with its own node_modules and cannot
 * import from `web/`, so this stays a second, small copy rather than a shared
 * import. A Monday date string, not an ISO week number: nobody has to
 * remember what "2026-W01" means when the Firestore console just shows a date.
 */
function weekKey(): string {
  const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const sinceMonday = (ist.getDay() + 6) % 7;
  const monday = new Date(ist);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(ist.getDate() - sinceMonday);
  return monday.toLocaleDateString("en-CA");
}

export async function draftboardExecute(interaction: ChatInputCommandInteraction): Promise<void> {
  const allTime = interaction.options.getBoolean("alltime") ?? false;
  await interaction.deferReply();

  try {
    const db = getDb();
    const rows = allTime
      ? (await db.collection("draftlabLadder").orderBy("elo", "desc").limit(10).get()).docs
          .map((d) => d.data())
          .filter((d) => (d.games ?? 0) >= 3)
      // Per-week subcollection, so "this week, most coins first" is a
      // single-field order rather than a filter-plus-sort needing a
      // composite index nobody has deployed.
      : (await db.collection("draftlabLadderWeekly").doc(weekKey()).collection("players")
          .orderBy("coins", "desc").limit(10).get()).docs
          .map((d) => d.data());

    if (!rows.length) {
      await interaction.editReply(
        allTime
          ? "Nobody is ranked yet. `/draft` opens a seat."
          : `Nobody has coins yet this week. \`/draft\` opens a seat — ${appUrl()}/draft`
      );
      return;
    }

    const medals = ["🥇", "🥈", "🥉"];
    const lines = rows.map((d, i) => {
      const place = medals[i] ?? `\`${String(i + 1).padStart(2, " ")}\``;
      const name = String(d.name ?? "Anonymous").slice(0, 24);
      return allTime
        ? `${place} **${name}** — ${d.elo} (${d.wins ?? 0}W ${d.losses ?? 0}L)`
        : `${place} **${name}** — 🪙 ${d.coins ?? 0} (${d.games ?? 0} played, ${d.wins ?? 0}W)`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xffd24a)
      .setTitle(allTime ? "Draft Lab — all-time rating" : "Draft Lab — this week")
      .setDescription(lines.join("\n"))
      .setFooter({
        text: allTime
          ? "Rating from head-to-head ranked drafts. 3 games to be ranked."
          : "Coins from every win, solo or ranked. Resets Monday IST.",
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[draftboard] failed:", err);
    await interaction.editReply("Could not read the board just now.");
  }
}
