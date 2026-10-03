import { SlashCommandBuilder } from 'discord.js';
import { getPlayer, updatePlayer } from '../game/players/model.js';
import { grantKnowledge, playerKnowledgeIds } from '../game/world/store.js';
import { fragmentFor } from '../game/knowledge/system.js';
import { bumpCounter } from '../game/titles/counters.js';
import { perksFor } from '../game/titles/perks.js';
import { checkCooldown, setCooldown, cooldownMessage, burstMessage, tryBurst, clearBurst, COOLDOWNS } from '../game/cooldowns.js';
import { panel, verr } from '../utils/v2.js';
import knowledge from '../../data/knowledge.json' with { type: 'json' };

const OBSERVE_BASE_COST = 10;
// Investigation: what you can learn depends on where you look and how far you have come.
// `pick` fragments are asymmetric — each incarnation is shown a different piece.
const MAP = {
  subway: { progress: 0, gives: ['foreknow_001', 'pattern_lurker'] },
  station: { progress: 1, gives: ['foreknow_002'], pick: ['danger_east', 'value_east'] },
};

export const data = new SlashCommandBuilder()
  .setName('observe')
  .setDescription('Investigate the world — observation, reading, memories')
  .addStringOption((o) => o.setName('focus').setDescription('subway, station').setRequired(true));

export async function execute(interaction) {
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  const focus = interaction.options.getString('focus', true);
  const spot = MAP[focus];
  if (!spot) return interaction.reply({ ...verr('Nothing to observe there. Try: subway, station.'), ephemeral: true });
  if (p.scenario_progress < spot.progress) {
    return interaction.reply({ ...verr('This place means nothing to you yet. Survive further first.'), ephemeral: true });
  }
  const cost = Math.max(5, OBSERVE_BASE_COST - perksFor(p.discord_id, { always: true }).energy);
  if (p.energy < cost) return interaction.reply({ ...verr(`Too exhausted to observe (need ${cost} energy).`), ephemeral: true });
  const wait = checkCooldown(p.discord_id, 'observe', COOLDOWNS.observe);
  if (wait) return interaction.reply({ ...verr(cooldownMessage(wait, 'observe')), ephemeral: true });
  if (!tryBurst(p.discord_id, 'observe')) return interaction.reply({ ...verr(burstMessage()), ephemeral: true });
  try {
    updatePlayer(p.discord_id, { energy: p.energy - cost });
    setCooldown(p.discord_id, 'observe', COOLDOWNS.observe);
    bumpCounter(p.discord_id, 'observes');
    const owned = playerKnowledgeIds(p.discord_id);
    const fresh = spot.gives.filter((id) => !owned.includes(id));
    if (spot.pick) {
      const frag = fragmentFor(p.discord_id, spot.pick);
      if (!owned.includes(frag) && !fresh.includes(frag)) fresh.push(frag);
    }
    if (!fresh.length) return interaction.reply({ ...panel({ title: '👁 OMNISCIENCE', body: 'You notice nothing new. The stream already knows you know.' }), ephemeral: true });
    const found = [];
    for (const id of fresh) {
      if (grantKnowledge(p.discord_id, id, `observe:${focus}`)) {
        found.push(knowledge.find((k) => k.id === id));
      }
    }
    await interaction.reply({
      ...panel({ title: '👁 OMNISCIENCE', body: `${found.map((k) => `**${k.title}**\n${k.body}`).join('\n\n')}\n\n-# Information is private until you share it (/know).` }),
      ephemeral: true,
    });
  } finally {
    clearBurst(p.discord_id, 'observe');
  }
}
