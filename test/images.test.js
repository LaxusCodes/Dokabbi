import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { imageFor, imageForEntity, setCharacterImage } from '../src/utils/images.js';
import { artPanel, textOf, V2 } from '../src/utils/v2.js';
import { renderCardImage, clearCardCache } from '../src/utils/cardRenderer.js';
import characters from '../data/characters.json' with { type: 'json' };
import monsters from '../data/monsters.json' with { type: 'json' };
import cards from '../data/cards.json' with { type: 'json' };

test('registry resolves, base ids fall back, empties stay null', () => {
  assert.equal(imageFor('kim_dokja'), null);
  assert.equal(imageFor('merciful_survivor@001'), null);
  assert.equal(imageFor(null), null);
});

test('artPanel never breaks a reply', () => {
  const bare = artPanel({ title: 'x', body: 'y', image: null });
  assert.equal(bare.flags, V2);
  assert.ok(!bare.files);
  assert.ok(textOf(bare).includes('x'));
  const url = artPanel({ title: 'x', body: 'y', image: 'https://example.com/a.png' });
  assert.ok(!url.files);
  const json = JSON.stringify(url.components);
  assert.ok(json.includes('https://example.com/a.png'));
  assert.ok(json.includes('"type":12'));
  const missing = artPanel({ title: 'x', body: 'y', image: 'assets/does-not-exist.png' });
  assert.ok(!missing.files);
  assert.ok(!JSON.stringify(missing.components).includes('"type":12'));
});

test('local files attach when present', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'orv-img-')), 'hero.png');
  fs.writeFileSync(file, 'not-a-real-png-but-exists');
  const out = artPanel({ title: 'x', body: 'y', image: file });
  assert.equal(out.files.length, 1);
  assert.ok(JSON.stringify(out.components).includes('attachment://hero.png'));
  const badExt = artPanel({ title: 'x', body: 'y', image: file.replace('.png', '.txt') });
  assert.ok(!badExt.files);
});

test('artPanel accepts generated Buffer images', () => {
  const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const out = artPanel({ title: 'x', body: 'y', image: buf });
  assert.equal(out.files.length, 1);
  assert.ok(JSON.stringify(out.components).includes('attachment://'));
});

test('renderCardImage returns valid PNG for characters', () => {
  clearCardCache();
  const buf = renderCardImage(characters[0]);
  assert.ok(buf instanceof Buffer);
  assert.ok(buf.length > 100);
  assert.equal(buf[0], 0x89);
  assert.equal(buf[1], 0x50);
  assert.equal(buf[2], 0x4e);
  assert.equal(buf[3], 0x47);
});

test('renderCardImage returns valid PNG for monsters', () => {
  clearCardCache();
  const buf = renderCardImage(monsters[0]);
  assert.ok(buf instanceof Buffer);
  assert.ok(buf.length > 100);
  assert.equal(buf[0], 0x89);
  assert.equal(buf[1], 0x50);
  assert.equal(buf[2], 0x4e);
  assert.equal(buf[3], 0x47);
});

test('renderCardImage returns valid PNG for cards', () => {
  clearCardCache();
  const buf = renderCardImage(cards[0]);
  assert.ok(buf instanceof Buffer);
  assert.ok(buf.length > 100);
  assert.equal(buf[0], 0x89);
  assert.equal(buf[1], 0x50);
  assert.equal(buf[2], 0x4e);
  assert.equal(buf[3], 0x47);
});

test('renderCardImage caches results', () => {
  clearCardCache();
  const buf1 = renderCardImage(characters[0]);
  const buf2 = renderCardImage(characters[0]);
  assert.equal(buf1, buf2);
});

test('imageForEntity returns generated Buffer when no registry art', () => {
  clearCardCache();
  const result = imageForEntity({ id: 'kim_dokja', name: 'Kim Dokja', description: 'Test', tags: ['test'] });
  assert.ok(result instanceof Buffer);
  assert.ok(result.length > 100);
});

test('setCharacterImage stores and retrieves URLs', () => {
  setCharacterImage('test_char_123', 'https://example.com/art.png');
  const url = imageFor('test_char_123');
  assert.equal(url, 'https://example.com/art.png');
  setCharacterImage('test_char_123', '');
  const cleared = imageFor('test_char_123');
  assert.ok(cleared === null || typeof cleared === 'string');
});

test('renderCardImage returns null for null input', () => {
  clearCardCache();
  const result = renderCardImage(null);
  assert.equal(result, null);
});
