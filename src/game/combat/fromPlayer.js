// Bridge: player rows + build (attributes/skills/items/stories) -> combatants.
// Keeps Discord commands thin; combat engine stays data-driven.
import { getDb } from '../../database/db.js';
import { createCombatant } from './engine.js';
import { comboBonus } from '../progression/catalog.js';
import { partyBonusPct } from '../parties/system.js';
import { bondBonusPct } from './synergy.js';
import { perksFor } from '../titles/perks.js';
import { storyCardsOf } from '../cards/mint.js';
import itemsCatalog from '../../../data/items.json' with { type: 'json' };

const itemBonusOf = (id) => itemsCatalog.find((i) => i.id === id)?.bonus || 0;

export function buildCombatantFromPlayer(player, { role = 'Damage', team = 'A', partyMembers = [], factionBonus = 0, contextScenario = null, honoredPairs = [] } = {}) {
  const db = getDb();
  const attrs = db.prepare('SELECT attribute_id FROM player_attributes WHERE discord_id = ?').all(player.discord_id);
  const skills = db.prepare('SELECT skill_id FROM player_skills WHERE discord_id = ?').all(player.discord_id);
  const inv = db.prepare('SELECT item_id FROM inventory WHERE discord_id = ? AND equipped = 1').all(player.discord_id);
  const stories = db.prepare('SELECT power FROM player_stories WHERE discord_id = ?').all(player.discord_id);
  // History as build: journey cards fight with you; cards born where you fight hit harder.
  const cards = storyCardsOf(db, player.discord_id);
  const affinity = contextScenario ? cards.some((c) => c.scenario_id === contextScenario) : false;
  const attrIds = attrs.map((a) => a.attribute_id);
  const skillIds = skills.map((s) => s.skill_id);
  // Equipped epithets fight with you: Butcher hits harder, Shield holds longer.
  const titlePower = perksFor(player.discord_id, {
    always: true, party: partyMembers.length > 1, solo: partyMembers.length <= 1,
    wounded: player.hp < player.max_hp * 0.5,
  }).power;
  return createCombatant({
    id: player.discord_id,
    name: player.name,
    level: player.level,
    hp: player.max_hp,
    maxHp: player.max_hp,
    energy: player.max_energy,
    maxEnergy: player.max_energy,
    stats: { str: player.str, agi: player.agi, vit: player.vit, mag: player.mag, intel: player.intel, level: player.level },
    status: 40 + player.level * 5,
    powerTier: player.level,
    probability: player.probability,
    role,
    team,
    build: {
      attrBonus: attrIds.length * 2 + comboBonus(attrIds, skillIds),
      skillMult: 1 + skillIds.length * 0.05,
      itemBonus: inv.reduce((s, r) => s + itemBonusOf(r.item_id), 0),
      storyBonus: stories.reduce((s, r) => s + (r.power || 0), 0) + Math.min(5, cards.length),
      partyBonusPct: partyBonusPct(partyMembers) + factionBonus + (affinity ? 10 : 0)
        + bondBonusPct(partyMembers.map((m) => m.discord_id || m.id).filter(Boolean), honoredPairs)
        + titlePower,
    },
  });
}

export function monsterToCombatant(mon, { team = 'B', level = null } = {}) {
  const lv = level ?? (mon.tier || 1) * 3;
  const power = mon.power || 10;
  return createCombatant({
    id: mon.id, name: mon.name, level: lv,
    hp: mon.hp, maxHp: mon.hp, energy: 40, maxEnergy: 40,
    stats: { str: power, agi: Math.max(3, power - 2), vit: 6, mag: Math.max(3, power - 4), intel: 3, level: lv },
    status: 40 + lv * 5,
    powerTier: mon.tier || 1,
    role: 'Damage',
    team,
    build: {},
  });
}
