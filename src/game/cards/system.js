// Cards: collectible + battle. Rarity != auto-win; synergy matters.
export const RARITY_WEIGHTS = { Common: 50, Uncommon: 25, Rare: 12, Hero: 7, Legendary: 4, Myth: 1.5, Secret: 0.5 };
export function rollRarity(rng = Math.random) {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [k, w] of Object.entries(RARITY_WEIGHTS)) {
    if ((r -= w) <= 0) return k;
  }
  return 'Common';
}
export function deckPower(cards) {
  // synergy: matching tags grant bonus
  const tags = {};
  let power = 0;
  for (const c of cards) {
    power += c.power || 0;
    for (const t of c.tags || []) tags[t] = (tags[t] || 0) + 1;
  }
  for (const n of Object.values(tags)) if (n >= 3) power += 10;
  return power;
}
