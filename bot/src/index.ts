import {
  Client,
  GatewayIntentBits,
  Events,
  TextChannel,
  Collection,
  Partials,
  ChannelType,
} from "discord.js";
import * as dotenv from "dotenv";
import * as cron from "node-cron";

dotenv.config();

import { initFirebase, getDb } from "./services/firebase";
import { getDotaBot } from "./services/dota-gc";
import { resolveDotaResults } from "./services/dota-results";
import { startBotLobbyControl } from "./services/bot-lobby";
import { sendPreMatchWarning, startMatchLobby } from "./services/match-orchestrator";
import { handleButton } from "./events/button-handler";
import { handleModal } from "./events/modal-handler";
import { registerWelcomeEvent } from "./events/welcome";
import { registerVcTracker } from "./services/vc-tracker";
import { registerVoicePanel } from "./services/voice-panel";
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
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
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
registerVcTracker(client);
registerVoicePanel(client);

// ─── DM Reply Forwarding ────────────────────────────────────
// When someone replies to a bot DM, forward it to a channel so admins can see it.
client.on(Events.MessageCreate, async (message) => {
  // Only handle DMs, ignore bot's own messages
  if (message.channel.type !== ChannelType.DM) return;
  if (message.author.bot) return;

  const forwardChannelId = process.env.DM_FORWARD_CHANNEL_ID || "1491455654370742324";
  if (!forwardChannelId) return;

  try {
    const channel = await client.channels.fetch(forwardChannelId) as TextChannel;
    if (!channel) return;

    const content = message.content.length > 1800
      ? message.content.slice(0, 1800) + "..."
      : message.content;

    await channel.send(
      `📩 **DM from <@${message.author.id}>** (${message.author.tag}):\n> ${content.split("\n").join("\n> ")}`
    );
  } catch (err: any) {
    console.error("[DM Forward]", err.message);
  }
});

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

  // Web-driven bot lobby control (command channel + live state).
  try { startBotLobbyControl(getDb()); } catch (e: any) { console.error("[BotLobby] init failed:", e?.message || e); }

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

  const warningsSent = new Set<string>();
  const lobbiesStarted = new Set<string>();

  cron.schedule("* * * * *", async () => {
    try {
      const now = Date.now();
      // ✅ BUG FIX: Query for BOTH "open" queues AND double-check against in-memory set.
      // The Firestore status update inside startMatchLobby is async and can race.
      const snap = await getDb()
        .collection("botQueues")
        .where("status", "==", "open")
        .get();

      for (const doc of snap.docs) {
        const queue = { ...doc.data(), id: doc.id } as any;
        if (!queue.scheduledTime) continue;

        // ✅ BUG FIX: Skip if already handled this session (guards against
        // the race window between cron firing and Firestore status updating)
        if (lobbiesStarted.has(queue.id)) continue;
        if (warningsSent.has(queue.id) && lobbiesStarted.has(queue.id)) continue;

        const matchTime = new Date(queue.scheduledTime).getTime();
        const minsUntil = (matchTime - now) / 60000;

        // 10-min warning
        if (minsUntil <= 10 && minsUntil > 9 && !warningsSent.has(queue.id)) {
          warningsSent.add(queue.id);
          console.log(`[Cron] Sending 10-min warning for: ${queue.name}`);
          await sendPreMatchWarning(client, queue);
        }

        // Match time — only fire once, immediately mark in memory before awaiting
        if (minsUntil <= 0 && minsUntil > -2) {
          // ✅ Add to set BEFORE awaiting startMatchLobby to prevent double-fire
          // if cron ticks again while startMatchLobby is still running (it can take 30s)
          lobbiesStarted.add(queue.id);
          console.log(`[Cron] ✅ Starting match for: ${queue.name} (${queue.id})`);
          try {
            await startMatchLobby(client, queue);
          } catch (err: any) {
            console.error(`[Cron] startMatchLobby error: ${err.message}`);
            // Remove from set so it can retry next minute if it hard-failed
            lobbiesStarted.delete(queue.id);
          }
        }
      }
    } catch (err: any) {
      console.error("[Cron] Error:", err.message);
    }
  });

  console.log("[Cron] Scheduled match checker running every minute");

  // ─── Dota result-fetch jobs ──────────────────────────────────
  // Admin/web writes a doc to `dotaResultJobs`:
  //   { tournamentId, status:"pending", apply?:true, forcedMatchIds?:[] }
  // The bot already holds the GC session, so it resolves bot-hosted
  // practice/custom lobbies (which no public API can serve) with no
  // Steam single-session conflict, then writes results + a report.
  const jobsRunning = new Set<string>();
  cron.schedule("* * * * *", async () => {
    try {
      const snap = await getDb()
        .collection("dotaResultJobs")
        .where("status", "==", "pending")
        .get();
      for (const doc of snap.docs) {
        if (jobsRunning.has(doc.id)) continue;
        jobsRunning.add(doc.id);
        const job = doc.data() as any;
        const tid = job.tournamentId;
        if (!tid) { await doc.ref.set({ status: "error", error: "missing tournamentId", updatedAt: new Date().toISOString() }, { merge: true }); continue; }
        console.log(`[DotaJob] ▶ ${doc.id} tournament=${tid}`);
        await doc.ref.set({ status: "processing", updatedAt: new Date().toISOString() }, { merge: true });
        try {
          const logs: string[] = [];
          const report = await resolveDotaResults(getDb(), {
            tournamentId: tid,
            apply: job.apply !== false,
            forcedMatchIds: Array.isArray(job.forcedMatchIds) ? job.forcedMatchIds.map(String) : [],
            log: (s) => { logs.push(s); console.log(`[DotaJob] ${s}`); },
          });
          await doc.ref.set({ status: "done", report, logs: logs.slice(-200), updatedAt: new Date().toISOString() }, { merge: true });
          console.log(`[DotaJob] ✅ ${doc.id} resolved=${report.resolved.length} unresolved=${report.unresolved.length}`);
        } catch (err: any) {
          await doc.ref.set({ status: "error", error: String(err?.message || err), updatedAt: new Date().toISOString() }, { merge: true });
          console.error(`[DotaJob] ✗ ${doc.id}: ${err?.message || err}`);
        } finally {
          jobsRunning.delete(doc.id);
        }
      }
    } catch (err: any) {
      console.error("[DotaJob] Error:", err.message);
    }
  });
  console.log("[Cron] Dota result-job consumer running every minute");

  // ─── Discord-side command bus ────────────────────────────────────────────
  // Lets web admin enqueue Discord operations (mainly VC evacuation) that
  // need the bot's Discord.js Gateway voice state cache — REST alone can't
  // enumerate voice channel members.
  //
  // Queue: `botDiscordCommands/{id}` {action, params, status:"pending"}
  // Actions:
  //   - evacuate_vc {vcId, fallbackVcId}: move every member in vcId → fallbackVcId
  //
  // After processing, bot writes {status:"done"|"error", result, error}.
  // Web typically waits ~2s after enqueue then deletes the VC, so by the
  // time the channel disappears Discord has already moved everyone.
  const discordOpsRunning = new Set<string>();
  getDb().collection("botDiscordCommands").where("status", "==", "pending").onSnapshot(async (snap) => {
    for (const d of snap.docs) {
      if (discordOpsRunning.has(d.id)) continue;
      discordOpsRunning.add(d.id);
      const cmd = d.data() as any;
      try {
        await d.ref.set({ status: "processing", updatedAt: new Date().toISOString() }, { merge: true });
        let result: any = null;
        if (cmd.action === "evacuate_vc") {
          const vcId = String(cmd.params?.vcId || "");
          const fallbackVcId = String(cmd.params?.fallbackVcId || "");
          if (!vcId || !fallbackVcId) throw new Error("evacuate_vc requires vcId and fallbackVcId");
          const guildId = process.env.DISCORD_GUILD_ID!;
          const guild = await client.guilds.fetch(guildId);
          const channel = await guild.channels.fetch(vcId).catch(() => null);
          if (!channel || !channel.isVoiceBased()) {
            result = { ok: false, reason: "channel not found / not voice-based", vcId };
          } else {
            const members = Array.from(channel.members.values());
            let movedCount = 0;
            const movedIds: string[] = [];
            for (const m of members) {
              try { await m.voice.setChannel(fallbackVcId); movedCount++; movedIds.push(m.id); }
              catch (e: any) { console.warn(`[Discord] evacuate move failed for ${m.id}: ${e?.message || e}`); }
            }
            result = { ok: true, movedCount, totalMembers: members.length, movedIds };
            console.log(`[Discord] evacuated ${movedCount}/${members.length} from ${vcId} → ${fallbackVcId}`);
          }
        } else {
          result = { ok: false, reason: `unknown action "${cmd.action}"` };
        }
        await d.ref.set({ status: "done", result, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (e: any) {
        await d.ref.set({ status: "error", error: String(e?.message || e), updatedAt: new Date().toISOString() }, { merge: true });
        console.error(`[Discord] command ${d.id} error: ${e?.message || e}`);
      } finally {
        discordOpsRunning.delete(d.id);
      }
    }
  }, (err) => console.error("[botDiscordCommands] snapshot error:", err?.message || err));
  console.log("[botDiscordCommands] consumer running (evacuate_vc etc)");

  console.log("\n✅ Bot fully operational!\n");
});

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) { console.error("❌ DISCORD_BOT_TOKEN not set"); process.exit(1); }

process.on("SIGTERM", () => {
  console.log("[Steam] SIGTERM received — logging off cleanly...");
  try { getDotaBot().disconnect(); } catch {}
  setTimeout(() => process.exit(0), 2000);
});
 
process.on("SIGINT", () => {
  console.log("[Steam] SIGINT received — logging off cleanly...");
  try { getDotaBot().disconnect(); } catch {}
  setTimeout(() => process.exit(0), 2000);
});
 
client.login(token);