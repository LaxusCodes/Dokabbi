// Probability / Status pressure — ORV limiters.
export function probabilityCost(powerTier, scenarioTier) {
  const over = Math.max(0, powerTier - scenarioTier);
  return over * 15;
}
export function canAffordProbability(player, cost) {
  return player.probability >= cost;
}
export function statusPressure(attackerStatus, defenderLevel) {
  // Returns resistance 0..1. High status overwhelms low level.
  const diff = attackerStatus - defenderLevel * 10;
  if (diff <= 0) return 1;
  return Math.max(0.05, 1 - diff / 200);
}
