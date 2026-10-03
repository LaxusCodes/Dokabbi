import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orv-prefix-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');

const { parsePrefix, ALIASES, resolveAlias, handlePrefixMessage } = await import('../src/prefix.js');
const { createPlayer } = await import('../src/game/players/model.js');
const { getDb } = await import('../src/database/db.js');

getDb(); // migrate throwaway db — never touches data/starstream.db

test('orv prefix parses, everything else ignored', () => {
  assert.deepEqual(parsePrefix('orv status', 'orv'), { name: 'status', args: [] });
  assert.deepEqual(parsePrefix('ORV RANKINGS', 'orv'), { name: 'rankings', args: [] });
  assert.deepEqual(parsePrefix('orv', 'orv'), { name: 'help', args: [] });
  assert.deepEqual(parsePrefix('orv   world  ', 'orv'), { name: 'world', args: [] });
  assert.deepEqual(parsePrefix('orv /register', 'orv'), { name: 'register', args: [] });
  assert.deepEqual(parsePrefix('orv register Laxus the Swift', 'orv'), { name: 'register', args: ['Laxus', 'the', 'Swift'] });
  assert.equal(parsePrefix('/status', 'orv'), null);
  assert.equal(parsePrefix('forward status', 'orv'), null);
  assert.equal(parsePrefix('orville status', 'orv'), null);
  assert.deepEqual(parsePrefix('! status', '!'), { name: 'status', args: [] });
});

test('every alias resolves to a handled command', () => {
  const handled = ['help', 'register', 'status', 'rankings', 'rank', 'world', 'journey', 'stream', 'chapter', 'tutorial', 'profile', 'daily', 'encounter', 'observe', 'know', 'sponsor', 'party', 'nebula', 'titles', 'collection', 'scenario', 'incarnation'];
  for (const [alias, target] of Object.entries(ALIASES)) {
    assert.ok(handled.includes(target), `alias ${alias} -> unhandled ${target}`);
  }
  assert.equal(resolveAlias('s'), 'status');
  assert.equal(resolveAlias('status'), 'status');
  assert.equal(resolveAlias('nope'), 'nope');
  assert.deepEqual(parsePrefix('orv s', 'orv'), { name: 'status', args: [] });
  assert.deepEqual(parsePrefix('orv ob station', 'orv'), { name: 'observe', args: ['station'] });
});

test('prefix tutorial opens the continuous thread, not legacy pages', async () => {
  // Unregistered → step-1 prompt, no legacy rails, no Jump menu.
  let sent = null;
  const m1 = {
    content: 'orv tutorial', author: { id: 'tut-nobody' }, guildId: 'dm', client: {},
    reply: async (m) => { sent = m; return { id: 'x1', channelId: 'c1' }; },
  };
  await handlePrefixMessage(m1, 'orv');
  let json = JSON.stringify(sent.components);
  assert.ok(!json.includes('pg:tut:'), 'no legacy rails');
  assert.ok(!json.includes('orvnav:'), 'no Jump menu on tutorial');
  assert.ok(json.includes('Choose your name'), 'step-1 prompt');
  assert.ok(!('ephemeral' in sent), 'public message carries no ephemeral flag');
  // Registered without a thread → creates THE thread and stores it.
  createPlayer('tut-u1', 'TutOne');
  sent = null;
  const m2 = {
    content: 'orv tutorial', author: { id: 'tut-u1' }, guildId: 'dm', client: {},
    reply: async (m) => { sent = m; return { id: 'm9', channelId: 'c9' }; },
  };
  await handlePrefixMessage(m2, 'orv');
  json = JSON.stringify(sent.components);
  assert.ok(!json.includes('pg:tut:'), 'no legacy rails on thread create');
  assert.ok(json.includes('TUTORIAL'), 'continuous card');
  const row = getDb().prepare('SELECT tutorial_msg_id, tutorial_channel_id FROM players WHERE discord_id = ?').get('tut-u1');
  assert.equal(row.tutorial_msg_id, 'm9');
  assert.equal(row.tutorial_channel_id, 'c9');
});
