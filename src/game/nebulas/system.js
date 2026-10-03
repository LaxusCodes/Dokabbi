// Nebula ranks, states, reputation math. Pure.
export const RELATION_STATES = ['Neutral', 'Interested', 'Cooperative', 'Competitive', 'Hostile', 'At War'];

export const RANKS = [
  { min: 50, title: 'Faction Asset' },
  { min: 30, title: 'Trusted Member' },
  { min: 15, title: 'Member' },
  { min: 5, title: 'Affiliate' },
  { min: 1, title: 'Recognized' },
  { min: -Infinity, title: 'Outsider' },
];

export function rankFor(reputation) {
  return RANKS.find((r) => (reputation || 0) >= r.min).title;
}

export function rankIndex(title) {
  return RANKS.findIndex((r) => r.title === title);
}

export function shiftState(state, steps) {
  const i = RELATION_STATES.indexOf(state);
  const next = Math.max(0, Math.min(RELATION_STATES.length - 1, (i < 0 ? 0 : i) + steps));
  return RELATION_STATES[next];
}

// Stronger affiliation, louder consequences: spillover scales with rank.
export function spilloverWeight(reputation) {
  const idx = rankIndex(rankFor(reputation));
  return RANKS.length - 1 - idx; // Outsider 0 ... Asset 5
}

export const AID_COST = 500;
export const AID_COOLDOWN_MS = 24 * 3600 * 1000;
export const MIN_AID_RANK = 'Member';
export const MIN_INVESTIGATE_RANK = 'Affiliate';

export function meetsRank(reputation, minimum) {
  return rankIndex(rankFor(reputation)) <= rankIndex(minimum);
}
