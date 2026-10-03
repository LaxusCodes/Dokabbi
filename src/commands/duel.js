import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { callDuel, openDuel, joinDuel, duelSides, fightDuel } from '../game/combat/duels.js';
import { constellationName } from '../game/constellations/wallets.js';
import { requireAlive } from '../game/incarnations/lifecycle.js';
import { checkCooldown, setCooldown, cooldownMessage, burstMessage, tryBurst, clearBurst, COOLDOWNS } from '../game/cooldowns.js';
import { streamPanel, verr } from '../utils/v2.js';
import constellations from '../../data/constellations.json' with { type: 'json' };

const valid = (id) => constellations.some((c) => c.id === id);

export const data = new SlashCommandBuilder()
  .setName('duel')
  .setDescription('Constellation duels fought by champions')
  .addSubcommand((s) =>
    s.setName('call').setDescription('Demand two constellations settle it')
      .addStringOption((o) => o.setName('challenger').setDescription('Challenger constellation id (name: id)').setRequired(true).addChoices(...constellations.map((c) => ({ name: `${c.name} (${c.id})`, value: c.id }))))
      .addStringOption((o) => o.setName('defender').setDescription('Defender constellation id (name: id)').setRequired(true).addChoices(...constellations.map((c) => ({ name: `${c.name} (${c.id})`, value: c.id }))))
      .addStringOption((o) => o.setName('cause').setDescription('Why they fight').setRequired(true))
  )
  .addSubcommand((s) => s.setName('join').setDescription('Fight as a champion').addStringOption((o) => o.setName('side').setDescription('A (challenger) or B (defender)').setRequired(true)))
  .addSubcommand((s) => s.setName('fight').setDescription('Begin the duel'))
  .addSubcommand((s) => s.setName('status').setDescription('Show the open duel'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId || 'dm';

  if (sub === 'call') {
    const p = getPlayer(interaction.user.id);
    if (!p) return interaction.reply({ ...verr('Use /register first. Try `/duel call challenger:<id> defender:<id> cause:<reason>`.'), ephemeral: true });
    const wait = checkCooldown(p.discord_id, 'duel_call', COOLDOWNS.duel_call);
    if (wait) return interaction.reply({ ...verr(`${cooldownMessage(wait, 'duel_call')} Try \`/duel call challenger:<id> defender:<id> cause:<reason>\`.`), ephemeral: true });
    if (!tryBurst(p.discord_id, 'duel_call')) return interaction.reply({ ...verr(`${burstMessage()} Try \`/duel call challenger:<id> defender:<id> cause:<reason>\`.`), ephemeral: true });
    try {
      const ch = interaction.options.getString('challenger', true);
      const de = interaction.options.getString('defender', true);
      if (!valid(ch) || !valid(de)) return interaction.reply({ ...verr(`Unknown constellation. Try: ${constellations.map((c) => c.id).join(', ')}. Try \`/duel call challenger:<id> defender:<id> cause:<reason>\`.`), ephemeral: true });
      try {
        const d = callDuel(guildId, ch, de, interaction.options.getString('cause', true));
        setCooldown(p.discord_id, 'duel_call', COOLDOWNS.duel_call);
        return interaction.reply(streamPanel({
          level: 'system', icon: '🌌', title: '⚠️ CONSTELLATION DUEL',
          bodyLines: `**${constellationName(ch)}** VS **${constellationName(de)}**\nCause: ${d.cause}\n\nGods don't bleed — champions do. Join with \`/duel join\`, then \`/duel fight\`. Avatars scale with influence; probability required is real.`.split('\n'),
        }));
      } catch (e) {
        return interaction.reply({ ...verr(`${e.message} Try \`/duel call challenger:<id> defender:<id> cause:<reason>\`.`), ephemeral: true });
      }
    } finally {
      clearBurst(p.discord_id, 'duel_call');
    }
  }

  if (sub === 'status') {
    const d = openDuel(guildId);
    if (!d) return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '⚔️ DUEL', bodyLines: ['No duel is open. Try `/duel call` to start one.'] }));
    const parts = duelSides(d.id);
    const a = parts.filter((x) => x.side === 'A').length;
    const b = parts.filter((x) => x.side === 'B').length;
    return interaction.reply(streamPanel({
      level: 'system', icon: '🌌', title: '⚔️ DUEL',
      bodyLines: `**${constellationName(d.challenger_const)}** (A: ${a} champions) VS **${constellationName(d.defender_const)}** (B: ${b} champions)\nCause: ${d.cause}`.split('\n'),
    }));
  }

  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first. Try `/duel join side:A`.'), ephemeral: true });
  const dead = requireAlive(p);
  if (dead) return interaction.reply({ ...verr(`${dead} Try \`/duel join side:A\`.`), ephemeral: true });
  const d = openDuel(guildId);
  if (!d) return interaction.reply({ ...verr('No duel is open. Try `/duel call` to start one.'), ephemeral: true });

  if (sub === 'join') {
    try {
      joinDuel(d.id, p.discord_id, interaction.options.getString('side', true).toUpperCase());
      return interaction.reply(streamPanel({
        level: 'important', icon: '⚔️', title: '⚔️ SWORN',
        bodyLines: [`You kneel before **${constellationName(interaction.options.getString('side', true).toUpperCase() === 'A' ? d.challenger_const : d.defender_const)}**. The stream notes your allegiance.`],
      }));
    } catch (e) {
      return interaction.reply({ ...verr(`${e.message} Try \`/duel join side:A\`.`), ephemeral: true });
    }
  }

  const r = fightDuel(guildId, d.id);
  const lines = r.log.slice(0, 10).map((e) => `R${e.round} ${e.text}`);
  await interaction.reply(streamPanel({
    level: 'important', icon: '⚔️', title: `⚔️ ${constellationName(r.winnerConst)} prevails`,
    bodyLines: `Over ${constellationName(r.loserConst)} (${r.rounds} rounds)${r.cooled ? `\nFactions cool to **${r.cooled}**.` : ''}\n${lines.join('\n')}${r.log.length > 10 ? `\n… (${r.log.length - 10} more)` : ''}\n\n${r.results.join('\n')}`.split('\n'),
  }));
}
