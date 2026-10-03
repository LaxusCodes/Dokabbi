import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getPlayer } from '../game/players/model.js';
import { requireAlive } from '../game/incarnations/lifecycle.js';
import { createAuction, placeBid, cancelAuction, getAuction, openAuctions, settleAuction, settleDue } from '../game/economy/auction.js';
import { itemDef } from '../game/economy/market.js';
import { v2, panel, streamPanel, verr, td, V2, sheet } from '../utils/v2.js';
import items from '../../data/items.json' with { type: 'json' };

export const data = new SlashCommandBuilder()
  .setName('auction')
  .setDescription('Spectacle sales: the Stream watches people fight over items')
  .addSubcommand((s) => s.setName('create').setDescription('Auction unequipped goods')
    .addStringOption((o) => o.setName('item').setDescription('Item to auction (name: id)').setRequired(true).addChoices(...items.map((i) => ({ name: `${i.name} (${i.id})`, value: i.id }))))
    .addIntegerOption((o) => o.setName('qty').setDescription('How many (default 1)').setRequired(false))
    .addIntegerOption((o) => o.setName('starting_price').setDescription('Opening price in coins (default 0)').setRequired(false))
    .addIntegerOption((o) => o.setName('minutes').setDescription('Duration in minutes, 1–1440 (default 60)').setRequired(false)))
  .addSubcommand((s) => s.setName('bid').setDescription('Bid (escrowed instantly, outbids refunded)')
    .addIntegerOption((o) => o.setName('id').setDescription('Auction id').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('Your bid in coins').setRequired(true)))
  .addSubcommand((s) => s.setName('inspect').setDescription('Full detail on one auction').addIntegerOption((o) => o.setName('id').setDescription('Auction id').setRequired(true)))
  .addSubcommand((s) => s.setName('status').setDescription('Open auctions and time left'))
  .addSubcommand((s) => s.setName('cancel').setDescription('Cancel before any bids').addIntegerOption((o) => o.setName('id').setDescription('Auction id').setRequired(true)));

const left = (a) => `${Math.max(0, Math.round((a.ends_at - Date.now()) / 60000))} min left`;

function auctionCard(a) {
  return `🔨 \`#${a.id}\` **${itemDef(a.item_id).name}** ×${a.qty}\nCurrent bid: 🪙 **${a.current_bid || a.starting_price}**${a.current_bidder ? ` by <@${a.current_bidder}>` : ''}\nTime remaining: ${left(a)}`;
}

function bidRow(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`auc:${id}:bid`).setLabel('Bid').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`auc:${id}:inspect`).setLabel('Inspect').setStyle(ButtonStyle.Secondary),
  );
}

function auctionMsg(a, extra = '') {
  return sheet(auctionCard(a) + extra, [bidRow(a.id)]);
}

export function parseBidAmount(input) {
  const n = Math.floor(Number(String(input).trim()));
  if (!Number.isFinite(n) || n <= 0) throw new Error('Enter a positive whole number of coins.');
  return n;
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId || 'dm';
  if (sub === 'status') {
    settleDue(guildId);
    const rows = openAuctions(guildId);
    if (!rows.length) return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🔨 AUCTIONS', bodyLines: ['No open auctions. Create one with `/auction create item:iron_sword starting_price:100`.'] }));
    const first = rows[0];
    return interaction.reply({
      ...auctionMsg(first, rows.length > 1 ? `\n\n-# +${rows.length - 1} more — use \`/auction inspect id:<id>\`.` : ''),
    });
  }
  if (sub === 'inspect') {
    const a = getAuction(interaction.options.getInteger('id', true));
    if (!a) return interaction.reply({ ...streamPanel({ level: 'system', icon: '🌌', title: '🔨 NOT FOUND', bodyLines: ['No auction with that id. Try `/auction inspect id:<id>`.'] }), ephemeral: true });
    if (a.status === 'open' && Date.now() >= a.ends_at) settleAuction(a.id);
    const cur = getAuction(interaction.options.getInteger('id', true));
    const msg = cur.status === 'open'
      ? { ...auctionMsg(cur, `\nSeller ${cur.seller_id} • Fee on sale: 5% sunk.`), ephemeral: true }
      : { ...streamPanel({ level: 'system', icon: '🌌', title: `🔨 #${cur.id}`, bodyLines: `**${itemDef(cur.item_id).name}** ×${cur.qty} [${cur.status}]\nSeller ${cur.seller_id} • Leading: ${cur.current_bid ? `${cur.current_bid} by ${cur.current_bidder}` : `opens at ${cur.starting_price}`}\nFee on sale: 5% sunk.`.split('\n') }), ephemeral: true };
    return interaction.reply(msg);
  }
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ ...streamPanel({ level: 'system', icon: '🌌', title: '🔨 REGISTER', bodyLines: ['You need to register first. Try `/register`.'] }), ephemeral: true });
  const dead = requireAlive(p);
  if (dead) return interaction.reply({ ...dead, ephemeral: true });
  try {
    if (sub === 'create') {
      const id = createAuction(p.discord_id, guildId, interaction.options.getString('item', true), interaction.options.getInteger('qty') || 1, interaction.options.getInteger('starting_price') || 0, interaction.options.getInteger('minutes') || 60);
      const a = getAuction(id);
      return interaction.reply({
        ...auctionMsg(a, `\nOutbids refund instantly.`),
      });
    }
    if (sub === 'bid') {
      placeBid(p.discord_id, interaction.options.getInteger('id', true), interaction.options.getInteger('amount', true));
      const a = getAuction(interaction.options.getInteger('id', true));
      return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🔨 BID PLACED', bodyLines: [`**${a.current_bid}** on \`#${a.id}\`. Escrowed — refunded the instant someone outbids you.`] }));
    }
    cancelAuction(p.discord_id, interaction.options.getInteger('id', true));
    return interaction.reply({ ...panel({ title: '🔨 CANCELLED', body: 'Auction cancelled before any bids. Goods returned.' }), ephemeral: true });
  } catch (e) {
    if (interaction.replied || interaction.deferred) return interaction.followUp({ ...verr(`${e.message} Try \`/auction <subcommand>\`.`), ephemeral: true });
    return interaction.reply({ ...verr(`${e.message} Try \`/auction <subcommand>\`.`), ephemeral: true });
  }
}

// Button → modal → bid. Same settlement core underneath.
export async function handleAuctionButton(interaction) {
  const [, rawId, action] = interaction.customId.split(':');
  const id = Number(rawId);
  const a = getAuction(id);
  if (!a) return interaction.reply({ ...streamPanel({ level: 'system', icon: '🌌', title: '🔨 GONE', bodyLines: ['That auction is gone.'] }), ephemeral: true });
  if (action === 'inspect') {
    return interaction.reply({
      ...sheet(auctionCard(a) + `\nSeller ${a.seller_id} • Fee on sale: 5% sunk.`, a.status === 'open' ? [bidRow(a.id)] : []),
      ephemeral: true,
    });
  }
  const modal = new ModalBuilder()
    .setCustomId(`auc-bid:${a.id}`)
    .setTitle(`Bid on ${itemDef(a.item_id).name}`);
  const input = new TextInputBuilder()
    .setCustomId('amount')
    .setLabel(`Your bid (min ${a.current_bid ? a.current_bid + 1 : a.starting_price})`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

export async function handleBidModal(interaction) {
  const [, id] = interaction.customId.split(':');
  try {
    const amount = parseBidAmount(interaction.fields.getTextInputValue('amount'));
    const { getPlayer } = await import('../game/players/model.js');
    const p = getPlayer(interaction.user.id);
    if (!p) return interaction.reply({ ...streamPanel({ level: 'system', icon: '🌌', title: '🔨 REGISTER', bodyLines: ['Use `/register` first.'] }), ephemeral: true });
    placeBid(p.discord_id, Number(id), amount);
    const cur = getAuction(Number(id));
    return interaction.reply(streamPanel({ level: 'system', icon: '🌌', title: '🔨 BID PLACED', bodyLines: [`**${cur.current_bid}** on \`#${cur.id}\`. Escrowed — refunded the instant someone outbids you.`] }));
  } catch (e) {
    if (interaction.replied || interaction.deferred) return interaction.followUp({ ...verr(`${e.message} Try \`/auction bid id:<id> amount:<n>\`.`), ephemeral: true });
    return interaction.reply({ ...verr(`${e.message} Try \`/auction bid id:<id> amount:<n>\`.`), ephemeral: true });
  }
}


