import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { getDb } from '../database/db.js';
import { storyCardsOf } from '../game/cards/mint.js';
import { panel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder().setName('journey').setDescription('Your story so far — Stories and journey cards');

export async function execute(interaction) {
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  const db = getDb();
  const stories = db.prepare('SELECT story_id FROM player_stories WHERE discord_id = ?').all(p.discord_id);
  const cards = storyCardsOf(db, p.discord_id);
  const sText = stories.length ? stories.map((s) => `• [${s.story_id}]`).join('\n') : '_No Stories yet._';
  const cText = cards.length ? cards.map((c) => `🎴 **${c.name}** (power ${c.power})\n_${c.effect}_`).join('\n\n') : '_No journey cards yet — your choices will mint them._';
  await interaction.reply(panel({ title: `📖 ${p.name} — ${p.title} • Lv ${p.level}`, body: `__Stories__\n${sText}\n\n__Journey cards__\n${cText}` }));
}
