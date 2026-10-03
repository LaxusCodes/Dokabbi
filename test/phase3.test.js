import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleChoices, requireChoiceAccess, validateShareScope, hasForeknowledge } from '../src/game/knowledge/system.js';
import { applyTrust, trustBand, disturbanceLines, worldEventSummary } from '../src/game/world/memory.js';
import { storyCardFor } from '../src/game/cards/mint.js';

const sc = {
  id: '001',
  choices: [
    { id: 'help', label: 'Help' },
    { id: 'forewarn', label: 'Warn them', requiresKnowledge: 'foreknow_001', altersWorld: true },
  ],
};

test('knowledge gates choices asymmetrically', () => {
  const blind = visibleChoices(sc, []);
  assert.equal(blind.filter((v) => v.locked).length, 1);
  assert.equal(blind.filter((v) => !v.locked).length, 1);
  assert.throws(() => requireChoiceAccess(sc.choices[1], []));
  assert.doesNotThrow(() => requireChoiceAccess(sc.choices[1], ['foreknow_001']));
  const reader = visibleChoices(sc, ['foreknow_001']);
  assert.ok(reader.every((v) => !v.locked));
  assert.ok(hasForeknowledge(['foreknow_001']));
  assert.ok(!hasForeknowledge(['pattern_lurker']));
});

test('share scopes validate', () => {
  assert.equal(validateShareScope('public'), 'public');
  assert.equal(validateShareScope('private'), 'private');
  assert.throws(() => validateShareScope('everyone'));
});

test('npc trust clamps and bands', () => {
  assert.equal(applyTrust(90, 20), 100);
  assert.equal(applyTrust(-90, -20), -100);
  assert.equal(trustBand(80), 'devoted');
  assert.equal(trustBand(0), 'neutral');
  assert.equal(trustBand(-80), 'hostile');
});

test('disturbance broadcast names the changer', () => {
  const lines = disturbanceLines('Gyu', 'Scenario 001');
  assert.ok(lines.some((l) => l.includes('Gyu')));
  assert.ok(lines.some((l) => l.includes('Probability')));
  assert.ok(worldEventSummary('scenario_altered', 'Gyu', 'Scenario 001').includes('ALTERED'));
});

test('journey cards derive from lived choices', () => {
  const card = storyCardFor({ storyId: 'merciful_survivor', storyName: 'Merciful Survivor', scenarioId: '001', choiceId: 'help', power: 2 });
  assert.equal(card.card_id, 'merciful_survivor@001');
  assert.ok(card.name.includes('Refused to Run'));
  assert.ok(card.effect.includes('+2 Status'));
});
