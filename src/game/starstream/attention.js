// Constellation attention: interest earned by proximity to drama. Pure math.
export const INTEREST_CAP = 100;
export const GIFT_THRESHOLD = 80;
export const EMPOWER_THRESHOLD = 95;

export function interestDeltaFor(eventKind) {
  const map = {
    sponsor_signed: 12, sponsor_broken: 6, scenario_altered: 8, scenario_cleared: 2,
    gambit: 10, clash: 8, duel: 12, collision: 8, stigma_evolved: 6,
    party_synergy: 4, wager_settled: 3, underdog: 12, secret: 5,
  };
  return map[eventKind] || 1;
}

export function clampInterest(v) {
  return Math.max(0, Math.min(INTEREST_CAP, v));
}

// Persona colors the reaction flavor, not the math.
export function reactionFlavor(persona, eventKind) {
  const table = {
    reckless: { gambit: 'is thrilled', underdog: 'is delighted', defer: 'is bored' },
    cautious: { altered: 'frowns', gambit: 'looks away', defer: 'nods approvingly' },
    steadfast: { protect: 'stands a little taller', altered: 'tightens its grip' },
    manipulative: { collision: 'smiles like a closing ledger', underdog: 'recalculates' },
  };
  return table[persona]?.[eventKind] || 'is watching';
}
