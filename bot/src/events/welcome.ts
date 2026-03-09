import { Client, TextChannel } from "discord.js";
import { welcomeEmbed } from "../utils/embeds";

export function registerWelcomeEvent(client: Client): void {
  client.on("guildMemberAdd", async (member) => {
    const channelId = process.env.WELCOME_CHANNEL_ID;
    if (!channelId) return;

    try {
      const ch = (await client.channels.fetch(channelId)) as TextChannel;
      if (!ch) return;

      await ch.send({
        content: `Welcome <@${member.id}> to the server! 🎉 Queue opens daily for Dota games at **9 PM IST**. Type \`/queue join\` to join tonight's match.`,
        embeds: [welcomeEmbed()],
      });
    } catch (err: any) {
      console.error("[Welcome]", err.message);
    }
  });
}
