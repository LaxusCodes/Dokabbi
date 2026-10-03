import { SlashCommandBuilder } from 'discord.js';
import { getDb } from '../database/db.js';
import { panel, streamPanel } from '../utils/v2.js';

export const data = new SlashCommandBuilder().setName('rankings').setDescription('Star Stream rankings');

export async function execute(interaction) {
  const rows = getDb().prepare('SELECT name, level, coins, scenario_progress FROM players ORDER BY level DESC, coins DESC LIMIT 10').all();
  if (!rows.length) return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🏆 STAR STREAM RANKINGS', bodyLines: ['No incarnations yet. Use /register.'] }));
  const lines = rows.map((r, i) => `${i + 1}. **${r.name}** — Lv ${r.level} • ${r.coins} coins • scenario #${r.scenario_progress}`);
  await interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🏆 STAR STREAM RANKINGS', bodyLines: lines.join('\n').split('\n') }));
}
