import test from 'node:test';
import assert from 'node:assert/strict';
import { epithets, requireAlive } from '../src/game/incarnations/lifecycle.js';

test('epithets are computed, never collected', () => {
  assert.deepEqual(epithets({}), []);
  assert.deepEqual(epithets({ alters: 2 }), ['Scenario Breaker']);
  assert.deepEqual(epithets({ sponsored: true }), ['Star-Touched']);
  assert.deepEqual(epithets({ sponsored: true, trusted: true }), ["Constellation's Favorite"]);
  assert.deepEqual(epithets({ defied: true, underdog: true }), ['Probability-Breaker', 'Stream-Famous']);
  assert.deepEqual(epithets({ rebirthed: 2 }), ['Twice-Born ×2']);
  assert.ok(epithets({ asset: true, bonded: true, refused: true }).includes('Unbound'));
});

test('the fallen do not act', () => {
  assert.equal(requireAlive(null), 'Use /register first.');
  assert.equal(requireAlive({ status: 'alive' }), null);
  assert.equal(requireAlive({}), null);
  assert.ok(requireAlive({ status: 'fallen' }).includes('fallen'));
  assert.ok(requireAlive({ status: 'vanished' }).includes('vanished'));
});
