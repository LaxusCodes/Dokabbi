import test from 'node:test';
import assert from 'node:assert/strict';
import { commentFor, hostFor, listHosts } from '../src/game/starstream/dokkaebis.js';
import { interestDeltaFor, clampInterest, reactionFlavor, GIFT_THRESHOLD, EMPOWER_THRESHOLD } from '../src/game/starstream/attention.js';
import { channelValueFor, rewardBonusFor, excitementDeltaFor } from '../src/game/starstream/economy.js';
import { disturbanceDeltaFor, pressureLevel, pressureLine } from '../src/game/starstream/pressure.js';
import { channelOverview, liveFeed } from '../src/game/starstream/channel.js';
import { mostWatched, mostDangerousParties, mostActiveConstellations, rankingsText } from '../src/game/starstream/rankings.js';
import { giftOffer, empowerOffer } from '../src/game/starstream/interventions.js';

test('hosts have taste and stable seats', () => {
  assert.ok(listHosts().length >= 3);
  assert.equal(hostFor('guildA').id, hostFor('guildA').id);
  const host = listHosts().find((h) => h.style === 'chaotic');
  assert.ok(commentFor(host, 'gambit', () => 0).includes(host.name));
  assert.equal(commentFor(host, 'defer', () => 0.9), null); // scorn is rationed
  assert.ok(commentFor(host, 'something_quiet', () => 0.05).includes('Hm'));
});

test('attention math caps and flavors', () => {
  assert.equal(interestDeltaFor('duel'), 12);
  assert.equal(interestDeltaFor('nothing_much'), 1);
  assert.equal(clampInterest(150), 100);
  assert.equal(clampInterest(-5), 0);
  assert.equal(reactionFlavor('reckless', 'gambit'), 'is thrilled');
  assert.equal(reactionFlavor('cautious', 'anything'), 'is watching');
  assert.equal(GIFT_THRESHOLD, 80);
  assert.equal(EMPOWER_THRESHOLD, 95);
});

test('channel value converts noise to modest rewards', () => {
  assert.ok(channelValueFor({ excitement: 90, wagers: 20, participants: 50, collisions: 3 }) <= 100);
  assert.equal(rewardBonusFor(100), 10);
  assert.equal(rewardBonusFor(5), 0);
  assert.equal(excitementDeltaFor('underdog'), 10);
  assert.equal(excitementDeltaFor('defer'), -4);
});

test('pressure warns instead of rigging', () => {
  assert.equal(disturbanceDeltaFor('altered'), 15);
  assert.equal(disturbanceDeltaFor('intervention'), -12);
  assert.equal(pressureLevel(10), 'calm');
  assert.equal(pressureLevel(40), 'watch');
  assert.equal(pressureLevel(70), 'warning');
  assert.ok(pressureLine('warning').includes('PROBABILITY WARNING'));
  assert.equal(pressureLine('calm'), null);
});

test('rankings follow attention, never level', () => {
  const events = [{ actor_id: 'a' }, { actor_id: 'a' }, { actor_id: 'a' }, { actor_id: 'b' }, {}];
  const watched = mostWatched(events, (id) => id.toUpperCase());
  assert.equal(watched[0].name, 'A');
  assert.equal(watched[0].views, 3);
  const parties = mostDangerousParties([{ winner_id: 'x' }, { winner_id: 'x' }, { winner_id: 'y' }], (id) => id);
  assert.equal(parties[0].wins, 2);
  const cons = mostActiveConstellations([{ constellation_id: 'c1', interest: 90 }], (id) => id);
  assert.equal(cons[0].interest, 90);
  const text = rankingsText({ watched, parties, constellations: cons });
  assert.ok(text.includes('MOST WATCHED') && text.includes('MOST DANGEROUS') && text.includes('MOST ACTIVE'));
});

test('interventions cost real influence-adjacent stakes', () => {
  assert.equal(giftOffer(50, 99999), null);
  assert.equal(giftOffer(90, 100), null);
  assert.deepEqual(giftOffer(85, 5000), { kind: 'gift', coins: 500, interestCost: 20 });
  assert.equal(empowerOffer(90, 99999), null);
  assert.deepEqual(empowerOffer(97, 5000), { kind: 'empower', coins: 1000, favor: 15 });
});

test('channel overview and live feed read like broadcasts', () => {
  const text = channelOverview({ chapterNo: 4, branchCount: 3, interests: [{ name: 'Judge', views: 1842 }], excitement: 74, disturbance: 21, trending: 'The Party That Challenged the Ledger' });
  assert.ok(text.includes('004') && text.includes('74%') && text.includes('TRENDING'));
  const feed = liveFeed([{ created_at: '2026-09-04 11:42:00', summary: 'Alpha entered the east.' }], 'g1');
  assert.ok(feed.includes('LIVE') && feed.includes('Alpha entered the east'));
});
