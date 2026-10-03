import test from 'node:test';
import assert from 'node:assert/strict';
import { pageId, parsePageId, paginate } from '../src/utils/interactions.js';
import { profileText } from '../src/game/incarnations/profile.js';
import { statusEmbed } from '../src/utils/embeds.js';
import { textOf, V2, sheet } from '../src/utils/v2.js';

test('stateless pagination round-trips', () => {
  assert.equal(pageId('market', 3), 'pg:market:3');
  assert.deepEqual(parsePageId('pg:market:3'), { ns: 'market', page: 3, owner: null });
  assert.equal(parsePageId('confirm:yes'), null);
  assert.equal(parsePageId('pg:market:abc'), null);
  const p = paginate([1, 2, 3, 4, 5, 6, 7], 1, 3);
  assert.deepEqual(p.slice, [4, 5, 6]);
  assert.equal(p.total, 3);
  const clamp = paginate([1, 2], 9, 5);
  assert.equal(clamp.page, 0);
  assert.deepEqual(paginate([], 0, 5).slice, []);
});

test('profile condenses a life to a glance', () => {
  const text = profileText({
    name: 'Laxus', title: 'Reader', level: 12, status: 'alive',
    activeTitle: 'Scenario Breaker', titles: ['A', 'B', 'C', 'D', 'E'],
    showcase: [{ name: 'Myth Card' }], companion: 'Uriel',
    nebula: 'Iron Gate', sponsor: 'judge_embers', divergence: 43,
  });
  assert.ok(text.includes('Laxus') && text.includes('Lv 12'));
  assert.ok(text.includes('Scenario Breaker') && text.includes('…'));
  assert.ok(text.includes('Uriel') && text.includes('43'));
  const bare = profileText({ name: 'X', title: 'T', level: 1 });
  assert.ok(bare.includes('Walks alone') || bare.includes('none'));
});

test('status panel carries the essentials as components', () => {
  const payload = statusEmbed({ name: 'L', title: 'T', level: 3, status: 'alive', hp: 80, max_hp: 100, energy: 10, max_energy: 50, coins: 5, str: 1, agi: 1, vit: 1, mag: 1, intel: 1, probability: 90, sponsor_id: null, scenario_progress: 0, deaths: 1, rebirths: 0 });
  assert.equal(payload.flags, V2);
  assert.ok(!('content' in payload) && !('embeds' in payload));
  const text = textOf(payload);
  assert.ok(text.includes('80%') && text.includes('HP'));
  assert.ok(text.includes('L') && text.includes('1 deaths'));
});

test('sheet keeps text AND buttons (no spread overwrite)', () => {
  const fakeRow = { type: 1, components: [] };
  const payload = sheet('Hello there', [fakeRow]);
  assert.ok(textOf(payload).includes('Hello there'));
  assert.equal(payload.components.length, 2);
  assert.equal(payload.components[1], fakeRow);
});
