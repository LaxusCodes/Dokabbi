import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orv-social-'));
process.env.DATABASE_PATH = path.join(dir, 't.db');

const { getDb } = await import('../src/database/db.js');
const { createPlayer } = await import('../src/game/players/model.js');
const { rankBy, fameText, compareText, fameBoard } = await import('../src/game/social/fame.js');
const { parseBidAmount } = await import('../src/commands/auction.js');

getDb();

test('rankBy orders and filters the silent', () => {
  const rows = rankBy(['a', 'b', 'c'], (id) => ({ a: 5, b: 0, c: 9 })[id]);
  assert.deepEqual(rows.map((r) => r.id), ['c', 'a']);
  assert.deepEqual(rankBy([], () => 1), []);
});

test('fame text shows many kinds of famous', () => {
  const text = fameText([
    { label: 'Most Watched', emoji: '👑', rows: ['#1 Laxus — 12'] },
    { label: 'Market Maker', emoji: '💰', rows: [] },
  ]);
  assert.ok(text.includes('Most Watched') && text.includes('Laxus') && text.includes('No one yet'));
});

test('compare marks the leader per row', () => {
  const text = compareText('A', 'B',
    { level: 10, stories: 3, clears: 5, wins: 2, trade_volume: 0, favor_max: 40, world_events: 9, titles: 1 },
    { level: 8, stories: 3, clears: 7, wins: 2, trade_volume: 100, favor_max: 10, world_events: 4, titles: 0 });
  assert.ok(text.includes('▲ Level: **10** — **8**'));
  assert.ok(text.includes('= Stories: **3** — **3**'));
  assert.ok(text.includes('▽') && text.includes('▲'));
});

test('bid amounts parse strictly', () => {
  assert.equal(parseBidAmount('750'), 750);
  assert.equal(parseBidAmount(' 99.9 '), 99);
  assert.throws(() => parseBidAmount('zero'), /positive/);
  assert.throws(() => parseBidAmount('-5'), /positive/);
  assert.throws(() => parseBidAmount(''), /positive/);
});

test('fame board ranks recorded lives', () => {
  createPlayer('f1', 'Fame1');
  createPlayer('f2', 'Fame2');
  const db = getDb();
  for (let i = 0; i < 5; i++) {
    db.prepare('INSERT INTO world_events (guild_id, kind, actor_id, summary) VALUES (?,?,?,?)').run('g', 'scenario_clear', 'f1', ` deed ${i}`);
  }
  db.prepare('INSERT INTO world_events (guild_id, kind, actor_id, summary) VALUES (?,?,?,?)').run('g', 'scenario_clear', 'f2', 'deed');
  db.prepare('INSERT INTO combat_logs (kind, participants, winner_id, log) VALUES (?,?,?,?)').run('pve', JSON.stringify(['f2']), 'f2', '[]');
  db.prepare('INSERT INTO combat_logs (kind, participants, winner_id, log) VALUES (?,?,?,?)').run('pve', JSON.stringify(['f2']), 'f2', '[]');
  const board = fameBoard('g');
  const watched = board.find((b) => b.label === 'Most Watched');
  assert.ok(watched.rows[0].includes('Fame1'));
  const danger = board.find((b) => b.label === 'Most Dangerous');
  assert.ok(danger.rows[0].includes('Fame2'));
  assert.equal(board.length, 6);
});
