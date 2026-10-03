// Audience sentiment: who the stream favors and how loudly. Pure.
export function computeMeters({ votesA = 0, votesB = 0, wagerCount = 0, alters = 0 }) {
  const total = votesA + votesB;
  const pctA = total ? (votesA / total) * 100 : 50;
  return {
    pctA,
    pctB: 100 - pctA,
    excitement: Math.min(99, 20 + total * 3 + wagerCount * 5),
    drama: Math.min(99, Math.round(100 - Math.abs(pctA - 50) * 2) + (wagerCount > 0 ? 10 : 0)),
    disturbance: Math.min(99, alters * 15),
  };
}

export function bar(pct, width = 12) {
  const full = Math.round((pct / 100) * width);
  return '█'.repeat(full) + '░'.repeat(width - full);
}

export function sentimentText({ aLabel, bLabel, meters }) {
  return [
    '📡 AUDIENCE',
    '',
    `${aLabel}`,
    `${bar(meters.pctA)} ${meters.pctA.toFixed(0)}%`,
    '',
    `${bLabel}`,
    `${bar(meters.pctB)} ${meters.pctB.toFixed(0)}%`,
    '',
    `Excitement: ${meters.excitement}  Drama: ${meters.drama}  Probability Disturbance: ${meters.disturbance}`,
  ].join('\n');
}

export function wagerFeedLine(w) {
  const who = w.anonymous ? (w.kind === 'constellation' ? 'An anonymous constellation' : 'An anonymous incarnation') : w.display;
  return `[${who} has wagered ${w.amount} Coins on ${w.side === 'A' ? w.aLabel : w.bLabel}.]`;
}

export function settleFeedLine(p, aLabel, bLabel) {
  const label = p.side === 'A' ? aLabel : bLabel;
  const who = p.anonymous ? 'An anonymous backer' : p.display;
  if (p.status === 'won') {
    const profit = (p.payout || 0) - p.amount;
    return `💰 ${who} backed ${label}: profit +${profit} Coins.`;
  }
  if (p.status === 'lost') return `${who} backed ${label}: lost ${p.amount} Coins to the stream.`;
  return `${who} backed ${label}: stake refunded (one-sided book).`;
}
