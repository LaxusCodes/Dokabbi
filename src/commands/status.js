import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { statusEmbed } from '../utils/embeds.js';
import { nextScenario } from '../game/scenarios/engine.js';
import { sentimentSummary } from '../game/constellations/sentiment.js';
import { verr } from '../utils/v2.js';
import { embedTutorial, refreshTutorialMessage } from '../game/tutorial/progress.js';

export const data = new SlashCommandBuilder().setName('status').setDescription('Show your status window');

export async function execute(interaction) {
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  const payload = statusEmbed(p, {
    sentiment: sentimentSummary(p.discord_id),
    next: nextScenario(p.scenario_progress),
  });
  embedTutorial(payload, interaction.user.id, 'status');
  await interaction.reply(payload);
  refreshTutorialMessage(interaction.client, interaction.user.id, null).catch(() => null);
}
