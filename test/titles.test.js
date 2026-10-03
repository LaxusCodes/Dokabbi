import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orv-titles-'));
process.env.DATABASE_PATH = path.join(dir, 't.db');

const { getDb } = await import('../src/database/db.js');
const { createPlayer } = await import('../src/game/players/model.js');
const { bumpCounter, countersOf } = await import('../src/game/titles/counters.js');
const { checkTitle } = await import('../src/game/titles/evaluate.js');
const { setSlots, perksFor, activeTitles } = await import('../src/game/titles/perks.js');
import titles from '../data/titles.json' with { type: 'json' };

getDb();
createPlayer('t1', 'Titles');

test('pool is behavior with teeth', () => {
  assert.ok(titles.length >= 60);
  for (const t of titles) {
    assert.ok(t.id && t.name && t.perk?.kind && typeof t.perk.value === 'number', t.id);
    assert.ok(['reward', 'power', 'energy', 'wager', 'favor'].includes(t.perk.kind), t.id);
    assert.ok(Object.keys(t.req?.counters || {}).length + Object.keys(t.req?.queries || {}).length > 0, t.id);
  }
});

test('checks gate on real thresholds', () => {
  const defier = titles.find((t) => t.id === 'defier');
  assert.deepEqual(checkTitle(defier, { gambit_wins: 2 }), { met: false, progress: '2/3' });
  assert.ok(checkTitle(defier, { gambit_wins: 3 }).met);
  const twice = titles.find((t) => t.id === 'twice_born');
  assert.ok(!checkTitle(twice, { rebirths: 0 }).met);
});

test('slots enforce earned-only, split strength', () => {
  getDb().prepare('INSERT INTO player_titles (discord_id, title_id) VALUES (?,?)').run('t1', 'butcher');
  getDb().prepare('INSERT INTO player_titles (discord_id, title_id) VALUES (?,?)').run('t1', 'veteran');
  assert.throws(() => setSlots('t1', { primary: 'defier' }), /Unearned/);
  assert.throws(() => setSlots('t1', { primary: 'butcher', secondary1: 'butcher' }), /stand alone/);
  setSlots('t1', { primary: 'butcher', secondary1: 'veteran' });
  assert.equal(activeTitles('t1').primary, 'butcher');
  // Butcher power 10 primary + Veteran power 3 halved = 11.5 (both unconditional).
  const perks = perksFor('t1', { always: true });
  assert.equal(perks.power, 11.5);
  assert.equal(perks.reward, 0);
  // Conditional perks stay holstered without context.
  getDb().prepare('INSERT INTO player_titles (discord_id, title_id) VALUES (?,?)').run('t1', 'defier');
  setSlots('t1', { primary: 'defier' });
  assert.equal(perksFor('t1', {}).reward, 0);
  assert.equal(perksFor('t1', { gambit: true }).reward, 5);
  // Unknown ids rejected.
  assert.throws(() => setSlots('t1', { primary: 'nope' }), /No such title/);
  assert.deepEqual(countersOf('nobody'), {});
  bumpCounter('t1', 'gambits', 2);
  assert.equal(countersOf('t1').gambits, 2);
});
