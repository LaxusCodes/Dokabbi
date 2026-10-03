import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { activeSeason, seasonStatus, scoreServers, gatherServerRows, closeSeason } from '../game/seasons/season.js';
import { streamPanel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder()
  .setName('season')
  .setDescription('The season the whole Stream shares')
  .addSubcommand((s) => s.setName('status').setDescription('Premise, window, your server standing'))
  .addSubcommand((s) => s.setName('standings').setDescription('Server leaderboard by recorded history'))
  .addSubcommand((s) => s.setName('close').setDescription('(Admin) end season, recognize winners'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const season = activeSeason();
  if (!season && sub !== 'close') return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🌌 SEASON', bodyLines: ['No season runs now. The Stream rests.'] }));
  if (sub === 'status') {
    const st = seasonStatus(season);
    const board = scoreServers(season, gatherServerRows(season));
    const mine = board.findIndex((r) => r.guildId === (interaction.guildId || 'dm')) + 1;
    return interaction.reply(streamPanel({
      level: 'system',
      icon: '🌌',
      title: `🌌 SEASON — "${season.name}" (${st.state})`,
      bodyLines: `_${season.premise}_\n\n` +
        `Special: ${season.special.join(' | ')}\n` +
        `Scoring: ${season.scoring.map((s) => `${s.label} ×${s.weight}`).join(', ')}\n` +
        `Your server: ${mine ? `#${mine}` : 'unranked'} of ${board.length}\n` +
        `Top: ${board.slice(0, 3).map((r) => `${r.guildId} (${r.score})`).join(', ') || 'no one yet'}`.split('\n'),
    }));
  }
  if (sub === 'standings') {
    const board = scoreServers(season, gatherServerRows(season));
    if (!board.length) return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🏆 SEASON STANDINGS', bodyLines: ['No server has written anything yet.'] }));
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: `🏆 SEASON STANDINGS — "${season.name}"`, bodyLines: board.slice(0, 10).map((r, i) => `#${i + 1} Server ${r.guildId} — ${r.score}`).join('\n').split('\n') }));
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ ...verr('Only server admins can close a season.'), ephemeral: true });
  }
  const target = activeSeason() || season;
  if (!target) return interaction.reply({ ...verr('No season to close.'), ephemeral: true });
  const result = closeSeason(target.id);
  if (result.already) return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🏆 SEASON', bodyLines: ['Season already closed.'] }));
  return interaction.reply(streamPanel({
      level: 'system',
      icon: '🌌',
      title: `🏆 Season "${target.name}" closed`,
      bodyLines: result.winners.map((w) => `#${w.place} Server ${w.guildId} (${w.members} witnesses rewarded)`).join('\n') || 'No witnesses.',
    }));
}
