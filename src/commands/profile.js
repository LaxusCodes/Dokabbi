import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { getDb } from '../database/db.js';
import { assembleRecord } from '../game/incarnations/record.js';
import { profileText } from '../game/incarnations/profile.js';
import { activeTitles } from '../game/titles/perks.js';
import { showcaseOf } from '../game/cards/collection.js';
import { listTitles } from '../game/titles/evaluate.js';
import { computeDivergence } from '../game/canon/divergence.js';
import { sentimentSummary } from '../game/constellations/sentiment.js';
import { artPanel, panel, verr } from '../utils/v2.js';
import { imageForEntity } from '../utils/images.js';
import { embedTutorial, refreshTutorialMessage } from '../game/tutorial/progress.js';
import characters from '../../data/characters.json' with { type: 'json' };

const titleName = (id) => listTitles().find((t) => t.id === id)?.name || id;

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('One glance at an incarnation')
  .addUserOption((o) => o.setName('who').setDescription('Whose profile'));

export async function execute(interaction) {
  const who = interaction.options.getUser('who');
  const id = who ? who.id : interaction.user.id;
  const payload = buildProfilePayload(id, interaction.guildId || 'dm');
  if (!payload) return interaction.reply({ ...verr('No such incarnation.'), ephemeral: true });
  if (!who) embedTutorial(payload, interaction.user.id, 'profile');
  await interaction.reply(payload);
  if (!who) refreshTutorialMessage(interaction.client, interaction.user.id, null).catch(() => null);
}

export function buildProfilePayload(id, guildId = 'dm') {
  const p = getPlayer(id);
  if (!p) return null;
  const record = assembleRecord(id, guildId);
  const slots = activeTitles(id);
  const titles = getDbTitles(id);
   const image = imageForEntity(p);
  return artPanel({
    title: `👤 ${p.name} — ${p.title}`,
    body: profileText({
      name: p.name, title: p.title, level: p.level, status: p.status,
      activeTitle: slots.primary ? titleName(slots.primary) : null,
      titles: titles.map(titleName),
      showcase: showcaseOf(id),
      companion: record?.companion || null,
      nebula: record?.neb?.nebula.name || null,
      sponsor: record?.contract?.constellation_id || null,
      divergence: computeDivergence(guildId).score,
      relations: sentimentSummary(id).rows,
    }),
    image,
  });
}

export async function handleViewProfileButton(interaction) {
  const owner = (interaction.customId || '').split(':')[2] || null;
  if (owner && interaction.user.id !== owner) {
    return interaction.reply({ ...verr(`That gate belongs to <@${owner}> — finish your own tutorial to open yours.`), ephemeral: true });
  }
  const payload = buildProfilePayload(interaction.user.id, interaction.guildId || 'dm');
  if (!payload) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ ...payload, ephemeral: true }).catch(() => null);
  }
  await interaction.reply({ ...payload, ephemeral: true }).catch(() => null);
}

function getDbTitles(id) {
  return getDb().prepare('SELECT title_id FROM player_titles WHERE discord_id = ?').all(id).map((r) => r.title_id);
}
