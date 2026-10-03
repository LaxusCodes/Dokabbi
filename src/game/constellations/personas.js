// The audience has personality: who they back and how much depends on who they are.
// Pure — wallets/escrow live in constellations/wallets.js.
export const PERSONAS = {
  cautious: { stakePct: [0.05, 0.1], side: 'favorite', minInfluence: 10, influenceCost: 2 },
  steadfast: { stakePct: [0.03, 0.07], side: 'favorite', minInfluence: 10, influenceCost: 1 },
  reckless: { stakePct: [0.3, 0.6], side: 'underdog', minInfluence: 20, influenceCost: 5 },
  manipulative: { stakePct: [0.15, 0.3], side: 'contrarian', minInfluence: 15, influenceCost: 3 },
};

export const PERSONA_OF = {
  judge_embers: 'cautious',
  silent_warden: 'steadfast',
  veiled_trickster: 'reckless',
  whispering_broker: 'manipulative',
};

export const maxWagerFor = (influence) => influence * 100;

// Decide a constellation wager. Returns null when it sits this one out.
export function personaWager(personaId, { influence, poolA, poolB, votesA, votesB, rng = Math.random }) {
  const persona = PERSONAS[personaId];
  if (!persona || influence < persona.minInfluence) return null;
  const cap = maxWagerFor(influence);
  const [lo, hi] = persona.stakePct;
  const amount = Math.max(50, Math.floor(cap * (lo + rng() * (hi - lo))));
  let side;
  if (persona.side === 'underdog') side = poolA <= poolB ? 'A' : 'B';
  else if (persona.side === 'contrarian') side = votesA >= votesB ? 'B' : 'A';
  else side = poolA >= poolB ? 'A' : 'B';
  return { side, amount: Math.min(amount, cap), influenceCost: persona.influenceCost };
}
