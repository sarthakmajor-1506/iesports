import {
  Client,
  GatewayIntentBits,
  Events,
  TextChannel,
  Collection,
} from "discord.js";
import * as dotenv from "dotenv";
import * as cron from "node-cron";

dotenv.config();

import { initFirebase, getDb } from "./services/firebase";
import { getDotaBot } from "./services/dota-gc";
import { sendPreMatchWarning, startMatchLobby } from "./services/match-orchestrator";
import { handleButton } from "./events/button-handler";
import { handleModal } from "./events/modal-handler";
import { registerWelcomeEvent } from "./events/welcome";
import { linksteamData, linksteamExecute, matchresultData, matchresultExecute } from "./commands/slash-commands";
import { lobbyControlEmbed } from "./utils/embeds";
import { createQueueButton, lobbyControlRow1, lobbyControlRow2, lobbyControlRow3 } from "./utils/buttons";

console.log("═══════════════════════════════════════");
console.log("  IEsports Bot v2.0 — Starting up...");
console.log("═══════════════════════════════════════\n");

initFirebase();
console.log("✅ Firebase initialized");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const commands = new Collection<string, any>();
commands.set(linksteamData.name, { data: linksteamData, execute: linksteamExecute });
commands.set(matchresultData.name, { data: matchresultData, execute: matchresultExecute });

// ─── Interaction Router ──────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const cmd = commands.get(interaction.commandName);
    if (cmd) {
      try { await cmd.execute(interaction); }
      catch (err: any) {
        console.error(`[Cmd] error:`, err);
        const msg = { content: "❌ Something went wrong.", ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(msg as any);
        else await interaction.reply(msg as any);
      }
    }
    return;
  }
  if (interaction.isButton()) {
    try { await handleButton(interaction); }
    catch (err: any) { console.error("[Button]", err); try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "❌ Error.", ephemeral: true }); } catch {} }
    return;
  }
  if (interaction.isModalSubmit()) {
    try { await handleModal(interaction); }
    catch (err: any) { console.error("[Modal]", err); }
    return;
  }
});

registerWelcomeEvent(client);

// ─── Ready ───────────────────────────────────────────────────

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`\n🤖 Bot online: ${readyClient.user.tag}`);
  console.log(`   Guilds: ${readyClient.guilds.cache.size}`);

  // Connect Steam/Dota2 GC
  const steamUser = process.env.STEAM_ACCOUNT_NAME;
  if (steamUser) {
    console.log(`\n[Steam] Connecting as ${steamUser}...`);
    try {
      await getDotaBot().connect();
      console.log("[Steam] ✅ Dota 2 GC connected!");
    } catch (err: any) {
      console.error("[Steam] ❌", err.message);
      console.log("[Steam] Running in manual-lobby mode.");
    }
  } else {
    console.log("\n[Steam] No STEAM_ACCOUNT_NAME — manual-lobby mode.");
  }

  // Post Create Queue panel to #create-queue
  const createQueueChId = process.env.CREATE_QUEUE_CHANNEL_ID;
  if (createQueueChId) {
    try {
      const ch = (await client.channels.fetch(createQueueChId)) as TextChannel;
      const msgs = await ch.messages.fetch({ limit: 5 });
      const hasPanel = msgs.some((m) => m.author.id === readyClient.user.id && m.components.length > 0);
      if (!hasPanel) {
        await ch.send({
          embeds: [{ title: "📋 Game Queues", description: "Admins can click **Create Queue** to start a new queue.\nQueues with join/leave buttons appear in #queue.", color: 0xf05a28, footer: { text: "IEsports Hub" } }],
          components: [createQueueButton()],
        });
        console.log("[Setup] Posted queue panel to #create-queue");
      }
    } catch (err: any) { console.error("[Setup]", err.message); }
  }

  // Post Lobby Control panel
  const lobbyChId = process.env.LOBBY_CONTROL_CHANNEL_ID;
  if (lobbyChId) {
    try {
      const ch = (await client.channels.fetch(lobbyChId)) as TextChannel;
      const msgs = await ch.messages.fetch({ limit: 5 });
      const hasPanel = msgs.some((m) => m.author.id === readyClient.user.id && m.components.length > 0);
      if (!hasPanel) {
        await ch.send({ embeds: [lobbyControlEmbed(null)], components: [lobbyControlRow1("none"), lobbyControlRow2("none"), lobbyControlRow3("none")] });
        console.log("[Setup] Posted lobby control to #lobby-control");
      }
    } catch (err: any) { console.error("[Setup]", err.message); }
  }

  // ─── Scheduled Match Cron — checks every minute ──────────
  // Looks for open queues with a scheduledTime.
  // At T-10min: sends warning + creates waiting room.
  // At T-0: creates lobby + invites everyone.

  const warningsSent = new Set<string>();  // track which queues got warned
  const lobbiesStarted = new Set<string>(); // track which queues got started

  cron.schedule("* * * * *", async () => {
    try {
      const now = Date.now();
      const snap = await getDb()
        .collection("botQueues")
        .where("status", "==", "open")
        .get();

      for (const doc of snap.docs) {
        const queue = { ...doc.data(), id: doc.id } as any;
        if (!queue.scheduledTime) continue;

        const matchTime = new Date(queue.scheduledTime).getTime();
        const minsUntil = (matchTime - now) / 60000;

        // 10 min warning (between 9-11 min before)
        if (minsUntil <= 10 && minsUntil > 9 && !warningsSent.has(queue.id)) {
          warningsSent.add(queue.id);
          console.log(`[Cron] Sending 10-min warning for: ${queue.name}`);
          await sendPreMatchWarning(client, queue);
        }

        // Match time (between -1 and 1 min of scheduled time)
        if (minsUntil <= 0 && minsUntil > -1 && !lobbiesStarted.has(queue.id)) {
          lobbiesStarted.add(queue.id);
          console.log(`[Cron] Starting match for: ${queue.name}`);
          await startMatchLobby(client, queue);
        }
      }
    } catch (err: any) {
      console.error("[Cron] Error:", err.message);
    }
  });

  console.log("[Cron] Scheduled match checker running every minute");
  console.log("\n✅ Bot fully operational!\n");
});

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) { console.error("❌ DISCORD_BOT_TOKEN not set"); process.exit(1); }
client.login(token);