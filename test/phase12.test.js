import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveState } from '../src/game/characters/system.js';
import { mayLearn } from '../src/game/characters/memory.js';
import { decide, investigatePlayer } from '../src/game/characters/behavior.js';
import { characterCard, revealableInfo } from '../src/game/characters/cards.js';
import { meetsRelationship } from '../src/game/scenarios/conditions.js';

test('nine-state ladder derives from axes', () => {
  assert.equal(deriveState({}), 'Unknown');
  assert.equal(deriveState({ interest: 5 }), 'Aware');
  assert.equal(deriveState({ fear: 40 }), 'Wary');
  assert.equal(deriveState({ interest: 50 }), 'Interested');
  assert.equal(deriveState({ trust: 15 }), 'Friendly');
  assert.equal(deriveState({ trust: 40 }), 'Trusted');
  assert.equal(deriveState({ trust: 70 }), 'Devoted');
  assert.equal(deriveState({ hostility: 40 }), 'Hostile');
  assert.equal(deriveState({ hostility: 70, trust: 90 }), 'Enemy'); // hostility wins
});

test('npcs learn only through the open', () => {
  assert.ok(mayLearn(['public']));
  assert.ok(mayLearn(['private'], true));
  assert.ok(!mayLearn(['private']));
  assert.ok(!mayLearn(['party', 'nebula']));
  assert.ok(!mayLearn([]));
});

test('behavior emerges from state and memory', () => {
  const inv = decide({ charId: 'kim_dokja', goals: [], state: 'Wary', eventKind: 'altered', memories: {}, rng: () => 0.9 });
  assert.equal(inv.type, 'investigate');
  const warn = decide({ charId: 'kim_dokja', goals: [], state: 'Hostile', memories: {}, rng: () => 0.9 });
  assert.equal(warn.type, 'warn');
  const calm = decide({ charId: 'kim_dokja', goals: [], state: 'Friendly', attention: 0, memories: {}, rng: () => 0.9 });
  assert.equal(calm.type, 'none');
  const move = decide({ charId: 'kim_dokja', goals: [{ goal: 'survive', progress: 3, status: 'active' }], state: 'Aware', memories: {}, rng: () => 0.1 });
  assert.equal(move.type, 'relocate');
  const found = investigatePlayer({ hides: 0, alters: 3, sharedPublic: 0 });
  assert.equal(found.found, 'divergence');
  assert.equal(investigatePlayer({ hides: 3, alters: 0, sharedPublic: 0 }).found, 'secrecy');
  assert.equal(investigatePlayer({ hides: 0, alters: 0, sharedPublic: 0 }).found, null);
});

test('character cards gate themselves by relationship', () => {
  const card = characterCard({ name: 'Kim Dokja', location: 'Subway', state: 'Wary', knownInfo: [], affiliations: [], interests: ['you'], history: ['seen once'] });
  assert.ok(card.includes('🎴 CHARACTER') && card.includes('Kim Dokja') && card.includes('???'));
  assert.deepEqual(revealableInfo('Unknown', ['a', 'b', 'c', 'd']), []);
  assert.deepEqual(revealableInfo('Interested', ['a', 'b', 'c']), ['a']);
  assert.deepEqual(revealableInfo('Trusted', ['a', 'b', 'c', 'd']), ['a', 'b', 'c', 'd']);
});

test('chapter paths can require relationships', () => {
  const ctx = { relationships: { kim_dokja: 'Friendly' } };
  assert.ok(meetsRelationship({ char: 'kim_dokja', min: 'Friendly' }, ctx));
  assert.ok(!meetsRelationship({ char: 'kim_dokja', min: 'Trusted' }, ctx));
  assert.ok(meetsRelationship({ char: 'kim_dokja', not: 'Enemy' }, ctx));
  assert.ok(!meetsRelationship({ char: 'survivor_17', min: 'Aware' }, ctx));
});
