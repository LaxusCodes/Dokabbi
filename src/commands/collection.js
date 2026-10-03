import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { getDb } from '../database/db.js';
import { collectionTally, collectionText, setShowcase, clearShowcase, showcaseOf, SHOWCASE_SLOTS } from '../game/cards/collection.js';
import { epithets } from '../game/incarnations/lifecycle.js';
import { assembleRecord } from '../game/incarnations/record.js';
import { discoveryStatus } from '../game/cards/discovery.js';
import { imageForEntity } from '../utils/images.js';
import { computeDivergence } from '../game/canon/divergence.js';
import { streamPanel, panel, verr, artPanel } from '../utils/v2.js';
import cards from '../../data/cards.json' with { type: 'json' };

export const data = new SlashCommandBuilder()
  .setName('collection')
  .setDescription('What you have lived, and what you show')
  .addSubcommand((s) => s.setName('view').setDescription('Browse your card collection').addUserOption((o) => o.setName('who').setDescription('Whose collection to view (yours if omitted)')))
  .addSubcommand((s) => s.setName('inspect').setDescription('View a single card by id').addStringOption((o) => o.setName('id').setDescription('Card id to inspect (name: id)').setRequired(true).addChoices(...cards.map((c) => ({ name: `${c.name} (${c.id})`, value: c.id })))).addUserOption((o) => o.setName('who').setDescription('Whose card to inspect')))
  .addSubcommand((s) => s.setName('showcase').setDescription(`Flex up to ${SHOWCASE_SLOTS} cards`).addStringOption((o) => o.setName('id').setDescription('Card id to showcase (name: id)').addChoices(...cards.map((c) => ({ name: `${c.name} (${c.id})`, value: c.id })))).addIntegerOption((o) => o.setName('slot').setDescription('Slot number 0–3').setRequired(false)));

function titlesOf(record) {
  if (!record) return [];
  return epithets({
    alters: record.alters,
    sponsored: Boolean(record.contract) || record.doneSponsors.length > 0,
    trusted: false,
    underdog: record.cards.some((c) => c.card_id.includes('underdog')),
    asset: record.stories.includes('nebula_asset'),
    bonded: record.stories.includes('survived_together'),
    refused: record.stories.includes('refused_nebula'),
    defied: record.stories.includes('defied_probability'),
    rebirthed: record.p.rebirths || 0,
  });
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId || 'dm';
  if (sub === 'showcase' && interaction.options.getString('id')) {
    const p = getPlayer(interaction.user.id);
    if (!p) return interaction.reply({ ...verr('Use /register first. Try `/register`.'), ephemeral: true });
    try {
      setShowcase(p.discord_id, interaction.options.getString('id', true), interaction.options.getInteger('slot') || 0);
      return interaction.reply({ ...panel({ title: '🎴 SHOWCASED', body: 'Let them look.' }), ephemeral: true });
    } catch (e) {
      return interaction.reply({ ...verr(`${e.message} Try \`/collection showcase id:<card>\`.`), ephemeral: true });
    }
  }
  const who = interaction.options.getUser('who');
  const id = who ? who.id : interaction.user.id;
  const target = getPlayer(id);
  if (!target) return interaction.reply({ ...verr('No such incarnation. Try `/collection view`.'), ephemeral: true });
  const db = getDb();
  const cards = db.prepare('SELECT * FROM story_cards WHERE discord_id = ?').all(id);
  const tally = collectionTally(cards);

  if (sub === 'inspect') {
    const cid = interaction.options.getString('id', true);
    const card = cards.find((c) => c.card_id === cid);
    if (!card) return interaction.reply({ ...panel({ title: '🎴 NOT FOUND', body: 'No such card in this collection. Try `/collection inspect id:<card>`.' }), ephemeral: true });
    const t = tally.detailed.find((c) => c.card_id === cid);
    return interaction.reply({
      ...artPanel({
        title: `🎴 ${card.name}`,
        body: `From **${target.name}'s** collection\n_${t.category} • ${t.rarity}_\n${card.effect || ''}\nPower ${card.power}`,
        image: imageForEntity(card),
      }),
      ephemeral: true,
    });
  }
  if (sub === 'showcase') {
    const rows = showcaseOf(id);
    if (!rows.length) return interaction.reply({ ...panel({ title: '🎴 EMPTY', body: 'Showcase empty. Flex something earned with `/collection showcase id:<card> slot:0`.' }), ephemeral: true });
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: `🎴 ${target.name}'s SHOWCASE`, bodyLines: rows.map((r) => `[${r.slot}] **${r.name}** _(${r.rarity})_\n_${r.effect || ''}_`).join('\n\n').split('\n\n') }));
  }
  const record = assembleRecord(id, guildId);
  const extra = [`\n\n__Showcase__`, ...showcaseOf(id).map((r) => `⭐ ${r.name} _(${r.rarity})_`)];
  const chapter = db.prepare(`SELECT chapter_no FROM chapter_instances WHERE guild_id = ? AND status = 'open' ORDER BY chapter_no DESC LIMIT 1`).get(guildId);
  const parts = chapter ? db.prepare('SELECT COUNT(DISTINCT discord_id) v FROM chapter_participants WHERE chapter_id = (SELECT id FROM chapter_instances WHERE guild_id = ? AND chapter_no = ?)').get(guildId, chapter.chapter_no).v : 0;
  const dist = db.prepare('SELECT disturbance FROM channel_state WHERE guild_id = ?').get(guildId)?.disturbance || 0;
  const disc = discoveryStatus({ divergence: computeDivergence(guildId).score, participants: parts, disturbance: dist });
  const mystery = `\n\n🌌 DISCOVERY ${'█'.repeat(Math.round(disc.pct / 10))}${'░'.repeat(10 - Math.round(disc.pct / 10))} ${disc.pct}%\n${disc.conditions.map((c) => `${c.met ? '✓' : '○'} ${c.label}`).join('\n')}`;
  await interaction.reply(panel({
    body: collectionText(target.name, tally, titlesOf(record)) + (showcaseOf(id).length ? extra.join('\n') : '') + mystery,
  }));
}
