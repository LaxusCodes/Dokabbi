// Probability enters combat: improbable acts are graded, not just failed.
// A ridiculous success becomes history. Pure.
import { computePower } from './engine.js';

export function sidePower(combatants) {
  return combatants.reduce((s, c) => s + computePower({ stats: c.stats, ...c.build }), 0);
}

// Ratio of attacker power to defender power. <0.5: highly improbable.
export function assessOdds(sideA, sideB) {
  const a = sidePower(sideA);
  const b = sidePower(sideB);
  const ratio = b <= 0 ? 99 : a / b;
  const band = ratio >= 2 ? 'certain' : ratio >= 1 ? 'favored' : ratio >= 0.5 ? 'risky' : 'improbable';
  return { ratio, band, improbable: ratio < 0.5 };
}

export function gambitLine(band) {
  const map = {
    certain: 'The stream yawns. Victory is expected; glory will be thin.',
    favored: 'The odds favor you, but the stream still watches.',
    risky: '⚠️ Risky action. The stream leans closer.',
    improbable: '⚠️ Highly improbable action. Probability: thin ice. Success here becomes Story.',
  };
  return map[band];
}
