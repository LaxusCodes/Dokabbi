// Eligibility: attention must be EARNED. Some requirements stay hidden until met.
// Pure — signals + favor + influence are gathered in contracts.js.
export const SPONSOR_CATALOG = {
  judge_embers: {
    sponsorId: 'judge_fire', stigma: 'flames_judgment', coins: 2500,
    story: 'merciful_survivor', minClears: 3, minFavor: 40, minInfluence: 30,
    expectation: { type: 'protect', required: 3 },
    hidden: { type: 'protect', required: 1, hint: 'Has protected another incarnation' },
  },
  veiled_trickster: {
    sponsorId: 'trickster', stigma: 'playful_scheme', coins: 4000,
    story: 'breaker_impossible', minClears: 3, minFavor: 40, minInfluence: 30,
    expectation: { type: 'defy', required: 2 },
    hidden: { type: 'defy', required: 1, hint: 'Has defied a predetermined outcome' },
  },
  silent_warden: {
    sponsorId: 'warden', stigma: 'dawns_aegis', coins: 2000,
    story: 'merciful_survivor', minClears: 3, minFavor: 40, minInfluence: 30,
    expectation: { type: 'stand_together', required: 2 },
    hidden: { type: 'stand_together', required: 1, hint: 'Has fought beside a party' },
  },
  whispering_broker: {
    sponsorId: 'broker', stigma: 'debts_due', coins: 3000,
    story: 'breaker_impossible', minClears: 3, minFavor: 40, minInfluence: 30,
    expectation: { type: 'profit', required: 2 },
    hidden: { type: 'profit', required: 1, hint: 'Has made a wager pay' },
  },
};

export function evaluateEligibility(constellationId, { clears = 0, favor = 0, stories = [], signals = {}, hasContract = false, influence = 0 } = {}) {
  const spec = SPONSOR_CATALOG[constellationId];
  if (!spec) throw new Error('Unknown constellation.');
  const hiddenMet = (signals[spec.hidden.type] || 0) >= spec.hidden.required;
  const checks = [
    { id: 'clears', label: `${spec.minClears}+ scenarios cleared`, met: clears >= spec.minClears, hidden: false },
    { id: 'favor', label: `Favor > ${spec.minFavor}`, met: favor > spec.minFavor, hidden: false },
    { id: 'story', label: `Story: ${spec.story}`, met: stories.includes(spec.story), hidden: false },
    { id: 'hidden', label: hiddenMet ? spec.hidden.hint : '???', met: hiddenMet, hidden: !hiddenMet },
    { id: 'contract', label: 'No conflicting sponsorship', met: !hasContract, hidden: false },
    { id: 'influence', label: 'Constellation has influence to spend', met: influence >= spec.minInfluence, hidden: false },
  ];
  return { eligible: checks.every((c) => c.met), checks, spec };
}
