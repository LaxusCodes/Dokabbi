import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { activeGlobal } from '../game/scenarios/store.js';
import { placePlayerWager, placeAnonymousPlayerWager } from '../game/wagers/store.js';
import { PLAYER_WAGER_CAP, PLAYER_WAGER_MIN } from '../game/wagers/engine.js';
import { checkCooldown, setCooldown, cooldownMessage, burstMessage, tryBurst, clearBurst, COOLDOWNS } from '../game/cooldowns.js';
import { panel, streamPanel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder()
  .setName('wager')
  .setDescription(`Back an outcome (player cap ${PLAYER_WAGER_CAP} coins — the story comes first)`)
  .addStringOption((o) => o.setName('side').setDescription('A or B').setRequired(true))
  .addIntegerOption((o) => o.setName('amount').setDescription(`Stake, ${PLAYER_WAGER_MIN}–${PLAYER_WAGER_CAP} coins`).setRequired(true))
  .addBooleanOption((o) => o.setName('anonymous').setDescription('Hide your name from the audience feed'));

export async function execute(interaction) {
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  const wait = checkCooldown(p.discord_id, 'wager', COOLDOWNS.wager);
  if (wait) return interaction.reply({ ...verr(cooldownMessage(wait, 'wager')), ephemeral: true });
  if (!tryBurst(p.discord_id, 'wager')) return interaction.reply({ ...verr(burstMessage()), ephemeral: true });
  try {
    const g = activeGlobal(interaction.guildId || 'dm');
    if (!g) return interaction.reply({ ...verr('No global scenario is open. Wagers need a stage.'), ephemeral: true });
    const side = interaction.options.getString('side', true).toUpperCase();
    const amount = interaction.options.getInteger('amount', true);
    const anon = interaction.options.getBoolean('anonymous') || false;
    try {
      if (anon) placeAnonymousPlayerWager(g.guild_id, g.id, p.discord_id, side, amount);
      else placePlayerWager(g.guild_id, g.id, p.discord_id, side, amount);
    } catch (e) {
      return interaction.reply({ ...verr(e.message), ephemeral: true });
    }
    setCooldown(p.discord_id, 'wager', COOLDOWNS.wager);
    const label = side === 'A' ? g.a_label : g.b_label;
    await interaction.reply(streamPanel({ level: 'important', icon: '⚔️', title: '⭐ WAGER PLACED', bodyLines: [`**${amount} Coins** on **${label}**${anon ? ' (anonymous)' : ''}.\n🔒 ESCROWED — the stake has left your balance until Global #${g.id} resolves.`] }));
  } finally {
    clearBurst(p.discord_id, 'wager');
  }
}
