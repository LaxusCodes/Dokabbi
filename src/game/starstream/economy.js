// Channel economy: excitement becomes value becomes rewards (never raw inflation). Pure.
export function channelValueFor({ excitement = 0, wagers = 0, participants = 0, collisions = 0 }) {
  return Math.min(100, Math.round(10 + excitement * 0.5 + wagers * 2 + participants * 1.5 + collisions * 5));
}

// Value 0-100 converts to a modest reward bonus, capped so coins stay meaningful.
export function rewardBonusFor(value) {
  return Math.min(10, Math.floor(value / 10));
}

export function excitementDeltaFor(eventKind) {
  const map = {
    gambit: 8, clash: 7, duel: 8, collision: 6, underdog: 10, altered: 5,
    sponsor_signed: 4, stigma_evolved: 4, party_synergy: 3, defer: -4, refund: -2,
  };
  return map[eventKind] ?? 1;
}
