import test from 'node:test';
import assert from 'node:assert/strict';
import { settleWagers, isUnderdogWin, poolTotals, validatePlayerStake, HOUSE_CUT_PCT } from '../src/game/wagers/engine.js';
import { personaWager, maxWagerFor, PERSONA_OF } from '../src/game/constellations/personas.js';
import { computeMeters, bar, sentimentText, settleFeedLine } from '../src/game/starstream/audience.js';

const W = (id, side, amount) => ({ id, side, amount });

test('parimutuel settlement pays winners from losers pool', () => {
  const wagers = [W(1, 'A', 100), W(2, 'A', 100), W(3, 'B', 200)];
  const r = settleWagers(wagers, 'A');
  const won = r.filter((x) => x.status === 'won');
  const lost = r.filter((x) => x.status === 'lost');
  assert.equal(won.length, 2);
  assert.equal(lost.length, 1);
  // losers 200, cut 15% -> 170 distributable, each A backer staked 100/200 -> +85
  assert.ok(won.every((x) => x.payout === 185));
  const total = poolTotals(wagers);
  assert.equal(total.total, 400);
  assert.ok(HOUSE_CUT_PCT === 15);
});

test('one-sided books refund; divided ballots refund', () => {
  const oneSided = settleWagers([W(1, 'A', 100)], 'A');
  assert.ok(oneSided.every((x) => x.status === 'refunded' && x.payout === 100));
  const divided = settleWagers([W(1, 'A', 100), W(2, 'B', 100)], 'divided');
  assert.ok(divided.every((x) => x.status === 'refunded'));
});

test('underdog detection needs a real upset', () => {
  assert.ok(isUnderdogWin([W(1, 'A', 50), W(2, 'B', 300), W(3, 'B', 300)], 'A'));
  assert.ok(!isUnderdogWin([W(1, 'A', 300), W(2, 'B', 100), W(3, 'B', 100)], 'A'));
  assert.ok(!isUnderdogWin([W(1, 'A', 50), W(2, 'B', 300)], 'A')); // fewer than 3 wagers
});

test('player stakes stay secondary', () => {
  assert.throws(() => validatePlayerStake({ amount: 5, balance: 9999, openCount: 0 }));
  assert.throws(() => validatePlayerStake({ amount: 5000, balance: 9999, openCount: 0 }));
  assert.throws(() => validatePlayerStake({ amount: 100, balance: 50, openCount: 0 }));
  assert.throws(() => validatePlayerStake({ amount: 100, balance: 9999, openCount: 3 }));
  assert.doesNotThrow(() => validatePlayerStake({ amount: 100, balance: 9999, openCount: 0 }));
});

test('personas bet their character', () => {
  const rng = () => 0.5;
  assert.equal(maxWagerFor(82), 8200);
  const reckless = personaWager('reckless', { influence: 60, poolA: 100, poolB: 900, votesA: 1, votesB: 9, rng });
  assert.equal(reckless.side, 'A'); // loves the impossible
  assert.ok(reckless.amount > maxWagerFor(60) * 0.3);
  const cautious = personaWager('cautious', { influence: 60, poolA: 100, poolB: 900, votesA: 1, votesB: 9, rng });
  assert.equal(cautious.side, 'B'); // plays it safe
  assert.ok(cautious.amount <= maxWagerFor(60) * 0.1);
  const manipul = personaWager('manipulative', { influence: 60, poolA: 1, poolB: 1, votesA: 8, votesB: 2, rng });
  assert.equal(manipul.side, 'B'); // against the crowd
  assert.equal(personaWager('reckless', { influence: 5, poolA: 1, poolB: 1, votesA: 0, votesB: 0, rng }), null);
  assert.ok(PERSONA_OF.veiled_trickster === 'reckless');
});

test('sentiment meters read the room', () => {
  const m = computeMeters({ votesA: 6, votesB: 4, wagerCount: 4, alters: 1 });
  assert.equal(Math.round(m.pctA), 60);
  assert.ok(m.excitement > m.drama - 60);
  assert.equal(m.disturbance, 15);
  assert.ok(bar(64).includes('█'));
  const text = sentimentText({ aLabel: 'A — Hold', bLabel: 'B — Run', meters: m });
  assert.ok(text.includes('64%') || text.includes('60%'));
  const line = settleFeedLine({ side: 'A', amount: 100, payout: 185, status: 'won', display: 'Gyu', anonymous: false }, 'Hold', 'Run');
  assert.ok(line.includes('+85'));
});
