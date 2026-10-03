import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orv-presence-'));
process.env.DATABASE_PATH = path.join(dir, 't.db');

const { getDb } = await import('../src/database/db.js');
const { createPlayer } = await import('../src/game/players/model.js');
const { scheduleEcho, dueEchoes, deliverEcho, setStreamChannel, getStreamChannel, echoFor } = await import('../src/game/world/echoes.js');
const { companionTalk } = await import('../src/game/combat/companions.js');
const { findCharacter } = await import('../src/game/cards/characters.js');

getDb();

test('echoes wait, fire once, and only add history', () => {
  const id = scheduleEcho('g1', 'altered_echo', 'Aftershock.', 3600000);
  assert.ok(id);
  assert.equal(scheduleEcho('dm', 'x', 'y', 1), null);
  assert.equal(dueEchoes('g1', Date.now()).length, 0); // not yet
  const all = dueEchoes('g1', Date.now() + 3600000);
  assert.equal(all.length, 1);
  const delivered = deliverEcho(id);
  assert.equal(delivered.summary, 'Aftershock.');
  assert.equal(deliverEcho(id), null); // exactly once
  assert.equal(dueEchoes('g1', Date.now() + 60000).length, 0);
  const ev = getDb().prepare("SELECT summary FROM world_events WHERE guild_id='g1'").all();
  assert.ok(ev.some((e) => e.summary.includes('Aftershock')));
  assert.ok(echoFor.fallen('X').delayMs > 0 && echoFor.altered('X', '001').summary.includes('001'));
});

test('stream channels are opt-in per guild', () => {
  assert.equal(getStreamChannel('g9'), null);
  setStreamChannel('g9', 'chan123');
  assert.equal(getStreamChannel('g9'), 'chan123');
});

test('play-channel fence defaults open, gates exactly', async () => {
  const { setPlayChannel, clearPlayChannel, getPlayChannel, channelAllowed } = await import('../src/game/world/echoes.js');
  assert.equal(getPlayChannel('fence'), null);
  assert.ok(channelAllowed(null, 'any'));
  assert.ok(channelAllowed(getPlayChannel('fence'), 'any')); // open by default
  setPlayChannel('fence', 'chanA');
  assert.equal(getPlayChannel('fence'), 'chanA');
  assert.ok(channelAllowed('chanA', 'chanA'));
  assert.ok(!channelAllowed('chanA', 'chanB'));
  assert.ok(!channelAllowed(getPlayChannel('fence'), 'chanB'));
  clearPlayChannel('fence');
  assert.equal(getPlayChannel('fence'), null);
  assert.ok(channelAllowed(getPlayChannel('fence'), 'chanB'));
});

test('per-server prefix falls back to global default', async () => {
  const { setPrefix, clearPrefix, getPrefix } = await import('../src/game/world/echoes.js');
  const { config } = await import('../src/config.js');
  assert.equal(getPrefix('px'), config.prefix);
  assert.equal(getPrefix(null), config.prefix);
  assert.equal(setPrefix('px', '!'), '!');
  assert.equal(getPrefix('px'), '!');
  assert.throws(() => setPrefix('px', 'too long prefix'), /1–5/);
  assert.throws(() => setPrefix('px', ''), /1–5/);
  clearPrefix('px');
  assert.equal(getPrefix('px'), config.prefix);
});

test('companions speak according to closeness', () => {
  const def = findCharacter('lee_seolhwa');
  const cold = companionTalk(def, { bond: 0, trust: 5 });
  const warm = companionTalk(def, { bond: 45, trust: 80 });
  const mid = companionTalk(def, { bond: 10, trust: 40 });
  assert.ok(cold.includes('distance') && warm.includes('shoulder'));
  assert.ok(mid.includes('nods') && !mid.includes('shoulder'));
});

test('rare purchases attract watchers', async () => {
  createPlayer('pS', 'Seller');
  createPlayer('pB', 'Buyer');
  const { default: upd } = await import('../src/game/players/model.js').then((m) => ({ default: m.updatePlayer }));
  upd('pB', { coins: 5000 });
  getDb().prepare('INSERT INTO inventory (discord_id, item_id, qty, equipped) VALUES (?,?,?,0)').run('pS', 'reader_coat', 1);
  const { buyListing, listItem } = await import('../src/game/economy/market.js');
  const id = listItem('pS', 'g1', 'reader_coat', 1, 500);
  const r = buyListing('pB', id);
  assert.ok(r.watcher && r.favor === 3);
  const fav = getDb().prepare('SELECT favor FROM constellation_favor WHERE discord_id=? AND constellation_id=?').get('pB', r.watcher).favor;
  assert.equal(fav, 3);
});
