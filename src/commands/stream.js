import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getOrCreateStream, advanceStream, recentEvents } from '../game/world/store.js';
import { setStreamChannel, setPlayChannel, clearPlayChannel, getPlayChannel, setPrefix, clearPrefix, getPrefix } from '../game/world/echoes.js';
import { getScenario } from '../game/scenarios/engine.js';
import { config } from '../config.js';
import { panel, streamPanel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder()
  .setName('stream')
  .setDescription('Server Star Stream status')
  .addSubcommand((s) => s.setName('status').setDescription('Show this server’s shared stream'))
  .addSubcommand((s) =>
    s.setName('advance').setDescription('(Admin) move the server stream to a scenario').addStringOption((o) => o.setName('scenario').setDescription('Scenario id, e.g. 001').setRequired(true))
  )
  .addSubcommand((s) =>
    s.setName('set-channel').setDescription('(Admin) where the Stream speaks unprompted').addChannelOption((o) => o.setName('channel').setDescription('Broadcast channel').setRequired(true))
  )
  .addSubcommand((s) =>
    s.setName('set-play').setDescription('(Admin) the one channel the bot answers in').addChannelOption((o) => o.setName('channel').setDescription('Play channel').setRequired(true))
  )
  .addSubcommand((s) => s.setName('clear-play').setDescription('(Admin) let the bot answer everywhere again'))
  .addSubcommand((s) => s.setName('set-prefix').setDescription('(Admin) custom prefix for this server').addStringOption((o) => o.setName('prefix').setDescription('1-5 chars, e.g. !').setRequired(true)))
  .addSubcommand((s) => s.setName('clear-prefix').setDescription('(Admin) back to the default prefix'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId || 'dm';
  if (sub === 'set-prefix' || sub === 'clear-prefix') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ ...verr('Only server admins can set the prefix.'), ephemeral: true });
    }
    if (!interaction.guildId) return interaction.reply({ ...verr('Server only.'), ephemeral: true });
    try {
      if (sub === 'set-prefix') {
        const clean = setPrefix(guildId, interaction.options.getString('prefix', true));
        return interaction.reply(panel({ title: '📡 PREFIX', body: `This server now answers to \`${clean}\` (e.g. \`${clean} status\`).` }));
      }
      clearPrefix(guildId);
      return interaction.reply(panel({ title: '📡 PREFIX', body: `Back to the default: \`${config.prefix}\`.` }));
    } catch (e) {
      return interaction.reply({ ...verr(e.message), ephemeral: true });
    }
  }
  if (sub === 'set-play' || sub === 'clear-play') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ ...verr('Only server admins can fence the Stream.'), ephemeral: true });
    }
    if (!interaction.guildId) return interaction.reply({ ...verr('Server channels only.'), ephemeral: true });
    if (sub === 'set-play') {
      const ch = interaction.options.getChannel('channel', true);
      setPlayChannel(guildId, ch.id);
      return interaction.reply(panel({ title: '📡 FENCED', body: `The Stream now answers only in <#${ch.id}>. (/stream itself still answers everywhere.)` }));
    }
    clearPlayChannel(guildId);
    return interaction.reply(panel({ title: '📡 OPEN', body: 'The fence is down. The Stream answers everywhere again.' }));
  }
  if (sub === 'set-channel') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ ...verr('Only server admins can invite the Stream to speak.'), ephemeral: true });
    }
    if (!interaction.guildId) return interaction.reply({ ...verr('Server channels only.'), ephemeral: true });
    setStreamChannel(guildId, interaction.options.getChannel('channel', true).id);
    return interaction.reply(panel({ title: '📡 INVITED', body: 'The Stream will speak here — echoes, Dokkaebi asides, nothing you asked for.' }));
  }
  if (sub === 'advance') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ ...verr('Only server admins can advance the Star Stream.'), ephemeral: true });
    }
    const id = interaction.options.getString('scenario', true);
    if (!getScenario(id)) return interaction.reply({ ...verr('Unknown scenario.'), ephemeral: true });
    advanceStream(guildId, id);
    return interaction.reply(panel({ title: '📡 TURNED', body: `The Star Stream turns to Scenario **${id}**.` }));
  }
  const stream = getOrCreateStream(guildId);
  const sc = getScenario(stream.current_scenario);
  const events = recentEvents(guildId, 5);
  const history = events.length ? events.map((e) => `• ${e.summary}`).join('\n') : 'No history yet — this server’s story is unwritten.';
  await interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '📡 STAR STREAM', bodyLines: `**${sc ? sc.title : 'Unknown'}** (server scenario: ${stream.current_scenario})\n${getPlayChannel(guildId) ? `Plays only in <#${getPlayChannel(guildId)}>\n` : ''}\n__Server history__\n${history}`.split('\n') }));
}
