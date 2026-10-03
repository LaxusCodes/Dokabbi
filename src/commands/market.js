import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { requireAlive } from '../game/incarnations/lifecycle.js';
import { listItem, cancelListing, buyListing, browseMarket, inspectListing, historyFor, itemDef, feeFor, MARKET_FEE_PCT } from '../game/economy/market.js';
import { paginate, pageRow } from '../utils/interactions.js';
import { panel, streamPanel, verr, td, V2, sheet } from '../utils/v2.js';

export function renderMarketPage(guildId, page = 0) {
  const rows = browseMarket(guildId, 50);
  if (!rows.length) return streamPanel({ level: 'system', icon: '🌌', title: '🏪 MARKET', bodyLines: ['Stalls empty. List something with `/market sell`.'] });
  const { slice, page: safe, total } = paginate(rows, page, 5);
  return sheet(
    `🏪 **MARKET** (page ${safe + 1}/${total})\n${slice.map(line).join('\n')}`,
    total > 1 ? [pageRow('market', safe, total)] : []
  );
}

export const data = new SlashCommandBuilder()
  .setName('market')
  .setDescription(`Player marketplace (${MARKET_FEE_PCT}% fee, sunk). Goods only — never lives.`)
  .addSubcommand((s) => s.setName('browse').setDescription('Open listings on this server'))
  .addSubcommand((s) => s.setName('sell').setDescription('List unequipped inventory (escrowed)')
    .addStringOption((o) => o.setName('item').setDescription('Item id').setRequired(true))
    .addIntegerOption((o) => o.setName('qty').setDescription('Quantity').setRequired(true))
    .addIntegerOption((o) => o.setName('price').setDescription('Total price').setRequired(true)))
  .addSubcommand((s) => s.setName('buy').setDescription('Buy now').addIntegerOption((o) => o.setName('id').setDescription('Listing id').setRequired(true)))
  .addSubcommand((s) => s.setName('cancel').setDescription('Pull your listing (goods return)').addIntegerOption((o) => o.setName('id').setDescription('Listing id').setRequired(true)))
  .addSubcommand((s) => s.setName('inspect').setDescription('A listing').addIntegerOption((o) => o.setName('id').setDescription('Listing id').setRequired(true)))
  .addSubcommand((s) => s.setName('history').setDescription('Your past trades'));

const line = (l) => {
  const def = itemDef(l.item_id);
  return `\`#${l.id}\` **${def.name}** ×${l.qty} — ${l.price} coins _(${l.status}${l.status === 'sold' ? ` → ${l.buyer_id}` : ''})_`;
};

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId || 'dm';
  if (sub === 'browse') {
    return interaction.reply(renderMarketPage(guildId, 0));
  }
  if (sub === 'inspect') {
    const l = inspectListing(interaction.options.getInteger('id', true));
    if (!l) return interaction.reply({ ...verr('No such listing.'), ephemeral: true });
    const def = itemDef(l.item_id);
    return interaction.reply({ ...streamPanel({ level: 'system', icon: '🌌', title: `🏪 #${l.id}`, bodyLines: `${line(l)}\n_${def.grade} • bonus ${def.bonus} • fee on sale: ${feeFor(l.price)} coins (sunk)_`.split('\n') }), ephemeral: true });
  }
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  const dead = requireAlive(p);
  if (dead) return interaction.reply({ ...verr(dead), ephemeral: true });
  try {
    if (sub === 'sell') {
      const id = listItem(p.discord_id, guildId, interaction.options.getString('item', true), interaction.options.getInteger('qty', true), interaction.options.getInteger('price', true));
      return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🏪 LISTED', bodyLines: [`Listed as \`#${id}\`. Goods escrowed — cancel anytime to reclaim.`] }));
    }
    if (sub === 'cancel') {
      cancelListing(p.discord_id, interaction.options.getInteger('id', true));
      return interaction.reply({ ...streamPanel({ level: 'system', icon: '🌌', title: '🏪 PULLED', bodyLines: ['Listing pulled. Goods returned.'] }), ephemeral: true });
    }
    if (sub === 'buy') {
      const r = buyListing(p.discord_id, interaction.options.getInteger('id', true));
      return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🏪 SOLD', bodyLines: [`Seller receives ${r.sellerGets} (fee ${r.fee} sunk into the Stream).${r.watcher ? ` Someone recognizes it — favor +3 with a watching constellation.` : ''}`] }));
    }
    const rows = historyFor(p.discord_id);
    if (!rows.length) return interaction.reply({ ...verr('No trades yet.'), ephemeral: true });
    return interaction.reply({ ...streamPanel({ level: 'system', icon: '🌌', title: '📜 YOUR TRADES', bodyLines: rows.map(line).join('\n').split('\n') }), ephemeral: true });
  } catch (e) {
    return interaction.reply({ ...verr(e.message), ephemeral: true });
  }
}
