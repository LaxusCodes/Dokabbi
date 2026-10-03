import test from 'node:test';
import assert from 'node:assert/strict';
import { computePower, resolveAttack } from '../src/game/combat/engine.js';
import { applyXp } from '../src/game/progression/levels.js';
import { scenarioReward } from '../src/game/economy/coins.js';
import { resolveChoice, getScenario } from '../src/game/scenarios/engine.js';
import { fuseStories } from '../src/game/stories/system.js';
import { deckPower } from '../src/game/cards/system.js';

test('combat power scales with stats', () => {
  const weak = computePower({ stats: { str: 5, agi: 5, vit: 5, mag: 5, intel: 5 } });
  const strong = computePower({ stats: { str: 20, agi: 20, vit: 20, mag: 20, intel: 20 } });
  assert.ok(strong > weak);
});

test('attack resolves with damage', () => {
  const out = resolveAttack({
    attacker: { stats: { str: 10, agi: 10, vit: 10, mag: 10, intel: 10 }, status: 50 },
    defender: { stats: { str: 5, agi: 5, vit: 5, mag: 5, intel: 5, level: 1 } },
    rng: () => 0.5,
  });
  assert.ok(out.damage >= 1);
});

test('xp levels up', () => {
  const r = applyXp({ level: 1, xp: 0 }, 1000);
  assert.ok(r.level > 1);
});

test('scenario choice resolves', () => {
  const sc = getScenario('001');
  const out = resolveChoice(sc, 'help', () => 0.1);
  assert.ok(out.text);
  assert.ok(scenarioReward(100, { level: 1 }) >= 100);
});

test('story fusion + deck synergy', () => {
  const fused = fuseStories({ id: 'a', power: 3 }, { id: 'b', power: 5 });
  assert.equal(fused.grade, 'Myth');
  const p = deckPower([
    { power: 5, tags: ['reader'] },
    { power: 5, tags: ['reader'] },
    { power: 5, tags: ['reader'] },
  ]);
  assert.ok(p >= 25);
});
