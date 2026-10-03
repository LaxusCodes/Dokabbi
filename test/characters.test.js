import test from 'node:test';
import assert from 'node:assert/strict';
import { RANKS, RANK_WEIGHTS, RANK_POWER, RANK_RARITY, RECRUIT_COST, pickCharacter, powerOf, findCharacter, characterCombatant } from '../src/game/cards/characters.js';
import { classifyCard } from '../src/game/cards/collection.js';
import characters from '../data/characters.json' with { type: 'json' };

test('rank ladder is ordered and weighted', () => {
  assert.deepEqual(RANKS, ['C', 'B', 'A', 'S', 'S+', 'SS', 'SSS']);
  assert.ok(RANK_WEIGHTS.SSS < RANK_WEIGHTS.SS && RANK_WEIGHTS.SS < RANK_WEIGHTS.S);
  assert.ok(RANK_POWER.SSS > RANK_POWER.SS && RANK_POWER.S > RANK_POWER.A);
  assert.equal(RANK_RARITY.SSS, 'Myth');
  assert.equal(RANK_RARITY.C, 'Common');
  assert.equal(RECRUIT_COST, 500);
  for (const c of characters) {
    assert.ok(RANKS.includes(c.gameRank), `${c.id} bad rank`);
    assert.ok(c.skill?.name && c.skill?.description, `${c.id} needs a special skill`);
    assert.ok(c.description, `${c.id} needs an original description`);
    assert.ok(typeof c.canon === 'boolean', `${c.id} must declare canon`);
    assert.ok('image' in c, `${c.id} needs an image slot`);
  }
  const canonCount = characters.filter((c) => c.canon).length;
  assert.ok(canonCount >= 50, `expected 50+ canon entries, got ${canonCount}`);
});

test('weighted pulls respect ranks', () => {
  const pulls = Array.from({ length: 40 }, (_, i) => pickCharacter(() => (i + 0.5) / 40).gameRank);
  assert.ok(pulls.includes('C') && pulls.includes('SSS'));
  assert.ok(pulls.filter((r) => r === 'C').length > pulls.filter((r) => r === 'SSS').length);
  assert.equal(powerOf(findCharacter('kim_dokja')), RANK_POWER.SSS);
});

test('recruited characters classify as characters', () => {
  assert.deepEqual(classifyCard({ card_id: 'kim_dokja', power: 40 }), { category: 'character', rarity: 'Myth' });
  assert.deepEqual(classifyCard({ card_id: 'yoo_sangah', power: 22 }), { category: 'character', rarity: 'Epic' });
  const fighter = characterCombatant(findCharacter('yoo_joonghyuk'));
  assert.ok(fighter.power === 40 && fighter.tags.includes('rank:SSS'));
});
