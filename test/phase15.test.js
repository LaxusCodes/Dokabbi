import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDivergence, divergenceBand, pressureFor, milestoneStatus } from '../src/game/canon/divergence.js';

test('canon holds when nothing happened', () => {
  const d = detectDivergence({ trust: {}, flags: {}, alters: 0, choices: {} });
  assert.equal(d.score, 0);
  assert.equal(d.band, 'dormant');
  assert.ok(d.intact.length > 0 && d.broken.length === 0);
  assert.equal(d.canonMemory, 100);
});

test('saving survivor-17 breaks canon loudly', () => {
  const d = detectDivergence({ trust: { survivor_17: 20 }, flags: {}, alters: 0, choices: {} });
  const hit = d.broken.find((b) => b.actual.includes('saved'));
  assert.ok(hit && hit.points === 18);
  assert.ok(d.canonMemory < 100);
});

test('flags, choices, alters and sponsors stack', () => {
  const d = detectDivergence({
    trust: {}, flags: { 'faction.survivor_community': 'formed', 'area.east': 'entered' },
    alters: 2, choices: { forewarn: 1 }, brokerSponsored: true, underdogs: 1,
  });
  assert.ok(d.score >= 15 + 10 + 16 + 12 + 8 + 6);
  assert.ok(['anomaly', 'rupture'].includes(d.band));
});

test('bands escalate', () => {
  assert.equal(divergenceBand(0), 'dormant');
  assert.equal(divergenceBand(5), 'stirrings');
  assert.equal(divergenceBand(25), 'noticed');
  assert.equal(divergenceBand(50), 'anomaly');
  assert.equal(divergenceBand(99), 'rupture');
});

test('pressure influences, never dictates', () => {
  assert.equal(pressureFor('dormant').dokjaDelta, 0);
  assert.equal(pressureFor('noticed').brief, true);
  assert.equal(pressureFor('rupture').dokjaDelta, 12);
  assert.ok(pressureFor('anomaly').note.includes('Dokja'));
});

test('milestones compare expected vs actual', () => {
  const ms = [
    { id: 'a', canon: 'No faction', check: { kind: 'flag', key: 'f', absentValue: 'x' } },
    { id: 'b', canon: 'A clear happened', check: { kind: 'event', eventKind: 'scenario_clear' } },
    { id: 'c', canon: 'Timeline intact', check: { kind: 'alters', max: 0 } },
  ];
  const rows = milestoneStatus(ms, { flags: { f: 'x' }, eventKinds: ['scenario_clear'], alters: 2 });
  assert.equal(rows.find((r) => r.id === 'a').held, false);
  assert.equal(rows.find((r) => r.id === 'b').held, true);
  assert.equal(rows.find((r) => r.id === 'c').held, false);
});
