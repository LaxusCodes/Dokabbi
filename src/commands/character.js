import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { requireAlive } from '../game/incarnations/lifecycle.js';
import { listCharacters, findCharacter, recruitCharacter, powerOf, RECRUIT_COST, RANKS, equipCompanion, unequipCompanion, getCompanion, companionHistory } from '../game/cards/characters.js';
import { bondLevel, effectiveStage, companionTalk } from '../game/combat/companions.js';
import { imageFor, imageForEntity, setCharacterImage } from '../utils/images.js';
import { emRank, emRole } from '../game/display/emojis.js';
import { v2, artPanel, panel, verr } from '../utils/v2.js';
import characters from '../../data/characters.json' with { type: 'json' };

export const data = new SlashCommandBuilder()
  .setName('character')
  .setDescription('The Stream’s incarnations: browse, inspect, recruit')
  .addSubcommand((s) => s.setName('browse').setDescription('Catalog by rank').addStringOption((o) => o.setName('rank').setDescription('Filter: C B A S SS SSS')))
  .addSubcommand((s) => s.setName('info').setDescription('Dossier + special skill').addStringOption((o) => o.setName('id').setDescription('Character id').setRequired(true).setAutocomplete(true)))
  .addSubcommand((s) => s.setName('recruit').setDescription(`Recruit a weighted-random character (${RECRUIT_COST} coins, no duplicates)`))
  .addSubcommand((s) => s.setName('equip').setDescription('Take a recruited character as your companion').addStringOption((o) => o.setName('id').setDescription('Character id').setRequired(true).setAutocomplete(true)))
  .addSubcommand((s) => s.setName('unequip').setDescription('Send your companion back to the collection'))
  .addSubcommand((s) => s.setName('companion').setDescription('Who fights beside you, and their history'))
  .addSubcommand((s) => s.setName('talk').setDescription('Speak with your companion — closeness opens them'))
  .addSubcommand((s) => s.setName('set-image').setDescription('(Admin) Set a character\'s art URL').addStringOption((o) => o.setName('id').setDescription('Character id').setRequired(true).setAutocomplete(true)).addStringOption((o) => o.setName('url').setDescription('Image URL (empty to clear)').setRequired(true)));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'set-image') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ ...verr('Only server admins can set character art.'), ephemeral: true });
    }
    const id = interaction.options.getString('id', true);
    const def = findCharacter(id);
    if (!def) return interaction.reply({ ...verr('Unknown character. Try `/character browse`.'), ephemeral: true });
    const url = interaction.options.getString('url', true).trim();
    setCharacterImage(id, url || null);
    return interaction.reply({ ...panel({ title: '🎴 CHARACTER ART', body: url ? `Art set for **${def.name}**.` : `Art cleared for **${def.name}**.` }), ephemeral: true });
  }
  if (sub === 'browse') {
    const rank = (interaction.options.getString('rank') || '').toUpperCase();
    if (rank && !RANKS.includes(rank)) return interaction.reply({ ...verr(`Ranks: ${RANKS.join(' ')}. Try \`/character browse rank:SS\`.`), ephemeral: true });
    const list = listCharacters().filter((c) => !rank || c.gameRank === rank);
    const lines = RANKS.filter((r) => !rank || r === rank)
      .map((r) => `${emRank(r)} **${r}** — ${list.filter((c) => c.gameRank === r).map((c) => c.name).join(', ') || '—'}`)
      .filter((l) => !l.endsWith('—'));
    return interaction.reply({ ...panel({ title: `🎴 CHARACTER CATALOG (${list.length} known)`, body: `${lines.join('\n')}\n\n-# Game ranks C→SSS are Stream tiers, not canon grades. Art slots await images.` }), ephemeral: true });
  }
  if (sub === 'info') {
    const def = findCharacter(interaction.options.getString('id', true));
    if (!def) return interaction.reply({ ...verr('No such character. Try `/character browse`.'), ephemeral: true });
    return interaction.reply({
      ...artPanel({
        title: `🎴 [${def.name}] — Rank ${emRank(def.gameRank)} ${def.gameRank}${def.canon ? '' : ' (original)'}`,
        body: `_${def.identity}._\n${def.description}\n\n**${def.skill.name}** — ${def.skill.description}\n\n${emRole(def.role)} Role ${def.role} • Faction ${def.faction} • Power ${powerOf(def)} • Tags ${(def.tags || []).join(', ')}`,
        image: imageForEntity(def),
      }),
      ephemeral: true,
    });
  }
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply(verr('Use /register first.', { ephemeral: true }));
  const dead = requireAlive(p);
  if (dead) return interaction.reply(verr(dead, { ephemeral: true }));
  if (sub === 'equip') {
    try {
      const def = equipCompanion(p.discord_id, interaction.options.getString('id', true));
      return interaction.reply(v2(`🤝 **${def.name}** walks beside you now. One slot — choose well. They fight in \`/pve\`.`));
    } catch (e) {
      return interaction.reply(verr(e.message, { ephemeral: true }));
    }
  }
  if (sub === 'unequip') {
    unequipCompanion(p.discord_id);
    return interaction.reply(v2('Your companion returns to the collection. History kept.', { ephemeral: true }));
  }
  if (sub === 'companion') {
    const def = getCompanion(p.discord_id);
    if (!def) return interaction.reply(verr('No companion equipped. See `/character recruit`.', { ephemeral: true }));
    const hist = companionHistory(p.discord_id, def.id);
    const notes = hist && JSON.parse(hist.notable || '[]');
    const blvl = bondLevel(hist?.bond);
    const stage = effectiveStage(hist?.mastery, hist ? hist.trust : 10);
    return interaction.reply({
      ...panel({
        title: `🤝 ${def.name} [${def.gameRank}]`,
        body: `${def.skill.name}: ${def.skill.description}\nBattles ${hist?.uses || 0} • Victories ${hist?.victories || 0} • Defeats ${hist?.defeats || 0}\nBond ${blvl}/5 (${hist?.bond || 0}) • Mastery stage ${stage} (${hist?.mastery || 0} wins) • Trust ${hist?.trust ?? 10}\n-# Rank is ceiling; life is height.${notes?.length ? `\nNotable: ${notes.join('; ')}` : ''}`,
      }),
      ephemeral: true,
    });
  }
  if (sub === 'talk') {
    const def = getCompanion(p.discord_id);
    if (!def) return interaction.reply(verr('No companion to talk to. See `/character recruit`.', { ephemeral: true }));
    const hist = companionHistory(p.discord_id, def.id);
    return interaction.reply(v2(`💬 ${companionTalk(def, { bond: hist?.bond || 0, trust: hist?.trust ?? 10 })}`, { ephemeral: true }));
  }
  try {
    const def = recruitCharacter(p.discord_id);
    await interaction.reply(artPanel({
      title: `🎴 [${def.name}] joined you`,
      body: `Recruited for ${RECRUIT_COST} coins (no duplicates — the owned step aside).\nRank **${def.gameRank}** — ${def.description}\n\n**${def.skill.name}** — ${def.skill.description}`,
      image: imageForEntity(def),
    }));
  } catch (e) {
    await interaction.reply(verr(e.message, { ephemeral: true }));
  }
}

export async function handleAutocomplete(interaction) {
  const focused = interaction.options.getFocused();
  const choices = characters.filter((c) => c.id.toLowerCase().includes(focused.toLowerCase()) || c.name.toLowerCase().includes(focused.toLowerCase())).slice(0, 25);
  await interaction.respond(choices.map((c) => ({ name: `${c.name} (${c.id})`, value: c.id })));
}
