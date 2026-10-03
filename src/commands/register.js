import { SlashCommandBuilder } from 'discord.js';
import { createPlayer, nameTakenMessage } from '../game/players/model.js';
import { registerPanel, beginTutorialRow, verr } from '../utils/v2.js';
import { embedTutorial, setTutorialMessage, tutorialMessagePayload, getStep } from '../game/tutorial/progress.js';

export const data = new SlashCommandBuilder()
  .setName('register')
  .setDescription('Create your incarnation')
  .addStringOption((o) => o.setName('name').setDescription('Display name').setRequired(true));

export async function execute(interaction) {
  const name = interaction.options.getString('name', true).slice(0, 32);
  try {
    const p = createPlayer(interaction.user.id, name);
    const base = registerPanel({ name: p.name, coins: p.coins });
    embedTutorial(base, interaction.user.id, 'register');
    await interaction.reply({ ...base, components: [...base.components, beginTutorialRow(interaction.user.id)] });
  } catch (e) {
    if (e?.code === 'NAME_TAKEN') {
      await interaction.reply({ ...verr(nameTakenMessage()), ephemeral: true });
      return;
    }
    await interaction.reply({ ...verr('Already registered. Use /status.'), ephemeral: true });
  }
}

export async function handleTutorialButton(interaction) {
  // customId: `stream:tutorial` | `stream:tutorial:<owner>` (legacy)
  //   | `stream:tutorial:<owner>:<src>` where src is 'slash' or the prefix.
  const parts = (interaction.customId || '').split(':');
  const owner = parts.length >= 3 ? parts[2] : null;
  if (owner && interaction.user.id !== owner) {
    return interaction.reply({ ...verr(`That gate belongs to <@${owner}> — register yourself to open your own.`), ephemeral: true });
  }
  const src = parts.length >= 4 && parts[3] && parts[3] !== 'slash' ? parts[3] : null;
  // The initiation thread starts here: remember this message so every later
  // step can EDIT it instead of sending another one.
  try {
    if (interaction.message?.id) {
      setTutorialMessage(interaction.user.id, interaction.message.channelId, interaction.message.id);
    }
  } catch { /* stored-message edit is best-effort */ }
  const payload = tutorialMessagePayload(getStep(interaction.user.id), src, interaction.user.id);
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(payload).catch(() => null);
  }
  try {
    // Same message transforms: panel → Tutorial 1/8. No second message.
    await interaction.update(payload);
  } catch {
    await interaction.reply({ ...payload, ephemeral: true }).catch(() => null);
  }
}
