import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { getPlayerParty } from '../game/parties/store.js';
import { getDb } from '../database/db.js';
import { teamHistory } from '../game/cards/collection.js';
import { allRelations } from '../game/nebulas/store.js';
import { streamPanel, panel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder()
  .setName('team')
  .setDescription('Your living team card')
  .addSubcommand((s) => s.setName('card').setDescription('Current identity + history'))
  .addSubcommand((s) => s.setName('history').setDescription('Every roster this team ever held'));

function teamCardText(group, guildId) {
  const db = getDb();
  const members = group.members;
  const stories = [...new Set(members.flatMap((m) => db.prepare('SELECT story_id FROM player_stories WHERE discord_id = ?').all(m.discord_id).map((r) => r.story_id)))].slice(0, 6);
  const bonds = db.prepare('SELECT COUNT(*) v FROM bond_counters WHERE guild_id = ? AND honored = 1').get(guildId).v;
  const branch = db.prepare('SELECT path FROM chapter_branches WHERE guild_id = ? AND branch_key = ? ORDER BY id DESC LIMIT 1').get(guildId, `party:${group.party.id}`);
  const nebs = [...new Set(members.map((m) => db.prepare('SELECT nebula_id FROM nebula_members WHERE discord_id = ?').get(m.discord_id)?.nebula_id).filter(Boolean))];
  const foes = [...new Set(nebs.flatMap((n) => allRelations(guildId, n).filter((r) => ['Hostile', 'At War'].includes(r.state)).map((r) => r.name)))];
  return [
    `Leader\n${members[0]?.name || '—'}`, '',
    'Members', ...members.map((m) => m.name), '',
    'Stories', ...(stories.length ? stories.map((s) => `• [${s}]`) : ['_None yet._']), '',
    `Survived Together\n${bonds}`, '',
    `Current Route\n${branch?.path || 'undecided'}`, '',
    `Enemies\n${foes.length ? foes.join(', ') : 'none known'}`, '',
    'Status\nACTIVE',
  ].join('\n');
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  const group = getPlayerParty(p.discord_id);
  if (!group) return interaction.reply({ ...verr('No team. Parties write team cards.'), ephemeral: true });
  const cardId = `team_${group.party.id}`;
  if (sub === 'history') {
    const hist = teamHistory(cardId);
    if (!hist.length) return interaction.reply({ ...verr('No recorded rosters yet.'), ephemeral: true });
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🎴 TEAM HISTORY', bodyLines: hist.map((h) => `v${h.version}: ${h.members.join(', ')}`).join('\n').split('\n') }));
  }
  return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: `🎴 [The Survivors of ${group.party.name}]`, bodyLines: [teamCardText(group, interaction.guildId || 'dm')] }));
}
