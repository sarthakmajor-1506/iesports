import { REST, Routes } from "discord.js";
import * as dotenv from "dotenv";
dotenv.config();

import { linksteamData, matchresultData } from "./commands/slash-commands";

const commands = [linksteamData.toJSON(), matchresultData.toJSON()];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN!);

(async () => {
  console.log(`Registering ${commands.length} commands...`);
  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID!, process.env.DISCORD_GUILD_ID!),
    { body: commands }
  );
  console.log("✅ Done:", commands.map((c) => `/${c.name}`).join(", "));
})();
