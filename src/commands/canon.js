import { SlashCommandBuilder } from 'discord.js';
import { computeDivergence, pressureFor, milestoneStatus, milestones } from '../game/canon/divergence.js';
import { recentEvents } from '../game/world/store.js';
import { getDb } from '../database/db.js';
import { streamPanel } from '../utils/v2.js';

export const bar = (pct) => {
  const full = Math.round(Math.max(0, Math.min(100, pct)) / 10);
  return '█'.repeat(full) + '░'.repeat(10 - full);
};

export const data = new SlashCommandBuilder()
  .setName('canon')
  .setDescription('Canon is the expected path. Your server is what happened.')
  .addSubcommand((s) => s.setName('status').setDescription('Divergence score and canon pressure'))
  .addSubcommand((s) => s.setName('divergence').setDescription('What broke vs what held'))
  .addSubcommand((s) => s.setName('timeline').setDescription('Milestones: expected vs actual'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId || 'dm';
  const div = computeDivergence(guildId);
  const pressure = pressureFor(div.band);

  if (sub === 'divergence') {
    const broken = div.broken.length ? div.broken.map((b) => `✗ [${b.scenario}] ${b.actual} (+${b.points}) — canon: ${b.canon}`).join('\n') : '_Nothing broken. Suspiciously obedient._';
    const intact = div.intact.length ? div.intact.map((b) => `✓ [${b.scenario}] ${b.canon}`).join('\n') : '_Nothing intact._';
    return interaction.reply(streamPanel({ level: 'major', icon: '🚨', title: `⚖️ DIVERGENCE ${div.score} (${div.band.toUpperCase()})`, bodyLines: `__Broken__\n${broken}\n\n__Held__\n${intact}`.split('\n') }));
  }
  if (sub === 'timeline') {
    const kinds = [...new Set(recentEvents(guildId, 200).map((e) => e.kind))];
    const flags = Object.fromEntries(getDb().prepare('SELECT key, value FROM server_flags WHERE guild_id = ?').all(guildId).map((r) => [r.key, r.value]));
    const alters = getDb().prepare('SELECT COUNT(*) v FROM scenario_instances WHERE guild_id = ? AND altered = 1').get(guildId).v;
    const rows = milestoneStatus(milestones, { flags, eventKinds: kinds, alters });
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '📖 CANON TIMELINE vs ACTUAL', bodyLines: rows.map((m) => `${m.held ? '✓' : '✗'} ${m.canon}`).join('\n').split('\n') }));
  }
  return interaction.reply(streamPanel({
    level: 'system', icon: '🌌', title: '⚖️ CANON STATUS',
    bodyLines: `Divergence: **${div.score}** (${div.band.toUpperCase()})   Canon memory: ${bar(div.canonMemory)} ${div.canonMemory}%\n\n${pressure.note}`.split('\n'),
  }));
}

export { bar as canonBar };
