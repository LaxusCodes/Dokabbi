import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCard, collectionTally, prestigeOf, SHOWCASE_SLOTS } from '../src/game/cards/collection.js';
import { discoveryStatus } from '../src/game/cards/discovery.js';

test('rarity means history, not clicks', () => {
  assert.deepEqual(classifyCard({ card_id: 'defied_probability@002', power: 7 }), { category: 'legendary', rarity: 'Myth' });
  assert.deepEqual(classifyCard({ card_id: 'server_3_underdog', power: 5 }), { category: 'world', rarity: 'Myth' });
  assert.deepEqual(classifyCard({ card_id: 'server_3', power: 5 }), { category: 'world', rarity: 'Legendary' });
  assert.deepEqual(classifyCard({ card_id: 'sponsored@judge_embers', power: 4 }), { category: 'sponsor', rarity: 'Epic' });
  assert.deepEqual(classifyCard({ card_id: 'memorial@uA#1', power: 4 }), { category: 'memorial', rarity: 'Legendary' });
  assert.deepEqual(classifyCard({ card_id: 'team_abc', power: 2 }), { category: 'team', rarity: 'Rare' });
  assert.deepEqual(classifyCard({ card_id: 'merciful_survivor@001', power: 2 }), { category: 'story', rarity: 'Rare' });
  assert.deepEqual(classifyCard({ card_id: 'mystery', power: 1 }), { category: 'story', rarity: 'Common' });
  assert.equal(SHOWCASE_SLOTS, 4);
});

test('tallies split by meaning and weight', () => {
  const t = collectionTally([
    { card_id: 'server_1', power: 5 }, { card_id: 'team_a', power: 2 }, { card_id: 'team_b', power: 2 },
  ]);
  assert.equal(t.byCategory.world, 1);
  assert.equal(t.byCategory.team, 2);
  assert.equal(t.byRarity.Legendary, 1);
  assert.equal(t.byRarity.Rare, 2);
});

test('prestige rewards events, never levels', () => {
  assert.equal(prestigeOf({}).title, 'Unknown');
  const quiet = prestigeOf({ channelValue: 10 });
  const loud = prestigeOf({ channelValue: 80, divergence: 60, events: 100, anomalies: 2, collisions: 3 });
  assert.ok(loud.score > quiet.score);
  assert.equal(prestigeOf({ channelValue: 100, divergence: 100, events: 300, anomalies: 5, collisions: 10 }).title, 'Mythic Nexus');
});

test('discovery stays mysterious until earned', () => {
  const none = discoveryStatus({ divergence: 0, participants: 0, disturbance: 0 });
  assert.equal(none.pct, 0);
  assert.ok(!none.complete);
  const full = discoveryStatus({ divergence: 50, participants: 4, disturbance: 40 });
  assert.ok(full.complete && full.pct === 100);
  const partial = discoveryStatus({ divergence: 50, participants: 1, disturbance: 0 });
  assert.ok(partial.pct > 0 && !partial.complete);
});
