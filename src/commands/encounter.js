import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { requireAlive } from '../game/incarnations/lifecycle.js';
import { runEncounter } from '../game/daily/store.js';
import { ENCOUNTER_COST } from '../game/daily/encounters.js';
import { checkCooldown, setCooldown, cooldownMessage, burstMessage, tryBurst, clearBurst, COOLDOWNS } from '../game/cooldowns.js';
import { panel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder().setName('encounter').setDescription(`A random event, weighted by your world (${ENCOUNTER_COST} energy)`);

export async function execute(interaction) {
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first. Try `/encounter`.'), ephemeral: true });
  const dead = requireAlive(p);
  if (dead) return interaction.reply({ ...verr(`${dead} Try \`/encounter\`.`), ephemeral: true });
  const wait = checkCooldown(p.discord_id, 'encounter', COOLDOWNS.encounter);
  if (wait) return interaction.reply({ ...verr(`${cooldownMessage(wait, 'encounter')} Try \`/encounter\`.`), ephemeral: true });
  if (!tryBurst(p.discord_id, 'encounter')) return interaction.reply({ ...verr(`${burstMessage()} Try \`/encounter\`.`), ephemeral: true });
  try {
    const lines = runEncounter(p.discord_id, interaction.guildId || 'dm');
    setCooldown(p.discord_id, 'encounter', COOLDOWNS.encounter);
    await interaction.reply(panel({ title: '🎲 ENCOUNTER', body: lines.join('\n') }));
  } catch (e) {
    await interaction.reply({ ...verr(`${e.message} Try \`/encounter\`.`), ephemeral: true });
  } finally {
    clearBurst(p.discord_id, 'encounter');
  }
}
