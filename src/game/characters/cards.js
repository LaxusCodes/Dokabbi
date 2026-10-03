// Character cards: the actual character, not an achievement. Pure builder.
export function characterCard({ charId, name, location, state, knownInfo = [], affiliations = [], interests = [], history = [] }) {
  return [
    '🎴 CHARACTER', '',
    name, '',
    `Status: Active`,
    `Location: ${location}`,
    `Relationship: ${state}`,
    `Known Information: ${knownInfo.length ? knownInfo.join('; ') : '???'}`,
    `Affiliations: ${affiliations.length ? affiliations.join(', ') : '???'}`,
    ...(interests.length ? [`Current Interest: ${interests.join('; ')}`] : []),
    '',
    'History:',
    ...(history.length ? history.map((h) => `• ${h}`) : ['_No shared history yet._']),
  ].join('\n');
}

// What this viewer may know: gated by relationship, like everything else.
export function revealableInfo(state, memories) {
  const order = ['Unknown', 'Aware', 'Wary', 'Interested', 'Friendly', 'Trusted', 'Devoted'];
  const idx = order.indexOf(state);
  if (idx >= order.indexOf('Trusted')) return memories.slice(0, 4);
  if (idx >= order.indexOf('Friendly')) return memories.slice(0, 2);
  if (idx >= order.indexOf('Interested')) return memories.slice(0, 1);
  return [];
}
