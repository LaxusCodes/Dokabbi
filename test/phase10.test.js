import test from 'node:test';
import assert from 'node:assert/strict';
import { branchKeyFor } from '../src/game/scenarios/instances.js';
import { pathsOppose, detectCollisions } from '../src/game/scenarios/collisions.js';
import { branchVerdict, chapterImportance, convergenceSummary } from '../src/game/scenarios/convergence.js';
import { resolvePath } from '../src/game/scenarios/branches.js';

test('branches key by party, solitude is shared', () => {
  assert.equal(branchKeyFor('u1', { party: { id: 'abc' } }), 'party:abc');
  assert.equal(branchKeyFor('u1', null), 'solo');
});

test('opposing objectives collide, parallel ones pass through', () => {
  assert.ok(pathsOppose('protect', 'ledger_cut'));
  assert.ok(pathsOppose('ledger_cut', 'gate_duty'));
  assert.ok(!pathsOppose('protect', 'confront'));
  assert.ok(!pathsOppose('protect', 'protect'));
  const branches = [
    { branch_key: 'party:A', path: 'protect', status: 'open' },
    { branch_key: 'party:B', path: 'ledger_cut', status: 'open' },
    { branch_key: 'solo', path: 'confront', status: 'open' },
    { branch_key: 'party:C', path: null, status: 'open' },
  ];
  const hits = detectCollisions(branches);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].branchA, 'party:A');
  assert.equal(hits[0].kind, 'conflicting_objectives');
  assert.deepEqual(detectCollisions([{ branch_key: 'solo', path: 'defer', status: 'open' }]), []);
});

test('director verdicts: collide, persist, converge', () => {
  assert.equal(branchVerdict({ path: 'protect' }, { participantCount: 4, hasCollision: true }).verdict, 'COLLIDE');
  assert.equal(branchVerdict({ path: 'protect' }, { participantCount: 4, importance: 3 }).verdict, 'PERSIST');
  assert.equal(branchVerdict({ path: null }, { participantCount: 1, importance: 0 }).verdict, 'CONVERGE');
  assert.equal(branchVerdict({ path: 'x' }, { participantCount: 2, dokjaAttention: 40 }).verdict, 'PERSIST');
  assert.ok(chapterImportance({ alters: 2, sponsors: 4, bonds: 1 }) >= 4);
  const summary = convergenceSummary(3, [{ branch_key: 'solo', path: 'defer' }], { solo: { verdict: 'CONVERGE', reason: 'threads rejoin' } });
  assert.ok(summary.includes('CONVERGE') && summary.includes('solo'));
});

test('outcomes carry locks and branch knowledge', () => {
  const o = resolvePath({
    id: 'eastern_route', label: 'E', rewards: { coins: 100, xp: 10 },
    consequences: { knowledge: 'value_east', locks: [{ path: 'eastern_route', reason: 'gone' }], worldLine: 'walked' },
  }, {});
  assert.equal(o.effects.knowledge, 'value_east');
  assert.deepEqual(o.effects.locks, [{ path: 'eastern_route', reason: 'gone' }]);
});
