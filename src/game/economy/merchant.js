import { getDb } from '../../database/db.js';
import { bumpCounter } from '../titles/counters.js';

// Merchant identity: reputation derived from actual trade history, never bought.
// One shop per player per guild. Stock reuses market escrow — no second inventory.
export function getShop(guildId, playerId) {
  return getDb().prepare('SELECT * FROM merchant_profiles WHERE guild_id = ? AND player_id = ?').get(guildId, playerId);
}

export function createShop(guildId, playerId, name) {
  if (getShop(guildId, playerId)) throw new Error('You already run a shop on this server. One merchant, one stall.');
  const clean = String(name || '').slice(0, 32).trim();
  if (!clean) throw new Error('Name your shop.');
  getDb().prepare('INSERT INTO merchant_profiles (guild_id, player_id, shop_name) VALUES (?,?,?)').run(guildId, playerId, clean);
  return getShop(guildId, playerId);
}

export function renameShop(guildId, playerId, name) {
  const shop = getShop(guildId, playerId);
  if (!shop || shop.status !== 'open') throw new Error('No open shop to rename.');
  const clean = String(name || '').slice(0, 32).trim();
  if (!clean) throw new Error('Name your shop.');
  getDb().prepare('UPDATE merchant_profiles SET shop_name = ? WHERE guild_id = ? AND player_id = ?').run(clean, guildId, playerId);
  return getShop(guildId, playerId);
}

export function closeShop(guildId, playerId) {
  const db = getDb();
  const shop = getShop(guildId, playerId);
  if (!shop || shop.status !== 'open') throw new Error('No open shop.');
  // Closing pulls every stall: escrowed goods return to inventory.
  const open = db.prepare(`SELECT * FROM market_listings WHERE guild_id = ? AND seller_id = ? AND status = 'open'`).all(guildId, playerId);
  for (const l of open) {
    db.prepare('INSERT INTO inventory (discord_id, item_id, qty) VALUES (?,?,?) ON CONFLICT(discord_id,item_id) DO UPDATE SET qty=qty+?')
      .run(playerId, l.item_id, l.qty, l.qty);
    db.prepare(`UPDATE market_listings SET status = 'cancelled' WHERE id = ?`).run(l.id);
  }
  db.prepare(`UPDATE merchant_profiles SET status = 'closed' WHERE guild_id = ? AND player_id = ?`).run(guildId, playerId);
  return open.length;
}

// Reputation events, all earned: +2 sale, +1 repeat customer, +1 at 500+ value,
// +2 rare sale, −3 cancellation.
export function recordSale(guildId, sellerId, buyerId, price, rare) {
  const db = getDb();
  const shop = getShop(guildId, sellerId);
  const repeat = db.prepare(`SELECT COUNT(*) v FROM market_listings WHERE guild_id = ? AND seller_id = ? AND buyer_id = ? AND status = 'sold'`).get(guildId, sellerId, buyerId).v > 1;
  let delta = 2;
  if (repeat) delta += 1;
  if (price >= 500) delta += 1;
  if (rare) {
    delta += 2;
    bumpCounter(sellerId, 'rare_sales');
  }
  if (shop) {
    db.prepare('UPDATE merchant_profiles SET reputation = reputation + ?, sales = sales + 1, volume = volume + ? WHERE guild_id = ? AND player_id = ?')
      .run(delta, price, guildId, sellerId);
  }
  return delta;
}

export function recordCancel(guildId, sellerId) {
  const shop = getShop(guildId, sellerId);
  if (!shop) return 0;
  getDb().prepare('UPDATE merchant_profiles SET reputation = reputation - 3, cancelled = cancelled + 1 WHERE guild_id = ? AND player_id = ?')
    .run(guildId, sellerId);
  return -3;
}

export function shopStock(guildId, playerId, limit = 10) {
  return getDb().prepare(`SELECT * FROM market_listings WHERE guild_id = ? AND seller_id = ? AND status = 'open' ORDER BY id DESC LIMIT ?`).all(guildId, playerId, limit);
}
