import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { setEmojiOverride, clearEmojiOverride, listEmojiOverrides, em } from '../game/display/emojis.js';
import { panel, verr } from '../utils/v2.js';

// Admin skinning: override any emoji key live, no redeploy.
// Keys look like: titles.butcher, ranks.SSS, roles.Healer, rarities.Myth, ui.coins
// Values may be unicode or custom codes (<:name:id>).
export const data = new SlashCommandBuilder()
  .setName('emoji')
  .setDescription('(Admin) reskin the Stream live')
  .addSubcommand((s) => s.setName('list').setDescription('Show overrides (empty = file defaults)'))
  .addSubcommand((s) => s.setName('set').setDescription('Override one emoji key')
    .addStringOption((o) => o.setName('key').setDescription('e.g. titles.butcher, ranks.SSS, roles.Healer').setRequired(true))
    .addStringOption((o) => o.setName('value').setDescription('Emoji or <:name:id>').setRequired(true)))
  .addSubcommand((s) => s.setName('clear').setDescription('Drop one override').addStringOption((o) => o.setName('key').setDescription('Key to clear').setRequired(true)));

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ ...verr('Only server admins can reskin the Stream. Try `/emoji set key:titles.butcher value:🌠`.'), ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  if (sub === 'list') {
    const rows = listEmojiOverrides();
    if (!rows.length) {
      return interaction.reply({
        ...panel({
          title: '🎨 EMOJI OVERRIDES',
          body: 'None — everything renders from `data/emojis.json`.\n\nKeys look like `titles.butcher`, `ranks.SSS`, `roles.Healer`, `rarities.Myth`, `ui.coins`.\nSet one: `/emoji set key:ranks.SSS value:🌠`\nCustom app emoji: upload in Developer Portal → Emojis, type `\:name:` in chat to copy `<:name:id>`, paste it as the value.',
        }),
        ephemeral: true,
      });
    }
    return interaction.reply({
      ...panel({ title: '🎨 EMOJI OVERRIDES', body: rows.map((r) => `\`${r.key}\` → ${r.value}`).join('\n') }),
      ephemeral: true,
    });
  }
  const key = interaction.options.getString('key', true);
  if (sub === 'clear') {
    const gone = clearEmojiOverride(key);
    return interaction.reply({ ...panel({ title: '🎨 EMOJI', body: gone ? `Cleared \`${key}\` — file default restored.` : `No override on \`${key}\`.` }), ephemeral: true });
  }
  const value = interaction.options.getString('value', true);
  setEmojiOverride(key, value);
  return interaction.reply(panel({ title: '🎨 EMOJI', body: `\`${key}\` now renders as ${value} everywhere, instantly. Sample: ${em(key.split('.')[0], key.split('.').slice(1).join('.'), '(no file default)')}` }));
}
