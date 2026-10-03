import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orv-market-'));
process.env.DATABASE_PATH = path.join(dir, 't.db');

const { getDb } = await import('../src/database/db.js');
const { createPlayer, getPlayer, updatePlayer } = await import('../src/game/players/model.js');
const { listItem, cancelListing, buyListing, browseMarket, historyFor, feeFor, MARKET_FEE_PCT } = await import('../src/game/economy/market.js');
const { createShop, renameShop, closeShop, getShop, recordSale, recordCancel } = await import('../src/game/economy/merchant.js');

getDb();
const stock = (id, item, qty, equipped = 0) => getDb().prepare('INSERT INTO inventory (discord_id, item_id, qty, equipped) VALUES (?,?,?,?) ON CONFLICT(discord_id,item_id) DO UPDATE SET qty=qty+?').run(id, item, qty, equipped, qty);
createPlayer('mS', 'Seller');
createPlayer('mB', 'Buyer');
updatePlayer('mS', { coins: 1000 });
updatePlayer('mB', { coins: 1000 });
stock('mS', 'recovery_pill', 5);
stock('mS', 'reader_coat', 1, 1); // worn

test('fees sink exactly what they claim', () => {
  assert.equal(MARKET_FEE_PCT, 5);
  assert.equal(feeFor(100), 5);
  assert.equal(feeFor(19), 0);
});

test('listing escrows goods; validation holds', () => {
  assert.throws(() => listItem('mS', 'g', 'recovery_pill', 1, 0), /Price/);
  assert.throws(() => listItem('mS', 'g', 'recovery_pill', 0, 10), /Quantity/);
  assert.throws(() => listItem('mS', 'g', 'reader_coat', 1, 10), /Unequip/);
  assert.throws(() => listItem('mS', 'g', 'recovery_pill', 99, 10), /hold that many/);
  const id = listItem('mS', 'g', 'recovery_pill', 2, 100);
  assert.equal(getDb().prepare('SELECT qty FROM inventory WHERE discord_id=? AND item_id=?').get('mS', 'recovery_pill').qty, 3);
  cancelListing('mS', id);
  assert.equal(getDb().prepare('SELECT qty FROM inventory WHERE discord_id=? AND item_id=?').get('mS', 'recovery_pill').qty, 5);
  assert.throws(() => cancelListing('mB', id), /open/);
});

test('settlement conserves coins minus the sink', () => {
  const id = listItem('mS', 'g', 'recovery_pill', 2, 100);
  assert.throws(() => buyListing('mS', id), /own listing/);
  updatePlayer('mB', { coins: 10 });
  assert.throws(() => buyListing('mB', id), /Insufficient/);
  updatePlayer('mB', { coins: 1000 });
  const before = getPlayer('mS').coins + getPlayer('mB').coins;
  const r = buyListing('mB', id);
  assert.equal(r.fee, 5);
  assert.equal(r.sellerGets, 95);
  const after = getPlayer('mS').coins + getPlayer('mB').coins;
  assert.equal(before - after, 5); // exactly the sink, nothing created or lost
  assert.equal(getDb().prepare('SELECT qty FROM inventory WHERE discord_id=? AND item_id=?').get('mB', 'recovery_pill').qty, 2);
  assert.throws(() => buyListing('mB', id), /sold or gone/); // no double-spend
  const hist = historyFor('mB');
  assert.ok(hist.some((h) => h.status === 'sold'));
});

test('servers stay economically isolated; rarity makes spectacles', () => {
  const id = listItem('mS', 'other', 'recovery_pill', 1, 50);
  assert.equal(browseMarket('g').filter((l) => l.id === id).length, 0);
  assert.equal(browseMarket('other').filter((l) => l.id === id).length, 1);
  cancelListing('mS', id);
  getDb().prepare('UPDATE inventory SET equipped = 0 WHERE discord_id = ? AND item_id = ?').run('mS', 'reader_coat');
  stock('mS', 'reader_coat', 1);
  const rare = listItem('mS', 'g', 'reader_coat', 1, 500);
  updatePlayer('mB', { coins: 5000 });
  buyListing('mB', rare);
  const ev = getDb().prepare("SELECT summary FROM world_events WHERE guild_id = ? AND summary LIKE '%rare item%'").all('g');
  assert.ok(ev.length >= 1);
  const counters = Object.fromEntries(getDb().prepare("SELECT key, value FROM title_counters WHERE discord_id='mB'").all().map((r) => [r.key, r.value]));
  assert.ok(counters.trades >= 1 && counters.trade_volume >= 500); // future Merchant titles read these
});

test('one shop per merchant; reputation is earned, never bought', () => {
  createPlayer('mS2', 'Seller2');
  createPlayer('mB2', 'Buyer2');
  updatePlayer('mS2', { coins: 1000 });
  updatePlayer('mB2', { coins: 2000 });
  stock('mS2', 'recovery_pill', 4);
  const shop = createShop('g', 'mS2', 'Ember Mart');
  assert.equal(shop.shop_name, 'Ember Mart');
  assert.throws(() => createShop('g', 'mS2', 'Second'), /one stall/);
  assert.throws(() => createShop('g', 'mB2', ''), /Name your shop/);
  // Same merchant may trade under another sky.
  assert.ok(createShop('other', 'mS2', 'Ember Mart West'));
  renameShop('g', 'mS2', 'Ember Grand Mart');
  assert.equal(getShop('g', 'mS2').shop_name, 'Ember Grand Mart');
  // A real sale: +2 base. Second sale to the same buyer: repeat +1.
  const a = listItem('mS2', 'g', 'recovery_pill', 1, 100);
  buyListing('mB2', a);
  assert.equal(getShop('g', 'mS2').reputation, 2);
  const b = listItem('mS2', 'g', 'recovery_pill', 1, 600);
  buyListing('mB2', b);
  assert.equal(getShop('g', 'mS2').reputation, 2 + 2 + 1 + 1); // base + repeat + high-value
  // Cancellation costs standing.
  const c = listItem('mS2', 'g', 'recovery_pill', 1, 50);
  cancelListing('mS2', c);
  assert.equal(getShop('g', 'mS2').reputation, 2 + 2 + 1 + 1 - 3);
  assert.equal(getShop('g', 'mS2').sales, 2);
});

test('closing pulls stalls home; merchant titles unlock from history', async () => {
  const { bumpCounter } = await import('../src/game/titles/counters.js');
  const { evaluateTitles } = await import('../src/game/titles/evaluate.js');
  stock('mS2', 'recovery_pill', 2);
  listItem('mS2', 'g', 'recovery_pill', 2, 70);
  const pulled = closeShop('g', 'mS2');
  assert.equal(pulled, 1);
  assert.equal(getShop('g', 'mS2').status, 'closed');
  assert.ok(getDb().prepare('SELECT qty FROM inventory WHERE discord_id=? AND item_id=?').get('mS2', 'recovery_pill').qty >= 2);
  assert.throws(() => renameShop('g', 'mS2', 'X'), /No open shop/);
  // 25 real trades earns Merchant of the Stream.
  bumpCounter('mB', 'trades', 25);
  const { fresh } = evaluateTitles('mB', 'g');
  assert.ok(fresh.some((d) => d.id === 'merchant_stream'));
});
