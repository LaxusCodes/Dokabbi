import { SlashCommandBuilder } from 'discord.js';
import { getDb } from '../database/db.js';
import { getChannel } from '../game/starstream/store.js';
import { computeDivergence } from '../game/canon/divergence.js';
import { prestigeOf } from '../game/cards/collection.js';
import { panel } from '../utils/v2.js';

export const data = new SlashCommandBuilder().setName('server').setDescription('What this server is famous for');

export async function execute(interaction) {
  const guildId = interaction.guildId || 'dm';
  const db = getDb();
  const channel = getChannel(guildId);
  const div = computeDivergence(guildId);
  const events = db.prepare('SELECT COUNT(*) v FROM world_events WHERE guild_id = ?').get(guildId).v;
  const anomalies = db.prepare("SELECT COUNT(*) v FROM world_events WHERE guild_id = ? AND summary LIKE '%CANON%'").get(guildId).v;
  const collisions = db.prepare('SELECT COUNT(*) v FROM chapter_collisions WHERE guild_id = ?').get(guildId).v;
  const prestige = prestigeOf({ channelValue: channel.channel_value, divergence: div.score, events, anomalies, collisions });
  const legends = db.prepare(
    `SELECT p.name, COUNT(*) n FROM scenario_log s JOIN players p ON p.discord_id = s.discord_id GROUP BY s.discord_id ORDER BY n DESC LIMIT 3`
  ).all();
  await interaction.reply(panel({
    title: `🌌 SERVER PRESTIGE — ${prestige.title.toUpperCase()} (${prestige.score})`,
    body: `Channel value ${channel.channel_value} • Divergence ${div.score} (${div.band}) • ${events} world events • ${anomalies} anomalies • ${collisions} collisions\n\n` +
      `__Legends of this server__\n${legends.length ? legends.map((l, i) => `#${i + 1} ${l.name} — ${l.n} scenario choices`) : '_No legends yet._'}\n\n` +
      `-# Prestige is earned by events, never by grinding.`,
  }));
}
