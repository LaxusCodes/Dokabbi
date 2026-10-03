// XP curve + level-ups. Pure functions.
export function xpForLevel(level) {
  return Math.floor(80 * Math.pow(level, 1.5));
}
export function applyXp(player, gained) {
  let { level, xp } = player;
  xp += gained;
  const leveled = [];
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level += 1;
    leveled.push(level);
  }
  return { level, xp, leveled };
}
export function levelUpGains() {
  return { max_hp: 8, max_energy: 3, str: 1, agi: 1, vit: 1 };
}
