import { ModalSubmitInteraction, TextChannel } from "discord.js";
import { createQueue, updateQueue, QueueDoc } from "../services/firebase";
import { queueEmbed } from "../utils/embeds";
import { queueButtons } from "../utils/buttons";

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId === "create_queue_modal") {
    await handleCreateQueueModal(interaction);
  }
}

async function handleCreateQueueModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply();

  const name = interaction.fields.getTextInputValue("queue_name");
  const type = interaction.fields.getTextInputValue("queue_type").toLowerCase() as "free" | "wager" | "sponsored";
  const fee = parseInt(interaction.fields.getTextInputValue("queue_fee") || "0") || 0;
  const timeStr = interaction.fields.getTextInputValue("queue_time") || "";
  const max = parseInt(process.env.MAX_QUEUE_SIZE || "10") || 10;

  const validTypes = ["free", "wager", "sponsored"];
  if (!validTypes.includes(type)) {
    await interaction.editReply("❌ Type must be: free, wager, or sponsored");
    return;
  }

  // Parse scheduled time — accepts "21:00", "9:00 PM", "9PM", "2100"
  let scheduledTime: string | null = null;
  if (timeStr.trim()) {
    try {
      const now = new Date();
      let hours = 0;
      let minutes = 0;

      const cleaned = timeStr.trim().toUpperCase();

      // Try "HH:MM" or "H:MM"
      const colonMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
      if (colonMatch) {
        hours = parseInt(colonMatch[1]);
        minutes = parseInt(colonMatch[2]);
        if (colonMatch[3] === "PM" && hours < 12) hours += 12;
        if (colonMatch[3] === "AM" && hours === 12) hours = 0;
      }
      // Try "9PM", "9 PM", "10AM"
      else {
        const ampmMatch = cleaned.match(/^(\d{1,2})\s*(AM|PM)$/);
        if (ampmMatch) {
          hours = parseInt(ampmMatch[1]);
          if (ampmMatch[2] === "PM" && hours < 12) hours += 12;
          if (ampmMatch[2] === "AM" && hours === 12) hours = 0;
        }
        // Try "2100" (24h format)
        else if (/^\d{4}$/.test(cleaned)) {
          hours = parseInt(cleaned.slice(0, 2));
          minutes = parseInt(cleaned.slice(2));
        }
      }

      // Build date in IST (today or tomorrow if time has passed)
      const scheduled = new Date(now);
      // Convert IST input to UTC: IST = UTC+5:30
      scheduled.setUTCHours(hours - 5, minutes - 30, 0, 0);

      // If the time has already passed today, schedule for tomorrow
      if (scheduled.getTime() < now.getTime()) {
        scheduled.setDate(scheduled.getDate() + 1);
      }

      scheduledTime = scheduled.toISOString();
    } catch {
      // Invalid time — just ignore and create without schedule
    }
  }

  const queueData: Omit<QueueDoc, "id"> = {
    name,
    type,
    entryFee: fee,
    bonus: 0,
    sponsorId: null,
    scheduledTime,
    players: [],
    maxPlayers: max,
    status: "open",
    createdAt: new Date().toISOString(),
    createdBy: interaction.user.id,
    lobbyId: null,
    messageId: null,
  };

  const queueId = await createQueue(queueData);

  // Post queue embed in #queue channel
  const queueChannelId = process.env.QUEUE_CHANNEL_ID;
  const targetChannel = queueChannelId
    ? ((await interaction.client.channels.fetch(queueChannelId)) as TextChannel)
    : (interaction.channel as TextChannel);

  const embed = queueEmbed({ ...queueData, id: queueId });
  const msg = await targetChannel.send({
    embeds: [embed],
    components: [queueButtons(queueId)],
  });

  await updateQueue(queueId, { messageId: msg.id });

  const timeDisplay = scheduledTime
    ? new Date(scheduledTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
    : "no scheduled time";

  await interaction.editReply(`✅ Queue **${name}** created! Scheduled: ${timeDisplay} IST\nQueue posted in ${targetChannel}`);
}