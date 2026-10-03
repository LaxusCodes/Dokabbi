import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import { config } from './config.js';

// Single source of truth for slash registration, used by both
// `npm run deploy` and the guarded auto-deploy on boot.
export async function collectCommands() {
  const commands = [];
  const dir = path.join(process.cwd(), 'src', 'commands');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    try {
      const mod = await import(pathToFileURL(path.join(dir, file)).href);
      if (mod.data) commands.push(mod.data.toJSON());
    } catch (e) {
      console.error(`deploy: skipping ${file}: ${e.message}`);
    }
  }
  return commands;
}

export async function deployCommands() {
  if (!config.token || config.token === 'put_token_here') throw new Error('DISCORD_TOKEN missing — cannot deploy commands.');
  if (!config.clientId || config.clientId === 'put_client_id_here') throw new Error('CLIENT_ID missing — cannot deploy commands.');
  const rest = new REST().setToken(config.token);
  const commands = await collectCommands();
  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
    console.log(`Deployed ${commands.length} guild commands.`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    console.log(`Deployed ${commands.length} global commands (can take up to an hour to appear).`);
  }
  return commands.length;
}
