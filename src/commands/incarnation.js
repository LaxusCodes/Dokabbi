import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { assembleRecord, recordText } from '../game/incarnations/record.js';
import { retireLegacy, reincarnate } from '../game/incarnations/lifecycle.js';
import { askConfirm } from '../utils/interactions.js';
import { getDb } from '../database/db.js';
import { streamPanel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder()
  .setName('incarnation')
  .setDescription('A life in the Stream, not a checklist')
  .addSubcommand((s) => s.setName('record').setDescription('Your full incarnation record').addUserOption((o) => o.setName('who').setDescription('Whose record')))
  .addSubcommand((s) => s.setName('legacy').setDescription('Retire at your height (level 3+, one-way until rebirth)'))
  .addSubcommand((s) => s.setName('reincarnate').setDescription('Begin a new life carrying ONE story').addStringOption((o) => o.setName('story').setDescription('Story id to inherit').setRequired(true)));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId || 'dm';
  if (sub === 'record') {
    const who = interaction.options.getUser('who');
    const id = who ? who.id : interaction.user.id;
    if (!getPlayer(id)) return interaction.reply({ ...verr('No such incarnation.'), ephemeral: true });
    const text = recordText(assembleRecord(id, guildId));
    return interaction.reply({ ...streamPanel({ level: 'system', icon: '🌌', bodyLines: [text.slice(0, 3600)] }), ephemeral: sub === 'record' && !who ? false : true });
  }
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  if (sub === 'legacy') {
    if (!await askConfirm(interaction, '🌫️ Retire this incarnation at its height? One-way until rebirth.')) return;
    try {
      retireLegacy(p.discord_id, guildId);
      return interaction.followUp(streamPanel({ level: 'system', icon: '🌌', title: '🌫️ VANISHED', bodyLines: [`${p.name} vanishes at the height of their story. The Stream keeps the record — see \`/incarnation record\`.`] }));
    } catch (e) {
      return interaction.followUp({ ...verr(e.message), ephemeral: true });
    }
  }
  try {
    const r = reincarnate(p.discord_id, interaction.options.getString('story', true));
    const stories = getDb().prepare('SELECT story_id FROM player_stories WHERE discord_id = ?').all(p.discord_id).map((x) => x.story_id);
    return interaction.reply(streamPanel({ level: 'legendary', icon: '✦', title: '🕯️ REBORN', bodyLines: [`A new life opens its eyes. Carried over: **${r.kept}**. Remembered: ${stories.join(', ') || 'nothing'}. (Rebirth #${r.rebirths})`] }));
  } catch (e) {
    return interaction.reply({ ...verr(e.message), ephemeral: true });
  }
}
