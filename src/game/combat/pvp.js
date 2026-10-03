// PvP: ELO, cooldowns, anti-abuse, matchmaking stub. Pure — DB lives in combat/store.js.
export const PVP_COOLDOWN_S = 60;
export const PVP_DAILY_CAP = 20;
export const PVP_MAX_REWARD_GAP = 10;
export const ELO_K = 32;
export const START_ELO = 1000;
export const CHALLENGE_TTL_S = 600;

export function eloExpected(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

export function eloUpdate(winnerElo, loserElo, k = ELO_K) {
  const expW = eloExpected(winnerElo, loserElo);
  const expL = eloExpected(loserElo, winnerElo);
  return { winnerElo: Math.round(winnerElo + k * (1 - expW)), loserElo: Math.round(loserElo + k * (0 - expL)) };
}

// Gating in one place so commands stay thin.
export function canPvp({ challengerId, opponentId, challengerLastAt, opponentLastAt, challengerToday, now = Date.now() }) {
  if (challengerId === opponentId) return { ok: false, reason: 'You cannot duel yourself.' };
  if (!opponentId) return { ok: false, reason: 'Opponent has not registered.' };
  const since = (t) => (t ? (now - t) / 1000 : Infinity);
  if (since(challengerLastAt) < PVP_COOLDOWN_S) {
    return { ok: false, reason: `Challenger cooldown: wait ${Math.ceil(PVP_COOLDOWN_S - since(challengerLastAt))}s.` };
  }
  if (since(opponentLastAt) < PVP_COOLDOWN_S) {
    return { ok: false, reason: `Opponent fought recently: wait ${Math.ceil(PVP_COOLDOWN_S - since(opponentLastAt))}s.` };
  }
  if ((challengerToday || 0) >= PVP_DAILY_CAP) return { ok: false, reason: `Daily PvP cap reached (${PVP_DAILY_CAP}).` };
  return { ok: true };
}

// Future matchmaking queue hook: closest ELO first.
export function findMatch(elo, candidates) {
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (Math.abs(b.elo - elo) < Math.abs(a.elo - elo) ? b : a));
}

export function pvpSpoils({ winnerLevel, loserLevel }) {
  const gap = Math.abs(winnerLevel - loserLevel);
  const mult = gap > PVP_MAX_REWARD_GAP ? 0.2 : 1;
  return { coins: Math.floor(150 * mult), xp: Math.floor(60 * mult) };
}
