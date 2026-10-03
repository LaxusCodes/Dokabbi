import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { requireAlive } from '../game/incarnations/lifecycle.js';
import { dailyView, claimDaily } from '../game/daily/store.js';
import { streakDay } from '../game/daily/missions.js';
import { panel, verr, v2, dailyPanel, streamPanel, claimRow, LEVELS } from '../utils/v2.js';
import { embedTutorial, refreshTutorialMessage } from '../game/tutorial/progress.js';
import { getPrefix } from '../game/world/echoes.js';

export const data = new SlashCommandBuilder()
  .setName('daily')
  .setDescription("Today's Star Stream contracts")
  .addSubcommand((s) => s.setName('view').setDescription("View today's missions and streak"))
  .addSubcommand((s) => s.setName('claim').setDescription('Check in and collect finished missions'))
  .addSubcommand((s) => s.setName('streak').setDescription('Your streak (a missed day is forgiven, two resets)'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first. Try `/daily view`.'), ephemeral: true });
  const dead = requireAlive(p);
  if (dead) return interaction.reply({ ...verr(`${dead} Try \`/daily view\`.`), ephemeral: true });
  const guildId = interaction.guildId || 'dm';

  if (sub === 'streak') {
    const v = dailyView(p.discord_id);
    return interaction.reply({
      ...streamPanel({
        level: 'system', icon: '🌌', title: 'Streak',
        bodyLines: [`**${v.streak}** (best ${v.best})`],
        footer: 'A single missed day is forgiven — two in a row resets.',
      }),
      ephemeral: true,
    });
  }
  if (sub === 'claim') {
    const { lines, streak } = claimDaily(p.discord_id, guildId);
    const payload = streamPanel({
      level: 'system', icon: '🌌', title: `Claimed — Day ${streakDay(Math.max(1, streak))}`,
      bodyLines: lines,
      footer: `Streak **${streak}**.\nTry \`/daily claim\` again tomorrow.`,
    });
    embedTutorial(payload, p.discord_id, 'daily_claim');
    await interaction.reply(payload);
    refreshTutorialMessage(interaction.client, p.discord_id, null).catch(() => null);
    return;
  }
  const v = dailyView(p.discord_id);
  const base = dailyPanel({ missions: v.missions, streak: v.streak, checkin: v.checkin });
  return interaction.reply({
    ...base,
    components: [...base.components, claimRow()],
    ephemeral: true,
  });
}

export async function handleClaimButton(interaction) {
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first. Try `/daily claim`.'), ephemeral: true });
  const { lines, streak } = claimDaily(p.discord_id, interaction.guildId || 'dm');
  const payload = streamPanel({
    level: 'system', icon: '🌌', title: `Claimed — Day ${streakDay(Math.max(1, streak))}`,
    bodyLines: lines,
    footer: `Streak **${streak}**.\nTry \`/daily claim\` again tomorrow.`,
  });
  const tutPrefix = interaction.message?.ephemeral ? null : getPrefix(interaction.guildId);
  embedTutorial(payload, interaction.user.id, 'daily_claim', tutPrefix);
  if (interaction.replied || interaction.deferred) return interaction.followUp({ ...payload, ephemeral: true });
  if (interaction.isRepliable?.() === false) return;
  try {
    await interaction.update(payload);
  } catch {
    await interaction.reply({ ...payload, ephemeral: true });
  }
  refreshTutorialMessage(interaction.client, interaction.user.id, tutPrefix).catch(() => null);
}
