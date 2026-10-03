import test from 'node:test';
import assert from 'node:assert/strict';
import { assessOdds, gambitLine, sidePower } from '../src/game/combat/probability.js';
import { avatarFor } from '../src/game/combat/constellation.js';
import { checkEvolution, evolutionHint, nextEvolution, UNLEASH_MULT } from '../src/game/combat/stigma.js';
import { pairKey, bondBonusPct, savesFromLog, BOND_SAVES_REQUIRED } from '../src/game/combat/synergy.js';
import { revealBonus } from '../src/game/combat/conditions.js';
import { createCombatant } from '../src/game/combat/engine.js';

const stats = { str: 10, agi: 10, vit: 10, mag: 10, intel: 10 };
const mk = (over = {}) => createCombatant({ id: 'x', name: 'X', level: 3, hp: 100, maxHp: 100, energy: 50, maxEnergy: 50, stats: { ...stats }, team: 'A', ...over });

test('odds grade courage honestly', () => {
  const strong = [mk()];
  const weak = [mk({ stats: { str: 1, agi: 1, vit: 1, mag: 1, intel: 1 } })];
  const fav = assessOdds(strong, weak);
  assert.ok(!fav.improbable && fav.ratio > 1);
  const doom = assessOdds(weak, strong);
  assert.ok(doom.improbable && doom.band === 'improbable');
  assert.ok(gambitLine('improbable').includes('Highly improbable'));
  assert.ok(sidePower(strong) > sidePower(weak));
});

test('avatars scale with influence, bleed like champions', () => {
  const rich = avatarFor('judge_embers', { influence: 90 });
  const poor = avatarFor('judge_embers', { influence: 20 });
  assert.ok(rich.hp > poor.hp);
  assert.ok(rich.name.includes('Judge'));
  assert.equal(rich.team, 'A');
  assert.ok(rich.status > 100); // status pressure is real
});

test('stigma evolution stays hidden until earned', () => {
  assert.equal(nextEvolution('flames_judgment', 1)?.level, 2);
  assert.equal(nextEvolution('flames_judgment', 3), null);
  assert.equal(evolutionHint('flames_judgment', 1, { uses: 0, protects: 0 }), '??? (use the stigma and the star will speak)');
  assert.ok(evolutionHint('flames_judgment', 1, { uses: 3, protects: 2 }).includes('3/5'));
  assert.equal(checkEvolution('flames_judgment', 1, { uses: 5, protects: 3 }), 2);
  assert.equal(checkEvolution('flames_judgment', 1, { uses: 5, protects: 0 }), null);
  assert.equal(UNLEASH_MULT, 2.0);
});

test('bonds turn rescues into build', () => {
  assert.deepEqual(pairKey('b', 'a'), ['a', 'b']);
  assert.equal(bondBonusPct(['a', 'b', 'c'], [['b', 'a']]), 3);
  assert.equal(bondBonusPct(['a', 'b'], []), 0);
  assert.equal(BOND_SAVES_REQUIRED, 3);
  const log = [
    { type: 'heal', actorId: 'a', targetId: 'b' },
    { type: 'heal', actorId: 'b', targetId: 'b' }, // self-care is no bond
    { type: 'heal', actorId: 'a', targetId: 'dead' },
    { type: 'attack', actorId: 'a', targetId: 'b' },
  ];
  assert.deepEqual(savesFromLog(log, ['a', 'b']), [['a', 'b']]);
});

test('revealed knowledge hits weak points', () => {
  const mon = { name: 'Lurker', weakness: 'soft underbelly', weakness_knowledge: 'pattern_lurker' };
  const hit = revealBonus('pattern_lurker', mon);
  assert.equal(hit.pct, 25);
  assert.ok(hit.line.includes('Weakness discovered'));
  const miss = revealBonus('value_east', mon);
  assert.equal(miss.pct, 10);
});
