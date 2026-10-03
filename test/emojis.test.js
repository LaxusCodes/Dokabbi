import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orv-emoji-'));
process.env.DATABASE_PATH = path.join(dir, 't.db');

const { getDb } = await import('../src/database/db.js');
const { em, emTitle, emRank, emRole, emRarity, setEmojiOverride, clearEmojiOverride, listEmojiOverrides } = await import('../src/game/display/emojis.js');
import characters from '../data/characters.json' with { type: 'json' };
import titles from '../data/titles.json' with { type: 'json' };

getDb();

test('overrides beat registry beats built-ins', () => {
  assert.equal(em('ranks', 'SSS'), '🌌'); // registry default
  assert.equal(em('nope', 'nothing', 'fb'), 'fb'); // fallback
  setEmojiOverride('ranks.SSS', '🌠');
  assert.equal(emRank('SSS'), '🌠');
  assert.equal(listEmojiOverrides().length, 1);
  assert.ok(clearEmojiOverride('ranks.SSS'));
  assert.equal(emRank('SSS'), '🌌'); // file default restored
  assert.ok(!clearEmojiOverride('ranks.SSS'));
});

test('titles fall back to their own emoji', () => {
  assert.equal(emTitle('butcher', '⚔️'), '⚔️');
  setEmojiOverride('titles.butcher', '<:butcher:123>');
  assert.equal(emTitle('butcher', '⚔️'), '<:butcher:123>');
  clearEmojiOverride('titles.butcher');
});

test('every rank, role and rarity resolves', () => {
  for (const r of ['C', 'B', 'A', 'S', 'S+', 'SS', 'SSS']) assert.ok(emRank(r).length > 0, r);
  for (const r of ['Common', 'Uncommon', 'Rare', 'Epic', 'Unique', 'Legendary', 'Myth']) assert.ok(emRarity(r).length > 0, r);
  const roles = [...new Set(characters.map((c) => c.role))];
  assert.ok(roles.length > 20);
  for (const role of roles) assert.ok(emRole(role).length > 0, role);
  for (const t of titles) assert.ok(emTitle(t.id, t.emoji).length > 0, t.id);
});
