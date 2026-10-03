// Constellation avatars: gods don't bleed, their champions do. Pure.
import { createCombatant } from './engine.js';
import { constellationName } from '../constellations/wallets.js';

// Avatar strength scales with the constellation's spendable influence —
// a spent force fields a weaker champion.
export function avatarFor(constellationId, { influence = 60, team = 'A', level = 9 } = {}) {
  const edge = Math.floor(influence / 10);
  return createCombatant({
    id: `avatar:${constellationId}`,
    name: `Avatar of ${constellationName(constellationId)}`,
    level,
    hp: 90 + edge * 4,
    maxHp: 90 + edge * 4,
    energy: 60,
    maxEnergy: 60,
    stats: { str: 12 + edge, agi: 12, vit: 14, mag: 12 + edge, intel: 10, level },
    status: 100 + edge * 2,
    powerTier: 4,
    role: 'Damage',
    team,
    build: { storyBonus: edge },
  });
}

export function avatarScenarioTier() {
  return 4;
}
