import { getDb } from '../../database/db.js';
import { getPlayer, updatePlayer } from '../players/model.js';
import { recordEvent } from '../world/store.js';
import { bumpCounter } from '../titles/counters.js';
import { recordSale, recordCancel } from './merchant.js';
import { feeFor, itemDef, isRare } from './market.js';
import { bumpChannel, addInterest, topInterests, seedAttention } from '../starstream/store.js';
import { emit } from '../events/bus.js';

// Auctions: spectacle over the same settlement core. Bid escrow in coins,
// item escrow at creation, losers refunded the instant they are outbid.
// Lives can never enter: only unequipped inventory goods, validated like market.
export function createAuction(sellerId, guildId, itemId, qty, startingPrice, minutes = 60) {
  if (!Number.isInteger(startingPrice) || startingPrice < 1) throw new Error('Starting price must be at least 1 coin.');
  if (!Number.isInteger(qty) || qty < 1) throw new Error('Quantity must be at least 1.');
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error('Duration 1–1440 minutes.');
  const db = getDb();
  const row = db.prepare('SELECT qty, equipped FROM inventory WHERE discord_id = ? AND item_id = ?').get(sellerId, itemId);
  if (!row || row.qty < qty) throw new Error('You do not hold that many.');
  if (row.equipped) throw new Error('Unequip it first — worn gear is not for sale.');
  if (row.qty === qty) db.prepare('DELETE FROM inventory WHERE discord_id = ? AND item_id = ?').run(sellerId, itemId);
  else db.prepare('UPDATE inventory SET qty = qty - ? WHERE discord_id = ? AND item_id = ?').run(qty, sellerId, itemId);
  const r = db.prepare('INSERT INTO auctions (guild_id, seller_id, item_id, qty, starting_price, ends_at) VALUES (?,?,?,?,?,?)')
    .run(guildId, sellerId, itemId, qty, startingPrice, Date.now() + minutes * 60000);
  const id = r.lastInsertRowid;
  seedAttention(guildId); // the audience exists before it reacts
  emit('auction_created', { guildId, auctionId: id, sellerId, itemId });
  if (isRare(itemId) || startingPrice >= 500) {
    if (guildId && guildId !== 'dm') {
      recordEvent(guildId, { kind: 'world_event', actorId: sellerId, summary: `🔴 A rare item (${itemDef(itemId).name}) entered auction (from ${startingPrice} coins). The Stream leans in.` });
    }
    emit('auction_rare', { guildId, auctionId: id });
    bumpChannel(guildId, { excitement: 5 });
  }
  return id;
}

export function getAuction(auctionId) {
  return getDb().prepare('SELECT * FROM auctions WHERE id = ?').get(auctionId);
}

export function openAuctions(guildId, limit = 10) {
  settleDue(guildId);
  return getDb().prepare(`SELECT * FROM auctions WHERE guild_id = ? AND status = 'open' ORDER BY ends_at LIMIT ?`).all(guildId, limit);
}

export function placeBid(bidderId, auctionId, amount) {
  settleDueFor(auctionId);
  const db = getDb();
  const a = getAuction(auctionId);
  if (!a || a.status !== 'open') throw new Error('Auction is not open.');
  if (Date.now() >= a.ends_at) {
    settleAuction(auctionId);
    throw new Error('Auction just closed.');
  }
  if (a.seller_id === bidderId) throw new Error('Sellers cannot bid on their own auction.');
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Bid must be positive.');
  const floor = a.current_bid ? a.current_bid + 1 : a.starting_price;
  if (amount < floor) throw new Error(`Must bid at least ${floor}.`);
  const bidder = getPlayer(bidderId);
  if (!bidder) throw new Error('Register first with /register.');
  if (bidder.coins < amount) throw new Error('Insufficient coins for escrow.');
  updatePlayer(bidderId, { coins: bidder.coins - amount });
  // Outbid escrow returns instantly — nobody's coins are ever double-held.
  if (a.current_bidder) {
    const prev = getPlayer(a.current_bidder);
    if (prev) updatePlayer(a.current_bidder, { coins: prev.coins + a.current_bid });
    emit('auction_outbid', { guildId: a.guild_id, auctionId, bidderId: a.current_bidder, amount: a.current_bid });
  }
  db.prepare('UPDATE auctions SET current_bid = ?, current_bidder = ? WHERE id = ?').run(amount, bidderId, auctionId);
  emit('auction_bid', { guildId: a.guild_id, auctionId, bidderId, amount });
  if (amount >= 500) {
    bumpChannel(a.guild_id, { excitement: 2 });
    const top = topInterests(a.guild_id, 1)[0];
    if (top) addInterest(a.guild_id, top.constellation_id, 2);
  }
  return true;
}

export function cancelAuction(sellerId, auctionId) {
  const db = getDb();
  const a = getAuction(auctionId);
  if (!a || a.status !== 'open') throw new Error('No such open auction.');
  if (a.seller_id !== sellerId) throw new Error('Only the seller can cancel.');
  if (a.current_bidder) throw new Error('Bids exist — the Stream does not let sellers flee an audience.');
  db.prepare('INSERT INTO inventory (discord_id, item_id, qty) VALUES (?,?,?) ON CONFLICT(discord_id,item_id) DO UPDATE SET qty=qty+?')
    .run(sellerId, a.item_id, a.qty, a.qty);
  db.prepare(`UPDATE auctions SET status = 'cancelled' WHERE id = ?`).run(auctionId);
  recordCancel(a.guild_id, sellerId);
  return true;
}

// Lazy expiry: every read settles what's due. Single-threaded sync => exactly once.
export function settleDue(guildId) {
  const due = getDb().prepare(`SELECT id FROM auctions WHERE guild_id = ? AND status = 'open' AND ends_at <= ?`).all(guildId, Date.now());
  for (const row of due) settleAuction(row.id);
}

function settleDueFor(auctionId) {
  const a = getAuction(auctionId);
  if (a && a.status === 'open' && Date.now() >= a.ends_at) settleAuction(auctionId);
}

export function settleAuction(auctionId) {
  const db = getDb();
  const a = getAuction(auctionId);
  if (!a || a.status !== 'open') return null; // already settled: exactly once
  if (!a.current_bidder) {
    db.prepare('INSERT INTO inventory (discord_id, item_id, qty) VALUES (?,?,?) ON CONFLICT(discord_id,item_id) DO UPDATE SET qty=qty+?')
      .run(a.seller_id, a.item_id, a.qty, a.qty);
    db.prepare(`UPDATE auctions SET status = 'expired' WHERE id = ?`).run(auctionId);
    return { status: 'expired' };
  }
  const fee = feeFor(a.current_bid);
  const seller = getPlayer(a.seller_id);
  if (seller) updatePlayer(a.seller_id, { coins: seller.coins + (a.current_bid - fee) });
  db.prepare('INSERT INTO inventory (discord_id, item_id, qty) VALUES (?,?,?) ON CONFLICT(discord_id,item_id) DO UPDATE SET qty=qty+?')
    .run(a.current_bidder, a.item_id, a.qty, a.qty);
  db.prepare(`UPDATE auctions SET status = 'sold' WHERE id = ?`).run(auctionId);
  bumpCounter(a.current_bidder, 'trades', 1);
  bumpCounter(a.current_bidder, 'trade_volume', a.current_bid);
  bumpCounter(a.seller_id, 'trades', 1);
  bumpCounter(a.seller_id, 'trade_volume', a.current_bid);
  const repDelta = recordSale(a.guild_id, a.seller_id, a.current_bidder, a.current_bid, isRare(a.item_id));
  emit('auction_won', { guildId: a.guild_id, auctionId, winnerId: a.current_bidder, price: a.current_bid });
  if (a.guild_id && a.guild_id !== 'dm') {
    recordEvent(a.guild_id, { kind: 'world_event', actorId: a.current_bidder, summary: `🔨 Auction won: ${itemDef(a.item_id).name} ×${a.qty} for ${a.current_bid} coins (fee ${fee} sunk).` });
  }
  return { status: 'sold', fee, sellerGets: a.current_bid - fee, repDelta };
}
