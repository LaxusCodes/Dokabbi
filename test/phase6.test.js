import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEligibility, SPONSOR_CATALOG } from '../src/game/sponsors/eligibility.js';
import { evaluateExpectation, describeExpectation } from '../src/game/sponsors/expectations.js';
import { tierFor, decayStep, expectationsConflict } from '../src/game/sponsors/relationship.js';
import { negotiate } from '../src/game/sponsors/negotiation.js';
import { offerText, interestBar } from '../src/game/sponsors/offers.js';

const rich = { clears: 5, favor: 60, stories: ['merciful_survivor'], signals: { protect: 2 }, hasContract: false, influence: 50 };
const poor = { clears: 0, favor: 0, stories: [], signals: {}, hasContract: false, influence: 50 };

test('eligibility gates + hidden requirements', () => {
  const ok = evaluateEligibility('judge_embers', rich);
  assert.ok(ok.eligible);
  assert.ok(ok.checks.every((c) => c.met));
  const no = evaluateEligibility('judge_embers', poor);
  assert.ok(!no.eligible);
  const hidden = no.checks.find((c) => c.id === 'hidden');
  assert.equal(hidden.label, '???'); // undiscovered stays secret
  const revealed = evaluateEligibility('judge_embers', { ...poor, signals: { protect: 3 } }).checks.find((c) => c.id === 'hidden');
  assert.ok(revealed.label.includes('protect'));
  const trickster = evaluateEligibility('veiled_trickster', { ...rich, stories: ['breaker_impossible'], signals: { defy: 1 } });
  assert.ok(trickster.eligible);
  const busy = evaluateEligibility('judge_embers', { ...rich, hasContract: true });
  assert.ok(!busy.eligible); // no conflicting sponsorship
  assert.ok(Object.keys(SPONSOR_CATALOG).length >= 4);
});

test('expectations read history', () => {
  const s = { protect: 2, clears: 5, defy: 1, pve: 3, wagerWins: 0, stories: ['a', 'b'] };
  assert.equal(evaluateExpectation('protect', s, 3), 2);
  assert.equal(evaluateExpectation('clear', s, 3), 3);
  assert.equal(evaluateExpectation('defy', s, 2), 1);
  assert.equal(evaluateExpectation('story', s, 5), 2);
  assert.ok(describeExpectation('protect', 3).includes('(3x)'));
});

test('loyalty tiers + decay ladder', () => {
  assert.equal(tierFor({}), 'None');
  assert.equal(tierFor({ hasOffer: true }), 'Interested');
  assert.equal(tierFor({ hasActive: true }), 'Supporter');
  assert.equal(tierFor({ completed: 1, favor: 30 }), 'Patron');
  assert.equal(tierFor({ completed: 1, favor: 65 }), 'Favored');
  assert.equal(tierFor({ completed: 2, favor: 85 }), 'Trusted');
  assert.equal(decayStep({ failures: 0 }), 'Disappointed');
  assert.equal(decayStep({ failures: 9 }), 'Contract at risk');
  assert.ok(expectationsConflict('protect', 'profit'));
  assert.ok(!expectationsConflict('protect', 'clear'));
});

test('negotiation follows persona', () => {
  const offer = { coins: 2500, duration: 3, expectation_required: 3 };
  const bold = negotiate('reckless', offer, 'coins', 0);
  assert.ok(bold.ok && bold.counter.coins === 3500);
  const stern = negotiate('cautious', offer, 'duration', 0);
  assert.ok(!stern.ok); // short bonds prove nothing
  const broker = negotiate('manipulative', offer, 'requirement', 0);
  assert.ok(broker.ok && broker.counter.expectation_required === 2);
  const haggling = negotiate('reckless', offer, 'coins', 3);
  assert.ok(!haggling.ok && haggling.locked);
  assert.ok(negotiate('cautious', offer, 'bogus', 0).response.includes('coins, duration'));
});

test('offer presentation', () => {
  const text = offerText({ constellationName: 'X', coins: 2500, stigma: 's', expectationType: 'protect', expectationRequired: 3, duration: 3 });
  assert.ok(text.includes('SPONSORSHIP OFFER') && text.includes('Favor -15'));
  assert.ok(interestBar(67).includes('█'));
});
