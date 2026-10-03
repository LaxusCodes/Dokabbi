// Pure economy logic — no Discord imports.
export function payBalance(player, amount) {
  if (amount <= 0) throw new Error('Amount must be positive');
  if (player.coins < amount) throw new Error('Insufficient coins');
  return player.coins - amount;
}
export function scenarioReward(base, { level = 1, titleBonusPct = 0, partyBonusPct = 0 } = {}) {
  return Math.floor(base * (1 + level * 0.05 + titleBonusPct / 100 + partyBonusPct / 100));
}
