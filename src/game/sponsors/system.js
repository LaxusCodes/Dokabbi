// Sponsor contracts grant stigmas. Keep sponsor list original-inspired, not copied.
export const SPONSORS = [
  { id: 'judge_fire', name: 'Demon-like Judge of Embers', stigma: 'flames_judgment' },
  { id: 'trickster', name: 'Veiled Trickster', stigma: 'playful_scheme' },
  { id: 'warden', name: 'Silent Warden of Dawn', stigma: 'dawns_aegis' },
];
export function contractTerms(sponsorId, level) {
  const sponsor = SPONSORS.find((s) => s.id === sponsorId);
  if (!sponsor) throw new Error('Unknown sponsor');
  return { sponsor, charges: 3 + Math.floor(level / 5), cost: 500 + level * 50 };
}
