import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orv-auction-'));
process.env.DATABASE_PATH = path.join(dir, 't.db');

const { getDb } = await import('../src/database/db.js');
const { createPlayer, getPlayer, updatePlayer } = await import('../src/game/players/model.js');
const { createAuction, placeBid, cancelAuction, getAuction, settleAuction, settleDue, openAuctions } = await import('../src/game/economy/auction.js');

getDb();
const stock = (id, item, qty) => getDb().prepare('INSERT INTO inventory (discord_id, item_id, qty, equipped) VALUES (?,?,?,0) ON CONFLICT(discord_id,item_id) DO UPDATE SET qty=qty+?').run(id, item, qty, qty);
createPlayer('aS', 'Seller');
createPlayer('aB1', 'Bidder1');
createPlayer('aB2', 'Bidder2');
for (const u of ['aS', 'aB1', 'aB2']) updatePlayer(u, { coins: 10000 });
stock('aS', 'recovery_pill', 3);
stock('aS', 'reader_coat', 1);

test('creation escrows goods; rules hold', () => {
  assert.throws(() => createAuction('aS', 'g', 'recovery_pill', 1, 0, 60), /Starting price/);
  assert.throws(() => createAuction('aS', 'g', 'nope', 1, 10, 60), /hold that many/);
  assert.throws(() => createAuction('aS', 'g', 'recovery_pill', 1, 10, 0), /Duration/);
  const id = createAuction('aS', 'g', 'recovery_pill', 2, 100, 60);
  assert.equal(getDb().prepare('SELECT qty FROM inventory WHERE discord_id=? AND item_id=?').get('aS', 'recovery_pill').qty, 1);
  assert.throws(() => placeBid('aS', id, 150), /own auction/);
  assert.throws(() => placeBid('aB1', id, 50), /at least 100/);
  updatePlayer('aB1', { coins: 0 });
  assert.throws(() => placeBid('aB1', id, 100), /Insufficient/);
  updatePlayer('aB1', { coins: 10000 });
  cancelAuction('aS', id); // no bids yet: allowed
  assert.equal(getDb().prepare('SELECT qty FROM inventory WHERE discord_id=? AND item_id=?').get('aS', 'recovery_pill').qty, 3);
});

test('outbids refund instantly; conservation holds end to end', () => {
  const id = createAuction('aS', 'g', 'recovery_pill', 1, 100, 60);
  placeBid('aB1', id, 100);
  assert.equal(getPlayer('aB1').coins, 9900);
  placeBid('aB2', id, 150); // aB1 refunded immediately
  assert.equal(getPlayer('aB1').coins, 10000);
  assert.equal(getPlayer('aB2').coins, 9850);
  assert.throws(() => cancelAuction('aS', id), /Bids exist/);
  // Force expiry, settle twice: exactly once.
  getDb().prepare('UPDATE auctions SET ends_at = ? WHERE id = ?').run(Date.now() - 1, id);
  const r1 = settleAuction(id);
  const r2 = settleAuction(id);
  assert.equal(r1.status, 'sold');
  assert.equal(r2, null);
  assert.equal(r1.fee, 7); // 5% of 150
  const sCoins = getPlayer('aS').coins;
  const b2Coins = getPlayer('aB2').coins;
  const b1Coins = getPlayer('aB1').coins;
  assert.equal(sCoins + b1Coins + b2Coins, 30000 - 7); // exact conservation
  assert.equal(getDb().prepare('SELECT qty FROM inventory WHERE discord_id=? AND item_id=?').get('aB2', 'recovery_pill').qty, 1);
  assert.throws(() => placeBid('aB1', id, 200), /not open/);
});

test('no-bid expiry restores; isolation holds', () => {
  const id = createAuction('aS', 'gx', 'recovery_pill', 1, 50, 60);
  assert.equal(openAuctions('g').filter((a) => a.id === id).length, 0);
  assert.equal(openAuctions('gx').filter((a) => a.id === id).length, 1);
  getDb().prepare('UPDATE auctions SET ends_at = ? WHERE id = ?').run(Date.now() - 1, id);
  settleDue('gx');
  assert.equal(getAuction(id).status, 'expired');
  // Stock carried across tests: 3 minted − 1 sold + 1 listed − 1 listed + 1 restored = 2.
  assert.equal(getDb().prepare('SELECT qty FROM inventory WHERE discord_id=? AND item_id=?').get('aS', 'recovery_pill').qty, 2);
});

test('killer: rare auction draws the Stream, pays merchant, mints history', async () => {
  const { createShop } = await import('../src/game/economy/merchant.js');
  createShop('g', 'aS', 'Stall');
  const id = createAuction('aS', 'g', 'reader_coat', 1, 400, 60);
  const ev0 = getDb().prepare("SELECT COUNT(*) v FROM world_events WHERE guild_id='g' AND summary LIKE '%entered auction%'").get().v;
  assert.ok(ev0 >= 1);
  placeBid('aB1', id, 400);
  placeBid('aB2', id, 600); // spectacle threshold: excitement + interest move
  const ch = getDb().prepare('SELECT excitement FROM channel_state WHERE guild_id=?').get('g');
  assert.ok(ch.excitement > 20);
  const interests = getDb().prepare('SELECT MAX(interest) v FROM constellation_attention WHERE guild_id=?').get('g').v;
  assert.ok(interests >= 10);
  getDb().prepare('UPDATE auctions SET ends_at = ? WHERE id = ?').run(Date.now() - 1, id);
  const r = settleAuction(id);
  assert.equal(r.status, 'sold');
  const { bumpCounter } = await import('../src/game/titles/counters.js');
  const { evaluateTitles } = await import('../src/game/titles/evaluate.js');
  bumpCounter('aS', 'trades', 25);
  const { fresh } = evaluateTitles('aS', 'g');
  assert.ok(fresh.some((d) => d.id === 'merchant_stream'));
  const won = getDb().prepare("SELECT summary FROM world_events WHERE guild_id='g' AND summary LIKE '%Auction won%'").all();
  assert.ok(won.length >= 1);
  const rep = getDb().prepare('SELECT reputation FROM merchant_profiles WHERE guild_id=? AND player_id=?').get('g', 'aS')?.reputation || 0;
  assert.ok(rep >= 2); // recordSale ran through auction settlement
});
