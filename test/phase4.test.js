import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionDeltaFor, relationshipLabel, chooseReaction, dokjaLine, dokjaGreeting } from '../src/game/canon/dokja.js';
import { tallyVotes, resolveGlobal } from '../src/game/scenarios/global.js';
import { consequenceFor } from '../src/game/scenarios/consequences.js';
import { buildTimeline } from '../src/game/world/timeline.js';
import { globalAnnounce, globalResult, wagerLine, audienceLine } from '../src/game/starstream/broadcast.js';
import { serverStoryCardFor } from '../src/game/cards/world-cards.js';
import { fragmentFor } from '../src/game/knowledge/system.js';

const votes = (a, b) => [...Array(a).fill({ choice: 'A' }), ...Array(b).fill({ choice: 'B' })];

test('dokja attention + relationship ladder', () => {
  assert.equal(attentionDeltaFor('altered'), 10);
  assert.equal(attentionDeltaFor('hide'), -3);
  assert.equal(relationshipLabel(50, 0), 'Trusted');
  assert.equal(relationshipLabel(0, 35), 'Suspicious');
  assert.equal(relationshipLabel(0, 20), 'Wary');
  assert.equal(relationshipLabel(-30, 0), 'Hostile');
  assert.equal(relationshipLabel(0, 0), 'Unaware');
});

test('dokja reactions follow server history, not script', () => {
  assert.equal(chooseReaction({ attention: 0, trust: 0 }), 'ignore');
  assert.equal(chooseReaction({ attention: 25, trust: 0, alters: 2 }), 'intervene');
  assert.equal(chooseReaction({ attention: 35, trust: 0 }), 'test');
  assert.equal(chooseReaction({ attention: 20, trust: 0 }), 'investigate');
  assert.equal(chooseReaction({ attention: 0, trust: 50 }), 'assist');
  assert.equal(chooseReaction({ attention: 50, trust: -50 }), 'mislead');
  assert.ok(dokjaLine('intervene', 'Gyu').includes('Gyu'));
  assert.ok(dokjaGreeting(40).includes('bending'));
});

test('global thresholds: 60% writes the timeline', () => {
  const t = tallyVotes(votes(7, 3));
  assert.equal(t.pctA, 70);
  const winA = resolveGlobal({ scenarioId: '002', aLabel: 'Protect', bLabel: 'Abandon', votes: votes(7, 3) });
  assert.equal(winA.winner, 'A');
  assert.equal(winA.consequence.title, 'Survivors were protected');
  const winB = resolveGlobal({ scenarioId: '002', aLabel: 'Protect', bLabel: 'Abandon', votes: votes(2, 8) });
  assert.equal(winB.winner, 'B');
  assert.ok(winB.consequence.flags.some(([k, v]) => v === 'hostile'));
  const split = resolveGlobal({ scenarioId: '002', aLabel: 'Protect', bLabel: 'Abandon', votes: votes(5, 5) });
  assert.equal(split.winner, 'divided');
  const generic = consequenceFor('999', 'A', { aLabel: 'X' });
  assert.ok(generic.title.includes('X'));
});

test('timeline assembles the server story', () => {
  const text = buildTimeline({
    stream: { current_scenario: '002' },
    instances: [{ scenario_id: '001', altered: 1, summary: 'Gyu changed it.' }],
    globals: [{ id: 1, scenario_id: '002', consequence: 'Survivors were protected', a_label: 'Protect', b_label: 'Abandon' }],
    events: [{ kind: 'scenario_clear' }, { kind: 'scenario_clear' }],
    flags: { 'area.plaza': 'guarded' },
  });
  assert.ok(text.includes('002'));
  assert.ok(text.includes('altered'));
  assert.ok(text.includes('2 scenario clears'));
  assert.ok(text.includes('guarded'));
});

test('broadcasts carry breaking news + wagers', () => {
  const a = globalAnnounce({ scenarioId: '002', title: 'T', aLabel: 'A', bLabel: 'B', participants: 127, minutes: 45, altered: true });
  assert.ok(a.includes('127 Incarnations') && a.includes('SPECIAL CONDITION'));
  const r = globalResult({ title: 'T', text: 'x', pctA: 70, pctB: 30, aLabel: 'A', bLabel: 'B' });
  assert.ok(r.includes('70%'));
  assert.ok(wagerLine(['Z'], () => 0).includes('Z'));
  assert.ok(audienceLine(342, 27).includes('342'));
});

test('server story cards belong to the stream', () => {
  const c = serverStoryCardFor({ globalId: 3, scenarioId: '002', name: '[The Night the Station Held]', participantCount: 127, cause: 'Survivors were protected' });
  assert.equal(c.card_id, 'server_3');
  assert.equal(c.power, 5);
  assert.ok(c.effect.includes('127'));
});

test('fragments split deterministically across players', () => {
  const opts = ['danger_east', 'value_east'];
  const ids = Array.from({ length: 20 }, (_, i) => `user${i}`);
  const got = new Set(ids.map((id) => fragmentFor(id, opts)));
  assert.equal(got.size, 2); // the whole picture requires talking to each other
  assert.equal(fragmentFor('user1', opts), fragmentFor('user1', opts));
});
