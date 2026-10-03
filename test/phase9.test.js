import test from 'node:test';
import assert from 'node:assert/strict';
import { meetsRequires, filterPaths, matchWhen } from '../src/game/scenarios/conditions.js';
import { difficultyFor } from '../src/game/scenarios/modifiers.js';
import { generateChapter, templateFor } from '../src/game/scenarios/generator.js';
import { resolvePath } from '../src/game/scenarios/branches.js';

const ctx = {
  knowledgeIds: ['danger_east'], stories: ['merciful_survivor'],
  partySize: 3, nebulaId: 'iron_gate', reputation: 20, flags: { 'area.plaza': 'hostile' },
};

test('requirements gate every layer', () => {
  assert.ok(meetsRequires({}, ctx));
  assert.ok(meetsRequires({ knowledgeAny: ['danger_east', 'value_east'] }, ctx));
  assert.ok(!meetsRequires({ knowledge: 'foreknow_002' }, ctx));
  assert.ok(meetsRequires({ minParty: 2 }, ctx));
  assert.ok(!meetsRequires({ minParty: 5 }, ctx));
  assert.ok(meetsRequires({ nebula: 'iron_gate' }, ctx));
  assert.ok(!meetsRequires({ nebula: 'veiled_ledger' }, ctx));
  assert.ok(meetsRequires({ minRank: 'Affiliate' }, ctx));
  assert.ok(!meetsRequires({ minRank: 'Faction Asset' }, ctx));
  assert.ok(meetsRequires({ story: 'merciful_survivor' }, ctx));
  assert.ok(meetsRequires({ flag: { key: 'area.plaza', value: 'hostile' } }, ctx));
  assert.ok(!meetsRequires({ flag: { key: 'area.plaza', value: 'guarded' } }, ctx));
});

test('hidden paths stay hidden, never removed', () => {
  const paths = [
    { id: 'a', requires: {} },
    { id: 'b', requires: { knowledge: 'foreknow_002' } },
  ];
  const vis = filterPaths(paths, ctx);
  assert.equal(vis.filter((v) => !v.locked).length, 1);
  assert.equal(vis.filter((v) => v.locked).length, 1);
  assert.equal(vis.find((v) => v.path.id === 'b').locked, true);
});

test('history clauses read the snapshot', () => {
  const snap = { alters: 3, bonds: 1, dokjaAttention: 20, sponsors: 4, wagers: 6, agendas: 1, flags: { 'area.plaza': 'hostile' }, relations: { 'iron_gate|veiled_ledger': 'Hostile' } };
  assert.ok(matchWhen({ minAlters: 2 }, snap));
  assert.ok(!matchWhen({ minAlters: 5 }, snap));
  assert.ok(matchWhen({ flag: { key: 'area.plaza', value: 'hostile' } }, snap));
  assert.ok(matchWhen({ relation: { a: 'iron_gate', b: 'veiled_ledger', min: 'Hostile' } }, snap));
  assert.ok(!matchWhen({ relation: { a: 'iron_gate', b: 'veiled_ledger', min: 'At War' } }, snap));
  assert.ok(matchWhen({ minAttention: 15 }, snap));
  assert.ok(matchWhen({}, snap));
});

test('difficulty follows survival', () => {
  const calm = difficultyFor({ clears: 0, alters: 0, sponsors: 0 });
  const storm = difficultyFor({ clears: 12, alters: 4, sponsors: 5 });
  assert.ok(storm.level > calm.level);
  assert.ok(storm.rewardMult >= calm.rewardMult && storm.rewardMult <= 2);
});

test('two servers get different chapter threes', () => {
  const peaceful = { clears: 2, alters: 0, bonds: 0, sponsors: 0, wagers: 0, agendas: 0, flags: { 'faction.survivor_community': 'formed' }, relations: {}, dokjaAttention: 0 };
  const scarred = { clears: 9, alters: 4, bonds: 3, sponsors: 5, wagers: 12, agendas: 2, flags: { 'area.plaza': 'hostile' }, relations: { 'iron_gate|veiled_ledger': 'Hostile' }, dokjaAttention: 35 };
  const a = generateChapter(3, peaceful);
  const b = generateChapter(3, scarred);
  assert.equal(a.title, 'The Price of Staying Together');
  assert.equal(b.title, 'The Cost of Walking Away');
  assert.ok(b.brief.length > a.brief.length);
  assert.ok(b.difficulty.level > a.difficulty.level);
  assert.ok(a.paths.length >= 5);
});

test('beyond scripted chapters the stream improvises', () => {
  const ch = generateChapter(9, { clears: 20, alters: 6, flags: {} });
  assert.equal(ch.chapterNo, 9);
  assert.ok(ch.title.length > 0 && ch.paths.length > 0);
  assert.ok(templateFor(99).no === 99);
});

test('outcomes scale and normalize effects', () => {
  const path = { id: 'x', label: 'X', rewards: { coins: 400, xp: 80 }, consequences: { flags: [['k', 'v']], favor: { judge_embers: 5 }, story: 'merciful', worldLine: 'did X' } };
  const o = resolvePath(path, { rewardMult: 1.5, factionRewardPct: 10 });
  assert.equal(o.coins, Math.floor(400 * 1.5 * 1.1));
  assert.equal(o.xp, 120);
  assert.deepEqual(o.effects.flags, [['k', 'v']]);
  assert.equal(o.effects.favor.judge_embers, 5);
  const bare = resolvePath({ id: 'y', label: 'Y' }, {});
  assert.equal(bare.coins, 100);
});
