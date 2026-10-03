import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { getDb } from '../database/db.js';
import { gatherStats } from '../game/titles/queries.js';
import { compareText } from '../game/social/fame.js';
import { streamPanel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder()
  .setName('compare')
  .setDescription('Two incarnations, side by side')
  .addUserOption((o) => o.setName('first').setDescription('First incarnation to compare (yours if omitted)').setRequired(false))
  .addUserOption((o) => o.setName('second').setDescription('Second incarnation to compare (yours if first is omitted)').setRequired(false));

function sheet(id, guildId) {
  const db = getDb();
  const p = getPlayer(id);
  const s = gatherStats(id, guildId);
  return {
    level: p?.level || 0,
    stories: s.stories,
    clears: s.clears,
    wins: s.wins,
    trade_volume: db.prepare('SELECT value FROM title_counters WHERE discord_id = ? AND key = ?').get(id, 'trade_volume')?.value || 0,
    favor_max: s.favor_max,
    world_events: s.world_events,
    titles: db.prepare('SELECT COUNT(*) v FROM player_titles WHERE discord_id = ?').get(id).v,
  };
}

export async function execute(interaction) {
  const a = interaction.options.getUser('first');
  const b = interaction.options.getUser('second');
  const guildId = interaction.guildId || 'dm';
  const me = interaction.user.id;
  const firstId = a ? a.id : me;
  const secondId = b ? b.id : (a ? me : firstId);
  if (!getPlayer(firstId) || !getPlayer(secondId)) {
    return interaction.reply({ ...verr('Both must be registered incarnations. Try `/compare first:<user> second:<user>`.'), ephemeral: true });
  }
  const db = getDb();
  const aName = db.prepare('SELECT name FROM players WHERE discord_id = ?').get(firstId).name;
  const bName = db.prepare('SELECT name FROM players WHERE discord_id = ?').get(secondId).name;
  return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '⚖️ COMPARISON', bodyLines: compareText(aName, bName, sheet(firstId, guildId), sheet(secondId, guildId)).split('\n') }));
}
