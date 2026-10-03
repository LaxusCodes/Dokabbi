import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client, Collection, GatewayIntentBits, Events } from 'discord.js';
import { config } from './config.js';
import { getDb } from './database/db.js';
import { registerNebulaListeners } from './game/nebulas/events.js';
import { registerLivingCardListeners } from './game/cards/living.js';
import { registerSpectacleListeners } from './game/starstream/listeners.js';
import { registerCharacterListeners } from './game/characters/actions.js';
import { pumpAll } from './game/starstream/ambient.js';
import { handlePrefixMessage } from './prefix.js';
import { parsePageId } from './utils/interactions.js';
import { getPlayChannel, channelAllowed, getPrefix } from './game/world/echoes.js';
import { deployCommands } from './deploy.js';
import { verr } from './utils/v2.js';

getDb(); // ensure schema
registerNebulaListeners();
registerLivingCardListeners();
registerSpectacleListeners();
registerCharacterListeners();
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
client.commands = new Collection();
// Never let a Discord socket error become an uncaught 'error' event (process crash).
client.on(Events.Error, (e) => console.error('client error:', e?.message || e));

// Component menus that re-enter the prefix router (orvnav/orvobs/orvpve)
// can run heavy work (battles, DB writes) before their first ack — the 3s
// token then dies with 10062 Unknown interaction. Ack upfront so every
// answer below flows through followUp; swallow only the expired-token case.
async function ackComponent(interaction) {
  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply({ ephemeral: true });
    }
    return true;
  } catch {
    return false; // already gone — nothing to answer
  }
}

function fakePrefixReply(interaction) {
  return async (payload) => {
    const ephemeralPayload = { ...payload, ephemeral: true };
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply(ephemeralPayload);
      } else {
        await interaction.followUp(ephemeralPayload);
      }
    } catch (e) {
      if (e?.code !== 10062) throw e;
      // expired between work and answer — nothing left to show
    }
  };
}

const commandsDir = path.join(process.cwd(), 'src', 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
    try {
      const mod = await import(pathToFileURL(path.join(commandsDir, file)).href);
      if (mod.data && mod.execute) client.commands.set(mod.data.name, mod);
    } catch (e) {
      console.error(`Failed to load command file ${file}:`, e.message);
    }
  }

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Play-channel gate: admins always pass (to bootstrap), everyone else plays where allowed.
    const allowed = interaction.guildId ? getPlayChannel(interaction.guildId) : null;
    const isAdmin = interaction.memberPermissions?.has('Administrator');
    const gated = (name) => name !== 'stream' && allowed && !channelAllowed(allowed, interaction.channelId) && !isAdmin;
    if (interaction.isChatInputCommand()) {
      if (gated(interaction.commandName)) {
        return interaction.reply({ ...verr(`The Stream only plays in <#${allowed}> on this server.`), ephemeral: true });
      }
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction);
    } else if (allowed && !channelAllowed(allowed, interaction.channelId) && !isAdmin) {
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({ ...verr(`The Stream only plays in <#${allowed}> on this server.`), ephemeral: true });
      }
      return;
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('scenario:')) {
      const scenario = client.commands.get('scenario');
      if (scenario?.handleMenu) await scenario.handleMenu(interaction);
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('orvnav:')) {
      // Global prefix nav: `Jump to…` dropdown on every `orv ...` reply.
      // Reuse the prefix renderer with a fake Message, answer privately
      // so the public menu stays put for everyone else.
      const picked = interaction.values?.[0] || 'help';
      const prefix = getPrefix(interaction.guildId);
      if (!(await ackComponent(interaction))) return;
      const fake = {
        content: `${prefix} ${picked}`,
        author: { id: interaction.user.id },
        guildId: interaction.guildId,
        reply: fakePrefixReply(interaction),
      };
      await handlePrefixMessage(fake, prefix);
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('orvobs:')) {
      // Observe picker: run `orv observe <subway|station>` for the clicker.
      const focus = interaction.values?.[0] || '';
      const prefix = getPrefix(interaction.guildId);
      if (!(await ackComponent(interaction))) return;
      const fake = {
        content: `${prefix} observe ${focus}`,
        author: { id: interaction.user.id },
        guildId: interaction.guildId,
        reply: fakePrefixReply(interaction),
      };
      await handlePrefixMessage(fake, prefix);
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('orvpve:')) {
      // PVE picker: run `orv pve <monster>` for the clicker.
      const monster = interaction.values?.[0] || '';
      const prefix = getPrefix(interaction.guildId);
      if (!(await ackComponent(interaction))) return;
      const fake = {
        content: `${prefix} pve ${monster}`,
        author: { id: interaction.user.id },
        guildId: interaction.guildId,
        reply: fakePrefixReply(interaction),
      };
      await handlePrefixMessage(fake, prefix);
    } else if (interaction.isButton()) {
      const pg = parsePageId(interaction.customId);
      if (pg?.ns === 'help') {
        const { renderHelpPage } = await import('./game/help/pages.js');
        await interaction.update(renderHelpPage(pg.page, getPrefix(interaction.guildId)));
      } else if (pg?.ns === 'market') {
        const market = await import('./commands/market.js');
        await interaction.update(market.renderMarketPage(interaction.guildId || 'dm', pg.page));
      } else if (pg?.ns === 'tut') {
        // Strangers can't flip your book: public pages carry owner id.
        if (pg.owner && pg.owner !== interaction.user.id) {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ ...verr(`That book belongs to <@${pg.owner}> — run \`orv tutorial\` to get your own.`), ephemeral: true });
          }
          return;
        }
        const { renderTutorialPage } = await import('./game/tutorial/pages.js');
        const payload = renderTutorialPage(pg.page, pg.owner || null);
        // Ephemeral flag is only legal when the source message is ephemeral
        // (slash /tutorial). Prefix pages are public — drop it or update() 400s.
        if (!interaction.message?.ephemeral) delete payload.ephemeral;
        await interaction.update(payload);
      } else if (interaction.customId === 'daily:claim') {
        const daily = client.commands.get('daily');
        if (daily?.handleClaimButton) await daily.handleClaimButton(interaction);
      } else if (interaction.customId.startsWith('stream:tutorial')) {
        const register = client.commands.get('register');
        if (register?.handleTutorialButton) await register.handleTutorialButton(interaction);
      } else if (interaction.customId.startsWith('tutdone:profile:')) {
        const profile = client.commands.get('profile');
        if (profile?.handleViewProfileButton) await profile.handleViewProfileButton(interaction);
      } else if (interaction.customId.startsWith('tutdone:scenario:')) {
        const scenario = client.commands.get('scenario');
        if (scenario?.handleEnterScenarioButton) await scenario.handleEnterScenarioButton(interaction);
      } else if (interaction.customId.startsWith('ch:')) {
        const chapter = client.commands.get('chapter');
        if (chapter?.handlePathButton) await chapter.handlePathButton(interaction);
      } else if (interaction.customId.startsWith('auc:')) {
        const auction = await import('./commands/auction.js');
        await auction.handleAuctionButton(interaction);
      } else if (interaction.customId.startsWith('pvp:')) {
        const pvp = client.commands.get('pvp');
        if (pvp?.handlePvpButton) await pvp.handlePvpButton(interaction);
      }
    } else if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('auc-bid:')) {
        const auction = await import('./commands/auction.js');
        await auction.handleBidModal(interaction);
      }
    } else if (interaction.isAutocomplete()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd?.handleAutocomplete) await cmd.handleAutocomplete(interaction);
    }
  } catch (e) {
    console.error(e);
    // The error path itself can fail (e.g. 10062 Unknown interaction on an
    // expired token) — that must never become an unhandled rejection crash.
    try {
      if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ ...verr('The stream flickers... an error occurred.'), ephemeral: true });
      } else if (interaction.isRepliable?.() && (interaction.replied || interaction.deferred)) {
        await interaction.followUp({ ...verr('The stream flickers... an error occurred.'), ephemeral: true });
      }
    } catch {
      // interaction already gone — nothing left to show
    }
  }
});

client.once(Events.ClientReady, (c) => {
  console.log(`Star Stream online as ${c.user.tag} (prefix "${config.prefix}")`);
  // Self-healing registration: slash commands deploy on every boot.
  // Never fatal — a deploy failure must not take the bot down.
  deployCommands()
    .then((n) => console.log(`Slash commands ensured (${n}).`))
    .catch((e) => console.error(`Auto-deploy skipped: ${e.message}`));
  // The Stream speaks unprompted every 5 minutes — only where invited.
  setInterval(() => {
    pumpAll(c).catch((e) => console.error('pump failed:', e.message));
  }, 5 * 60_000).unref?.();
});
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    const allowed = message.guildId ? getPlayChannel(message.guildId) : null;
    if (allowed && !channelAllowed(allowed, message.channelId)) return; // silent outside the play channel
    await handlePrefixMessage(message, getPrefix(message.guildId));
  } catch (e) {
    console.error(e);
  }
});

if (!config.token || config.token === 'put_token_here') {
  console.log('No DISCORD_TOKEN set — copy .env.example to .env and run `npm run deploy` then `npm start`.');
  process.exit(0);
}
// Last resort: log, never exit. A single expired interaction must not take the Stream down.
process.on('unhandledRejection', (e) => console.error('unhandled rejection:', e?.message || e));
client.login(config.token);
