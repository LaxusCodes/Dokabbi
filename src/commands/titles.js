import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { titleProgress, listTitles } from '../game/titles/evaluate.js';
import { setSlots, activeTitles } from '../game/titles/perks.js';
import { emTitle } from '../game/display/emojis.js';
import { streamPanel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder()
  .setName('titles')
  .setDescription('Epithets earned by how you lived')
  .addSubcommand((s) => s.setName('view').setDescription('Earned titles + progress'))
  .addSubcommand((s) => s.setName('equip').setDescription('1 primary + 2 secondaries')
    .addStringOption((o) => o.setName('primary').setDescription('Title id'))
    .addStringOption((o) => o.setName('secondary1').setDescription('Title id'))
    .addStringOption((o) => o.setName('secondary2').setDescription('Title id')));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  if (sub === 'equip') {
    try {
      const slots = setSlots(p.discord_id, {
        primary: interaction.options.getString('primary'),
        secondary1: interaction.options.getString('secondary1'),
        secondary2: interaction.options.getString('secondary2'),
      });
      const names = (id) => listTitles().find((t) => t.id === id);
      const ename = (id) => `${emTitle(id, names(id)?.emoji)} ${names(id)?.name}`;
      return interaction.reply({
        ...streamPanel({
          level: 'system',
          icon: '🌌',
          title: '🏷️ Active epithet',
          bodyLines: `Primary: **${slots.primary ? ename(slots.primary) : '—'}**\nSecondaries: ${slots.secondaries.map(ename).join(', ') || '—'}\n-# Primary at full strength, secondaries at half.`.split('\n'),
        }),
        ephemeral: true,
      });
    } catch (e) {
      return interaction.reply({ ...verr(e.message), ephemeral: true });
    }
  }
  const guildId = interaction.guildId || 'dm';
  const rows = titleProgress(p.discord_id, guildId);
  const earned = rows.filter((r) => r.owned);
  const next = rows.filter((r) => !r.owned).slice(0, 8);
  const active = activeTitles(p.discord_id);
  await interaction.reply({
    ...streamPanel({
      level: 'system',
      icon: '🌌',
      title: `👑 TITLES (${earned.length}/${rows.length})   Active: ${active.primary || '—'}`,
      bodyLines: (earned.length ? earned.map((r) => `${emTitle(r.def.id, r.def.emoji)} **${r.def.name}** — _${r.def.perk.kind} +${r.def.perk.value}%${r.def.perk.when !== 'always' ? ` (${r.def.perk.when})` : ''}_`).join('\n') : '_None yet. Live dangerously._') +
        (next.length ? `\n\n__In reach__\n${next.map((r) => `○ ${r.def.name} — ${r.check.progress || r.def.desc}`).join('\n')}` : ''),
    }),
    ephemeral: true,
  });
}
