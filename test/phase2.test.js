import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePower, resolveAttack, createCombatant, isAlive, applyEffect, tickEffects,
  selectTarget, takeTurn, runBattle, combatRewards, validateRole, cardToCombatant, nebulaToSide,
} from '../src/game/combat/engine.js';
import { eloExpected, eloUpdate, canPvp, findMatch, pvpSpoils } from '../src/game/combat/pvp.js';
import { formationBonus, validatePartySize, roleSynergy, partyBonusPct } from '../src/game/parties/system.js';

const rng = () => 0.5;
const stats = { str: 10, agi: 10, vit: 10, mag: 10, intel: 10 };
const mk = (over = {}) =>
  createCombatant({ id: 'a', name: 'A', level: 3, hp: 100, maxHp: 100, energy: 50, maxEnergy: 50, stats: { ...stats }, team: 'A', ...over });

test('legacy combat API unchanged', () => {
  assert.ok(computePower({ stats: { str: 5, agi: 5, vit: 5, mag: 5, intel: 5 } }) > 0);
  const out = resolveAttack({ attacker: { stats, status: 50 }, defender: { stats, level: 1 }, rng });
  assert.ok(out.damage >= 1);
});

test('roles validate; party size caps at 5', () => {
  assert.equal(validateRole('Support'), 'Support');
  assert.throws(() => validateRole('Bard'));
  assert.throws(() => validatePartySize(6));
});

test('formation + role synergy stack', () => {
  const m = [{ role: 'Frontliner' }, { role: 'Support' }, { role: 'Damage' }];
  assert.equal(formationBonus(m).bonusPct, 10);
  assert.ok(roleSynergy(m).bonusPct >= 5);
  assert.ok(partyBonusPct(m) >= 15);
});

test('status effects tick and expire', () => {
  const c = mk();
  applyEffect(c, { type: 'burn', turns: 2, value: 4 });
  tickEffects(c);
  assert.equal(c.hp, 96);
  tickEffects(c);
  assert.equal(c.effects.length, 0);
});

test('target selection strategies', () => {
  const enemies = [mk({ id: 'x', name: 'X', hp: 10, team: 'B' }), mk({ id: 'y', name: 'Y', hp: 80, team: 'B' })];
  assert.equal(selectTarget(enemies, 'lowest_hp', rng).id, 'x');
  assert.equal(selectTarget(enemies, 'front', rng).id, 'x');
});

test('turn-based battle ends with a winner and bounded log', () => {
  const a = [mk({ team: 'A' })];
  const b = [mk({ id: 'b', name: 'B', hp: 20, maxHp: 20, team: 'B' })];
  const r = runBattle(a, b, { rng });
  assert.ok(['A', 'B'].includes(r.winner));
  assert.ok(r.rounds >= 1 && r.rounds <= 20);
  assert.ok(r.log.length > 0);
});

test('support heals instead of attacking', () => {
  const healer = mk({ role: 'Support', energy: 50 });
  const ally = mk({ id: 'ally', name: 'Ally', hp: 40, team: 'A' });
  const foe = mk({ id: 'foe', name: 'Foe', team: 'B' });
  const entries = takeTurn(healer, [healer, ally], [foe], { rng });
  assert.ok(entries.some((e) => e.type === 'heal'));
});

test('rewards punish big level gaps (anti-abuse)', () => {
  const fair = combatRewards({ victory: true, monsterPower: 10, partySize: 2, levelGap: 1 });
  const farmed = combatRewards({ victory: true, monsterPower: 10, partySize: 2, levelGap: 15 });
  assert.ok(farmed.coins < fair.coins);
  assert.ok(combatRewards({ victory: false }).coins <= 5);
});

test('elo math + pvp gating', () => {
  assert.ok(eloExpected(1200, 1000) > 0.5);
  const u = eloUpdate(1000, 1000);
  assert.ok(u.winnerElo > u.loserElo);
  assert.ok(!canPvp({ challengerId: 'x', opponentId: 'x' }).ok);
  assert.ok(!canPvp({ challengerId: 'a', opponentId: null }).ok);
  const cold = canPvp({ challengerId: 'a', opponentId: 'b', challengerLastAt: Date.now(), opponentLastAt: 0, challengerToday: 0 });
  assert.ok(!cold.ok);
  assert.ok(canPvp({ challengerId: 'a', opponentId: 'b', challengerLastAt: 0, opponentLastAt: 0, challengerToday: 0 }).ok);
  assert.ok(!canPvp({ challengerId: 'a', opponentId: 'b', challengerLastAt: 0, opponentLastAt: 0, challengerToday: 25 }).ok);
  assert.equal(findMatch(1000, [{ elo: 900 }, { elo: 1050 }]).elo, 1050);
  assert.ok(pvpSpoils({ winnerLevel: 1, loserLevel: 20 }).coins < pvpSpoils({ winnerLevel: 5, loserLevel: 5 }).coins);
});

test('card + nebula hooks produce combatants', () => {
  const c = cardToCombatant({ id: 'k', name: 'K', power: 10, tags: ['reader'] });
  assert.ok(isAlive(c) && c.hp === 50);
  const side = nebulaToSide([{ discord_id: 'z', name: 'Z', level: 2 }]);
  assert.equal(side.length, 1);
});
