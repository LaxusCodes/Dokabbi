import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { getDb } from '../database/db.js';
import {
  refreshTutorialMessage, tutorialMessagePayload, setTutorialMessage, getStep,
} from '../game/tutorial/progress.js';
import { verr, v2 } from '../utils/v2.js';

export const data = new SlashCommandBuilder()
  .setName('tutorial')
  .setDescription('Your initiation thread (replays your current step, never restarts)');

export async function execute(interaction) {
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first — birth comes before orientation.'), ephemeral: true });
  // One thread only: refresh the stored message and point at it.
  // Never restart progress, never open legacy pages.
  const refreshed = await refreshTutorialMessage(interaction.client, p.discord_id, null).catch(() => false);
  if (refreshed) {
    const row = getDb().prepare('SELECT tutorial_msg_id, tutorial_channel_id FROM players WHERE discord_id = ?').get(p.discord_id);
    const loc = interaction.guildId && interaction.guildId !== 'dm' ? interaction.guildId : '@me';
    return interaction.reply({
      ...v2(`🌌 Your initiation thread lives on — [continue here](https://discord.com/channels/${loc}/${row.tutorial_channel_id}/${row.tutorial_msg_id}).`),
      ephemeral: true,
    });
  }
  // No thread yet: this reply BECOMES the one thread (public, so later
  // steps can edit it).
  const payload = tutorialMessagePayload(getStep(p.discord_id), null, p.discord_id);
  const sent = await interaction.reply({ ...payload, fetchReply: true });
  try {
    if (sent?.id) setTutorialMessage(p.discord_id, sent.channelId, sent.id);
  } catch { /* thread still shows — tracking is best-effort */ }
}
