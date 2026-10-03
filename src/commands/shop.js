import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { requireAlive } from '../game/incarnations/lifecycle.js';
import { createShop, renameShop, closeShop, getShop, shopStock } from '../game/economy/merchant.js';
import { itemDef } from '../game/economy/market.js';
import { panel, streamPanel, verr } from '../utils/v2.js';

export const data = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('Your merchant stall in the Stream')
  .addSubcommand((s) => s.setName('view').setDescription('Your shop (or another merchant’s)').addUserOption((o) => o.setName('who').setDescription('Merchant')))
  .addSubcommand((s) => s.setName('create').setDescription('Open your one stall').addStringOption((o) => o.setName('name').setDescription('Shop name').setRequired(true)))
  .addSubcommand((s) => s.setName('rename').setDescription('Rename your shop').addStringOption((o) => o.setName('name').setDescription('New name').setRequired(true)))
  .addSubcommand((s) => s.setName('stock').setDescription('Your escrowed listings'))
  .addSubcommand((s) => s.setName('close').setDescription('Shut down (stalls return to inventory)'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId || 'dm';
  if (sub === 'view') {
    const who = interaction.options.getUser('who');
    const id = who ? who.id : interaction.user.id;
    const shop = getShop(guildId, id);
    if (!shop) return interaction.reply({ ...verr('No shop here. Open one with `/shop create`.'), ephemeral: true });
    const stock = shopStock(guildId, id);
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: `🏪 ${shop.shop_name}`, bodyLines: (`rep ${shop.reputation} (${shop.status})\nSales ${shop.sales} • Volume ${shop.volume} • Cancelled ${shop.cancelled}\n\n` +
        (stock.length ? stock.map((l) => `\`#${l.id}\` **${itemDef(l.item_id).name}** ×${l.qty} — ${l.price} coins`).join('\n') : '_Stalls empty._')).split('\n') }));
  }
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...verr('Use /register first.'), ephemeral: true });
  const dead = requireAlive(p);
  if (dead) return interaction.reply({ ...verr(dead), ephemeral: true });
  try {
    if (sub === 'create') {
      const shop = createShop(guildId, p.discord_id, interaction.options.getString('name', true));
      return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: `🏪 ${shop.shop_name}`, bodyLines: ['Shutters open. Stock it with `/market sell`.'] }));
    }
    if (sub === 'rename') {
      const shop = renameShop(guildId, p.discord_id, interaction.options.getString('name', true));
      return interaction.reply({ ...streamPanel({ level: 'system', icon: '🌌', title: '🏪 RENAMED', bodyLines: [`Now called **${shop.shop_name}**.`] }), ephemeral: true });
    }
    if (sub === 'stock') {
      const stock = shopStock(guildId, p.discord_id);
      if (!stock.length) return interaction.reply({ ...verr('Stalls empty.'), ephemeral: true });
      return interaction.reply({ ...streamPanel({ level: 'system', icon: '🌌', title: '🏪 STOCK', bodyLines: stock.map((l) => `\`#${l.id}\` **${itemDef(l.item_id).name}** ×${l.qty} — ${l.price} coins`).join('\n').split('\n') }), ephemeral: true });
    }
    const pulled = closeShop(guildId, p.discord_id);
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🏪 CLOSED', bodyLines: [`Shutters down. ${pulled} listing(s) returned to inventory. Reputation kept — the Stream remembers.`] }));
  } catch (e) {
    if (interaction.replied || interaction.deferred) return interaction.followUp({ ...verr(e.message), ephemeral: true });
    return interaction.reply({ ...verr(e.message), ephemeral: true });
  }
}
