import { SlashCommandBuilder } from 'discord.js';
import { activeGlobal, votesFor } from '../game/scenarios/store.js';
import { openWagers } from '../game/wagers/store.js';
import { poolTotals } from '../game/wagers/engine.js';
import { computeMeters, sentimentText, wagerFeedLine } from '../game/starstream/audience.js';
import { alterCount } from '../game/canon/store.js';
import { getPlayer } from '../game/players/model.js';
import { constellationName, getOrSeedWallets } from '../game/constellations/wallets.js';
import { streamPanel } from '../utils/v2.js';

export const data = new SlashCommandBuilder().setName('audience').setDescription('Who the stream favors, and how loudly');

export async function execute(interaction) {
  const guildId = interaction.guildId || 'dm';
  const g = activeGlobal(guildId);
  if (!g) return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '📡 AUDIENCE', bodyLines: ['No global scenario is open. The audience is quiet… for now.'] }));
  const votes = votesFor(g.id);
  const wagers = openWagers(guildId, g.id);
  const displayOf = (w) => (w.kind === 'constellation' ? constellationName(w.backer_id) : getPlayer(w.backer_id)?.name || 'An incarnation');
  const meters = computeMeters({
    votesA: votes.filter((v) => v.choice === 'A').length,
    votesB: votes.filter((v) => v.choice === 'B').length,
    wagerCount: wagers.length,
    alters: alterCount(guildId),
  });
  const pools = poolTotals(wagers);
  const feed = wagers.slice(0, 10).map((w) => wagerFeedLine({ ...w, display: displayOf(w), aLabel: g.a_label, bLabel: g.b_label })).join('\n');
  const wallets = getOrSeedWallets(guildId)
    .map((w) => `• ${constellationName(w.constellation_id)} — influence ${w.influence}, escrowed ${w.escrow}`)
    .join('\n');
  await interaction.reply(streamPanel({ level: 'system', icon: '🌌', bodyLines: [sentimentText({ aLabel: `A — ${g.a_label}`, bLabel: `B — ${g.b_label}`, meters }) +
    `\n\nStaked: A ${pools.a} / B ${pools.b} coins` +
    (feed ? `\n\n${feed}` : '\n\n_No wagers yet._') +
    `\n\n__Constellation limits__\n${wallets}\n\n-# Max wager = influence × 100. Wagers cost influence.`] }));
}
