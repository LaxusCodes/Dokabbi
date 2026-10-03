import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMissions, missionDone, advanceStreak, streakDay, streakReward } from '../src/game/daily/missions.js';
import { buildWeights, pickEncounter, ENCOUNTER_COST } from '../src/game/daily/encounters.js';

test('missions adapt to a life', () => {
  const party = generateMissions({ inParty: true });
  assert.ok(party.some((m) => m.text.includes('party')));
  const sponsored = generateMissions({ sponsored: true });
  assert.ok(sponsored.some((m) => m.text.includes('sponsor')));
  const solo = generateMissions({});
  assert.ok(solo.some((m) => m.text.includes('Observe')));
  assert.equal(solo.length, 4);
  assert.ok(missionDone('clear', { scenarios: 1 }));
  assert.ok(!missionDone('combat', { combats: 0 }));
});

test('streaks forgive one miss, not two', () => {
  assert.deepEqual(advanceStreak({ streak: 3, lastDay: '2026-09-03' }, '2026-09-04'), { streak: 4, claimed: false });
  assert.deepEqual(advanceStreak({ streak: 3, lastDay: '2026-09-04' }, '2026-09-04'), { streak: 3, claimed: true });
  const grace = advanceStreak({ streak: 3, lastDay: '2026-09-02' }, '2026-09-04');
  assert.equal(grace.streak, 3); // forgiven
  assert.deepEqual(advanceStreak({ streak: 9, lastDay: '2026-09-01' }, '2026-09-04'), { streak: 1, claimed: false });
  assert.equal(streakDay(1), 1);
  assert.equal(streakDay(8), 1);
  assert.equal(streakDay(7), 7);
  assert.ok(streakReward(3).encounter);
  assert.ok(streakReward(7).knowledge);
  assert.equal(streakReward(1).coins, 100);
});

test('encounters follow the world', () => {
  const w = buildWeights({ sponsored: true, maxTrust: 20, disturbance: 40, probability: 30, divergence: 25, hasUndiscovered: true });
  assert.ok(w.sponsor_gift > 6 && w.dokja_sighting > 5 && w.probability_shift > 8);
  const lonely = buildWeights({});
  assert.equal(lonely.sponsor_gift, 0);
  assert.equal(ENCOUNTER_COST, 10);
  const first = pickEncounter({ a: 1, b: 0 }, () => 0.5);
  assert.equal(first, 'a');
  const seq = ['constellation_notice', 'quiet', 'toll'];
  const picks = new Set(seq.map((_, i) => pickEncounter({ x: 1, y: 1, z: 1 }, () => (i + 0.5) / 3)));
  assert.equal(picks.size, 3); // rng spans the table
});
