import { SlashCommandBuilder } from 'discord.js';
import { recentEvents, getOrCreateStream, allFlags, allInstances } from '../game/world/store.js';
import { pastGlobals } from '../game/scenarios/store.js';
import { buildTimeline } from '../game/world/timeline.js';
import { liveFeed } from '../game/starstream/channel.js';
import { streamPanel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder()
  .setName('world')
  .setDescription("What this server's Star Stream remembers")
  .addSubcommand((s) => s.setName('history').setDescription('Recent world events'))
  .addSubcommand((s) => s.setName('timeline').setDescription("The server's own Story"))
  .addSubcommand((s) => s.setName('stream').setDescription('Live Star Stream feed'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId || 'dm';
  if (sub === 'stream') {
    const events = recentEvents(guildId, 30);
    if (!events.length) return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '📡 STAR STREAM — LIVE', bodyLines: ['Static. Nothing has happened yet — fix that.'] }));
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '📡 STAR STREAM — LIVE', bodyLines: [liveFeed(events, guildId).slice(0, 3500)] }));
  }
  if (sub === 'timeline') {
    const text = buildTimeline({
      stream: getOrCreateStream(guildId),
      instances: allInstances(guildId),
      globals: pastGlobals(guildId, 5),
      events: recentEvents(guildId, 50),
      flags: allFlags(guildId),
    });
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🌍 SERVER TIMELINE', bodyLines: [text.slice(0, 3800)] }));
  }
  const events = recentEvents(guildId, 10).reverse();
  if (!events.length) return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🌍 THE WORLD REMEMBERS', bodyLines: ['Nothing yet. Make a choice in a scenario.'] }));
  await interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🌍 THE WORLD REMEMBERS', bodyLines: [events.map((e) => `• ${e.summary}`).join('\n')] }));
}
