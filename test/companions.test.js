import test from 'node:test';
import assert from 'node:assert/strict';
import { combatRoleFor, schoolFor, companionCombatant, companionOpening, evolutionStage, effectiveStage, bondLevel, synergyBonus } from '../src/game/combat/companions.js';
import { findCharacter, powerOf } from '../src/game/cards/characters.js';

const def = (over) => ({ id: 'x', name: 'X', gameRank: 'A', role: 'Fighter', tags: [], skill: { name: 'S', description: 'd' }, ...over });

test('roles map to combat jobs, tags break ties', () => {
  assert.equal(combatRoleFor(def({ role: 'Healer' })), 'Support');
  assert.equal(combatRoleFor(def({ role: 'Guardian' })), 'Frontliner');
  assert.equal(combatRoleFor(def({ role: 'Scout' })), 'Scout');
  assert.equal(combatRoleFor(def({ role: 'Interpreter' })), 'Information');
  assert.equal(combatRoleFor(def({ role: 'SomethingNew', tags: ['healer'] })), 'Support');
  assert.equal(combatRoleFor(def({ role: 'SomethingNew' })), 'Damage');
  assert.equal(combatRoleFor(findCharacter('lee_seolhwa')), 'Support');
});

test('schools make ranks situational, not linear', () => {
  assert.equal(schoolFor(def({ role: 'Healer' })), 'vitality');
  assert.equal(schoolFor(def({ role: 'Guardian' })), 'ward');
  assert.equal(schoolFor(def({ role: 'Scout' })), 'insight');
  assert.equal(schoolFor(def({ role: 'Gambler', tags: ['gambit'] })), 'fortune');
  assert.equal(schoolFor(def({ role: 'Fighter', tags: ['blade'] })), 'assault');
  // An S healer out-supports an SSS striker in the right party.
  assert.equal(schoolFor(findCharacter('lee_seolhwa')), 'vitality');
  assert.equal(schoolFor(findCharacter('yoo_joonghyuk')), 'assault');
});

test('trust gates evolution; rank is ceiling, life is height', () => {
  assert.equal(evolutionStage(0), 0);
  assert.equal(evolutionStage(3), 1);
  assert.equal(evolutionStage(10), 2);
  assert.equal(effectiveStage(10, 60), 2); // trusted veteran: full strength
  assert.equal(effectiveStage(10, 30), 1); // wary: capped
  assert.equal(effectiveStage(10, 10), 0); // stranger: locked
  assert.equal(effectiveStage(0, 100), 0); // trust without wins is just fondness
  assert.equal(bondLevel(0), 0);
  assert.equal(bondLevel(45), 2);
  assert.equal(bondLevel(999), 5);
  // A lived-in S (bond 5 → +10 power, synergy) can pass a fresh SSS.
  const sVet = companionCombatant(def({ gameRank: 'S' }), 'A', { synergy: 8, bondLevel: 5 });
  const sssFresh = companionCombatant(def({ gameRank: 'SSS' }), 'A', {});
  assert.ok(sVet.build.storyBonus > sssFresh.build.storyBonus - 12);
  // Synergy counts shared tags, capped.
  assert.equal(synergyBonus(def({ tags: ['a', 'b'] }), ['b', 'c']), 2);
  assert.equal(synergyBonus(def({ tags: ['a'] }), ['z']), 0);
  assert.equal(synergyBonus(def({ tags: ['a', 'b', 'c', 'd', 'e'] }), ['a', 'b', 'c', 'd', 'e']), 8);
});

test('stages evolve the signature', () => {
  const mk = () => companionCombatant(def({ gameRank: 'A' }), 'B');
  const ward0 = companionOpening(companionCombatant(def({ role: 'Guardian' })), [mk()], [mk()], def({ role: 'Guardian' }), () => 0.5, 0);
  const ward2 = companionOpening(companionCombatant(def({ role: 'Guardian' })), [mk()], [mk()], def({ role: 'Guardian' }), () => 0.5, 2);
  assert.ok(ward2.entries[0].text.includes('guarded'));
  assert.equal(ward0.entries[0].type, 'guard');
  // Stage scales ward duration through the same engine effect.
  const ally0 = mk();
  companionOpening(companionCombatant(def({ role: 'Guardian' })), [ally0], [mk()], def({ role: 'Guardian' }), () => 0.5, 0);
  const ally2 = mk();
  companionOpening(companionCombatant(def({ role: 'Guardian' })), [ally2], [mk()], def({ role: 'Guardian' }), () => 0.5, 2);
  assert.ok(ally2.effects.find((e) => e.type === 'guard').turns > ally0.effects.find((e) => e.type === 'guard').turns);
});

test('companions scale with rank and open with their skill', () => {
  const weak = companionCombatant({ ...def({}), gameRank: 'C' });
  const strong = companionCombatant({ ...def({}), gameRank: 'SSS' });
  assert.ok(strong.hp > weak.hp && strong.stats.str > weak.stats.str);
  assert.equal(weak.team, 'A');
  const mkFoe = () => companionCombatant(def({ id: 'foe', name: 'Foe', gameRank: 'C' }), 'B');
  const foe = mkFoe();
  const foeHp = foe.hp;
  const out = companionOpening(strong, [strong], [foe], findCharacter('yoo_joonghyuk'), () => 0.5);
  assert.ok(out.entries.length === 1 && out.entries[0].round === 0);
  assert.ok(foe.hp < foeHp); // assault opening damages
  const ward = companionOpening(companionCombatant(def({ role: 'Guardian' })), [weak], [mkFoe()], findCharacter('lee_hyunsung'), () => 0.5);
  assert.equal(ward.entries[0].type, 'guard');
  const rich = companionOpening(strong, [strong], [mkFoe()], findCharacter('kim_namwoon'), () => 0.5);
  assert.equal(rich.rewardPct, 10);
  const calm = companionOpening(strong, [strong], [], findCharacter('kim_namwoon'), () => 0.5);
  assert.equal(calm.entries.length, 0);
  assert.ok(powerOf(findCharacter('kim_dokja')) === 40);
});
