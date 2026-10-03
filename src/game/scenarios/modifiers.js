// Difficulty follows history: the more the stream has survived, the more it demands. Pure.
export function difficultyFor(snapshot = {}) {
  const heat = (snapshot.alters || 0) * 2 + (snapshot.sponsors || 0) + Math.floor((snapshot.clears || 0) / 3);
  const level = Math.min(10, 1 + heat);
  const rewardMult = Math.min(2, 1 + (snapshot.clears || 0) * 0.02 + (snapshot.alters || 0) * 0.05);
  return { level, rewardMult: Math.round(rewardMult * 100) / 100 };
}
