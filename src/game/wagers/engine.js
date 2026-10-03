// Parimutuel wager engine: winners split the losers' pool, channel takes a cut.
// Pure — escrow movement lives in wagers/store.js.
export const HOUSE_CUT_PCT = 15;
export const PLAYER_WAGER_CAP = 1000;
export const PLAYER_WAGER_MIN = 10;
export const PLAYER_OPEN_WAGER_LIMIT = 3;
export const UNDERDOG_SHARE_PCT = 35;

export function poolTotals(wagers) {
  let a = 0;
  let b = 0;
  for (const w of wagers) {
    if (w.side === 'B') b += w.amount;
    else a += w.amount;
  }
  return { a, b, total: a + b };
}

// Returns per-wager results: {id, status:'won'|'lost'|'refunded', payout}.
// payout includes the returned stake. One-sided books refund (no profit).
export function settleWagers(wagers, winner) {
  if (winner !== 'A' && winner !== 'B') {
    return wagers.map((w) => ({ id: w.id, status: 'refunded', payout: w.amount }));
  }
  const { a, b, total } = poolTotals(wagers);
  const winPool = winner === 'A' ? a : b;
  const losePool = total - winPool;
  if (winPool === 0 || losePool === 0) {
    return wagers.map((w) => ({ id: w.id, status: 'refunded', payout: w.amount }));
  }
  const distributable = Math.floor(losePool * (1 - HOUSE_CUT_PCT / 100));
  return wagers.map((w) => {
    if (w.side !== winner) return { id: w.id, status: 'lost', payout: 0 };
    const share = Math.floor((w.amount / winPool) * distributable);
    return { id: w.id, status: 'won', payout: w.amount + share };
  });
}

// An outcome nobody expected: winner held less than 35% of the staked pool.
export function isUnderdogWin(wagers, winner) {
  const { a, b, total } = poolTotals(wagers);
  if (total === 0 || wagers.length < 3) return false;
  const share = winner === 'A' ? a / total : b / total;
  return share * 100 < UNDERDOG_SHARE_PCT;
}

export function validatePlayerStake({ amount, balance, openCount }) {
  if (!Number.isInteger(amount) || amount < PLAYER_WAGER_MIN) throw new Error(`Minimum wager is ${PLAYER_WAGER_MIN} coins.`);
  if (amount > PLAYER_WAGER_CAP) throw new Error(`Player wagers cap at ${PLAYER_WAGER_CAP} coins — betting stays secondary to the story.`);
  if (amount > balance) throw new Error('Insufficient coins (escrow locks the stake immediately).');
  if (openCount >= PLAYER_OPEN_WAGER_LIMIT) throw new Error(`At most ${PLAYER_OPEN_WAGER_LIMIT} open wagers per incarnation.`);
}
