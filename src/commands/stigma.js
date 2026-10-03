import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { playerStigmas, getMastery } from '../game/combat/store.js';
import { evolutionHint, stigmaDef } from '../game/combat/stigma.js';
import { streamPanel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder().setName('stigma').setDescription('Your stigmas: mastery and hidden evolutions');

export async function execute(interaction) {
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  const rows = playerStigmas(p.discord_id);
  if (!rows.length) return interaction.reply({ ...verr('No stigmas. Earn a sponsorship first.'), ephemeral: true });
  await interaction.reply({
    ...streamPanel({
      level: 'system',
      icon: '🌌',
      title: '✨ STIGMAS',
      bodyLines: `${rows.map((s) => {
        const m = getMastery(p.discord_id, s.stigma_id);
        return `• [${stigmaDef(s.stigma_id)?.name || s.stigma_id}] Lv ${s.level} — charges ${s.charges}/3, uses ${m.uses}, shields ${m.protects}\n  _Next: ${evolutionHint(s.stigma_id, s.level, m)}_`;
      }).join('\n\n')}\n\n-# Unleash in battle with /pve.`.split('\n'),
    }),
    ephemeral: true,
  });
}
