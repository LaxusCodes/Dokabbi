import { getDb } from '../../database/db.js';
import { getPlayer, updatePlayer } from '../players/model.js';
import { recordEvent } from '../world/store.js';
import { bumpCounter } from '../titles/counters.js';
import { recordSale, recordCancel } from './merchant.js';
import { addFavor } from '../sponsors/contracts.js';
import constellations from '../../../data/constellations.json' with { type: 'json' };
import items from '../../../data/items.json' with { type: 'json' };

// Marketplace: escrowed goods, instant settlement, sunk fees.
// Tradable: unequipped inventory items ONLY. Stories, titles, sponsors,
// companions, and identity can never enter this module by construction.
export const MARKET_FEE_PCT = 5;

export const itemDef = (id) => items.find((i) => i.id === id) || { id, name: id, grade: 'Common', bonus: 0 };
export const isRare = (itemId) => ['Rare', 'Epic', 'Legendary', 'Myth'].includes(itemDef(itemId).grade);
export const feeFor = (price) => Math.floor(price * MARKET_FEE_PCT / 100);

export function validateListing({ price, qty }) {
  if (!Number.isInteger(price) || price < 1) throw new Error('Price must be at least 1 coin.');
  if (!Number.isInteger(qty) || qty < 1) throw new Error('Quantity must be at least 1.');
}

// Escrow at list time: goods leave the seller immediately (no double-spend),
// return on cancel, transfer on buy.
export function listItem(sellerId, guildId, itemId, qty, price) {
  validateListing({ price, qty });
  const db = getDb();
  const row = db.prepare('SELECT qty, equipped FROM inventory WHERE discord_id = ? AND item_id = ?').get(sellerId, itemId);
  if (!row || row.qty < qty) throw new Error('You do not hold that many.');
  if (row.equipped) throw new Error('Unequip it first — worn gear is not for sale.');
  if (row.qty === qty) db.prepare('DELETE FROM inventory WHERE discord_id = ? AND item_id = ?').run(sellerId, itemId);
  else db.prepare('UPDATE inventory SET qty = qty - ? WHERE discord_id = ? AND item_id = ?').run(qty, sellerId, itemId);
  const r = db.prepare('INSERT INTO market_listings (guild_id, seller_id, item_id, qty, price) VALUES (?,?,?,?,?)')
    .run(guildId, sellerId, itemId, qty, price);
  return r.lastInsertRowid;
}

export function cancelListing(sellerId, listingId) {
  const db = getDb();
  const l = db.prepare('SELECT * FROM market_listings WHERE id = ?').get(listingId);
  if (!l || l.status !== 'open') throw new Error('No such open listing.');
  if (l.seller_id !== sellerId) throw new Error('Only the seller can cancel.');
  db.prepare('INSERT INTO inventory (discord_id, item_id, qty) VALUES (?,?,?) ON CONFLICT(discord_id,item_id) DO UPDATE SET qty=qty+?')
    .run(sellerId, l.item_id, l.qty, l.qty);
  db.prepare(`UPDATE market_listings SET status = 'cancelled' WHERE id = ?`).run(listingId);
  recordCancel(l.guild_id, sellerId);
  return true;
}

export function buyListing(buyerId, listingId) {
  const db = getDb();
  const l = db.prepare('SELECT * FROM market_listings WHERE id = ?').get(listingId);
  if (!l || l.status !== 'open') throw new Error('Already sold or gone.');
  if (l.seller_id === buyerId) throw new Error('You cannot buy your own listing.');
  const buyer = getPlayer(buyerId);
  if (!buyer) throw new Error('Register first with /register.');
  if (buyer.coins < l.price) throw new Error('Insufficient coins.');
  const seller = getPlayer(l.seller_id);
  const fee = feeFor(l.price);
  updatePlayer(buyerId, { coins: buyer.coins - l.price });
  if (seller) updatePlayer(l.seller_id, { coins: seller.coins + (l.price - fee) });
  db.prepare('INSERT INTO inventory (discord_id, item_id, qty) VALUES (?,?,?) ON CONFLICT(discord_id,item_id) DO UPDATE SET qty=qty+?')
    .run(buyerId, l.item_id, l.qty, l.qty);
  db.prepare(`UPDATE market_listings SET status = 'sold', buyer_id = ? WHERE id = ?`).run(buyerId, listingId);
  // Future Merchant titles read these counters.
  bumpCounter(buyerId, 'trades', 1);
  bumpCounter(buyerId, 'trade_volume', l.price);
  bumpCounter(l.seller_id, 'trades', 1);
  bumpCounter(l.seller_id, 'trade_volume', l.price);
  const rare = isRare(l.item_id);
  const repDelta = recordSale(l.guild_id, l.seller_id, buyerId, l.price, rare);
  if (isRare(l.item_id) && l.guild_id && l.guild_id !== 'dm') {
    // Provenance matters: someone always recognizes where it came from.
    const watcher = constellations[Math.floor(Math.random() * constellations.length)].id;
    const favor = addFavor(buyerId, watcher, 3);
    recordEvent(l.guild_id, { kind: 'world_event', actorId: buyerId, summary: `🔴 A rare item (${itemDef(l.item_id).name}) changed hands for ${l.price} coins. Constellation interest is rising.` });
    return { fee, sellerGets: l.price - fee, repDelta, watcher, favor };
  }
  return { fee, sellerGets: l.price - fee, repDelta };
}

export function browseMarket(guildId, limit = 10) {
  return getDb().prepare(`SELECT * FROM market_listings WHERE guild_id = ? AND status = 'open' ORDER BY id DESC LIMIT ?`).all(guildId, limit);
}

export function inspectListing(listingId) {
  return getDb().prepare('SELECT * FROM market_listings WHERE id = ?').get(listingId);
}

export function historyFor(discordId, limit = 10) {
  return getDb().prepare(`SELECT * FROM market_listings WHERE (seller_id = ? OR buyer_id = ?) AND status != 'open' ORDER BY id DESC LIMIT ?`).all(discordId, discordId, limit);
}
