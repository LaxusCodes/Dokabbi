// Server-wide scenarios: the whole stream votes, the majority rewrites the world. Pure.
import { consequenceFor } from './consequences.js';

export const MAJORITY_PCT = 60;

export function tallyVotes(votes) {
  let a = 0;
  let b = 0;
  for (const v of votes) {
    if (v.choice === 'B') b += 1;
    else a += 1;
  }
  const total = a + b;
  return { a, b, total, pctA: total ? (a / total) * 100 : 0, pctB: total ? (b / total) * 100 : 0 };
}

export function resolveGlobal({ scenarioId, aLabel, bLabel, votes }) {
  const t = tallyVotes(votes);
  let winner = 'divided';
  if (t.total > 0) {
    if (t.pctA >= MAJORITY_PCT) winner = 'A';
    else if (t.pctB >= MAJORITY_PCT) winner = 'B';
  }
  return { ...t, winner, consequence: consequenceFor(scenarioId, winner, { aLabel, bLabel }) };
}
