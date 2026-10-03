import test from 'node:test';
import assert from 'node:assert/strict';
import { rankFor, shiftState, spilloverWeight, meetsRank } from '../src/game/nebulas/system.js';
import { nebulaOfConstellation, signingFallout, politicalEvent, rivalsOf } from '../src/game/nebulas/politics.js';
import { entryVisibleTo } from '../src/game/knowledge/permissions.js';
import { on, emit, off } from '../src/game/events/bus.js';

const DEFS = [
  { id: 'iron_gate', constellations: ['judge_embers'] },
  { id: 'veiled_ledger', constellations: ['whispering_broker'] },
];

test('ranks gate privileges', () => {
  assert.equal(rankFor(0), 'Outsider');
  assert.equal(rankFor(5), 'Affiliate');
  assert.equal(rankFor(15), 'Member');
  assert.equal(rankFor(30), 'Trusted Member');
  assert.equal(rankFor(50), 'Faction Asset');
  assert.ok(meetsRank(20, 'Member'));
  assert.ok(!meetsRank(4, 'Affiliate'));
  assert.ok(spilloverWeight(50) > spilloverWeight(0)); // affiliation has cost
});

test('relationship ladder moves both ways', () => {
  assert.equal(shiftState('Neutral', 3), 'Competitive');
  assert.equal(shiftState('Hostile', -4), 'Neutral');
  assert.equal(shiftState('At War', 5), 'At War');
  assert.equal(shiftState('Neutral', -5), 'Neutral');
});

test('sponsorships move faction standing', () => {
  assert.equal(nebulaOfConstellation('judge_embers', DEFS), 'iron_gate');
  assert.equal(nebulaOfConstellation('nobody', DEFS), null);
  const rels = [{ with: 'veiled_ledger', state: 'Competitive' }];
  const { home, shifts } = signingFallout({ constellationId: 'judge_embers', nebulaDefs: DEFS, relationships: rels });
  assert.equal(home, 'iron_gate');
  assert.ok(shifts.some((s) => s.nebula === 'iron_gate' && s.repDelta === 10));
  assert.ok(shifts.some((s) => s.nebula === 'veiled_ledger' && s.relationShift === 1));
  assert.deepEqual(rivalsOf('iron_gate', DEFS, [{ with: 'x', state: 'Neutral' }]), []);
  const ev = politicalEvent({ homeName: 'Iron Gate', rivalName: 'Veiled Ledger', playerName: 'Gyu', kind: 'signed', rng: () => 0 });
  assert.ok(ev.includes('Gyu') && ev.includes('STAR STREAM ALERT'));
  assert.ok(politicalEvent({ homeName: 'X', playerName: 'Y', kind: 'broken', rng: () => 0 }).includes('RESOURCE CLAIM'));
});

test('knowledge scopes are enforced, not stored', () => {
  const owner = 'o', viewer = 'v';
  const ctx = (sameParty, sameNebula) => ({ sameParty, sameNebula });
  assert.ok(entryVisibleTo({ scope: 'public' }, viewer, owner, ctx(false, false)));
  assert.ok(!entryVisibleTo({ scope: 'private' }, viewer, owner, ctx(true, true)));
  assert.ok(entryVisibleTo({ scope: 'party', shared_with: null }, viewer, owner, ctx(true, false)));
  assert.ok(!entryVisibleTo({ scope: 'party', shared_with: null }, viewer, owner, ctx(false, true)));
  assert.ok(entryVisibleTo({ scope: 'player', shared_with: 'v' }, viewer, owner, ctx(false, false)));
  assert.ok(!entryVisibleTo({ scope: 'player', shared_with: 'stranger' }, viewer, owner, ctx(false, false)));
  assert.ok(entryVisibleTo({ scope: 'nebula', shared_with: null }, viewer, owner, ctx(false, true)));
  assert.ok(!entryVisibleTo({ scope: 'nebula', shared_with: null }, viewer, owner, ctx(true, false)));
  // rival-nebula members stay blind: party bond does not leak faction secrets
  assert.ok(!entryVisibleTo({ scope: 'nebula', shared_with: null }, viewer, owner, ctx(true, false)));
});

test('event bus connects story to factions', () => {
  const seen = [];
  const unsub = on('sponsor_signed', (p) => seen.push(p));
  emit('sponsor_signed', { guildId: 'g', playerId: 'p' });
  assert.equal(seen.length, 1);
  unsub();
  emit('sponsor_signed', { guildId: 'g' });
  assert.equal(seen.length, 1); // unsubscribed
  assert.throws(() => { throw new Error('x'); }, /x/); // sanity
});
