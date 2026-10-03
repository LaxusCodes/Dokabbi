// Offers: private invitations, not a shop shelf. Pure builders.
import { describeExpectation } from './expectations.js';

export function interestOf(favor) {
  return Math.max(0, Math.min(100, Math.round(favor)));
}

export function interestBar(favor, width = 8) {
  const full = Math.round((interestOf(favor) / 100) * width);
  return '█'.repeat(full) + '░'.repeat(width - full);
}

export function offerText({ constellationName, coins, stigma, expectationType, expectationRequired, duration }) {
  return [
    '━━━━━━━━━━━━━━━━━━━━', 'SPONSORSHIP OFFER', '━━━━━━━━━━━━━━━━━━━━', '',
    `From: ${constellationName}`, '',
    `Initial Coins: +${coins}`, `Stigma: [${stigma}]`, '',
    `Expectation: ${describeExpectation(expectationType, expectationRequired)}`, '',
    `Contract: ${duration} Scenarios`, 'Failure: Favor -15', '',
    '━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}
