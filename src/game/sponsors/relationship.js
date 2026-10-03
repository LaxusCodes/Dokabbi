// Loyalty tiers + decay: relationships bend before they break. Pure.
export const TIERS = ['Interested', 'Supporter', 'Patron', 'Favored', 'Trusted'];
export const FAILURE_FAVOR_PENALTY = 15;
export const COMPLETION_FAVOR_REWARD = 20;

export function tierFor({ completed = 0, favor = 0, hasActive = false, hasOffer = false } = {}) {
  if (favor >= 80 && completed >= 2) return 'Trusted';
  if (favor >= 60 && completed >= 1) return 'Favored';
  if (completed >= 1 || favor >= 50) return 'Patron';
  if (hasActive) return 'Supporter';
  if (hasOffer) return 'Interested';
  return 'None';
}

export function tierIndex(tier) {
  return TIERS.indexOf(tier);
}

// Failure path: disappointment -> warnings -> reduced support -> termination risk.
export function decayStep({ failures = 0 }) {
  const stages = ['Disappointed', 'Warned', 'Support reduced', 'Contract at risk'];
  return stages[Math.min(failures, stages.length - 1)];
}

// Two sponsors, incompatible hungers: protect vs profit-from-chaos.
const CONFLICTS = [['protect', 'profit'], ['stand_together', 'profit']];
export function expectationsConflict(typeA, typeB) {
  return CONFLICTS.some(([a, b]) => (typeA === a && typeB === b) || (typeA === b && typeB === a));
}
