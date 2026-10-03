// Outcomes: a chosen path becomes rewards + a normalized effect list. Pure.
// The Director applies effects; this module only builds them.
export function resolvePath(path, { rewardMult = 1, factionRewardPct = 0 } = {}) {
  const base = path.rewards || { coins: 100, xp: 30 };
  const coins = Math.floor(base.coins * rewardMult * (1 + factionRewardPct / 100));
  const xp = Math.floor(base.xp * rewardMult);
  const c = path.consequences || {};
  return {
    coins,
    xp,
    effects: {
      flags: c.flags || [],
      favor: c.favor || {},
      trust: c.trust || [],
      nebulaRep: c.nebulaRep || null,
      story: c.story || null,
      knowledge: c.knowledge || null,
      locks: c.locks || [],
      worldLine: c.worldLine || path.label,
    },
  };
}
